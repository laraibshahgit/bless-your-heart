# Implicit Ordering & Hidden Dependency Audit — Run 32/001

**Date:** 2026-05-04 21:48 (user local)
**Branch:** `nightytidy/run-2026-05-01-1532`
**Mode:** READ-ONLY (orchestrator override — no code changes, no commits, no branch ops)
**Scope:** Every place the codebase produces correct results because of implicit execution order, load sequence, or return arrangement that nothing enforces.

---

## TL;DR

The codebase is small (≈ 41 source files, 1 Netlify function, ≈ 350 tests) and has been heavily audited for ordering hazards in prior runs (28/001 cancelled-flag-after-every-await; 29/001 form-submit + onClick mutex; 30/001 sync flag-flip on lazy-init singletons; 25/001 setTimeout-in-Promise.race cleanup). **No critical or high-severity implicit-ordering bugs were found.** Three medium / low-severity items merit attention; all three are mechanically fixable but require a follow-up run with write permission.

| Phase | Findings | Severity Spread |
|-------|----------|-----------------|
| 1 — DB ordering | 0 | — (no multi-row queries exist) |
| 2 — Middleware | 0 | — (single linear handler) |
| 3 — Startup / init | 1 | Low |
| 4 — Async / events | 0 | — (already audited 28–30) |
| 5 — Module loading | 1 | Low |
| 6 — CSS specificity | 0 | — (Tailwind layers explicit) |
| 7 — Test ordering | 1 | Medium (latent flake) |
| **Total** | **3** | 0 critical · 0 high · 1 medium · 2 low |

Tests were not re-run (read-only mode); the `master` snapshot at the start of this branch had a green suite per audit run 31/001.

---

## Coverage Map

| Directory | DB Ordering | Middleware | Startup | Events | Imports | CSS | Tests | Total |
|-----------|------------|------------|---------|--------|---------|-----|-------|-------|
| `src/server/` | 0 | n/a | 0 | 0 | 0 | n/a | n/a | 0 |
| `netlify/functions/` | 0 | 0 | 0 | 0 | 0 | n/a | n/a | 0 |
| `src/components/` | n/a | n/a | n/a | 0 | 0 | 0 | n/a | 0 |
| `src/lib/` | n/a | n/a | n/a | 0 | 0 | n/a | n/a | 0 |
| `src/main.tsx` | n/a | n/a | 1 | 0 | 1 | 0 | n/a | 1 (overlap) |
| `tests/` | n/a | n/a | n/a | n/a | n/a | n/a | 1 | 1 |

---

## Phase 1 — Database Ordering

**Search scope:** every Firestore call site in `src/server/` and `netlify/functions/`.

**Total queries discovered:** 1 (single).

| # | File:Line | Query | Has ORDER BY? | Consumer | Order-Sensitive? | Severity |
|---|-----------|-------|---------------|----------|------------------|----------|
| DB-1 | `src/server/rateLimit.ts:57-60` | `db.collection('rateLimits').doc(hashedIp)` → `tx.get(docRef)` | n/a (single doc) | rate-limit transaction body | No | None |

**Why no findings:**
- The only Firestore touchpoint is a `runTransaction` against a **single document by ID** (`rateLimits/{hashedIp}`). There is no `.where(...)`, no `.orderBy(...)`, no multi-row read.
- `src/data/photos.json` is a static JSON array (`photos as Photo[]`). It is filtered by `selectPhoto()` in `src/server/photoSelection.ts` and presented to the user via `randomPick()` — array order is intentionally not consumed; the consumer picks uniformly at random within each rung. No implicit-ordering risk.
- `getPhotoById(photoId)` in `src/lib/photos.ts:13` uses `.find(...)` by id. ID is a primary key; insertion order is irrelevant.

| Metric | Count |
|--------|-------|
| Total multi-row queries | 0 |
| Queries without ORDER BY | 0 |
| Queries where consumer assumes order | 0 |
| "Take first" patterns without ORDER BY | 0 |
| Safe ORDER BY fixes applied | 0 (n/a) |

---

