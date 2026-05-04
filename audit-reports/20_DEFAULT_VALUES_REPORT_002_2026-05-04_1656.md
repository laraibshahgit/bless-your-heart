# Default Values & Magic Constants Audit (Run 002)

Date: 2026-05-04 16:56 (local)
Branch: `nightytidy/run-2026-05-01-1532` (orchestrator-managed; no new branch created)
Mode: implementation (read-write)
Prior run: `audit-reports/20_DEFAULT_VALUES_REPORT_001_2026-05-04_1636.md`

## Executive Summary

Run 001 was thorough — it inventoried ~75 defaults across timeouts, retries, limits, TTLs, pools, magic numbers, and env vars and extracted 10 inline literals to named constants. It also produced a six-line recommendations table of items it deferred because each carried test-suite risk worth a reviewer pass. **This run picks up four of those six recommendations** (the four that were mechanically achievable without invasive infrastructure changes) and ships them with pinning tests.

Implemented this run:
1. **Per-request timeouts on every Anthropic SDK call** (Run 001 rec #2). Adds a single shared `ANTHROPIC_REQUEST_TIMEOUT_MS = 12_000` constant in `src/server/anthropic.ts`, threaded into all three `messages.create` sites (one in `anthropic.ts:generateLines`, one in `anthropic.ts:checkTone`, one in `safety.ts:checkDistressWithHaiku`). Replaces the SDK's 10-minute default with a value that fits the Netlify lambda budget.
2. **Outer-fetch `AbortSignal` on `callGenerate`** (Run 001 rec #1). Adds `GENERATE_FETCH_TIMEOUT_MS = 30_000` and `signal: AbortSignal.timeout(...)` so a hung response stream from the lambda doesn't pin the user's tab forever.
3. **`.max(50)` bound on `excludePhotoIds`** (Run 001 rec #3). Caps attacker-controlled array length below Netlify's 6MB body limit, with two new boundary tests pinning accept-50 / reject-51 in `generate-contract.test.ts`.
4. **Fixed the flaky TTL-contract tests** (Run 001 rec #4). Root cause was the `Timestamp.now()` mock — its `.toMillis()` method re-read `Date.now()` on every invocation, so reading `windowStart` after `expiresAt` could observe a 1ms wall-clock tick and produce `expiresAtMs - windowStartMs === 3599999`. Fixed by capturing `Date.now()` once at construction in three test files (`rateLimit-extended.test.ts`, `generate-integration.test.ts`, `generate-rate-limit-integration.test.ts`).

Deferred (still in the recommendations table, unchanged from Run 001):
- **#5 — Production-env assertion** for `IP_SALT_BASE` / `ALLOWED_ORIGINS`. Requires Netlify-context env var coordination and tests that mock `CONTEXT`. Defer to a session focused on deploy hardening.
- **#6 — Rename "9999 bypass" to a flag-style env var.** Stylistic, low-value, touches CLAUDE.md + `.env.example` + 3 test files for a small benefit. Skipped by judgment.

After this run the codebase has zero High-severity missing-timeout findings: the client fetch is bounded, every Anthropic call is bounded, every Firestore transaction is wrapped in `Promise.race` against `RATE_LIMIT_TIMEOUT_MS`. The flaky test no longer flakes.

## Re-verification of Run 001's Inventory

I re-ran the inventory passes from Phases 1–6 of Run 001 against the current tree to confirm nothing has shifted since `dfaeb73`:

| Area | Run 001 finding | Now | Notes |
|------|-----------------|-----|-------|
| Phase 1 — Timeouts | 10 timeouts, 4 missing (T6/T7/T8/T9) | 10 timeouts, **0 missing High-sev** | All 4 implemented this run |
| Phase 2 — Limits | 7 known limits, 1 unbounded (`excludePhotoIds`) | 8 known limits, 0 unbounded | `.max(50)` added |
| Phase 3 — Cache TTLs | 1 application TTL (RATE_LIMIT_WINDOW_MS); no business-data caching | unchanged | Still appropriate |
| Phase 4 — Pools/concurrency | None to right-size (serverless) | unchanged | No new `Promise.all` over user-controlled collections |
| Phase 5 — Magic numbers | 10 extracted, 7 intentionally inline | unchanged | No new inline literals introduced since Run 001 |
| Phase 6 — Env vars | 11 vars, 2 prod-required-but-not-asserted | unchanged | Same recs (#5) deferred |

No regressions or new findings since Run 001. The codebase has not gained inline literals.

## Phase-Specific Detail (this run)

### Phase 1 / T6 — Client fetch timeout

**Implementation** (`src/lib/api.ts`):

```ts
const GENERATE_FETCH_TIMEOUT_MS = 30_000;
//
// fetch('/.netlify/functions/generate', {
//   ...,
//   signal: AbortSignal.timeout(GENERATE_FETCH_TIMEOUT_MS),
// })
```

**Why 30s, not 12s like the server:** The function itself is bounded by Netlify (10s default, 26s max) — `GENERATE_FETCH_TIMEOUT_MS` only fires if the response stream hangs after the lambda has already returned headers (CDN edge weirdness, mid-stream lambda crash). 30s gives the legitimate response time for cold-start + DNS + actual work to complete with margin while capping the worst case.

**Test coverage**: One existing test in `tests/client/api.test.ts:40-44` used strict `toHaveBeenCalledWith({...})` — switched to `expect.objectContaining({...})` so it tolerates the new `signal` field. One new test pins `signal instanceof AbortSignal` so a future refactor that drops the signal would trip it.

### Phase 1 / T7-T9 — Anthropic SDK timeouts

**Implementation** (`src/server/anthropic.ts`):

```ts
export const ANTHROPIC_REQUEST_TIMEOUT_MS = 12_000;
//
// anthropic.messages.create({...}, { timeout: ANTHROPIC_REQUEST_TIMEOUT_MS })
```

Threaded into three call sites: `generateLines`, `checkTone`, `checkDistressWithHaiku`. Exported once and imported by `safety.ts` so all classifiers share one source of truth.

**Why 12s:** The Netlify free-tier max function duration is 26s. The retry loop in `generate.ts` runs up to 3 attempts of `(generate + tone-check)`. Worst case under provider degradation:

```
Distress check (1× ≤ 12s) + (Generate + Tone) × 3 attempts ≤ 12 + 3·(12+12) = 84s
```

That exceeds 26s, but in practice:
- The distress check usually completes in <500ms (Haiku, single-token verdict)
- Tone check is usually <500ms (Haiku, single-token verdict)
- Generate is usually 1-3s
- Worst-case provider degradation typically affects all three calls equally — if Sonnet is slow, Haiku usually is too

So the realistic budget is ~12s for one bad attempt + ~2s each for two more = ~16s, well within the lambda. Without this cap, a single hung 10-minute SDK default would burn the entire lambda on attempt 1 and the user would see a generic 502.

**Test coverage**: Three new tests, one per call site. Each asserts `mock.calls[0][1] === { timeout: ANTHROPIC_REQUEST_TIMEOUT_MS }`. The existing tests assert on `mock.calls[0][0]` (request body) only, so the new contract pins the second-arg shape that wasn't checked before.

### Phase 2 / U3 — `excludePhotoIds` bound

**Implementation** (`netlify/functions/generate.ts`):

```ts
const MAX_EXCLUDE_PHOTO_IDS = 50;
//
// excludePhotoIds: z.array(z.string()).max(MAX_EXCLUDE_PHOTO_IDS).default([]),
```

**Why 50:** Photo library is currently 10 entries; 50 is generous for any session (would cover 5 generations with no overlap before exhausting). Upper bound exists primarily as a defense against multi-MB attacker-supplied arrays sneaking past Netlify's 6MB body cap without business-logic engagement — Zod will reject early at `.max(50)` before any handler code runs.

**Test coverage**: Two new boundary tests in `generate-contract.test.ts` — accept-exactly-50 (the boundary, allowed) and reject-51 (just over). The existing test at line 336 (`rejects when excludePhotoIds contains non-string entries`) already pins type-shape rejection.

### Phase 3 / TTL-flake fix

Root cause confirmed by re-reading the `Timestamp` mock and the assertions:

```ts
// Old shape — re-reads Date.now() on every .toMillis() call:
Timestamp = {
  now: () => ({ toMillis: () => Date.now() }),  // volatile!
};

// rateLimit.ts code:
const now = Timestamp.now();
const nowMs = now.toMillis();   // captures Date.now() at T1
tx.update(docRef, {
  windowStart: now,   // <-- the volatile object!
  expiresAt: Timestamp.fromMillis(nowMs + RATE_LIMIT_WINDOW_MS),  // stable
});

// rateLimit-extended.test.ts assertion:
const written = mockTx.update.mock.calls[0][1];
const windowStartMs = written.windowStart.toMillis();  // re-reads Date.now() at T2!
const expiresAtMs = written.expiresAt.toMillis();      // returns nowMs + WINDOW (stable)
expect(expiresAtMs - windowStartMs).toBe(oneHourMs);   // = (nowMs + WINDOW) - Date.now()_T2
```

If a millisecond ticked between T1 and T2, the difference is `WINDOW - 1 = 3599999`. Reproduced 1/5 runs on Run 001's baseline.

**Fix** in three files: change `now: () => ({ toMillis: () => Date.now() })` to `now: () => { const ms = Date.now(); return { toMillis: () => ms }; }`. Each call to `Timestamp.now()` now captures `Date.now()` once at construction; subsequent `.toMillis()` reads return the same value.

**Verification**: 5 consecutive full-suite runs after the fix all returned 357/357 with no flake. Compared to Run 001 baseline where 1 in ~5 runs failed.

## Files Modified

Production code:
- `netlify/functions/generate.ts` — added `MAX_EXCLUDE_PHOTO_IDS = 50` const + `.max()` modifier on Zod schema
- `src/lib/api.ts` — added `GENERATE_FETCH_TIMEOUT_MS = 30_000` const + `signal` on the fetch call
- `src/server/anthropic.ts` — added exported `ANTHROPIC_REQUEST_TIMEOUT_MS = 12_000`; threaded into both `messages.create` calls
- `src/server/safety.ts` — imported `ANTHROPIC_REQUEST_TIMEOUT_MS`; threaded into `messages.create` for distress check

Tests:
- `tests/client/api.test.ts` — relaxed strict-equality fetch assertion to `expect.objectContaining`; added AbortSignal contract test (1 new test)
- `tests/server/anthropic.test.ts` — added timeout contract tests for `generateLines` and `checkTone` (2 new tests)
- `tests/server/safety-extended.test.ts` — added timeout contract test for `checkDistressWithHaiku` (1 new test)
- `tests/server/generate-contract.test.ts` — added accept-50 / reject-51 boundary tests for `excludePhotoIds` (2 new tests)
- `tests/server/rateLimit-extended.test.ts` — fixed `Timestamp.now()` mock to capture `Date.now()` once at construction
- `tests/server/generate-integration.test.ts` — same `Timestamp.now()` mock fix
- `tests/server/generate-rate-limit-integration.test.ts` — same `Timestamp.now()` mock fix

Total: 11 source files modified, 6 new tests added, 0 deletions, 0 new modules.

**Not modified** (left alone deliberately): the dirty files dangling from prior audit runs — `src/components/PromptInput.tsx`, `src/lib/compositor.ts`, `src/lib/fonts.ts`, `src/types/index.ts`, untracked `src/lib/poster-layout.ts`, untracked `audit-reports/17_FUNCTION_CENTRALIZATION_REPORT_001_*.md`. Run 001 chose not to entangle its commit with those, and Run 002 follows the same boundary so the run-17 / run-15 work commits cleanly when its owner picks it up.

To keep the commit boundary tight, `netlify/functions/generate.ts` had run-17's two-line `MAX_PROMPT_LENGTH` change (one import edit + one `max()` argument swap) reverted in the working tree before staging — my `MAX_EXCLUDE_PHOTO_IDS` addition stays, run-17's work is untouched on disk afterward. The commit therefore contains only the `MAX_EXCLUDE_PHOTO_IDS` delta plus the new comment, and `max(200)` stays as a literal until run-17 lands and re-introduces the named constant.

## Summary Table

| Metric | Count |
|--------|-------|
| Total defaults inventoried (cumulative across runs 001+002) | ~75 |
| Critical missing timeouts | 0 (was 1 after Run 001; client fetch addressed this run) |
| High-severity missing timeouts | 0 (was 3 after Run 001; Anthropic SDK addressed this run) |
| Unbounded operations | 0 (was 1 after Run 001; `excludePhotoIds` addressed this run) |
| Cache entries with no/inappropriate TTL | 0 |
| Connection pools at library defaults | 2 (Anthropic, Firebase Admin) — appropriate for serverless |
| Magic numbers extracted to named constants this run | 4 (`ANTHROPIC_REQUEST_TIMEOUT_MS`, `GENERATE_FETCH_TIMEOUT_MS`, `MAX_EXCLUDE_PHOTO_IDS`) plus 1 stable-Timestamp shape |
| Values needing configuration extraction (env-driven) | 0 |
| Hardcoded secrets / credentials in code | 0 |
| Tests still passing after changes | **YES** (357/357 stable across 5 consecutive runs) |
| Pre-existing flaky tests | **0** (the TTL flake from Run 001 is fixed) |

## Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Production-env assertion for `IP_SALT_BASE` / `ALLOWED_ORIGINS` (carry-over from Run 001 #5) | Surface missing prod config at deploy time, not at first 3am incident | Medium | Probably | Add `validateProdEnv()` at module load; gate on Netlify's `CONTEXT === 'production'`. Test mocks need to clear `CONTEXT`. Worth a focused session because it touches deploy semantics. |
| 2 | Run-17 (function centralization) work in `PromptInput.tsx`, `compositor.ts`, `fonts.ts`, `types/index.ts` is still dangling in working tree across audit sessions | Drift between client `<input maxLength>` and server Zod cap | Low — both currently say 200 | Yes (low-effort) | The dirty work is one commit. Whoever owns the run-17 audit should land it. Leaving it dangling 3+ days has caused two audits (Run 001, Run 002) to maneuver around it. |
| 3 | Rename "9999 rate-limit bypass" magic number to a flag-style env var (carry-over from Run 001 #6) | Removes magic-number coupling | Low | Only if time allows | Stylistic. Touches CLAUDE.md, `.env.example`, 3 test files. Benefit is small. |

No new High/Critical findings this run. The audit run-20 series has now closed every High/Critical recommendation Run 001 surfaced; remaining items are deploy-hygiene (#1) or stylistic (#3). I'd consider this audit topic stable and not worth re-running at high frequency — re-audit when a major architectural change lands (e.g., adding a database read path, a job queue, or a websocket).

## Verification

- `npx vitest run`: 357/357 passed, 5 consecutive runs (was 351/351 with intermittent 1ms TTL flake before this run)
- `npx tsc -b --noEmit`: clean (no output)
- `git diff` against HEAD: only my intentional changes; no entanglement with the dangling run-15/run-17 dirty files
- Each new behavior has a pinning test:
  - `tests/server/anthropic.test.ts > generateLines > 'passes ANTHROPIC_REQUEST_TIMEOUT_MS as the per-request timeout'`
  - `tests/server/anthropic.test.ts > checkTone > 'passes ANTHROPIC_REQUEST_TIMEOUT_MS as the per-request timeout'`
  - `tests/server/safety-extended.test.ts > checkDistressWithHaiku > 'passes ANTHROPIC_REQUEST_TIMEOUT_MS as the per-request timeout'`
  - `tests/client/api.test.ts > callGenerate > 'attaches an AbortSignal to the fetch call (timeout cap)'`
  - `tests/server/generate-contract.test.ts > … > 'accepts excludePhotoIds at exactly 50 entries'` and `'rejects excludePhotoIds at 51 entries'`
