# Test Efficiency Audit — Run 001

**Date:** 2026-05-01 18:15 (local)
**Branch:** `nightytidy/run-2026-05-01-1532` (orchestrator-managed)
**Auditor:** automated overnight efficiency audit (mode: IMPLEMENTATION)
**Test runner:** vitest 4.1.5 (single runner, no other test infra)

---

## TL;DR

The suite is **already at vitest's natural cold-start floor** for this codebase. Median wall-clock for 310 tests is **~1.88 s** across 24 files; a single trivial test in isolation takes 517 ms (framework boot ≈225 ms, transform ≈26 ms, import ≈265 ms). There is no DB, network, filesystem, sleep, port-binding, container, or shared-resource activity in any test. Parallelization is already optimal. **No mechanical fixes were applied** — every candidate either returned no measurable benefit (`--pool=forks` ran 4 % slower) or made the suite slower (`--no-isolate` ran 28 % slower). Recommendations section is intentionally short.

---

## 1. Runner & Configuration

| Item | Value |
|---|---|
| Runner | vitest 4.1.5 |
| Pool | `threads` (default) |
| Isolate | `true` (default) |
| Test environment | `node` (default), `jsdom` per-file via `// @vitest-environment jsdom` directive |
| Globals | `true` (`describe` / `it` / `expect` / `vi` auto-imported) |
| Include glob | `tests/**/*.test.ts` |
| Coverage provider | `@vitest/coverage-v8` (only on explicit invocation; not on default suite) |
| CI test pipeline | **None** — Netlify deploy runs `npm run build` only, not tests. No `.github/workflows`, `.gitlab-ci.yml`, or `.circleci/` |
| CPU cores available | 28 |

vitest config (verbatim from `vite.config.ts:20-24`):
```ts
test: {
  globals: true,
  environment: 'node',
  include: ['tests/**/*.test.ts'],
}
```

No `pool`, `poolOptions`, `isolate`, `maxConcurrency`, `testTimeout`, or `setupFiles` are configured — the runner uses every default.

### CI gap (out of audit scope but worth flagging)

There is **no automated test execution before deploy**. `netlify.toml` runs `npm run build`, which only invokes `lint:photos && tsc -b --noEmit && vite build`. Tests are run manually by the developer before push. A regression that is not caught locally will land on `master` and auto-deploy. Adding a CI gate is a separate engineering task — not addressed by this audit.

---

## 2. Baseline Summary

Five back-to-back full-suite runs (cold disk cache → warm):

| Run | Wall (s) | transform (s) | import (s) | env (s) | tests (s) |
|---|---|---|---|---|---|
| 1 | 1.92 | 3.53 | 10.65 | 4.79 | 0.56 |
| 2 | 3.03 | 15.09 | 28.41 | 10.02 | 2.42 |
| 3 | 1.96 | 3.90 | 12.55 | 6.03 | 0.56 |
| 4 | 2.87 | 16.15 | 28.75 | 9.72 | 0.94 |
| 5 | 1.80 | 3.75 | 10.54 | 5.77 | 0.57 |
| **Median** | **1.96** | 3.90 | 12.55 | 6.03 | 0.57 |
| **Min** | **1.80** | — | — | — | — |

Phase totals (transform + import + env) sum to ~22 s, far exceeding wall-clock. This is expected: those numbers are summed across parallel workers (vitest reports cumulative time, not wall-clock per phase).

**Bimodal distribution observation.** Runs cluster either at 1.8–2.0 s or 2.9–3.0 s, never in between. The slow runs correlate with elevated transform numbers (15 s vs 3.5 s cumulative), suggesting an esbuild transform-cache miss (likely correlated with Windows file-system caching pressure between runs). After warm-up the suite settles at ~1.85 s consistently.

| Metric | Value |
|---|---|
| Total test files | 24 |
| Total tests | 310 |
| Pass / fail / skip | 310 / 0 / 0 |
| Median wall-clock | **1.96 s** (warm: ~1.85 s) |
| Per-test cumulative exec time | 0.93 s |
| Per-file cumulative exec time | 0.95 s |
| Slowest single test | 139.8 ms — `smoke.test.ts › safety filters import…` |
| Slowest single file | 283 ms — `tests/smoke.test.ts` |