## Phase 2 — Middleware Ordering

**Search scope:** Express / Koa / Fastify / Netlify handler middleware patterns.

**Total handlers:** 1 — `netlify/functions/generate.ts` exports a single `Handler`.

| # | "Middleware" Step | File:Line | Reads | Writes | Depends On | Order Enforced? | Risk If Reordered |
|---|-------------------|-----------|-------|--------|------------|-----------------|-------------------|
| MW-1 | Method check (POST only) | `generate.ts:134-144` | `event.httpMethod` | nothing | — | Enforced (sequential) | n/a |
| MW-2 | Origin allowlist (CSRF shield) | `generate.ts:146-152` | `event.headers.origin` | nothing | env `ALLOWED_ORIGINS` | Enforced (sequential, in front of all paid work) | If moved after rate-limit, attacker-controlled cross-origin POSTs would consume rate-limit budget; if moved after Anthropic, attacker controls Anthropic spend. **Currently correct.** |
| MW-3 | Zod body validation | `generate.ts:154-161` | `event.body` | local `parsed` | — | Enforced | n/a |
| MW-4 | Rate-limit (Firestore) | `generate.ts:169-210` | `parsed`, env `RATE_LIMIT_PER_HOUR` | local `rateResult` | `getDb` lazy init | Enforced | Skipping it lets one IP consume unbounded Anthropic spend |
| MW-5 | Slur filter (free) | `generate.ts:213-220` | `prompt` | nothing | precompiled `SLUR_PATTERNS` | Enforced | If moved after Anthropic call, Anthropic still sees slur input — wasted spend, no behavior change |
| MW-6 | Real-person filter | `generate.ts:222-229` | `prompt` | nothing | — | Enforced | Same as MW-5 |
| MW-7 | Distress phrase list | `generate.ts:232` | `prompt` | nothing | precompiled `DISTRESS_PHRASES_LOWER` | Enforced (short-circuits MW-8) | n/a |
| MW-8 | Distress Haiku classifier | `generate.ts:233` | `prompt` | nothing | Anthropic client (paid) | Enforced (only fires when MW-7 misses) | If MW-7 and MW-8 swapped, every request pays Haiku $; conversely, if MW-7 alone is the gate, false negatives reach Sonnet |
| MW-9 | Generation loop | `generate.ts:251-281` | `prompt` | local `lastOutput` | Anthropic client | Enforced (sequential by retry budget) | n/a |
| MW-10 | Photo selection | `generate.ts:287-292` | `lastOutput`, `excludePhotoIds` | nothing | static photos array | Enforced | n/a |

**Why no findings:**
- The pipeline is implemented as a **single linear function body**, not as registered middleware. Reordering would require a deliberate code edit, not a `require()` reshuffle.
- The cost-ordering (free filters first, paid Haiku before paid Sonnet, paid Sonnet before photo selection) is **documented in `CLAUDE.md` § "Filter pipeline (cost-ordered)"** with an explicit numbered list — this is the closest the project has to a middleware registry, and it is auditable from cold start.
- The handler does not register middleware via `app.use(...)`; there is no plugin-loader; there are no middleware-from-multiple-files concerns.

**Documenting comment opportunity (deferred to write-permission run):** `generate.ts:170-281` carries the cost-ordering invariant in CLAUDE.md but not in the file itself. A single block comment at the top of the handler (mirroring the CLAUDE.md numbered list) would prevent a future contributor reordering the slur check after the Anthropic call without realizing the cost implication. Severity: Low. Logged as **OD-1** below.

---

## Phase 3 — Startup / Initialization Order

**Search scope:** every entry point and every lazy-init singleton.

**Entry points:**
- `src/main.tsx` — browser entry
- `netlify/functions/generate.ts` — lambda entry (cold start)

