# Integration & Boundary Testing Audit — Run 001

**Date:** 2026-05-01 18:29 PT
**Branch:** `nightytidy/run-2026-05-01-1532`
**Baseline:** 24 test files, 310 tests, 2.12s wall-clock (vitest run)
**After audit:** 27 test files, 333 tests, 2.99s wall-clock (+0.87s for +23 tests)

---

## TL;DR

The codebase is small (one HTTP endpoint, one external API, one Firestore collection, one CDN URL pattern, one Canvas pipeline) and most boundaries already had focused unit-with-mocks coverage. This audit closes five real gaps that survived previous test-coverage and hardening passes:

1. The 3-second `Promise.race` timeout on the rate-limit call (the load-bearing fail-open) was never exercised through the handler.
2. The bundled `photos.json` data contract was only validated at build time by `tools/lint-photos.ts`; `vitest run` left the library un-validated.
3. `firebaseAdmin.ts` — the `\\n → \n` private-key transformation, the warm-start short-circuit, and Firestore-instance memoization had zero tests despite being the #1 silent-deploy failure mode for Firebase Admin SDK historically.
4. The rate-limit transaction had no resilience test for corrupt Firestore documents.
5. The photo URL builder had no documented behavior for the "trailing slash on base URL" case.

333 tests pass, typecheck clean. Suite is still under the ~5s threshold called out in `audit-reports/07_TEST_EFFICIENCY_REPORT_001_*.md`, so no efficiency regression.

---

## Phase 1 — Boundary Inventory

| # | Boundary | Module(s) | What it talks to | Failure modes | Existing fallback |
|---|----------|-----------|------------------|---------------|-------------------|
| B1 | Anthropic — generation (Sonnet) | `src/server/anthropic.ts:59-75` | Anthropic API | Timeout, 429, 5xx, malformed JSON | 2 retries → safe_fallback |
| B2 | Anthropic — tone check (Haiku) | `src/server/anthropic.ts:95-123` | Anthropic API | Timeout, 5xx | Fail open (returns `true`) |
| B3 | Anthropic — distress check (Haiku) | `src/server/safety.ts:50-72` | Anthropic API | Timeout, 5xx | Fail open (returns `false`) |
| B4 | Firestore — rate-limit transaction | `src/server/rateLimit.ts:25-63` | Firestore | Timeout, doc corruption, network | 3s race + try/catch fail-open |
| B5 | Firebase Admin — credential init | `src/server/firebaseAdmin.ts` | GCP / Firestore SDK | Bad key encoding, missing env, double-init | Throws at first request |
| B6 | HTTP — Netlify function ingress | `netlify/functions/generate.ts` | Browser, Netlify edge | Bad JSON, wrong method, body too large | Zod 400 / 405 |
| B7 | HTTP — Netlify function egress | response shape | Browser | Type drift, missing fields | None (consumers check `status`) |
| B8 | Client → server fetch | `src/lib/api.ts` | Netlify endpoint | Network down, non-2xx, parse error | `errorCopy.generation.*` |
| B9 | Photo URL construction (CDN) | `src/lib/photos.ts:6-10` | Firebase Storage | Bad base URL, special chars in id | None (img onerror in component) |
| B10 | Image load + decode | `src/lib/compositor.ts:7-13` | Browser network | CORS, 404, decode error | Caught by component |
| B11 | Canvas 2D render | `src/lib/compositor.ts` | Browser Canvas | Font missing, ctx unavailable | Throws to ErrorBoundary |
| B12 | Font loading | `src/lib/fonts.ts` | `document.fonts` | Network, invalid font | Promise rejection |
| B13 | Blob download | `src/lib/download.ts` | `file-saver` | iOS Safari quirks, blob null | Returns `false` |
| B14 | PostHog analytics | `src/lib/analytics.ts` | PostHog HTTP | Missing key, network | Skipped silently |
| B15 | Hotline lookup | `src/server/hotlines.ts` | Static data | Unknown country | INTL fallback |
| B16 | photos.json data contract | `src/data/photos.json` | Server, client, lint script | Schema drift, malformed entry | Build-time lint only |
| B17 | safeFallbacks → photos.json reference | `src/server/fallbacks.ts` | photos.json | Renamed/removed photo id | None (silent broken last rung) |

