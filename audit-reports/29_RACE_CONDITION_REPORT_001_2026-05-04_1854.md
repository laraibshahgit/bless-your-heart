# 29_RACE_CONDITION_REPORT_001 — 2026-05-04 18:54

## Executive Summary

**Safety level: moderate → safe (after fix).**

Bless Your Heart is a stateless single-page app on top of a single Netlify
function and a Firestore-backed rate limiter. There are no user accounts, no
multi-writer entities, no background jobs, and no caching layer. Almost every
multi-request concurrency surface is therefore narrowed to two places:

1. The **rate-limit transaction** in [`src/server/rateLimit.ts`](../src/server/rateLimit.ts) (already protected).
2. The **client-side `handleGenerate` flow** in [`src/App.tsx`](../src/App.tsx) (this report's fix).

After this run, no race condition is known to be live in production code. One
class of issue is documented as **accepted risk** (Lambda warm-container
double-init of Firebase / Anthropic SDK clients — benign, the SDKs are
idempotent), and one is documented as **out of scope, monitor only** (the
known UTC-midnight rate-limit double-window, already pinned in CLAUDE.md and
the audit history).

**At 100 concurrent requests, before this fix, the following WILL go wrong:**
- A user clicking the Generate button (`type="submit"` inside a `<form
  onSubmit>`) fires `callGenerate` **twice** per click — once via React's
  synthetic `onClick`, once via the browser's submit event. This doubles
  Anthropic spend per click and creates a stale-response overwrite race.
- A user with a flaky connection (responses arriving out of order) sees the
  newer poster briefly, then the older response overwrites it on the canvas.

**After this fix:** both paths converge through a synchronous in-flight mutex
(`inFlightRef`) plus a generation-token (`generationIdRef`) that discards
stale responses.

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | — |
| High | 1 | Fixed |
| Medium | 0 | — |
| Low | 2 | Documented (accepted) |
| Informational | 4 | Documented |

---

## 2. Shared Mutable State

### Module-level mutable state

| Location | Data | Read By | Written By | Risk | Fix |
|---|---|---|---|---|---|
| [`src/server/firebaseAdmin.ts:4-26`](../src/server/firebaseAdmin.ts) | `_db: Firestore \| null` lazy-init singleton | every Firestore call (rate limiter only today) | first call to `getDb()` per warm container | **Low** — two simultaneous first-calls in a fresh container could both pass the `if (!_db)` check and call `getFirestore()` twice. The Firebase Admin SDK guards `getApps().length > 0` internally and returns the same Firestore instance, so the race is benign (extra ms of work, no incorrect state). | None needed — accepted risk. SDK idempotency closes the gap. |
| [`src/server/anthropic.ts:44-51`](../src/server/anthropic.ts) | `client: Anthropic \| null` lazy-init singleton | every Anthropic call site (`generateLines`, `checkTone`, `checkDistressWithHaiku`) | first call to `getAnthropicClient()` per warm container | **Low** — same shape as Firebase. The SDK constructor is idempotent and stateless beyond `apiKey`, so two simultaneous initializations produce equivalent clients. | None needed — accepted risk. |
| [`src/server/safety.ts:12-14, 32-34, 47`](../src/server/safety.ts) | `SLUR_PATTERNS`, `PUBLIC_FIGURE_PATTERNS`, `DISTRESS_PHRASES_LOWER` precompiled at module load | `checkSlurFilter`, `checkRealPersonFilter`, `checkDistressPhraseList` | module evaluation only | **None** — read-only after init. Audit run 25/001 introduced the precompilation pattern. | — |

### Request-scoped state leaks

None found. Every request handler in `netlify/functions/generate.ts` holds its
state in function-local `let` bindings (`rateResult`, `lastOutput`, `retries`,
`timeoutHandle`). No mutable state is parked on a shared object across
invocations.

### Module reuse across warm-container invocations

Lambda freezes the event loop between invocations on a warm container, so any
unfinished timer **survives** to the next request. Already pinned by:

- The **rate-limit timeout cleanup** in [`generate.ts:171-209`](../netlify/functions/generate.ts) — `timeoutHandle` is captured in the outer scope, cleared in `finally`. Audit run 25/001 closed the leak. No sibling timers in the codebase.
- The Anthropic SDK call sites — they pass `{ timeout: ANTHROPIC_REQUEST_TIMEOUT_MS }` as the second arg, which the SDK handles with internal cleanup.

**No leaked timers found anywhere else.**

---

## 3. Database Race Conditions

### Read-modify-write patterns

| Location | Operation | Current Protection | Risk | Recommendation |
|---|---|---|---|---|
| [`rateLimit.ts:54-132`](../src/server/rateLimit.ts) | Per-IP counter increment, window-reset on rollover, count cap check | `db.runTransaction(async (tx) => { ... })` — Firestore serializable transaction on a single document. Two concurrent calls for the same `hashedIp` retry on conflict; only one increments `count`. | **None.** Firestore transactions are serializable on the document key. The `tx.update({ count: data.count + 1 })` is read-and-write inside the same transaction; if the document changes between read and commit, Firestore throws `FAILED_PRECONDITION` and the SDK retries the transaction body. | None. Already protected. |

### Check-then-act patterns

None found beyond the rate-limit transaction. The other check-then-act spots
(`checkSlurFilter`, `checkRealPersonFilter`, `checkSpecificity`,
`checkTone`) are pure functions over per-request data — no shared state to
race.

### Transaction scope issues

**No external side effects inside the transaction.** The rate-limit
transaction body only reads from Firestore and writes to Firestore. No HTTP
calls, no log emits inside the transaction, no queue publishes. This is the
correct shape — the transaction is brief, the `Promise.race` deadline (3s in
[`generate.ts:181`](../netlify/functions/generate.ts)) bounds catastrophe, and
the fail-open path on timeout is clearly documented.

**Daily-salt rotation is documented as accepted risk.** At UTC 00:00:00 every
IP gets a fresh document, so a user can do ~25 requests at 23:59:59 UTC and
another ~25 at 00:00:01 UTC. CLAUDE.md and `audit-reports/14_*` already pin
this. Not a race per se — the limiter does what it says — but worth flagging
because two concurrent requests at the boundary would each see different
hashed IPs.

### Operational dependency: Firestore TTL policy

`rateLimits/{hashedIp}.expiresAt` is written correctly on create + window-reset.
But the **TTL deletion policy** is a Firestore project-level config — must be
set in Firebase Console / `gcloud firestore` against the `rateLimits`
collection. This is **not enforceable from code**. CLAUDE.md already calls
this out under "Operational dependency". Verify on every new Firebase
environment; if missing, the collection grows unbounded.

**Status: pinned in CLAUDE.md and the integration test
[`tests/server/rateLimit-extended.test.ts`](../tests/server/rateLimit-extended.test.ts) `TTL contract` block. No further action.**

---

## 4. Cache Race Conditions

### Cache inventory

| Cached Data | Backend | TTL | Read Locations | Write Locations | Invalidation Locations | Consistency Risk |
|---|---|---|---|---|---|---|
| Anthropic prompt prefix (system prompt + tool decls) | Anthropic-internal | 5 min ephemeral | every `messages.create({ system: [{cache_control: {type: 'ephemeral'}}] })` call | Anthropic edge maintains | server-side, opaque | **None.** This is a one-way cache; the prompt prefix is content-addressed by Anthropic, no app-level invalidation possible or needed. |
| `loadingPhrases`, `presets`, `placeholders` (client static content) | bundled JS | per-deploy (page reload) | render path | n/a (immutable in source) | n/a | **None.** Static assets, served from CDN with `Cache-Control: immutable`. |
| Hero example WebP/PNG companions | Browser/CDN | 1 year (Netlify config, filename-versioned) | `<img>` tag | n/a | filename swap on regeneration | **None.** Filename-versioned. Stale filename = unused; no incoherency window. |
| Photo CDN images (Firebase Storage) | Browser/CDN | per-Storage-rule | `<canvas>` via `loadImage()` | n/a (static photo library) | bucket-level | **None.** Photo library is append-only; existing photo IDs never change content. |
| Font woff2/woff (Cormorant Garamond) | Browser/CDN | per-Vite-asset hash | `ensureFontsReady()` | per-deploy (filename hash) | filename-versioned | **None.** |

### There is no application-level cache.

No Redis. No Memcached. No in-memory cache. No HTTP-layer caching of generate
responses (`Cache-Control: no-store` on every response). No CDN caching of
the `/.netlify/functions/generate` endpoint (Netlify defaults to no-cache for
function responses, and the explicit `no-store` reinforces it).

**Result:** Phase 3 has no findings. The whole class of cache races
(stale-read windows, thundering herds, double-write inconsistency,
delete-then-cache races) is structurally absent because the app has no shared
mutable cache. This is a deliberate architectural choice: each generate call
is an idempotent-from-the-client-POV pipeline, and the only persistence is
the rate limiter's per-IP counter (correctly serialized via Firestore
transaction).