| # | Step | File:Line | Depends On | Async? | Awaited? | Order Enforced? | Failure Mode If Reordered |
|---|------|-----------|------------|--------|----------|-----------------|---------------------------|
| ST-1 | `import '@fontsource/cormorant-garamond/400.css'` (×3 weights) | `main.tsx:4-6` | DOM `<style>` injection | sync (CSS @import) | n/a | Enforced via Vite import order | If moved after `globals.css`, font-face declarations would still resolve (no @apply override exists in globals.css), but cascade-layer mental model breaks |
| ST-2 | `import '@/styles/globals.css'` | `main.tsx:8` | Tailwind `@layer` directives, fontsource above | sync | n/a | Enforced | Tailwind `@layer base` selectors reference `font-serif` which expects Cormorant — broken if fontsource hasn't injected first. **Currently correct.** |
| ST-3 | `initAnalytics()` | `main.tsx:15` | env `VITE_POSTHOG_KEY`, `import.meta.env.PROD` | sync (flag flip is sync; posthog network is async fire-and-forget) | not awaited | Coincidental | If swapped with ST-4, no functional difference today (independent). **Could become a bug** if either gains a dep on the other. |
| ST-4 | `ensureFontsReady()` | `main.tsx:16` | `document.fonts.ready`, fontsource @font-face | async, fire-and-forget here | not awaited at top level | Coincidental | Already lazy-cached; `PosterCanvas.checkFit` and `composite` re-await it. The top-level call is just to **start** the load early. Safe. |
| ST-5 | `createRoot(rootEl).render(<App />)` | `main.tsx:26-32` | DOM `#root`, all imports above | sync | n/a | Enforced (sequential) | n/a |
| ST-6 | `getAnthropicClient()` (module load) | `generate.ts:48` | env `ANTHROPIC_API_KEY` | sync | n/a | Enforced via lazy-init guard | If env unset at module-eval, `new Anthropic({apiKey: undefined})` ships and first SDK call 401s. Behavior is well-defined, not ordering-dependent. |
| ST-7 | `getDb()` lazy-init | `firebaseAdmin.ts:21-27` (called from `rateLimit.ts:56`) | env `FIREBASE_*` | sync | n/a | Enforced via guard | Per-Lambda warm cache; cold start runs `initFirebase()` exactly once. |
| ST-8 | `initialized = true` flip | `analytics.ts:24` | — | sync | n/a | **Enforced (audit run 30/001)** | Flag is set BEFORE `posthog.init(...)`, blocking re-entrancy. |

**Findings:**

### ST-FIND-1 — Implicit ordering between `initAnalytics()` and `ensureFontsReady()` (Low)

**Location:** `src/main.tsx:15-16`

```ts
initAnalytics();
ensureFontsReady();
```

**Problem:** Today the two calls are independent — neither reads anything the other writes. Their order in the file is therefore coincidental. **What breaks:** if a future contributor adds an analytics-pageview event that wants to capture document.fonts.status, swapping lines 15 and 16 would silently produce a "fonts: loading" event instead of "fonts: loaded" for slower connections. The order is correct today but nothing documents *why*. No `// ORDER DEPENDENCY` comment exists.

**Recommended mechanical fix (deferred):** add a one-line comment at `main.tsx:15`:
```ts
// Order does not matter today (independent), but kicking analytics first
// means the first PostHog auto-pageview captures BEFORE we start blocking
// on fontsource — a 1-2ms head start that helps on slow networks.
initAnalytics();
ensureFontsReady();
```

**Severity:** Low. No current-day bug. Latent ordering hazard.

---

## Phase 4 — Async / Event Ordering

**Search scope:** every `Promise.all`, `forEach(async)`, `addEventListener`, `EventEmitter`, custom event bus.

**Findings:** zero new — every async ordering hazard in the codebase has been closed in prior audit runs.