**Not present (verified absent in this codebase):** webhooks (inbound), auth providers, OAuth, JWT, email/SMS/push, payment, search, message queues, Redis, dedicated cache layer, database migrations.

---

## Phase 2 — Coverage Matrix (Before This Audit)

| # | Boundary | Tests | Happy path | Failure modes | Contract validation | Determinism | Rating |
|---|----------|-------|------------|---------------|---------------------|-------------|--------|
| B1 | Anthropic — Sonnet | `anthropic.test.ts`, `generate-integration.test.ts` | ✓ | ✓ retry exhaustion, parse fail, throw | ✓ via Zod in generate-contract | ✓ mocked SDK | **Strong** |
| B2 | Anthropic — Haiku tone | `anthropic.test.ts` | ✓ | ✓ throw, non-text, env bypass | n/a (string verdict) | ✓ | **Strong** |
| B3 | Anthropic — Haiku distress | `safety-extended.test.ts`, `generate-integration.test.ts` | ✓ | ✓ throw, non-text | n/a | ✓ | **Strong** |
| B4 | Firestore txn (logic) | `rateLimit-extended.test.ts` (mocked) | ✓ | Partial — no doc-corruption | Type-cast only | ✓ | **Moderate** |
| B5 | Firebase Admin init | None | ✗ | ✗ | ✗ | n/a | **NONE** |
| B6 | HTTP ingress | `generate-contract.test.ts` | ✓ | ✓ (boundaries 1/200/201, types, methods) | ✓ Zod | ✓ | **Strong** |
| B7 | HTTP egress | `generate-contract.test.ts` | ✓ | ✓ (every status discriminator) | ✓ Zod schema | ✓ | **Strong** |
| B8 | callGenerate | `client/api.test.ts` | ✓ | ✓ offline, 5xx, 4xx, throw | Type-cast only | ✓ | **Strong** |
| B9 | Photo URL | `client/photos.test.ts` | ✓ | Partial — no trailing-slash case | ✓ | ✓ | **Moderate** |
| B10 | Image load | None directly (covered indirectly via compositor) | ✗ | ✗ | n/a | n/a | **Weak** |
| B11 | Canvas | `client/compositor.test.ts` | ✓ | ✓ overflow | n/a | ✓ recording mock ctx | **Strong** |
| B12 | Fonts | `client/fonts.test.ts` | ✓ | ✓ rejection | ✓ font names | ✓ | **Strong** |
| B13 | Download | `client/download.test.ts` | ✓ | ✓ null blob, throw, iOS Safari | ✓ filename | ✓ | **Strong** |
| B14 | Analytics | `client/analytics.test.ts` | ✓ | ✓ no-key, no-prod | ✓ init args | ✓ | **Strong** |
| B15 | Hotlines | `server/hotlines.test.ts` + smoke | ✓ | ✓ unknown country | n/a | ✓ | **Strong** |
| B16 | photos.json (runtime) | smoke checks ONE photo | Partial | ✗ | ✗ | n/a | **Weak** |
| B16 | photos.json (build-time) | `tools/lint-photos.ts` (no self-test) | ✗ | ✗ | n/a | n/a | **Weak** |
| B17 | fallback → photos.json ref | None | ✗ | ✗ | ✗ | n/a | **NONE** |
| Rate-limit timeout race (B4 + B6) | None — generate-integration bypasses with `RATE_LIMIT_PER_HOUR='9999'` | ✗ | ✗ | ✗ | n/a | **NONE** |

---