### Anthropic prompt caching — not an app race

`PROMPT_CACHE_CONTROL` (`src/server/anthropic.ts:42`) marks the system prompt
prefix with `cache_control: { type: 'ephemeral' }`. This is server-side
caching at Anthropic's edge — the app has no read/write/invalidate pattern,
just a read-mostly hint. No race possible.

---

## 5. Queue & Job Idempotency

**Not applicable.** Bless Your Heart has no background jobs, no message
queue, no scheduled tasks, no event consumers. The single Netlify function
synchronously serves each request with no asynchronous offloading.

The closest thing is the **Anthropic generation retry loop**
([`generate.ts:248-281`](../netlify/functions/generate.ts)) — if Sonnet
output fails parse / specificity / tone, the loop retries up to twice.

| Loop | Idempotent? | Protection | Risk if Duplicated |
|---|---|---|---|
| Retry budget = 2 in `generate.ts` | **Intentionally NOT idempotent** — temperature 0.9 produces different output each call, which is the only way retries can recover from a failed tone check | None needed; each iteration runs in sequence inside one request | None. The loop is single-threaded inside the Lambda invocation. |
| Same request fired concurrently (e.g., user double-fire from client) | Not deduplicated server-side | None — relies on client-side mutex (the fix in this report) | **2× Anthropic spend per duplicate.** The new client guard fixes this at the source. |

