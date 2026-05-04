# Test Hardening Report — 2026-05-01

**Branch:** `nightytidy/run-2026-05-01-1532` (orchestrator-managed; the prompt's `test-hardening-[date]` directive was overridden by the standing NightyTidy multi-agent rule that forbids creating new branches)
**Run:** 001
**Author:** NightyTidy / Claude
**Test framework:** Vitest 4.1.5
**Baseline:** 279 tests across 23 files, 1.8 s wall, 100 % green over 5 consecutive runs

---

## 1. Summary

| Metric | Count |
|---|---|
| Flaky tests found and fixed | 0 actively flaking; **4 fragile patterns hardened defensively** |
| Flaky tests found but couldn't fix | 0 |
| Previously disabled tests re-enabled | 0 (no skips/disables exist in the suite) |
| API endpoints found | **1** (`POST /.netlify/functions/generate`) |
| Contract tests written | **41** (new `tests/server/generate-contract.test.ts`) |
| Documentation discrepancies found | **7** |
| Undocumented behaviors discovered | **6** |
| Total tests after run | **320** (was 279, +41 contract tests) |
| Stability verification | 5 consecutive `npm test` runs, all green |
| Typecheck | Clean (`tsc -b --noEmit`) |

The suite was already in remarkably good shape — no skips, no `setTimeout`-based waits, no order-dependent state leaks that fired in 5 sequential runs, and a clean 1.8-second wall time. The work below is **defensive hardening**, not broken-test triage.

---

## 2. Flaky Tests Fixed

These tests were **not currently failing** but contained patterns that would silently break under load, reorder, or environment shifts. Each fix preserves test intent — only the non-determinism is removed.

| # | Test name | File | Root cause | Fix applied |
|---|---|---|---|---|
| 1 | `hashIp (extended) › uses IP_SALT_BASE env var when set` | `tests/server/rateLimit-extended.test.ts:57` | Mutated `process.env.IP_SALT_BASE` to `'different-salt'` and restored it AFTER the `expect(...)` call. If the assertion ever throws (e.g. someone changes `hashIp` so the two hashes collide), the env mutation leaks for the rest of the file. The neighboring `safety-extended.test.ts:165` already uses the correct `try/finally` pattern, so this was inconsistent within the same project. | Wrapped the env mutation in `try { ... } finally { restore }` matching the project's established pattern. |
| 2 | `tests/client/api.test.ts` (entire file) | `tests/client/api.test.ts:1` | Missing `// @vitest-environment jsdom` directive despite using `globalThis.navigator.onLine` and `fetch`. Currently passes because Node 21+ ships a built-in `globalThis.navigator` — but a CI image pinned to Node 20 LTS would silently fail with "Cannot read properties of undefined (reading 'onLine')". Also did not import `describe/it/expect/vi/...` explicitly (relied on `globals: true`), making the file harder to debug. | Added `// @vitest-environment jsdom` as the first line, added explicit `vitest` imports, and added a 4-line comment explaining why jsdom is required. |
| 3 | `tests/client/photos.test.ts` (file-level setup) | `tests/client/photos.test.ts:5,79` | Two `afterEach` hooks registered at file level — one early (`vi.unstubAllEnvs()`) and one *after* all `describe` blocks (`vi.stubEnv(..., ORIGINAL_BASE)`). Both ran on every test, the second re-stubbing what the first unstubbed. The pattern relied on a quirk of where the captured `ORIGINAL_BASE` came from (top-of-file `import.meta.env`) and would silently break under HMR or if any describe were moved above the second hook. | Removed the trailing duplicate `afterEach`. The single `vi.unstubAllEnvs()` hook is sufficient — `vi.stubEnv` restores cleanly without external state. |
| 4 | `tests/client/compositor.test.ts › checkFit` describe block | `tests/client/compositor.test.ts:336` | Three tests inside `describe('checkFit')` install `vi.spyOn(document, 'createElement')` but the `afterEach` only deleted a dead `(global as any).__mockCtx` slot that nothing read. The `document.createElement` spy was never restored. Currently each test re-installs its own spy so the leak is masked, but reordering or adding a fourth test that omits the spy would silently inherit the previous one. | Replaced the dead-code afterEach with `vi.restoreAllMocks()`. Removed the unused `__mockCtx` setup. |

**Verification:** All four files were re-run 5× sequentially after the fix; results stable.

### Patterns NOT changed (intentionally)

- `Math.random` mocking in `tests/server/photoSelection-extended.test.ts:22` — already correctly scoped via `beforeEach`/`afterEach` with `vi.spyOn(Math, 'random').mockReturnValue(0)` and `vi.restoreAllMocks()`. No drift risk.
- `Date.now()` references in `tests/server/rateLimit-extended.test.ts:127, 142, 156, ...` — used inside mock factory bodies that compute a relative timestamp (e.g. `Date.now() - 1000`). The 1-hour windows being asserted are far larger than any conceivable wall-clock jitter; not flaky.
- `process.env.RATE_LIMIT_PER_HOUR = '9999'` set at module-load in `generate-integration.test.ts:37` — would only leak if vitest ran files in the same worker process. Vitest 4.x defaults to forked workers per test file, so cross-file isolation is preserved. Did not refactor.

---

## 3. Flaky Tests Unresolved

None. All four identified fragile patterns were fully fixed and verified.

---

## 4. API Endpoint Map

This project has **one API endpoint**, intentionally. The architecture is documented in `CLAUDE.md` ("Single endpoint: `POST /.netlify/functions/generate`") and verified by exhaustive search of `netlify/functions/`.

| Method | Path | Auth | Status before run | Status after run |
|---|---|---|---|---|
| `POST` | `/.netlify/functions/generate` | None (rate-limited by hashed IP) | Behavior tested in `generate-integration.test.ts` (16 tests) | Behavior + wire-format **contract** now tested in `generate-contract.test.ts` (41 tests) |
| `GET` / `PUT` / `DELETE` / `PATCH` / `OPTIONS` / `HEAD` | `/.netlify/functions/generate` | n/a | Untested | All return 405 plain-text — pinned by parametrized contract test |

### Response status discriminators (all now schema-pinned)

| `status` | HTTP code | Required body fields |
|---|---|---|
| `ok` | 200 | `line1` ≤ 60, `line2` ≤ 100, `photoId`, `fittingRung` ∈ {1,2,3,4} |
| `blocked` | 200 | `message` |
| `distress` | 200 | `hotline: { countryCode, name, phone, url? }` |
| `rate_limited` | 200 | `message` |
| `safe_fallback` | 200 | `line1`, `line2`, `photoId` (**no** `fittingRung`) |
| `error` | 400 | `message`, `retryable: boolean` |
| _(plain-text 405)_ | 405 | body is the literal string `'Method not allowed'` |

### What the contract tests verify

1. HTTP status code for each documented and undocumented method
2. `Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store` on every JSON response (including rate-limited)
3. Every response body parses against a Zod `discriminatedUnion('status', [...])` mirroring `GenerateResponse`
4. Required-vs-optional request fields (e.g. `excludePhotoIds` is type-required but server-defaulted to `[]`)
5. Boundary inputs: prompt at length 1, 200, 201; trim semantics
6. Rejection of wrong-typed inputs: `prompt: number`, `prompt: null`, `excludePhotoIds: number[]`
7. `x-country` header sensitivity: uppercase, lowercase, mixed case, missing, unknown ISO code
8. Schema integrity: rejects out-of-range `fittingRung`, oversized line lengths, missing `retryable`, unknown discriminator
9. INTL hotline shape (countryCode `'INTL'`, empty `phone`, populated `url`) — pinned because three production countries (NZ, IN, DE, FR) also omit `url` and the type makes it optional

---

## 5. Documentation Discrepancies

These are mismatches between `src/types/index.ts`, `CLAUDE.md`, and the actual handler implementation. Each is now documented in a contract test that pins the **actual** behavior so future drift produces a clear failure.

| # | Topic | What the type/docs say | What the code does | Severity |
|---|---|---|---|---|
| 1 | `GenerateResponse.ok.fittingRung` | `1 \| 2 \| 3 \| 4` (four-rung enum) | `selectPhoto` returns `1 \| 2 \| 3` only. `generate.ts:164` has the no-op `photoResult.rung === 3 ? 3 : photoResult.rung`. **No code path emits `4`.** | Low — type is too loose; consumers handle the broader case anyway, but suggests an unimplemented "rung 4" branch. |
| 2 | `Hotline.phone` | `phone: string` (required, non-optional) | INTL fallback in `src/server/hotlines.ts:18` returns `phone: ''`. Empty string satisfies the type but breaks the implied contract that `phone` is dialable. | Medium — a consumer rendering `<a href={'tel:' + phone}>` produces a broken link for INTL distress calls. |
| 3 | `GenerateRequest.excludePhotoIds` | `excludePhotoIds: string[]` (required) | `RequestSchema` in `netlify/functions/generate.ts:15` uses `.default([])`, so omitting it succeeds. The TYPE is stricter than the SERVER. | Low — only matters for SDK consumers reading the TS type. The browser client (`src/lib/api.ts`) always sends it. |
| 4 | 405 response body | (Undocumented in type) | Plain string `'Method not allowed'`, breaks the JSON `Content-Type` and `GenerateResponse` shape | Low — only affects malicious / accidental non-POST callers. |
| 5 | Rate-limit response headers | (Undocumented) | No `Retry-After` header is set on the `rate_limited` response, despite `checkAndIncrementRateLimit` returning `retryAfterSec: 60`. The value is discarded. | Medium — RFC 7231 compliance; standard HTTP clients won't back off correctly. |
| 6 | `Hotline.countryCode` for fallback | Type implies an ISO-3166 alpha-2 code | INTL fallback uses literal string `'INTL'` (not a real ISO code). | Low — purely cosmetic. Consumers comparing against ISO codes need to handle this sentinel. |
| 7 | Rate-limit fail-open | (Undocumented) | If Firestore throws or the 3-second timeout fires (`generate.ts:60`), the rate limit is **silently bypassed** and the request proceeds. Logged as `rate_limit_check_failed`. | Medium — operationally visible only via PostHog. Worth surfacing in CLAUDE.md so future reviewers don't add code that depends on rate limiting being authoritative. |

---

## 6. Undocumented Behavior

Behavior I discovered while writing contract tests that isn't documented in `CLAUDE.md`, the type, or any spec doc:

1. **Prompt trimming happens in `RequestSchema`, not in `normalizePrompt`.** `RequestSchema.prompt = z.string().trim().min(1).max(200)` — so a 202-char string padded with whitespace passes the length check after trim. `normalizePrompt` (line 30) only handles internal whitespace and newlines. The two-step normalization is invisible to anyone reading the schema in isolation.
2. **`x-country` header is the only request header read from request body** — and it's normalized via `.toUpperCase()` (line 92). No schema or doc mentions this is the only way to influence hotline selection. Geographic IP detection is not used.
3. **The Anthropic SDK timeout is implicit.** No explicit timeout is set on `generateLines` / `checkTone` / `checkDistressWithHaiku`. The retry loop catches throws but not hangs. A stalled SDK call would hang the entire request up to Netlify's 10 s function timeout.
4. **`safe_fallback` photo IDs are picked from a fixed list.** `safeFallbacks` in `src/server/fallbacks.ts` is a static array — the photo for a fallback bypasses `selectPhoto` entirely and ignores `excludePhotoIds`. A user who excluded a fallback photo and then triggered fallback would still see it.
5. **Distress phrase list short-circuits Haiku.** `generate.ts:88` runs the cheap phrase list first; only on a miss does it call the paid Haiku classifier. This is a cost-optimization detail; future contributors who reorder these calls would silently double the per-request Haiku cost.
6. **Rate-limit timeout (3 s) is a function constant, not env-configurable.** `setTimeout(() => reject(...), 3000)` is hardcoded at `generate.ts:60`. Environments with slower Firestore (e.g. cold-start regions) would see more `rate_limit_check_failed` events. Not surfaced anywhere as a tunable.

---

## 7. Recommendations

| # | Recommendation | Impact | Risk if ignored | Worth doing? | Details |
|---|---|---|---|---|---|
| 1 | **Document the `fittingRung: 4` ambiguity** — either implement rung 4, narrow the type to `1 \| 2 \| 3`, or add a `// TODO: rung 4` comment. | Removes a permanent type confusion; helps future contributors. | Low — purely a clarity issue. | **Probably** — pick one of the three options in a 5-min PR. | The cleanest fix is narrowing the type. The browser `App.tsx` already handles 1-4 so narrowing is non-breaking. |
| 2 | **Surface the empty `phone: ''` for INTL hotlines as a discriminated case.** Either change the type to `phone?: string` and update consumers, or substitute a generic emergency dispatch number. | Improves accessibility for international distress users. | Medium — actively broken `tel:` links in distress flow. | **Yes** — this is in the safety-critical path. | A non-INTL user sees a working `tel:` link; an INTL user sees a broken one. The current INTL `url` is `findahelpline.com` which is good — but the type doesn't communicate the asymmetry. |
| 3 | **Add `Retry-After: 60` header to the rate-limited response.** | Standard HTTP semantics; any future client that uses an off-the-shelf rate-limit-respecting library (`retry-axios`, etc.) will Just Work. | Low — current single client doesn't read it. | **Probably** — one-line change. | Already implied by the unused `retryAfterSec` field returned from `checkAndIncrementRateLimit`. Just plumb it through. |
| 4 | **Add explicit timeout to Anthropic SDK calls.** | Prevents request hangs. The retry loop assumes failures throw quickly; a stalled call breaks that assumption. | Medium — visible only under SDK degradation, but then it's a 10 s+ user-facing hang. | **Probably** — `client.messages.create({ ..., signal: AbortSignal.timeout(8000) })` is one parameter. | Anthropic SDK supports `AbortSignal`. Set it ~6-8 s leaving room for retries within Netlify's 10 s budget. |
| 5 | **Make the rate-limit Firestore timeout env-configurable.** | Operability — different Firestore regions have different cold-start latencies. | Low — current value works in practice. | **Only if time allows** — premature optimization until someone reports a problem. | A `RATE_LIMIT_FIRESTORE_TIMEOUT_MS` env var defaulting to 3000. |
| 6 | **Adopt the `try/finally` env-mutation pattern as a written convention** in `CLAUDE.md` testing-patterns section. | Prevents recurrence of the leak fixed in row 1 of section 2. | Low — caught now, but easy to reintroduce. | **Probably** — three lines added to CLAUDE.md. | The codebase has examples of both patterns; pinning the rule prevents drift. |
| 7 | **Consider a `tests/contract/` directory for endpoint contract tests** as the API surface grows. | Organizational clarity; signals to readers what each test layer protects. | Low — current single endpoint doesn't need it yet. | **Only if time allows** — wait until there's a 2nd endpoint. | YAGNI for now; one endpoint, one file. |

---

## 8. Files Changed

| File | Change |
|---|---|
| `tests/server/rateLimit-extended.test.ts` | Wrapped env mutation in `try/finally`; added explanatory comment. |
| `tests/client/api.test.ts` | Added `// @vitest-environment jsdom`; added explicit vitest imports; added 4-line rationale comment. |
| `tests/client/photos.test.ts` | Removed duplicate trailing `afterEach`; added comment explaining the consolidation. |
| `tests/client/compositor.test.ts` | Replaced dead `__mockCtx` afterEach with `vi.restoreAllMocks()`; added comment. |
| `tests/server/generate-contract.test.ts` | **NEW** — 41 contract tests pinning HTTP behavior, headers, request validation, response schemas, and header sensitivity. |

---

## 9. Process Notes

- **No production code was modified.** This was strictly a test-suite hardening pass.
- **No tests were skipped or disabled.** All fixes preserve the original test intent.
- **Branch:** Stayed on the orchestrator-managed branch (`nightytidy/run-2026-05-01-1532`). The prompt's instruction to create `test-hardening-[date]` was overridden by the standing NightyTidy multi-agent constraint that forbids branch creation. This is the correct precedence per the project's `CLAUDE.md`.
- **No files deleted.** Per the orchestrator's safety rules.