| # | Pattern | File:Line | Risk Status |
|---|---------|-----------|-------------|
| AS-1 | `Promise.all` in `fonts.ts:10-14` | Three independent `document.fonts.load(...)` calls | **Safe** — each call is independent; no order dependency |
| AS-2 | `await ensureFontsReady()` + `await loadImage()` + `await checkFit()` | `PosterCanvas.tsx:58-72` | **Safe** — `if (cancelled) return` after every await (audit run 28/001) |
| AS-3 | `useCallback handleGenerate` re-entrancy | `App.tsx:85-189` | **Safe** — `inFlightRef` synchronous mutex + `generationIdRef` stale-token guard (audit run 29/001) |
| AS-4 | `posthog.init(...)` re-entrancy | `analytics.ts:5-35` | **Safe** — flag flips synchronously before init (audit run 30/001) |
| AS-5 | `addEventListener('resize', ...)` rAF coalesce | `PosterCanvas.tsx:32-44` | **Safe** — single outer `frame` handle, rAF cancellation in cleanup (audit run 25/001) |
| AS-6 | `setTimeout` cleanup in `Promise.race` | `compositor.ts:65-82`, `generate.ts:171-209` | **Safe** — `finally`-clear pattern (audit runs 25/001 and 31/001) |
| AS-7 | `setTimeout` debounce on unmount | `PromptInput.tsx:55`, `DownloadButton.tsx:22` | **Safe** — `useRef` handle, cleanup in unmount effect |
| AS-8 | Generation retry loop | `generate.ts:251-281` | **Safe** — sequential by design (parallelizing would multiply Anthropic spend) |

**Search hits checked exhaustively:**
- `Promise.all`: 1 occurrence (`fonts.ts:10`) — independent operations.
- `.forEach(async`: **zero occurrences in `src/`**. (Confirmed via grep.)
- `addEventListener`: 1 occurrence (`PosterCanvas.tsx:40`) — paired with `removeEventListener` in cleanup.
- `EventEmitter` / custom event bus: zero. The app is React-state-driven; no events.

**No new findings.**

---

## Phase 5 — Module Load Order

**Search scope:** every top-level side effect, every barrel file, every dynamic import.

| # | Module | File:Line | Side Effect | Depends On (Order) | Enforced? | Severity |
|---|--------|-----------|-------------|--------------------|-----------|----------|
| ML-1 | `@fontsource/cormorant-garamond/400.css` | `main.tsx:4` | Injects `@font-face` `<style>` block | Must be in document before `globals.css` `@apply font-serif` resolves | Enforced (Vite preserves CSS import order) | n/a |
| ML-2 | `@fontsource/cormorant-garamond/500.css` | `main.tsx:5` | Injects bold `@font-face` | Independent of ML-1 (different weight) | Coincidental | None — order is irrelevant between weights |
| ML-3 | `@fontsource/cormorant-garamond/400-italic.css` | `main.tsx:6` | Injects italic `@font-face` | Same as ML-2 | Coincidental | None |
| ML-4 | `@/styles/globals.css` | `main.tsx:8` | `@tailwind base/components/utilities` + `@apply` | Depends on ML-1 (font-serif → Cormorant) being declared | Enforced | If accidentally moved BEFORE ML-1, browser falls back to system serif until fontsource catches up — visual flash, no crash |
| ML-5 | `getAnthropicClient()` invocation | `generate.ts:48` | Module-load-time client construction (lazy-init guarded) | env vars | Enforced | n/a |
| ML-6 | `SLUR_PATTERNS` precompile | `safety.ts:12-14` | Module-load-time RegExp construction | `slur-list.ts` exports `slurList` | Enforced | n/a — tests use `vi.mock('@/server/slur-list')` which hoists above this evaluation |
| ML-7 | `DISTRESS_PHRASES_LOWER` precompile | `safety.ts:47` | Module-load-time array map | `distress-phrases.ts` | Enforced | n/a |
| ML-8 | `lazy(() => import('@/components/DistressInterstitial'))` | `App.tsx:14-16` | Dynamic chunk request | React Suspense boundary in render tree | Enforced | n/a |
| ML-9 | `await import('../../src/server/rateLimit')` | `generate.ts:173` | Dynamic import inside the handler | Must run inside the rate-limit branch only | Enforced | n/a |
| ML-10 | Module-scope test env writes | `tests/server/generate-{contract,integration,rate-limit-integration}.test.ts` | `process.env.X = ...` BEFORE `import { handler }` | Vitest per-file isolation | **Coincidental but documented** | See TF-FIND-1 below |

