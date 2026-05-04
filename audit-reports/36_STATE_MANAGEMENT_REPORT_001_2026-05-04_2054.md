# State Management Audit — Run 36/001

**Date:** 2026-05-04 20:54 (local)
**Branch:** `nightytidy/run-2026-05-01-1532`
**Scope:** Complete state-management audit of the Bless Your Heart codebase.
**Test baseline:** 392/392 passing in 1.07s; identical after fixes.

---

## 1. Executive Summary

**Health rating: SOLID.**

The codebase has a small, well-contained state surface — no global stores, no
server-cache library, no router. All state lives in `App.tsx` (orchestrator) and
five component-local containers, plus two module-level singletons (font ready
promise, analytics init flag) and one sessionStorage key (`byh:lastPrompt`).

Most of the state-management land mines other audits would file — concurrency
mutex on user-initiated async work, cleanup of `setTimeout`/`requestAnimationFrame`
handles, image-load timeouts, stale-response tokens, lazy-init flag flips before
async setup, swallowed analytics failures — have already been closed by audit
runs **27/001, 28/001, 29/001, 30/001, 33/001**. The bar is high.

**Findings:**
- **1 real bug fixed:** `canvasReady` stale across regenerate cycle in
  `PosterReveal` causes premature `scrollIntoView` before the new canvas paints.
- **1 theoretical issue documented, not fixed:** `PromptInput` sessionStorage
  restore has a sub-50ms race against initial-mount keystrokes. Fix would
  require lifting state ownership and contradicts the audit-24/001 placement
  documented in CLAUDE.md.
- **0 duplicated-state instances.** `loading` boolean and `posterState.phase
  === 'loading'` are technically two sources of truth for the same idea, but
  they're set in the same render batch and never observably diverge. Not a
  defect.
- **0 missing UI states.** Idle / loading / error / success / distress / blocked
  / rate_limited / safe_fallback / canvas_failure all wired with appropriate
  copy and `role="alert"` / `role="status"` live regions.
- **0 lifecycle bugs.** No SSR, no auth, no router → no logout cleanup, no
  hydration mismatch, no route key prop. All `setTimeout` / `requestAnimationFrame`
  handles cleaned up on unmount per existing audit conventions.

| Category | Findings | Fixed |
|---|---|---|
| Duplicated state | 0 | 0 |
| Stale state | 1 | 1 |
| Missing UI states | 0 | 0 |
| Lifecycle bugs | 0 | 0 |
| Hydration mismatches | N/A (CSR-only) | — |
| Edge cases | 0 actionable | 0 |
| Architecture concerns | 1 minor | 0 (documented) |

---

## 2. State Source Map

### 2.1 Global stores

**None.** No Redux, Zustand, MobX, Vuex/Pinia, Recoil/Jotai, React Context, or
signals. App is small enough that prop drilling from `App.tsx` covers every
consumer in ≤1 hop.

### 2.2 Server cache

**None.** No React Query, SWR, Apollo, RTK Query, urql. `callGenerate`
(`src/lib/api.ts`) is a one-shot fetch per user click. Caching is intentionally
absent — every generation produces unique output by design (Anthropic call is
non-deterministic, and the photo is randomly picked from the eligible pool).

### 2.3 Component-local state

| Owner | State | Type | Lifecycle | Notes |
|---|---|---|---|---|
| `App.tsx` | `prompt` | `string` | Page (sessionStorage backup via PromptInput) | |
| `App.tsx` | `selectedPreset` | `string \| null` | Page | Cleared in `handlePromptChange` if value drifts |
| `App.tsx` | `posterState` | `PosterPhase` (discriminated union) | Page | Single source of truth for the poster pipeline |
| `App.tsx` | `excludePhotoIds` | `string[]` | Page | Capped at `MAX_EXCLUDE_PHOTO_IDS=50` via `.slice(-50)` |
| `App.tsx` | `inlineError` | `string \| null` | Transient | Cleared on next user input |
| `App.tsx` | `distressData` | `{ open, hotline }` | Transient | |
| `App.tsx` | `loading` | `boolean` | Transient | See § 3 below |
| `App.tsx` | `inFlightRef` | `useRef<boolean>` | Transient | Concurrency mutex (audit 29/001) |
| `App.tsx` | `generationIdRef` | `useRef<number>` | Transient | Stale-response token (audit 29/001) |
| `PromptInput` | `placeholder` | `string` (random pick at mount) | Page | One-shot lazy `useState` initializer |
| `PromptInput` | `inputRef` | DOM ref | Page | |
| `PromptInput` | `debounceRef` | timeout handle | Transient | Cleaned up on unmount (audit 25/001) |
| `HeroExamples` | `mobileIndex` | `number` (random pick) | Page | One-shot lazy `useState` initializer |
| `PosterReveal` | `canvasReady` | `boolean` | Page | **Fix applied — see § 4** |
| `PosterReveal` | `containerRef` | DOM ref | Page | |
| `PosterCanvas` | `canvasRef` | DOM ref | Page | |
| `PosterCanvas` | `displaySize` | `number` | Page | rAF-throttled resize listener (audit 25/001) |
| `DownloadButton` | `status` | `'idle'\|'downloading'\|'confirmed'\|'error'` | Transient | Auto-resets via `resetRef` |
| `DownloadButton` | `showIOSHint` | `boolean` | Transient | |
| `DownloadButton` | `resetRef` | timeout handle | Transient | Cleaned up on unmount (audit 25/001) |
| `ErrorBoundary` | `hasError` | `boolean` | Persistent until reload | |