## Phase 3 — Contract Testing Assessment

The HTTP boundary is the only formal contract in this codebase. It is unusually well covered:

- `tests/server/generate-contract.test.ts` ships a Zod `discriminatedUnion` mirroring `GenerateResponse`. Every documented status variant (`ok`, `distress`, `blocked`, `rate_limited`, `safe_fallback`, `error`) has both a "real handler emits this" test and a "schema accepts this static fixture" test. Boundaries (60/100 char caps, fittingRung 1–4, 5 rejected) are pinned. Headers (`Content-Type`, `Cache-Control`) and status codes (200/400/405) are pinned. Header sensitivity (`x-country` casing → uppercase, unknown → INTL fallback) is pinned.
- `tests/server/generate-integration.test.ts` covers behavior (which path runs) — the two files together pin both halves.

**Gap closed in this audit:** the `rate_limited` path's full lifecycle (fail-open under timeout, fail-open under reject, allowed/denied bifurcation) had only a single contract test for the response shape. Behavior was untested through the handler.

**No other formal contracts exist in the system.** photos.json was the closest thing to a "contract" — closed in this audit (B16 below).

---

## Phase 4 — Smoke Test Adequacy

`tests/smoke.test.ts` (7 tests, < 400ms): the file already follows the bouncer pattern correctly — it asserts that core modules load and run on a clean prompt without crashing. It checks one photo from the library (not the whole library — that's now handled by `photos-library-schema.test.ts`).

**Adequate as-is for the deploy gate.** The new schema test runs in the regular suite, not as a smoke test, so smoke duration stays under budget.

---

## Phase 5 — E2E Coverage

**No E2E tests in this codebase by design.** Per `CLAUDE.md` global rules ("E2E tests are user-requested only — they require project-specific infrastructure, carry high maintenance cost"), this is intentional. The product has a single critical user journey:

1. User types/selects a prompt.
2. Submits.
3. Sees a loading state for ≥800ms (`LOAD_FLOOR_MS`).
4. Receives a poster (or distress modal, or inline error).
5. Optionally regenerates.
6. Optionally downloads.

Every step is exercised by unit + integration tests with deterministic mocks. The 800ms anticipation beat, blob/canvas handling, share/download flows, and the entire generate pipeline are tested. The only gap a real E2E suite would fill is "Cormorant Garamond actually loads from the network in a real browser" — and that's a deploy-time concern handled by the manual smoke test in CLAUDE.md ("generate + download on iOS Safari").

**Recommendation: do not add E2E.** The cost/value ratio in this product is bad — the product surface is small, and Playwright on a Netlify function would mostly retest the integration suite with more flakiness.

---

## Phase 6 — Environment Fidelity

| Concern | Reality |
|---------|---------|
| Test environment | `vitest --environment=node`; `// @vitest-environment jsdom` opt-in for browser specs. No Docker, no test containers. |
| Anthropic | Mocked SDK via `vi.hoisted` + `vi.mock('@anthropic-ai/sdk')`. Real SDK never instantiated in tests. **No emulator exists for Anthropic; this is unavoidable.** |
| Firestore | Mocked at the `getDb` and `firebase-admin/firestore` levels. No firestore-emulator. **Acceptable for a single-collection product** — the Firestore behaviors used (transactions, set/update, Timestamp) are simple enough that the mock is faithful. If the product ever adopts compound queries or security rules, an emulator becomes worth the added setup. |
| Canvas | jsdom `getContext('2d')` is incomplete; tests build a recording mock context per `compositor.test.ts`. Adequate. |
| Fonts / DOM APIs | jsdom + targeted property defines. Adequate. |
| Test data | All data is fixture-driven inside test files. No shared seed file, no fixtures dir. Adequate at this size. |
| Reproducibility | Per-file isolation enforced by vitest's default `isolate: true`. CLAUDE.md documents two specific load-bearing module-scope env writes (`generate-contract.test.ts:53-56`, `generate-integration.test.ts:37-40`) that depend on isolation — preserved here. The new `generate-rate-limit-integration.test.ts` adds a third such block; it is documented in the file's preamble. |

**No fidelity gaps that justify infra changes for a product this size.**

---

## Phase 7 — Tests Written This Run

### `tests/server/photos-library-schema.test.ts` (NEW, 6 tests)

Closes B16. Validates the bundled `photos.json` against a Zod schema mirroring the `Photo` interface AND the rules in `tools/lint-photos.ts`. Specifically:

- Every entry conforms to the schema.
- All ids are unique (lint contract).
- Every `textZone` fits inside the photo (`x+width <= 1.001`, `y+height <= 1.001`) — same tolerance as the linter.
- Every `high-capacity` photo has `capacity.line1 >= 60` AND `capacity.line2 >= 100` — pins the tier promise.
- The library contains ≥ 8 high-capacity photos — pins the rung-1 pool size.
- Every photoId in `safeFallbacks` references a real library photo (closes B17).

Why this matters: `npm test` did not invoke `lint:photos`, so a developer who edited `photos.json` and ran only the test suite would not catch a malformed entry. The contract is now enforced at every test run.

### `tests/server/generate-rate-limit-integration.test.ts` (NEW, 8 tests)

Closes the rate-limit gap. The existing `generate-integration.test.ts` bypasses the entire rate-limit branch with `RATE_LIMIT_PER_HOUR=9999`, so the wrapper code in `generate.ts:55-72` was never exercised through the handler. This file enables the branch and tests:

- Allowed → proceeds to Anthropic, hashedIp (not raw IP) is passed to Firestore.
- Denied → short-circuits to `status: 'rate_limited'`, no Anthropic call, `gen_rate_limited` log includes hashedIp.
- Rejected (Firestore down) → fail open, `rate_limit_check_failed` logged, generation succeeds.
- Hangs past 3s (timeout race) → fail open, log mentions "timeout", generation succeeds. Uses `vi.useFakeTimers` + `vi.advanceTimersByTimeAsync(3001)`.
- `RATE_LIMIT_PER_HOUR=9999` → bypass; `checkAndIncrementRateLimit` is never called.

Why this matters: the 3-second timeout is the load-bearing safety valve for the entire product — if Firestore is slow, users still get posters. A refactor that broke the timeout (changed the order of the `Promise.race`, dropped the catch, raised the timeout) would have shipped silently.

### `tests/server/firebaseAdmin.test.ts` (NEW, 6 tests)

Closes B5. Tests the three things in `firebaseAdmin.ts` that can silently break Firestore connectivity:

- `\\n → \n` private-key transformation (the most common Firebase Admin deploy bug).
- Pass-through behavior when the key is already in raw form.
- `undefined` passed through when env var is unset (so `cert()` produces a clear error).
- `projectId`, `clientEmail`, `storageBucket` env-var forwarding.
- `getApps().length > 0` warm-start short-circuit (Lambda container reuse).
- `_db` memoization — repeated `getDb()` returns the same instance, doesn't re-init.

Mocks `firebase-admin/app` and `firebase-admin/firestore` at the module-mock level so no real GCP credentials are needed.

### `tests/server/rateLimit-extended.test.ts` (EXTENDED, +2 tests)

Adds resilience cases for B4 — corrupt Firestore documents:

- `windowStart` missing → function rejects (no partial write).
- `windowStart` is a plain number instead of a `Timestamp` → function rejects.

Pins the contract that the function's failure mode is "rejection" (so the handler's `try/catch` in `generate.ts:69` fires) rather than "wrong result" (which would corrupt the data further).