**Findings:**

### ML-FIND-1 — Vite CSS import order is the only thing keeping the font cascade correct (Low)

**Location:** `src/main.tsx:4-8`

```ts
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/400-italic.css';

import '@/styles/globals.css';
```

**Problem:** Vite preserves CSS import order in the order modules are evaluated. If a future contributor reformats `main.tsx` with an "alphabetize imports" tool, `globals.css` could move ABOVE the `@fontsource/...` lines (alphabetically earlier). Tailwind's `@apply font-serif` in the base layer would then evaluate before the @font-face declarations are in the document. **What breaks:** at first paint the body falls back to system serif; once fontsource resolves a frame later, type re-flows. Visual flicker, no functional break, no canvas issue (PosterCanvas already awaits `ensureFontsReady()`).

**Recommended mechanical fix (deferred):** add a one-line comment at `main.tsx:4`:
```ts
// CSS import order is load-bearing: fontsource @font-face declarations MUST
// reach the document before globals.css's @tailwind base / @apply font-serif
// resolves, or the first paint flashes system serif before Cormorant catches
// up. Do not let an "alphabetize imports" tool reorder these.
import '@fontsource/cormorant-garamond/400.css';
```

**Severity:** Low.

---

## Phase 6 — CSS Specificity

**Search scope:** `src/styles/globals.css`, every `*.tsx`, every Tailwind utility usage.

**Total findings:** 0.

| # | Rule | File:Line | Specificity Mechanism |
|---|------|-----------|------------------------|
| CSS-1 | `body { @apply bg-cream text-ink-deep font-serif antialiased }` | `globals.css:5-9` | `@layer base` — explicit cascade layer, lowest priority |
| CSS-2 | `.text-poster-light` / `.text-poster-dark` | `globals.css:11-18` | `@layer utilities` — highest priority among layers |
| CSS-3 | All component styles | inline Tailwind class strings | `@layer utilities` — last-class-wins handled by Tailwind's deduplication |

**Why no findings:**
- The project uses **explicit `@layer`** directives (`@layer base`, `@layer utilities`). Tailwind's CSS cascade-layer mechanism resolves specificity ties via layer precedence, not source order. This is the deterministic mechanism CSS provides for exactly this problem.
- No `!important` usage anywhere in `src/`.
- No CSS-in-JS library (no styled-components, Emotion, vanilla-extract).
- `'unsafe-inline'` in the CSP is required by Radix runtime style injection (documented in `netlify.toml:48-49`) — Radix injects scoped styles at component mount, not runtime-conflicting class overrides.

---

## Phase 7 — Test Ordering

**Search scope:** every test file under `tests/`.

| # | Test File | Depends On | Shared State | Breaks When | Currently Caught? | Severity |
|---|-----------|------------|-------------|-------------|------------------|----------|
| TF-1 | `tests/server/generate-{contract,integration,rate-limit-integration}.test.ts` | Module-scope `process.env.X = ...` writes BEFORE `import { handler }` | Per-file env state | Vitest disables per-file isolation OR a future test reorders the env writes after the import | **Yes** — `CLAUDE.md` § "Testing Patterns (Non-Obvious)" pins this | Low — well-documented |
| TF-2 | `tests/server/generate-contract.test.ts:42-47` Timestamp mock | Re-reads `Date.now()` on every `.toMillis()` call | — | Any future TTL-sensitive contract test moved into this file would inherit the 1-ms drift flake | **No** — comment is in extended file but not propagated to contract file | Medium |
| TF-3 | All test files | Default vitest pool (threads + isolate) | Per-worker module cache | Switching to `--no-isolate` or `--pool=forks` | **Yes** — `CLAUDE.md` documents `audit-reports/07_TEST_EFFICIENCY_REPORT_001` as the empirical baseline | Low — documented pin |

**Findings:**

### TF-FIND-1 — `generate-contract.test.ts:42-44` uses the volatile `Timestamp.now` shape that CLAUDE.md explicitly warns against (Medium — latent flake)

**Location:** `tests/server/generate-contract.test.ts:42-47`