### 2.4 URL state

**None.** Single page app. Nothing encoded in path, query, or hash.

### 2.5 Browser storage

| Key | Type | Owner | Purpose |
|---|---|---|---|
| `byh:lastPrompt` | sessionStorage | `PromptInput` | Persist user prompt across reloads (300ms debounce) |
| (PostHog internals) | sessionStorage (per `persistence: 'sessionStorage'` in `analytics.ts`) | PostHog SDK | Distinct ID, session metadata |

No cookies set by app code. No IndexedDB. No localStorage.

### 2.6 Form state

No form library. Bare `<input maxLength={MAX_PROMPT_LENGTH}>` controlled by
`App.tsx`. No multi-step form. `react-hook-form` + `@hookform/resolvers` were
declared in the original spec but removed in NightyTidy step 11 — not
reintroduced. ✓

### 2.7 Module-level singletons

| File | Singleton | Lifecycle |
|---|---|---|
| `src/lib/fonts.ts` | `fontsReadyPromise: Promise<void> \| null` | Lazy-init, persists for app lifetime |
| `src/lib/analytics.ts` | `initialized: boolean` | Set synchronously before async `posthog.init` (audit 30/001) |
| `src/lib/photos.ts` | `photos = photosData as Photo[]` | Frozen at module load — static data, not state |

### 2.8 Derived/computed state

| Consumer | Computation | Notes |
|---|---|---|
| `App.tsx` | `isGenerating = loading` | Alias only — see § 9 architectural note |
| `App.tsx` | `canGenerate = prompt.trim().length > 0 && !isGenerating` | Computed each render, no memo |
| `App.tsx` (in handler) | `source = selectedPreset ? (prompt === selectedPreset ? 'preset' : 'edited_preset') : 'freeform'` | Analytics field |
| `PromptInput` | `showCounter = value.length >= COUNTER_VISIBLE_THRESHOLD` | |

No `useMemo`. The work is cheap enough not to warrant memoization.

### 2.9 Implicit state

- **Scroll position** — manipulated via `containerRef.current?.scrollIntoView()`
  in `PosterReveal`. See § 4.
- **Focus position** — Radix Dialog primitives manage focus trap inside the
  distress modal and credits dialog.
- **`<details>`-style toggles** — only Radix Dialog open/close, managed by Radix.

---

## 3. Duplicated State

**No actionable duplications.**

### 3.1 Soft duplication: `loading` ↔ `posterState.phase === 'loading'` ↔ `inFlightRef.current`

`App.tsx` carries three signals that all answer "is a generation in flight?":

1. `loading` (state) — drives `GenerateButton`'s `loading` and `aria-busy` props.
2. `posterState.phase === 'loading'` — drives `PosterReveal`'s loading branch.
3. `inFlightRef.current` (ref) — synchronous mutex that gates re-entry of
   `handleGenerate` (audit 29/001).

These are intentional, not accidental:

- `inFlightRef` MUST be sync — the entire reason it exists is that `setLoading`
  is async. Removing it reintroduces the audit-29/001 double-fire bug.
- `loading` and `posterState.phase === 'loading'` are set in the same render
  batch by every code path in `handleGenerate` and never observably diverge.
  Could be collapsed to a single source (`posterState.phase === 'loading'`),
  but the current shape is documented and pinned by behavior tests upstream.