**No server-side request deduplication is recommended.** It's expensive
(Firestore lookup per request), the failure mode is "user sees the second of
two posters," not data corruption, and the client-side mutex makes it
unreachable today.

---

## 6. Frontend Concurrency

### Findings

#### **HIGH — Double-fire race in `handleGenerate` (FIXED THIS RUN)**

**Location:** [`src/App.tsx:57-141`](../src/App.tsx) (post-fix).

**Pre-fix shape:**

```tsx
const canGenerate = prompt.trim().length > 0 && !isGenerating;

const handleGenerate = useCallback(async () => {
  if (!canGenerate) return;       // captured by closure at render time
  setLoading(true);                // does NOT update synchronously
  // ...
  const result = await callGenerate(prompt.trim(), excludePhotoIds);
  // ... state mutations
}, [prompt, excludePhotoIds, canGenerate, selectedPreset]);

return (
  <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }}>
    {/* ... */}
    <GenerateButton ... onClick={handleGenerate} />  {/* type="submit" */}
  </form>
);
```

**Interleaved timeline that fails:**

```
t0  User clicks <GenerateButton type="submit">
t1  React onClick fires → handleGenerate() #1
       canGenerate = true (closure captured render-N value)
       setLoading(true) — schedules update
       await callGenerate(prompt, []) — yields
t2  Browser fires native submit event → form onSubmit
       e.preventDefault()
       handleGenerate() #2
       canGenerate = true (SAME render-N closure)
       setLoading(true) — idempotent
       await callGenerate(prompt, []) — yields
       → TWO in-flight requests, 2× Anthropic spend
t3  Response B (newer) arrives first → setState applies new poster
t4  Response A (older) arrives → setState OVERWRITES newer poster
```