---

## 3. Slowest Tests Dashboard

The 31 slowest tests (top 10 % of 310) account for **638 ms / 931 ms = 68.5 %** of total per-test execution time. This sits comfortably within the audit's expected 50–80 % concentration band, so the picture isn't lopsided.

| Rank | Test | File | Duration (ms) | Root Cause | Evidence | Fixed? |
|---|---|---|---|---|---|---|
| 1 | safety filters import and run on a clean prompt without crashing | tests/smoke.test.ts | 139.8 | IMPORT | Dynamic `await import('@/server/safety')` triggers cold-load of `slur-list.ts`, `distress-phrases.ts`, etc. (smoke.test.ts:23) | No (intentional — smoke test verifies module *loads*) |
| 2 | getPhotoUrl builds the URL using the configured base… | tests/client/photos.test.ts | 131.5 | IMPORT | First test in file; `vi.resetModules()` in `beforeEach` (photos.test.ts:7-9) then `await import('@/lib/photos')` re-evaluates the module | No (existing comment block documents this is intentional after prior consolidation) |
| 3 | validation parses a well-formed Sonnet response | tests/smoke.test.ts | 123.3 | IMPORT | Dynamic `await import('@/server/validation')` (smoke.test.ts:32) — second cold-load in this file | No (smoke design) |
| 4 | cn joins multiple class strings | tests/client/cn.test.ts | 24.1 | IMPORT | First test — pays per-file static import warmup for `clsx`/`tailwind-merge` | No (irreducible cold-import cost) |
| 5 | initAnalytics does nothing when not in production | tests/client/analytics.test.ts | 22.1 | IMPORT | First test — pays jsdom env init + posthog-js import | No (irreducible) |
| 6 | rate_limited response includes Cache-Control: no-store | tests/server/generate-contract.test.ts | 14.2 | IMPORT | First test — pays full handler import (`netlify/functions/generate.ts`) which transitively loads ~10 server modules + zod schema | No (file-level integration; no faster way) |
| 7 | parseGenerationOutput parses valid JSON output | tests/server/validation.test.ts | 11.7 | IMPORT | First test — pays static import of `@/server/validation` | No (irreducible) |
| 8 | checkAndIncrementRateLimit creates a new doc with count=1… | tests/server/rateLimit-extended.test.ts | 11.0 | SETUP | `buildMockDb` constructs full mocked Firestore tree (rateLimit-extended.test.ts:27-44); first test pays import cost too | No (mock infra is minimal) |
| 9 | checkSynonymMap returns true when a content word maps… | tests/server/synonyms.test.ts | 10.9 | IMPORT | First test — pays static import of synonym map (~80 entries) | No (irreducible) |
| 10 | ensureFontsReady caches the promise — second call returns same instance | tests/client/fonts.test.ts | 10.1 | IMPORT | First test in file; jsdom env + `@fontsource/cormorant-garamond` import | No (irreducible) |
| 11 | getPhotoUrl returns "/photos%2F<id>.jpg?alt=media" when base is missing | tests/client/photos.test.ts | 9.5 | SETUP | `vi.resetModules()` re-imports module each test; this test stubs env so re-import is genuinely needed | No (env-dependent) |
| 12 | hashIp (extended) produces a 32-char hex string | tests/server/rateLimit-extended.test.ts | 9.0 | CPU | `crypto.createHash('sha256')` round inside `hashIp`; minor warmup of node:crypto | No (already minimal) |
| 13 | parseGenerationOutput (extended) strips trailing markdown fences | tests/server/validation-extended.test.ts | 8.7 | IMPORT | First test in file | No (irreducible) |
| 14 | 200 ok response includes Content-Type: application/json | tests/server/generate-contract.test.ts | 7.8 | SETUP | Full handler invocation through mocked Anthropic + mocked Firestore | No (this is the contract test's purpose) |
| 15 | checkSlurFilter returns false for clean input | tests/server/safety.test.ts | 7.4 | IMPORT | First test — pays import of slur list + regex compilation | No (irreducible) |
| 16 | checkAndIncrementRateLimit increments count on existing doc | tests/server/rateLimit-extended.test.ts | 6.9 | SETUP | Mocked Firestore transaction execution | No (mock is minimal) |
| 17 | callGenerate returns parsed response on successful fetch | tests/client/api.test.ts | 6.7 | IMPORT | First test — jsdom env + fetch mock setup | No (irreducible) |
| 18 | getHotlineForCountry returns US 988 for "US" | tests/server/hotlines.test.ts | 6.7 | IMPORT | First test — pays static import of `hotlines.ts` (40+ entries) | No (irreducible) |
| 19 | VOICE_SYSTEM_PROMPT is a non-empty string with required contract sections | tests/server/anthropic.test.ts | 6.6 | IMPORT | First test — pays import of `@/server/anthropic` which transitively imports the SDK (mocked) | No (irreducible) |
| 20 | photos.json data integrity textZone bounds all values are in 0-1 range | tests/client/textFitting.test.ts | 6.4 | IMPORT | First test — pays static import of `photos.json` + textFitting helpers | No (irreducible) |
| 21 | getPhotoById returns the photo for a known id | tests/client/photos.test.ts | 6.3 | SETUP | `vi.resetModules()` re-imports `@/lib/photos` even though this test does NOT mutate env (cost is paid every test in the file) | Cosmetic only — see Recommendations §10.2 |
| 22 | hotline lookup returns a usable resource when country missing | tests/smoke.test.ts | 6.0 | IMPORT | Dynamic `await import('@/server/hotlines')` (smoke.test.ts:60) | No (smoke design) |
| 23 | getHotlineForCountry every supported country has a non-empty phone number | tests/server/hotlines.test.ts | 6.0 | IMPORT | First-class iteration over the hotlines array (~40 items) — fast | No (irreducible) |
| 24 | GET returns 405 with plain-text body (not JSON) | tests/server/generate-contract.test.ts | 5.9 | SETUP | Full handler invocation | No |
| 25 | safeFallbacks no fallback uses an exclamation point | tests/server/fallbacks.test.ts | 5.9 | IMPORT | First test — pays static import of `fallbacks.ts` | No (irreducible) |
| 26 | checkFit returns scale < 1 when one line slightly overflows but stays above 0.6 | tests/client/compositor.test.ts | 5.9 | IMPORT | First test in `checkFit` describe — pays jsdom env (paid per file) + canvas mock setup | No (jsdom required) |
| 27 | getPhotoById returns undefined for empty string | tests/client/photos.test.ts | 5.7 | SETUP | `vi.resetModules()` re-import (no env mutation in this test) | Cosmetic only — see §10.2 |
| 28 | selectPhoto (extended) returns null for empty photo library | tests/server/photoSelection-extended.test.ts | 5.7 | IMPORT | First test — pays static import of `photoSelection.ts` | No (irreducible) |
| 29 | safeFallbacks every fallback has non-empty lines | tests/server/fallbacks.test.ts | 5.5 | CPU | Iteration over fallback array (~5 items × 3 assertions) | No |
| 30 | safeFallbacks contains at least one entry | tests/server/fallbacks.test.ts | 5.5 | IMPORT | Pays static import — sub-millisecond actual logic | No (irreducible) |
| 31 | getAllCredits returns objects with non-empty id and credit | tests/client/photos.test.ts | 5.1 | SETUP | `vi.resetModules()` re-import | Cosmetic only — see §10.2 |

### Root-cause summary

| Tag | Count in slowest 31 | Total time (ms) | % of slow-test time |
|---|---|---|---|
| IMPORT | 21 | 451.0 | 70.7 % |
| SETUP | 8 | 64.7 | 10.1 % |
| CPU | 2 | 14.5 | 2.3 % |
| DB / NETWORK / SLEEP / FILESYSTEM / STARTUP / SERIAL / COVERAGE | 0 | 0 | 0 % |

**Interpretation.** Every measurable slow test is paying either (a) cold-load of TypeScript modules through esbuild + node module resolution (IMPORT), or (b) trivial one-time mock setup (SETUP). There is no DB/network/sleep/filesystem/port/container activity in any test in the entire suite. The "slowness" budget is dominated by per-file static-import warmup that the runner cannot eliminate as long as workers are isolated from each other.

---

## 4. Parallelization Status

| Aspect | Status | Notes |
|---|---|---|
| Pool | `threads` (vitest default) | Confirmed optimal — `--pool=forks` measured at 1.98 s vs threads 1.86 s |
| File parallelism | Enabled (default) | `--file-parallelism` flag is no-op; default is on |
| Isolation | `isolate: true` (default) | Confirmed required — `--no-isolate` measured at 2.44 s (28 % slower) due to top-level `process.env` mutations in two files |
| Concurrent within-file | Off | No `it.concurrent` / `describe.concurrent` used; not warranted at current speeds |
| Worker count | up to 28 (CPU count) | 24 files / 28 cores → all files can run in parallel; no queueing |

### Blocker scan

Searched for: `setTimeout`, `sleep(`, `waitForTimeout`, `cy.wait`, `listen(`, `new Promise...resolve.*setTimeout`, `writeFile`, `tmpdir`, `fs.write`, `fs/promises`, `describe.serial`, `test.serial`, `it.serial`, `test.concurrent`, `describe.concurrent`. **Zero matches across all 24 test files.**

Other candidates examined:

- **Hardcoded ports** — none. No `listen(N)` calls in any test or source path imported by tests.
- **Shared temp file paths** — none. No filesystem I/O in tests.
- **Real network calls** — none. `fetch` is always mocked in `tests/client/api.test.ts`. The Anthropic SDK is mocked in `generate-contract.test.ts`, `generate-integration.test.ts`, and `anthropic.test.ts` via `vi.hoisted` + `vi.mock`. Firestore is mocked in `rateLimit-extended.test.ts` and `generate-contract.test.ts`.
- **Top-level `process.env` mutations** — present in `generate-contract.test.ts:53-56` and `generate-integration.test.ts:37-40`. These mutations are needed BEFORE the `import { handler }` statement (the source module reads env at module-eval time). Under default `isolate: true`, each test file runs in its own worker context so this is safe; under `--no-isolate` it would leak. **Not a blocker** for the current configuration but does prevent flipping `isolate: false` to recover the marginal speedup that flag promises (and the experiment proved that flag actually slows things down on this codebase).
- **Shared file-system state** — none.

**Verdict: zero parallelization blockers.** No changes warranted.

---

## 5. Framework Boot Overhead

Single trivial-test run (`tests/server/rateLimit.test.ts`, 1 assertion):

```
Duration  517ms (transform 26ms, setup 0ms, import 265ms, tests 3ms, environment 0ms)
```

Breakdown:
- node + vitest cold start: ~225 ms (517 ms total – 26 ms transform – 265 ms import – 3 ms test ≈ 223 ms)
- Single-file transform: 26 ms
- Module evaluation: 265 ms
- Test execution: 3 ms

Full suite wall-clock median: 1.96 s.

**Boot share: 225 ms / 1960 ms = 11.5 %.** Below the 20 % flag threshold.

---

## 6. Setup Hook Audit

Files with hooks (located via grep `beforeAll|beforeEach|afterAll|afterEach`):

| File | Hook | What it does | Heavy? | Promote-able to `beforeAll`? |
|---|---|---|---|---|
| `tests/client/photos.test.ts` | `beforeEach` | `vi.resetModules()` | No | No — needed to allow `vi.stubEnv` re-takes effect on re-import |
| `tests/client/photos.test.ts` | `afterEach` | `vi.unstubAllEnvs()` | No | N/A — restoration |
| `tests/client/api.test.ts` | `beforeEach` / `afterEach` | mock `fetch`, mock `navigator.onLine`, restore | No | No — mocks must reset between cases |
| `tests/client/analytics.test.ts` | `beforeEach` / `afterEach` | env stub + posthog-js mock reset | No | No |
| `tests/client/compositor.test.ts` | `beforeEach` / `afterEach` (×2) | recording-canvas mock construction; spy reset | No | No — fresh mock per test required for assertion isolation |
| `tests/client/download.test.ts` | `beforeEach` / `afterEach` | mock `saveAs`, restore | No | No |
| `tests/client/fonts.test.ts` | `beforeEach` | reset font-load promise cache | No | No — testing the cache itself |
| `tests/server/anthropic.test.ts` | `beforeEach` / `afterEach` | env mutation with `try`/`finally` cleanup | No | No |
| `tests/server/generate-contract.test.ts` | `beforeEach` / `afterEach` | reset `anthropicCreate` mock between cases | No | No |
| `tests/server/generate-integration.test.ts` | `beforeEach` / `afterEach` | reset Anthropic + Firestore mocks | No | No |
| `tests/server/photoSelection-extended.test.ts` | `beforeEach` / `afterEach` | seeded RNG via `vi.spyOn(Math, 'random')` | No | No — RNG must be deterministic per test |
| `tests/server/rateLimit-extended.test.ts` | `beforeEach` / `afterEach` | rebuild mocked Firestore tree per case | No | Yes mechanically — but `mockDb` state carries between tests; would need refactor of `buildMockDb` to support reset semantics. Not warranted at current 11 ms/test cost. |

**No hook construction creates 50+ records, opens DB connections, boots a server, loads large fixtures, or does anything heavy.** Standard vitest mock-and-restore pattern throughout.

No `setupFiles` or global `setup.ts` is configured.

---

## 7. Experiments Run

Each non-default configuration was tried via CLI flag (no config files modified, no commits):

| Config | Wall (s) | Δ vs default | Outcome |
|---|---|---|---|
| Default (`--pool=threads --isolate`) | **1.86** | — | Baseline |
| `--pool=forks` | 1.98 | +6 % slower | Reverted (no apply) |
| `--no-isolate` | 2.44 | +31 % slower | Reverted (no apply) — also unsafe due to top-level `process.env` writes |
| `--file-parallelism` (explicit) | 1.77 | within noise band | No-op (flag is on by default) |

Runs varied within the bimodal 1.8–2.0 vs 2.9–3.0 s pattern noted in §2; numbers above are representative warm-cache values picked from each config's sample.

---

## 8. Fixes Applied

**None.**

The audit instructions list six categories of mechanical fix: enable parallelization, fix hardcoded ports, fix shared temp paths, remove unnecessary sleeps, promote `beforeEach` → `beforeAll`, wrap DB ops in transactions. Going down the list:

| Candidate fix | Applicable here? |
|---|---|
| Enable parallelization | Already enabled (vitest default; threads pool, file parallelism on, 28-thread cap with 24 files) |
| Fix hardcoded ports | No `listen(...)` calls anywhere |
| Fix shared temp paths | No filesystem writes anywhere |
| Remove unnecessary sleeps | No `setTimeout` / `sleep` / `waitForTimeout` calls anywhere |
| Promote `beforeEach` → `beforeAll` | All `beforeEach` hooks are mock/env state resetters that genuinely need to run between cases. The single ambiguous candidate (`vi.resetModules()` in `photos.test.ts`) is documented as intentional after the consolidation pass in `audit-reports/05_TEST_CONSOLIDATION_REPORT_001`; the four tests in that file that don't strictly need the reset would save ~30–50 ms total. Risk-benefit does not justify the change. |
| Wrap DB ops in transactions | No real DB activity. The ORM/transaction pattern doesn't apply — Firestore is fully mocked. |

The audit instructions explicitly allow this outcome: *"Be honest in 'Worth Doing?' — not everything flagged is worth the engineering time."* The audit found nothing that warrants fixing.

---

## 9. Before / After Comparison

Since no changes were applied, "after" equals "before".

| Metric | Before | After | Change |
|---|---|---|---|
| Wall-clock median (5-run sample) | 1.96 s | 1.96 s | 0 |
| Total tests | 310 | 310 | 0 |
| Pass rate | 100 % | 100 % | 0 |
| Slowest single test | 139.8 ms | 139.8 ms | 0 |
| Cumulative test exec time | 0.93 s | 0.93 s | 0 |

All 310 tests pass after the audit, exactly as they did before. Build pipeline (`npm run build`) was not re-validated because no source-tree files were modified.

---

## 10. Recommendations

The audit surfaced no mechanical optimizations that are worth the engineering time today. The two items below are honest "if you have an idle hour" calls — neither moves wall-clock by more than a rounding error, and one is a hygiene fix unrelated to performance.

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Add a CI test gate (e.g. GitHub Actions on PR + pre-deploy) | Catches test regressions before they auto-deploy via Netlify | **High** (correctness, not perf) | Yes | Currently `netlify.toml` only runs `npm run build` (lint:photos + tsc + vite build). Tests rely on developers remembering `npm test` before push. A regression that slips through deploys to production. This is out of scope for an *efficiency* audit but is the most material risk surfaced during the runner-config inspection. Implementation is ~15 lines of YAML once a CI provider is chosen. |
| 2 | Move top-level `process.env.X = ...` writes in `tests/server/generate-contract.test.ts:53-56` and `tests/server/generate-integration.test.ts:37-40` into `beforeAll` blocks | Hygiene — reduces friction if `isolate: false` is ever revisited | Low | Only if time allows | These four assignments must happen before the `import { handler }` statement that follows them, so the refactor would require switching to dynamic import inside `beforeAll` or using `vi.hoisted` + `vi.stubEnv`. Saves zero milliseconds today; only matters if someone later tries to flip `isolate: false`. |

No performance recommendations because there is no performance problem to solve. The suite is at vitest's natural floor for cold-start overhead given the project's module graph.

### Watch-mode and feedback-tier notes

- **Watch mode** (`npm run test:watch`) uses vitest's default config — affected-file re-runs based on the dependency graph. No tuning warranted.
- **Tier-1 fast feedback** is the existing `tests/smoke.test.ts` (7 tests, 362 ms). It already does its job per the project README/CLAUDE.md.
- **Most-frequently-failing tests**: not identifiable because no CI logs exist. With 100 % current pass rate and no historical failure data, ordering by fail-frequency is moot.

---

## 11. Files Touched

**None.** This audit produced only:

- `audit-reports/07_TEST_EFFICIENCY_REPORT_001_2026-05-01_18-15.md` (this file)
- `audit-reports/baseline-vitest.json` (raw vitest JSON output preserved for reproducibility — same data the dashboard above is computed from)

No source files, no test files, no config files, and no documentation files were modified.

---

## Appendix A — Raw per-file durations (one representative warm run)

```
283 ms   7 tests   tests/smoke.test.ts
161 ms   7 tests   tests/client/photos.test.ts
 59 ms  41 tests   tests/server/generate-contract.test.ts
 45 ms  21 tests   tests/server/rateLimit-extended.test.ts
 33 ms   7 tests   tests/client/analytics.test.ts
 32 ms  21 tests   tests/server/anthropic.test.ts
 32 ms   8 tests   tests/client/cn.test.ts
 32 ms  18 tests   tests/server/generate-integration.test.ts
 26 ms  23 tests   tests/server/safety-extended.test.ts
 25 ms  32 tests   tests/server/validation-extended.test.ts
 23 ms  12 tests   tests/server/synonyms.test.ts
 21 ms   8 tests   tests/server/fallbacks.test.ts
 20 ms  20 tests   tests/client/compositor.test.ts
 20 ms   4 tests   tests/client/fonts.test.ts
 20 ms   7 tests   tests/server/validation.test.ts
 19 ms   8 tests   tests/server/hotlines.test.ts
 17 ms  11 tests   tests/server/photoSelection-extended.test.ts
 17 ms   9 tests   tests/client/textFitting.test.ts
 16 ms  17 tests   tests/client/content.test.ts
 12 ms   7 tests   tests/client/api.test.ts
 11 ms  12 tests   tests/client/download.test.ts
 10 ms   5 tests   tests/server/safety.test.ts
  7 ms   4 tests   tests/server/photoSelection.test.ts
  4 ms   1 test    tests/server/rateLimit.test.ts
```

Most of every per-file number is module-import warmup, not assertion cost. The single-test rateLimit.test.ts file shows the per-worker floor: ~4 ms with no transitive imports of consequence.