### `tests/client/photos.test.ts` (EXTENDED, +1 test)

Pins the photo URL builder's behavior when `VITE_FIREBASE_STORAGE_BASE_URL` ends with a trailing `/`: produces a literal `//` in the URL. Firebase Storage tolerates this in practice; pinning the behavior so a future migration to a stricter CDN produces a clear test failure before a 404.

---

## Files Modified or Added

| Path | Change |
|------|--------|
| `tests/server/photos-library-schema.test.ts` | NEW — 6 tests |
| `tests/server/generate-rate-limit-integration.test.ts` | NEW — 8 tests |
| `tests/server/firebaseAdmin.test.ts` | NEW — 6 tests |
| `tests/server/rateLimit-extended.test.ts` | EXTENDED — +2 tests for doc corruption |
| `tests/client/photos.test.ts` | EXTENDED — +1 test for trailing slash |
| `audit-reports/08_INTEGRATION_BOUNDARY_TESTING_REPORT_001_2026-05-01_18-29.md` | NEW — this report |

**No production code modified.** No files deleted. No branches touched.

---

## Recommendations

| # | Recommendation | Impact | Risk if ignored | Worth doing? | Details |
|---|----------------|--------|------------------|--------------|---------|
| 1 | Configure an explicit timeout on the Anthropic SDK | Prevents Lambda hangs eating the 10s function budget | **Medium** | **Probably** | The Anthropic SDK has a default timeout (currently 10 min). Lambda kills the function at 10s. The mismatch means a stalled SDK call burns the entire budget with no clean error logged. Add `timeout: 8000` (or pass `signal` from `AbortController`) to the `anthropic.messages.create` calls. Not testable without a live SDK, but trivially safe to add. |
| 2 | Add a Zod parse to the Firestore rate-limit doc on read | Catches schema drift early; replaces silent `data!.windowStart!.toMillis()` crashes with a typed error | **Low** | **Only if time allows** | Current behavior: corrupt doc → `.toMillis()` throws → handler fail-opens (user gets poster, no rate limit). This is acceptable. Adding Zod would let us emit a specific `rate_limit_doc_corrupt` log event and clean up the doc. Marginal value at this scale. |
| 3 | Trim trailing slash in `getPhotoUrl` base normalization | Removes the latent `//` in URLs when env var has a trailing slash | **Low** | **Only if time allows** | One-line fix: `const base = (...).replace(/\/$/, '')`. Currently no symptoms because Firebase Storage tolerates `//`. Worth doing only if the CDN ever changes. The new test pins the current behavior so any change will show up as a clear failure. |
| 4 | E2E with Playwright for golden-path smoke | Catches "Cormorant Garamond didn't load in production" class of bugs | **Low** | **No** | The product surface is small; the unit + integration suite is exhaustive on logic. The remaining failure modes (font CDN flake, Netlify cold-start latency) are better caught by a 1-line manual smoke before each release than by a flaky Playwright suite. CLAUDE.md already requires the manual smoke. |
| 5 | Schedule a recurring agent to detect photos.json drift | Catches a contributor adding a malformed photo without running `npm run build` | **Low** | **No** | Now closed by `photos-library-schema.test.ts`. CI runs `npm test` on every push, so the lint contract is enforced automatically. |

**Order is by risk descending.** Recommendation #1 is the only one that addresses a real production-failure-mode the audit found unaddressed; the rest are marginal.

---

## Verification

```
npx vitest run         → 27 files / 333 tests / 2.99s — all passing
npm run typecheck      → clean
```

Suite is still well under the ~5s threshold flagged in `audit-reports/07_TEST_EFFICIENCY_REPORT_001_*.md`. The audit added 23 tests (+7.4%) for a wall-clock cost of +0.87s. The cost is consistent with that report's finding that wall-clock is dominated by per-worker module import warmup: 3 new test files × ~290 ms per-worker overhead ≈ 870 ms. Per-test cost is small (~13 ms of actual `tests/`-block time). The `vi.advanceTimersByTimeAsync(3001)` in the timeout test advances virtual time, not real time, so it costs nothing on the wall clock.