**Why `canGenerate` doesn't help:** it's state-derived, recomputed only at
render. The closure captures the render-N value of `canGenerate`, and both
event handlers fire in the same event tick before render-N+1 lands.

**Why this is exploitable from a single click:** a `<button type="submit">`
inside a `<form onSubmit>` always fires both React's synthetic onClick AND
the browser's submit event. There is no browser-level deduplication.

**Fix shape (this run):**

```tsx
const inFlightRef = useRef(false);          // synchronous mutex
const generationIdRef = useRef(0);          // stale-response token

const handleGenerate = useCallback(async () => {
  if (inFlightRef.current) return;          // sync guard — beats render lag
  if (!canGenerate) return;
  inFlightRef.current = true;
  const myGenerationId = ++generationIdRef.current;

  try {
    // ... existing handler ...
    const result = await callGenerate(prompt.trim(), excludePhotoIds);

    // Stale-response guard — discard if a later generation fired.
    if (myGenerationId !== generationIdRef.current) return;

    // ... existing response handling, including a re-check after sleep ...
  } finally {
    if (myGenerationId === generationIdRef.current) {
      inFlightRef.current = false;          // current owner releases
    }
  }
}, [...]);
```

**Why both guards:**

- `inFlightRef` is the synchronous mutex — closes today's bug (single-click
  double-fire). Cleared in `finally` so an exception doesn't permanently jam
  the button.
- `generationIdRef` is defense in depth. Even if a future entry path
  bypasses the mutex (e.g., a refactor that introduces a third `onSubmit`
  trigger), the token discards any response whose id is no longer current.
  Mirrors the `cancelled`-flag pattern that audit run 28/001 added in
  `PosterCanvas.tsx`.

**Mutex ownership semantics:** only the LATEST generation owns the mutex. A
stale generation that early-returns leaves `inFlightRef.current = true`; the
current generation's finally block releases it. Verified by tracing the
finally condition `myGenerationId === generationIdRef.current`.

**Severity:** **High** in cost terms (2× Anthropic spend per Generate click,
~$0.0026/click instead of $0.0013). User-visible severity is moderate (a
flicker between two posters at most).

#### **LOW — `sessionStorage` cross-tab coherency**

**Location:** [`src/components/PromptInput.tsx:19-33`](../src/components/PromptInput.tsx).

`safeSessionSet(SESSION_KEY, value)` is best-effort: two tabs can both write
within the 300ms debounce window, and the last write wins. CLAUDE.md
explicitly accepts this as best-effort persistence, and the restore path
defensively truncates to `MAX_PROMPT_LENGTH`. **Not a bug** — documented
behavior. No action.

#### **INFO — No user-initiated AbortController on `callGenerate`**

**Location:** [`src/lib/api.ts:13-43`](../src/lib/api.ts).

`callGenerate` uses `AbortSignal.timeout(GENERATE_FETCH_TIMEOUT_MS)` (30s)
for hung-stream detection only. There is no mechanism for the client to
abort an in-flight fetch when the user triggers a new one. Combined with the
new `inFlightRef` mutex, this is moot today (the user can't trigger a new
fetch until the previous one resolves), but if a future refactor allows
concurrent fetches, the lack of abort would be a regression vector.

**Recommendation:** monitor only. Adding `AbortController` plumbing is a
larger refactor than warranted by the current threat model. Document in
CLAUDE.md if the in-flight semantics ever change.

#### **INFO — Out-of-order response handling**