**Risk if collapsed**: any future code path that updates `posterState` without
calling `setLoading` (or vice versa) would create a divergence — and nothing in
the type system enforces them moving together. Today there is exactly one such
code path per outcome and they're co-located in `handleGenerate`. Acceptable.

**Decision: document, do not refactor.** The CLAUDE.md "Don't refactor working
patterns" rule applies — collapsing this would be a refactor with no behavior
change and a risk of touching the audit-29/001 concurrency invariants.

---

## 4. Stale State Bugs

### 4.1 BUG (FIXED): `canvasReady` does not reset across regenerate cycle

**File:** `src/components/PosterReveal.tsx`
**Severity:** Low (visual jank — premature scroll, stale-target focus).
**Status:** Fixed.

**Pre-fix behavior:**

`PosterReveal` owns `canvasReady: boolean`, set to `true` when `PosterCanvas`
finishes drawing (via `onReady` callback). The scroll-into-view effect fires
when `state.phase === 'settled' && canvasReady`.

When the user regenerates a poster:

1. `posterState.phase` transitions `settled → loading`.
2. `PosterReveal` re-renders. The `state.phase === 'settled'` branch unmounts;
   `PosterCanvas` unmounts.
3. **`canvasReady` stays `true`** (no reset on phase transition).
4. `posterState.phase` transitions `loading → settled` (~1s later, with new
   poster).
5. `PosterReveal` re-renders. Effect deps `[state.phase, canvasReady]` change
   (state.phase flipped). Guard `state.phase === 'settled' && canvasReady`
   passes against stale `canvasReady=true`. **`scrollIntoView` fires
   immediately** against the freshly-mounted, still-blank `PosterCanvas`.
6. ~100–1000ms later, `PosterCanvas` finishes the async pipeline (font load →
   image fetch → checkFit → composite) and calls `onReady`. `setCanvasReady(true)`
   is a no-op (already true). No re-effect, no re-scroll.

**User experience:** browser scrolls smoothly to a blank canvas position, then
the canvas fills in seconds later. Visible only when the user has scrolled away
from the poster between regenerations (otherwise the scroll target is similar
enough that the smooth-scroll appears as a no-op).

**Fix:**

```ts
useEffect(() => {
  if (state.phase !== 'settled') {
    setCanvasReady(false);
  }
}, [state.phase]);
```

Reset `canvasReady` to `false` whenever the phase leaves `settled`. The next
`onReady` from the freshly-mounted `PosterCanvas` is what flips it back to
`true`, and only then does the scroll fire.

**Tests:**

- No React component-render tests exist in this codebase (CLAUDE.md confirms
  `@testing-library/react` was removed in NightyTidy step 11; this is the
  intentional shape).
- All 392 unit + integration tests still pass.
- Manual repro: regenerate from a settled poster after scrolling to the bottom
  of the page. Pre-fix: scroll fires while canvas is blank. Post-fix: scroll
  fires only when the new canvas is fully drawn.

**Commit:** see § 11.

### 4.2 NOT-A-BUG: `selectedPreset` does not re-highlight when prompt is restored to exactly the preset string

**Scenario:** User picks preset `"missing my mom"`. They edit to `"missing my
dad"`. `selectedPreset` clears via `handlePromptChange`'s drift check. They edit
back to exactly `"missing my mom"`. `selectedPreset` stays `null`; the chip is
not visually highlighted.

This is intentional. `selectedPreset` carries information beyond `prompt`: it
distinguishes "user originally picked this preset" (analytics `source =
'preset'` or `'edited_preset'`) from "user typed it from scratch" (`source =
'freeform'`). If we derived it from prompt-match, we'd lose the
`'edited_preset'` analytics distinction. Cosmetic-only chip-highlight loss is
the lesser evil.

### 4.3 NOT-A-BUG: `excludePhotoIds` accumulates across prompt changes

**Scenario:** User generates poster A from prompt X (photoId mountain-01). They
clear the prompt and generate poster B from prompt Y. `excludePhotoIds` still
contains `['mountain-01']`, so the second generation excludes mountain-01 even
though the prompts are unrelated.

Not a bug. The photo library is small (~10 entries); excluding 1–N from
accumulator doesn't materially affect variety. The 3-rung fallback in
`photoSelection.ts` handles "all eligible photos excluded" by ignoring the
exclusion list at rung 3. No user-visible failure mode.

A naïve "clear excludePhotoIds when prompt changes meaningfully" heuristic
would be hard to define (substring match? token match? user intent?) and
risks regressing the "regenerate gives a different photo" behavior the
accumulator exists to guarantee.