```ts
vi.mock('firebase-admin/firestore', () => {
  const Timestamp = {
    now: () => ({ toMillis: () => Date.now() }),         // ← volatile shape
    fromMillis: (ms: number) => ({ toMillis: () => ms }),
  };
  return { Timestamp };
});
```

Compare to the other two integration test files which use the **stable** shape:

```ts
// generate-integration.test.ts:26-35  AND  generate-rate-limit-integration.test.ts:48-56
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => {
      const ms = Date.now();              // ← captured ONCE at construction
      return { toMillis: () => ms };
    },
    fromMillis: (ms: number) => ({ toMillis: () => ms }),
  },
}));
```

**Why this is a real problem (latent):** `CLAUDE.md` explicitly documents:
> The `Timestamp.now()` mock MUST capture `Date.now()` once at construction — use `now: () => { const ms = Date.now(); return { toMillis: () => ms }; }`. The volatile shape `now: () => ({ toMillis: () => Date.now() })` re-reads the wall clock on every `.toMillis()` call and produces a 1ms drift across paired reads in the same assertion (e.g. `expiresAt - windowStart === 3599999` when a millisecond ticks between them — caused a 1-in-5 TTL-test flake before audit run 20/002). **Same shape required in `generate-integration.test.ts` and `generate-rate-limit-integration.test.ts`.**