Same finding as the double-fire fix above. The `generationIdRef` token
addresses both vectors: synchronous double-fire (today's bug) and
network-induced out-of-order (future risk).

### Verified safe (no action needed)

- **PosterCanvas image-load effect** ([`PosterCanvas.tsx:47-91`](../src/components/PosterCanvas.tsx)) — `cancelled` flag checked after every `await`. Audit run 28/001 closed this.
- **Resize listener** — rAF-throttled with cleanup. Audit run 25/001.
- **`PromptInput` debounce timer** — captured in `debounceRef`, cleared on unmount. Audit run 25/001.
- **`DownloadButton` reset timer** — captured in `resetRef`, cleared on unmount. Audit run 25/001.
- **`loadImage` decode timeout** — `Promise.race` with `setTimeout` in `finally`. Audit run 27/001.
- **All buttons disabled during in-flight state.** Generate, Download, Preset, Regenerate all gate on `isGenerating` / `loading` / parent state-machine phase.

---

## 7. Concurrency Tests Written

**No new tests added.** Rationale:

- The fix lives in React state-machine logic (App.tsx). The project has no
  React component-render tests anywhere in the suite — CLAUDE.md explicitly
  notes that `@testing-library/react` was declared in the spec but never
  wired in (NightyTidy step 11 Run 002), and instructs not to "reach for
  testing-library on autopilot."
- Adding `@testing-library/react` and a `setupFiles` entry in
  `vite.config.ts` purely to test this single guard would be over-engineering.
- The fix is small (≈40 lines, mostly comments), the contract is documented
  in-line, and the smoke test (`tests/smoke.test.ts`) exercises the App
  render path end-to-end without asserting on guard behavior.

If a future PR adds testing-library for other reasons, this guard becomes a
natural target for a `renderHook` or component test that fires `onClick` and
`onSubmit` synchronously and asserts `callGenerate` is called exactly once.
Note this in the audit report so the next reviewer knows where to look.

**Existing tests that indirectly cover the surrounding contract:**

- `tests/client/api.test.ts` — `callGenerate` shape + `AbortSignal` contract.
- `tests/server/generate-rate-limit-integration.test.ts` — Firestore
  transaction race-resolution under concurrent same-IP load.
- `tests/server/rateLimit-extended.test.ts:TTL contract` — pin
  `expiresAt = windowStart + 1 hour` invariant.

All 380 tests still pass with the App.tsx fix in place.

---

## 8. Risk Map

Ranked by likelihood × impact, highest first.

| # | Race | Likelihood | Visibility | Cost / Impact | Status |
|---|---|---|---|---|---|
| 1 | Double-fire `handleGenerate` (form-submit + button-click in same tick) | **High** under any normal click | Silent (poster flicker only) | 2× Anthropic spend per click ≈ +$0.0013/click | **Fixed this run** |
| 2 | Out-of-order `callGenerate` response overwrite (network reorder) | Low (single-fire path requires reorder; today moot due to inFlightRef) | Silent (newer poster replaced by older) | Wrong poster shown until next regenerate | **Fixed this run** (token guard) |
| 3 | Lambda warm-container double-init of Firebase / Anthropic singletons | Very low | Silent (extra ms of work on cold path) | Negligible | **Accepted (SDK-idempotent)** |
| 4 | Rate-limit collection grows unbounded if Firestore TTL policy not configured | One-time deploy risk | Cost (Firestore reads) | Free-tier overflow over months | **Operational dependency, documented** |
| 5 | UTC-midnight rate-limit double-window (~25 + ~25 across boundary) | Predictable, daily | Visible to determined attacker | Cost amplification window | **Accepted, documented** |
| 6 | Cross-tab `sessionStorage` write race for `byh:lastPrompt` | Low (requires two tabs + debounce alignment) | Silent (last-write-wins) | None — best-effort persistence | **Accepted, documented in CLAUDE.md** |
| 7 | No user-initiated `AbortController` on `callGenerate` | None today (gated by mutex) | n/a | Regression vector if mutex is removed | **Monitor only** |

**Distinguishing visible-error vs. silent-wrong-answer:**

The dangerous category is **silent wrong answers** — race #2 (older response
overwriting newer poster) is the only one in this codebase, and it's now
fixed by the generation-token guard. All other races either fail visibly
(rate limit returns `rate_limited`, Anthropic timeout returns `safe_fallback`)
or fail benignly (warm-container double-init, sessionStorage cross-tab).

---