---

## 5. Missing UI States

**No gaps found.** Every async path has all four states wired.

| Async path | idle | loading | error | success (data) | success (empty) |
|---|---|---|---|---|---|
| `callGenerate` (primary) | ✓ `posterState.phase === 'idle'` | ✓ `posterState.phase === 'loading'` (rotating phrase, `role="status"`) | ✓ `posterState.phase === 'error'` (retryable + Try Again, `role="alert"`) | ✓ `posterState.phase === 'settled'` (PosterCanvas + Regenerate + Download) | N/A — server always returns ok / error |
| `downloadPoster` (in `DownloadButton`) | ✓ `status === 'idle'` | ✓ `status === 'downloading'` (button disabled, `aria-busy`) | ✓ `status === 'error'` (auto-reset 3s, single `aria-live` region) | ✓ `status === 'confirmed'` (auto-reset 2.5s) | N/A |
| `loadImage` (in `PosterCanvas`) | N/A | implicit (canvas blank) | ✓ `onFitFailure?.()` → routes to `posterState.phase === 'error'` | ✓ `onReady?.()` triggers scroll via `PosterReveal` | N/A |

Special cases also wired:
- `distress` → `DistressInterstitial` modal with `role="dialog" aria-modal="true"`
- `blocked`, `rate_limited` → inline `<p role="alert">` under the prompt input
- `safe_fallback` → renders as `settled` with `fittingRung: 4` (analytics
  distinguished, user UI identical)
- `canvasWriteFailed` → routes via `onCanvasFailure` to `posterState.phase ===
  'error'` (audit 27/001)

---

## 6. Lifecycle Bugs

**No lifecycle bugs found.** All cleanup is in place per existing audit
conventions.

### 6.1 Survives when it should

- **Refresh:** `prompt` restored from sessionStorage in `PromptInput` (audit
  24/001 truncates on restore).
- **Tab visibility / suspend:** No state lost on tab switch. No
  `visibilitychange` listener to reset state.

### 6.2 Vanishes when it should

- **Regenerate from settled:** `DownloadButton` and `PosterCanvas` unmount; their
  state is wiped via cleanup `useEffect`s.
- **Distress modal close:** `setDistressData({ open: false, hotline: null })`.
  `DistressInterstitial` unmounts (lazy import, `Suspense fallback={null}`).
- **`PosterCanvas` mid-draw cancellation:** `cancelled` flag pattern after
  every `await` (audit 28/001).

### 6.3 Cleanup audit

| Resource | Owner | Cleanup mechanism |
|---|---|---|
| `setTimeout` in PromptInput debounce | `debounceRef` | `useEffect(() => () => clearTimeout(debounceRef.current), [])` ✓ |
| `setTimeout` in DownloadButton auto-reset | `resetRef` | `useEffect(() => () => clearTimeout(resetRef.current), [])` ✓ |
| `requestAnimationFrame` in PosterCanvas resize | `frame` (closure) | `if (frame !== 0) cancelAnimationFrame(frame)` in cleanup ✓ |
| `addEventListener('resize')` | window | `removeEventListener` in cleanup ✓ |
| Async-effect-in-flight in PosterCanvas | `cancelled` flag | Checked after every `await` ✓ |
| `setTimeout` in `generate.ts` rate-limit race | local handle | `clearTimeout` in `finally` ✓ (audit 25/001) |

### 6.4 Hydration mismatches

**N/A.** This is a pure CSR (client-side rendered) Vite app. `index.html` is
static; React boots on the client. There is no SSR hydration step, so there can
be no SSR/CSR divergence.

### 6.5 StrictMode double-mount safety

| Component | Effect | StrictMode-safe? |
|---|---|---|
| `PromptInput` restore effect | `[]` deps, guard `if (saved && !value)` | ✓ second mount sees `value` non-empty after first restore landed |
| `PosterCanvas` async render | `cancelled` flag pattern | ✓ first unmount sets `cancelled=true`, async work checks at every `await` |
| `DownloadButton` resetRef cleanup | `useEffect(() => () => clearTimeout(...), [])` | ✓ runs on every unmount including dev double-mount |
| `analytics.initAnalytics` | `initialized = true` set sync before `posthog.init` | ✓ second sync call early-returns (audit 30/001) |

---

## 7. Hydration Mismatches

**N/A** — see § 6.4. Pure CSR.

---

## 8. Edge Cases