The CLAUDE.md note explicitly names two of the three integration files but **omits `generate-contract.test.ts`**. The contract file uses the volatile shape today and currently doesn't read `expiresAt - windowStart` math (its scope is response-shape contract tests, not TTL math), which is **why this hasn't flaked yet**. The drift is latent: any future contract test that reads paired Timestamp values (e.g., asserting that the rate-limited response body's `resetAt` matches a window calculation) will hit the same 1-in-5 flake.

**Recommended mechanical fix (deferred to a write-permission run):** copy the stable shape from `generate-integration.test.ts:26-35` into `generate-contract.test.ts:41-47`. Pure mechanical change — same assertions pass, eliminates a latent flake source, brings all three files into alignment with CLAUDE.md.

**Severity:** Medium — latent flake source guarded only by current test scope.

### TF-FIND-2 — Vitest default file-execution order is non-deterministic but tolerated (Low)

**Location:** `vite.config.ts:20-24` — no `sequence` or `fileParallelism` override.

Vitest does not guarantee an execution order across `.test.ts` files. Module-scope env writes in `generate-{contract,integration,rate-limit-integration}.test.ts` would leak across files within the same worker if `isolate: false` were set. Per-file isolation (default) makes this safe **today**. The comment at `CLAUDE.md` § "module-scope env writes are load-bearing" pins this, and audit run 07/001 measured `--no-isolate` as +31% slower (i.e., not even tempting). No new finding — already documented.

---

## Phase 8 — Mechanical Fixes Applied

**None — read-only mode.** All recommendations below are deferred to a future write-permission run.

| # | File | Proposed Change | Type |
|---|------|-----------------|------|
| OD-1 | `netlify/functions/generate.ts:170` | Add `// ORDER DEPENDENCY` block-comment listing the cost-ordered pipeline rationale (mirroring the CLAUDE.md numbered list) | Comment added |
| OD-2 | `src/main.tsx:15` | Add 3-line comment explaining ST-FIND-1 (initAnalytics + ensureFontsReady ordering) | Comment added |
| OD-3 | `src/main.tsx:4` | Add 4-line comment explaining ML-FIND-1 (CSS import order is load-bearing) | Comment added |
| OD-4 | `tests/server/generate-contract.test.ts:42-47` | Replace volatile Timestamp.now shape with stable shape (matches `generate-integration.test.ts:26-35`) | Code change (mechanical) |

---

## Phase 9 — Recommendations Requiring Human Judgment

| # | Issue | Location | What to Do | Risk if Ignored | Effort | Related |
|---|-------|----------|-----------|-----------------|--------|---------|
| HJ-1 | OD-4 (Timestamp mock alignment) | `tests/server/generate-contract.test.ts:42-47` | Copy stable shape from `generate-integration.test.ts` | Medium — latent flake if any future contract test reads TTL math | 2 lines | TF-FIND-1 |
| HJ-2 | OD-1 (pipeline ORDER DEPENDENCY block) | `netlify/functions/generate.ts:170` | Inline-document the cost-ordering rationale | Low — invariant lives only in CLAUDE.md, brittle to "let me clean up the imports" reorders | ~10 lines of comment | Phase 2 narrative |
| HJ-3 | OD-3 (CSS import order comment) | `src/main.tsx:4` | Inline-document why fontsource imports must precede globals.css | Low — alphabetize-imports tool would silently regress | 4 lines of comment | ML-FIND-1 |
| HJ-4 | OD-2 (initAnalytics/ensureFontsReady) | `src/main.tsx:15` | Inline-document independence (and the latent dependency that would change this) | Low — order doesn't matter today | 3 lines of comment | ST-FIND-1 |

None require architectural change. None are critical-path. All four are pure documentation or 1-line mechanical replacements that **cannot** affect runtime behavior. They are deferred only because this run is read-only.

---

## Phase 10 — Concrete "Will Break When..." Scenarios

| # | Finding Ref | Scenario | Trigger | Impact | Likelihood |
|---|------------|----------|---------|--------|------------|
| 1 | TF-FIND-1 | Contract test that asserts `body.resetAt - windowStartMs / 1000 === 3600` flakes 1 run in 5 | Future contributor adds a TTL-math contract assertion to `generate-contract.test.ts` and copy-pastes the existing `Timestamp` mock | CI gets a flake that blocks merges intermittently; debugging time burned because the failure looks like a real off-by-one | **Medium** — contract tests are the natural home for TTL-math assertions; the next person to add one inherits the volatile mock |
| 2 | ML-FIND-1 | First paint shows system serif for 50–200 ms before Cormorant settles; type re-flows | Contributor runs an "organize imports" tool that alphabetizes `main.tsx` imports, moving `@/styles/globals.css` above the three `@fontsource/...` imports (alphabetically earlier) | Visible CLS on first load; design feels broken on slow networks; canvas is unaffected (it awaits `ensureFontsReady`) | Low — most import-organizers respect side-effect-only imports, but not all |
| 3 | ST-FIND-1 | A future PostHog event captures fonts.status as "loading" instead of "loaded" for slow-network users | Contributor adds a "track('first_paint', { fontsReady: document.fonts.status === 'loaded' })` event somewhere, then a separate refactor swaps lines 15 and 16 of main.tsx | Analytics under-reports font-ready states for ~5% of slow-network users; not user-visible; misleads ops | Low — speculative; requires two unrelated changes |
| 4 | OD-1 | Slur-filter check accidentally moved after Anthropic call | Contributor refactors `generate.ts` and reorders the cost pipeline unaware that filter-then-Anthropic is for cost reasons | Anthropic spend on slur prompts (small $ but bypassable user-cost pump); user-visible behavior unchanged | Very Low — would require a deliberate reorder; CLAUDE.md is the gate |

---

## Closing Notes

**What this audit found:** the codebase has been pre-emptively hardened against the most common implicit-ordering bugs. Every place where async ordering matters has either been (a) audited and fixed in a numbered prior run, or (b) made explicit via mutex/cancelled-flag/finally patterns. The remaining items are all comment-or-test-mock-level — no production-path bugs.

**What this audit did NOT find:**
- Any multi-row DB query without ORDER BY (no such queries exist).
- Any middleware order ambiguity (single linear handler).
- Any forEach(async) bug (zero occurrences).
- Any CSS specificity-tie ambiguity (cascade layers explicit).
- Any startup-order dependency that breaks today.

**What was deliberately not changed (read-only mode):** all four recommendations OD-1 through OD-4. Each is mechanical, behavior-preserving, and ready to apply in a follow-up write-permission run.

**Suite health:** not re-run in this audit; last green at audit run 31/001 (clean per `git log -1 --format=%s 8e092c7`).