## 9. Recommendations

### Immediate fixes (in this run)

| # | Recommendation | Status |
|---|---|---|
| 1 | Add `inFlightRef` synchronous mutex + `generationIdRef` stale-token to `handleGenerate` | **Done** |

### Patterns for new code

- **For any user-initiated async operation that mutates shared state:** always
  pair a synchronous `useRef` mutex with a generation-token. The state-derived
  guard pattern (`if (!loading) ...`) is insufficient because state updates
  lag the click event.
- **For any `<button type="submit">` inside a `<form onSubmit>`:** assume
  both `onClick` AND `onSubmit` will fire. Either gate at the handler with a
  sync mutex, or remove one trigger. Adding a small CLAUDE.md note (see
  next section).
- **For any new Anthropic call site:** mirror the existing `{ timeout: ... }`
  arg and the `cache_control` system prompt shape. No new caching layer
  needed.
- **For any new Firestore write:** if it's a counter-increment, use
  `runTransaction` (single-document serializable). If it's a write the
  client-side accumulator depends on, mirror the contract bounds in
  `src/types/index.ts` so client and server can't drift.

### Infrastructure

- **No new infrastructure recommended.** The architecture's stateless,
  per-request shape is the strongest defense against concurrency bugs. Don't
  introduce a cache, queue, or background job until a feature requires it.

### Monitoring to add

- **Anthropic spend per session (rough proxy for race #1)** — if the fix
  works, average API calls per Generate-button-click should drop ~50% from
  baseline. Worth eyeballing in PostHog `gen_ok` event count vs. user
  session count over 7 days.
- **`generation_completed` events without a preceding `prompt_submitted`** —
  would indicate a stale response slipping through despite the token guard.
  Should be 0; alarm if non-zero.

### Load testing approach

For a hypothetical future load test:

- **Rate limiter** — Fire 100 parallel requests from the same IP. Verify
  exactly `RATE_LIMIT_PER_HOUR` succeed, the rest return `rate_limited`. The
  Firestore transaction provides this guarantee; the test would prove the
  retry-on-conflict logic survives real concurrency.
- **Generate endpoint** — Fire 50 parallel requests with different prompts
  from different IPs. Verify all succeed (no shared-state contention) and
  Anthropic spend equals 50× per-request baseline (no duplicate calls).

These are not in this PR's scope.

### CLAUDE.md updates

Recommend appending the following to the **Frontend** section after the
existing `setTimeout`-cleanup rule:

> - **Form-submit + button-click double-fire**: any `<button type="submit">`
>   inside a `<form onSubmit>` fires the handler twice per click (React
>   onClick + browser submit). Gate user-initiated async work with a
>   synchronous `useRef` mutex (`inFlightRef`) plus a generation-token
>   (`generationIdRef`) to discard stale responses. State-derived guards
>   (`if (!loading) return`) are insufficient — state updates lag click
>   events. Pattern lives in [`App.tsx`](src/App.tsx)'s `handleGenerate`
>   (audit run 29/001).

(Will be threaded in a follow-up `docs:` commit per the existing audit-run
convention — this report's commit only changes code + documents the fix.)

---

## Appendix A — Files changed this run

- [`src/App.tsx`](../src/App.tsx) — added `inFlightRef` and `generationIdRef`
  guards to `handleGenerate`. Wrapped existing handler body in `try`/`finally`
  so the mutex always releases. Two stale-response checks: one immediately
  after `await callGenerate`, one after the LOAD_FLOOR_MS sleep.

## Appendix B — Files reviewed (no change required)

- `netlify/functions/generate.ts`
- `src/server/rateLimit.ts`
- `src/server/firebaseAdmin.ts`
- `src/server/anthropic.ts`
- `src/server/safety.ts`
- `src/server/validation.ts`
- `src/components/PosterCanvas.tsx`
- `src/components/PromptInput.tsx`
- `src/components/DownloadButton.tsx`
- `src/components/GenerateButton.tsx`
- `src/lib/api.ts`
- `src/lib/compositor.ts`