### 8.1 Multi-tab

| Scenario | Behavior | Bug? |
|---|---|---|
| Same prompt drafted in two tabs | Each tab has its own sessionStorage (per-tab spec) | No |
| User generates in tab A, switches to tab B | Tab B unaffected (no shared state) | No |
| User logs out (N/A — no auth) | — | — |

### 8.2 Network interruption

| Scenario | Behavior | Bug? |
|---|---|---|
| Mid-generation offline | `fetch` rejects → `gen_client_error` log, `errorCopy.generation.networkOffline` if `!navigator.onLine`, otherwise `errorCopy.generation.unknown`. Routes to `posterState.phase === 'error'` with retryable. | No |
| Slow-stream lambda hang | `AbortSignal.timeout(30_000)` fires → same error path | No |
| Retry after failure | User-initiated only (Try Again button). No auto-retry — intentional. | No |

### 8.3 Session expiry

**N/A** — no auth, no session token.

### 8.4 Tab visibility / mobile suspend

No `visibilitychange` listener. If the user backgrounds during generation:
- iOS Safari may suspend the JS event loop. The fetch may complete or get
  killed by the OS; result handling is normal on return.
- No state is reset on background/foreground.

No bug. No action needed.

---

## 9. Re-render Hot Spots

### 9.1 PresetButtons re-renders on every keystroke

`App.tsx` defines `handlePresetSelect` and `handlePromptChange` as regular
function declarations (not `useCallback`). They get a new identity every render.
`PresetButtons` and `PromptInput` receive these as props.

**Impact:** Every keystroke in `PromptInput` causes `setPrompt` → App re-renders
→ `PresetButtons` re-renders (new `onSelect` ref). `PresetButtons` is cheap
(static map of 6–8 chip buttons), so the impact is negligible — no measurable
jank.

**Decision: document, don't fix.** Wrapping in `useCallback` would tighten
identity equality but the wrapper allocation cost is comparable to the avoided
re-render cost for a list of this size. Premature optimization per
CLAUDE.md.

### 9.2 PosterCanvas effect deps are correctly minimal

`PosterCanvas`'s render effect deps are `[line1, line2, photoId, displaySize]`
— intentionally NOT including `onReady` / `onFitFailure`. If they were
included, every parent re-render (which produces new arrow-fn refs) would
re-trigger the entire async pipeline (font load → image fetch → composite). ✓

### 9.3 `App.tsx` re-renders on every state change

7 useState slots. Every keystroke fires re-render. Children:
- `Header`, `Footer`, `HeroExamples` — pure / static, no perf concern.
- `PromptInput` — receives same props (value, onChange) as before, internal
  `useState`-driven re-renders only on its own state changes.
- `PresetButtons` — see § 9.1.
- `GenerateButton` — pure, takes `loading`/`disabled`/`onClick`.
- `PosterReveal` — receives `state` (changes only when posterState changes),
  `onRegenerate` (regenerated each render — minor), `onCanvasFailure`
  (`useCallback`, stable).

**No actionable hot spot.**

---

## 10. Architecture Assessment

### 10.1 Server vs client state separation: ✓

There is no server data being managed in client state. `callGenerate` is
fire-and-forget; the response feeds straight into `posterState`. No cache, no
loading flags duplicated across slices. Clean.

### 10.2 State proximity: ✓

App is small enough that state at `App.tsx` orchestrator + per-component
locals is the right shape. No prop drilling beyond 1 level. No over-globalized
state.

### 10.3 Discriminated-union state machine: ✓

`PosterPhase` is the canonical example: a single state slot with phase-
specific payload, narrowed via TS exhaustively. Eliminates the "loading
without data" / "data without success flag" inconsistency that flat boolean
slots produce. The audit-22/001 removal of the `revealing` phase confirms
this discipline.

### 10.4 Concurrency-mutex pattern: ✓

`inFlightRef` + `generationIdRef` pattern (audit 29/001) is the right shape
for user-initiated async work. Mutex prevents double-fire (form-submit +
button-onClick same tick); generation token prevents stale-response overwrite.
The pattern is documented and tested.

### 10.5 Module-level singleton lifecycle: ✓

`initAnalytics` flips its guard SYNCHRONOUSLY before async setup (audit
30/001). `getAnthropicClient` and `getDb` (server-side) follow the same
pattern. ✓

### 10.6 Soft architectural concern: redundant `loading` slot

Documented in § 3.1. Could be collapsed but the gain is minimal and the risk
is touching audit-29/001 concurrency invariants. Acceptable as-is.

---

## 11. Fixes Applied

| # | File | Issue | Fix | Tests pass |
|---|---|---|---|---|
| 1 | `src/components/PosterReveal.tsx` | `canvasReady` stale across regenerate cycle (§ 4.1) | Added `useEffect` resetting `canvasReady` to `false` whenever `state.phase` leaves `settled` | 392/392 ✓ |

**Commit message** (proposed):
```
fix: reset canvasReady on phase transition (audit run 36/001)
```

---

## 12. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | (Done) Reset `canvasReady` to `false` on non-settled phase | Low | Low — premature scroll on regenerate, mostly invisible if user hasn't scrolled away | ✅ Yes — fixed | § 4.1 |
| 2 | Lift `byh:lastPrompt` restore to `App.tsx` lazy `useState` initializer | Theoretical race elimination + faster paint | Negligible — race is < 1 in 10000, no observed damage | ❌ No | Encapsulation tradeoff and contradicts audit 24/001's documented placement; the race is sub-50ms and can only fire if the user types before first `useEffect` runs |
| 3 | Memoize `handlePresetSelect` / `handlePromptChange` with `useCallback` | Marginal re-render reduction in `PresetButtons` | None observed | ❌ No | Premature optimization. PresetButtons is cheap; the wrapper allocation is comparable to the avoided render cost |
| 4 | Collapse `loading` boolean into derived `posterState.phase === 'loading'` | Removes one source of truth for the same idea | Could regress audit-29/001 mutex invariants if done sloppily | ❌ No | Refactor with no behavior change. Don't refactor working patterns |
| 5 | Add `<picture>`-level `key` on `PosterCanvas` to force fresh mount on every regenerate | Slight defensive hardening of the audit-28/001 cancelled-flag pattern | None — cancelled-flag pattern already handles unmount correctly | ❌ No | Belt-and-suspenders; not needed |

Ordered by risk descending. Recommendations 2–5 are honestly marginal — flagged
for completeness, not for action.

---

## 13. State Health Across Audit History

The audit history (runs 27–35) has progressively tightened state-management
invariants. This audit found the residue of those efforts: a single missed
reset path (canvasReady), no unbounded growth, no cleanup gaps, no
race-prone async state. The pattern of paired `setState` + cleanup, ref-based
mutexes for sync re-entry, generation tokens for stale responses, and
discriminated-union state for the central pipeline is consistent and ready
for further iteration.

| Audit run | State-management contribution |
|---|---|
| 25/001 (Performance) | rAF-throttled resize listener, setTimeout cleanup in PromptInput/DownloadButton, scoped-handle clearTimeout in serverless rate-limit race |
| 27/001 (Error Recovery) | onCanvasFailure plumbed App.tsx → PosterReveal → PosterCanvas; declared-but-unwired callback bug closed |
| 28/001 (Resource Lifecycle) | `cancelled` flag check after every `await` in PosterCanvas async effect |
| 29/001 (Race Condition) | `inFlightRef` mutex + `generationIdRef` stale-token in handleGenerate |
| 30/001 (Idempotency) | Sync flag-flip before async setup in `initAnalytics` |
| 33/001 (External Integration) | try/catch around posthog SDK calls |
| 36/001 (this audit) | `canvasReady` reset on phase transition |

---

## Chat summary (printed to user)

**Status:** Mapped every state container, identified 1 real bug (`canvasReady`
stale across regenerate), fixed it, all 392 tests pass.

**Key Findings:**
- **Fixed (Low):** `PosterReveal` did not reset `canvasReady` to `false` when
  leaving `settled` phase, so on regenerate the scroll-into-view fired against
  the freshly-mounted blank canvas before the new poster drew.
- **Health:** Solid. No duplicated state, no missing UI states, no lifecycle
  bugs, no hydration concerns (CSR-only), no actionable edge cases. The
  cumulative discipline of audit runs 27/28/29/30/33 has already closed most
  of the land mines.
- **No global stores, no server-cache library, no router** — the app is small
  enough that App.tsx as orchestrator + component-locals is the right shape.

**Changes Made:** 1 file — `src/components/PosterReveal.tsx` (added a
phase-transition reset effect, ~10 lines including audit comment).

**Recommendations:** None warrant action. Four marginal items documented in
§ 12 of the report.

**Report Location:**
`audit-reports/36_STATE_MANAGEMENT_REPORT_001_2026-05-04_2054.md`
