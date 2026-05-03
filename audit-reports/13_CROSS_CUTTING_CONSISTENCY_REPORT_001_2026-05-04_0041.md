# Cross-Cutting Concerns Consistency Audit — Run 001

**Date**: 2026-05-04 00:41 (user local time)
**Branch**: `nightytidy/run-2026-05-01-1532`
**Auditor**: Claude (Opus 4.7, NightyTidy run)
**Codebase**: Bless Your Heart — single-page web app (React + Vite SPA, single Netlify-function backend)
**Scope of audit**: Patterns that should be identical across modules / files / layers, looking for drift.

---

## Status Line

Audited every cross-cutting concern in scope and applied three mechanical fixes:
- Added `error: String(err)` to two server-side fail-open log lines (`tone_check_failed`, `distress_check_failed`) so they match the pattern set by `rate_limit_check_failed` / `gen_anthropic_error`.
- Closed a contract-test gap by pinning the optional `retryAfterSec` / `resetAt` fields on `RateLimitedResponseSchema` so the contract schema mirrors the `GenerateResponse` type for `rate_limited` (the type and the rate-limit-integration test already used these fields; the contract schema was the lone holdout).

All 345 tests pass after fixes. `tsc -b --noEmit` is clean.

The codebase is unusually consistent for a cross-cutting audit — eight of nine phases either don't apply (no DB schema, no tenancy, no money, no list endpoints) or are documented as deliberate canonical patterns in [`docs/API_DESIGN_GUIDE.md`](../docs/API_DESIGN_GUIDE.md). The only real drift was in observability event-detail capture.

---

## Key Findings

- ✅ **Phases 1–3 (pagination, sorting/filtering, soft-delete) are not applicable.** Single endpoint (`POST /generate`), no list/collection endpoints, no entity CRUD, no DB-level deletion in app code. Only persisted record is a transient rate-limit doc keyed by hashed-IP, expired by Firestore TTL on `expiresAt`. Nothing to drift between.
- ✅ **Phases 6 & 7 (currency, multi-tenancy) do not apply.** No money handling, no orgs / accounts / workspaces, no per-user state.
- ⚠️ **Phase 4 (audit logging) — minor capture-detail drift, NOW FIXED.** Among four "fail-open" branches that catch and log an error, only two captured the actual error string. Standardised to all four.
- ⚠️ **Phase 4 (contract test schema) — drift between the type and the contract schema, NOW FIXED.** `GenerateResponse.rate_limited` declares `retryAfterSec?` and `resetAt?`, the rate-limit integration test asserts both, but `tests/server/generate-contract.test.ts:RateLimitedResponseSchema` did not enumerate them. Without the schema entries, a future change that subtly retypes those fields could pass the contract suite. Schema now mirrors the type.
- ✅ **Phase 5 (timezone) is consistent.** All datetime work uses native `Date` + `firebase-admin/firestore Timestamp`. No `moment`/`dayjs`/`luxon`. Only date-only string in the codebase is the rate-limit salt's `new Date().toISOString().slice(0, 10)`, intentionally a UTC date boundary so the salt rotates at UTC midnight regardless of the request's locale.
- ✅ **Phase 8 (errors / status codes) is consistent and pinned.** Single canonical error shape `{ status: 'error', message, retryable }`; wrapper-pattern 200 with body discriminator for business outcomes; HTTP-level errors only for `400` (bad request), `403` (origin), `405` (method). Pinned by [`tests/server/generate-contract.test.ts`](../tests/server/generate-contract.test.ts).

No security-severity drift was found (no missing soft-delete filters, no missing tenant filters, no missing audit trails on auth/permission paths — none of those concepts exist in this app).

---

## Changes Made

| # | File | Change | Reason |
|---|---|---|---|
| 1 | `src/server/safety.ts:67-70` | `catch {} → catch (err) {}`, added `error: String(err)` to the JSON log payload | Match pattern used by `rate_limit_check_failed` (`netlify/functions/generate.ts:148`) and `gen_anthropic_error` (`netlify/functions/generate.ts:222`). Fail-open log lines must capture the failure cause; otherwise on-call has only the event name. |
| 2 | `src/server/anthropic.ts:118-121` | Same change to `tone_check_failed`. | Same reason. |
| 3 | `tests/server/generate-contract.test.ts:94-101` | Added optional `retryAfterSec` and `resetAt` fields to `RateLimitedResponseSchema`. | The Zod schema in the contract file is the canonical "what does the API actually emit" pin. Without those fields, a future refactor that drops them from the response would not trigger the contract suite. The integration test asserts them but tests behavior, not shape. |

All three changes are mechanical, pure refactoring of existing behavior with no API contract change. Test count unchanged (345/345). TypeScript check clean.

---

## Drift Heat Map

| Phase | Concern | Verdict | Severity |
|---|---|---|---|
| 1 | Pagination | **N/A** — no list/collection endpoints | — |
| 2 | Sorting & filtering | **N/A** — no list endpoints, no dynamic queries | — |
| 3 | Soft delete & data lifecycle | **N/A** — no entity CRUD, no app-level deletes | — |
| 4 | Audit logging & activity tracking | **Consistent (post-fix)** — 90%+ alignment after closing two log-detail gaps and one contract-schema gap | Low |
| 5 | Timezone & date/time | **Consistent** — single library (native+Firestore Timestamp), single TZ (UTC), single API format (epoch seconds for resets) | — |
| 6 | Currency & numeric precision | **N/A** — no money | — |
| 7 | Multi-tenancy & data isolation | **N/A** — no tenancy model | — |
| 8 | Error responses & status codes | **Consistent** — single canonical shape, wrapper-pattern documented in API guide and pinned by contract tests | — |

Overall: **consistent**. No "significant drift" or "no standard" categories triggered.

---

## Phase Detail

### Phase 1 — Pagination Consistency

**Catalog**: zero list endpoints, zero pagination patterns.

The only collection-shaped data is `GenerateRequest.excludePhotoIds: string[]` — an array of photo IDs the client wants the server to skip on regeneration. This is a strict-set filter, not pagination: the server never returns more than one photo per call, so there is no "next page."

The future convention is already documented in [`docs/API_DESIGN_GUIDE.md:135-144`](../docs/API_DESIGN_GUIDE.md):

- Cursor-based for unbounded sets, offset/limit for bounded sets
- Param names fixed: `limit` (not `pageSize`/`per_page`), `cursor` (not `next`/`after`), `offset` (not `start`)
- Default limit `25`, hard max `100`
- Response wraps under `items` key

Since there are no instances, there is no drift. **Recommendation**: when the first list endpoint lands, add a contract test that pins these conventions on the new endpoint.

### Phase 2 — Sorting & Filtering Consistency

**Catalog**: zero dynamic query endpoints. All filtering is in-memory `Array.filter` over the static `photos.json` library inside [`src/server/photoSelection.ts`](../src/server/photoSelection.ts). No SQL anywhere — Firestore writes are point-key txns on `rateLimits/{hashedIp}`.

No sort / filter / search format drift can exist with one endpoint and one filter array.

### Phase 3 — Soft Delete & Data Lifecycle Consistency

**Catalog**:

| Entity | Persisted? | Strategy | Field | Cascade | Restore | Purge |
|---|---|---|---|---|---|---|
| `rateLimits/{hashedIp}` | Firestore | TTL via `expiresAt` Timestamp | `expiresAt: Timestamp.fromMillis(nowMs + 1hr)` | none — single doc | n/a — no user-facing entity | Firestore TTL extension |
| User-generated posters | **Not persisted** | n/a | n/a | n/a | n/a | n/a |
| User accounts | **Do not exist** | n/a | n/a | n/a | n/a | n/a |

Posters are generated and downloaded client-side; nothing about a user's content lives on the server. There is nothing to soft-delete and no consumer of a `deleted_at` filter could exist.

Firestore security rules ([`firestore.rules`](../firestore.rules)) deny all client read/write — only the Admin SDK from the Netlify function touches the rate-limit collection. This is the correct posture for a single-collection abuse-control table.

**No drift; no recommendation.**

### Phase 4 — Audit Logging & Activity Tracking Consistency

There are two parallel observability streams: server-side console logging and client-side PostHog events. They serve different purposes and do not need to align with each other, but each must be internally consistent.

#### 4a. Server-side event log (`netlify/functions/generate.ts` + helpers)

Every code path emits a JSON log line with an `event` field, per the convention documented in [`docs/API_DESIGN_GUIDE.md:171-179`](../docs/API_DESIGN_GUIDE.md). All event values are snake_case strings.

| Event | Severity (log fn) | Where | Extra fields | Captures error? |
|---|---|---|---|---|
| `gen_ok` | log | `generate.ts:265` | `fittingRung`, `retries`, `model` | n/a — success |
| `gen_block` (`reason: 'origin'`) | log | `generate.ts:100` | `reason` | n/a — no error |
| `gen_block` (`reason: 'slur'`) | log | `generate.ts:155` | `reason` | n/a — no error |
| `gen_block` (`reason: 'real-person'`) | log | `generate.ts:164` | `reason` | n/a — no error |
| `gen_distress` | log | `generate.ts:179` | none | n/a — no error |
| `gen_rate_limited` | log | `generate.ts:131` | `hashedIp` | n/a — no error |
| `gen_retry` (`reason: 'format'\|'specificity'\|'tone'`) | log | `generate.ts:201,207,214` | `reason` | n/a — control flow |
| `gen_safe_fallback` | log | `generate.ts:228, 250` | none | n/a — control flow |
| `gen_anthropic_error` | error | `generate.ts:222` | `error: String(err)` | ✅ |
| `rate_limit_check_failed` | error | `generate.ts:148` | `error: String(err)` | ✅ |
| `tone_check_failed` | error | `anthropic.ts:120` | none **→ FIXED to add `error`** | ❌ → ✅ |
| `distress_check_failed` | error | `safety.ts:69` | none **→ FIXED to add `error`** | ❌ → ✅ |

**Drift identified (now fixed)**: of the four `console.error`-level fail-open events, two were missing the `error: String(err)` field. After fix, all four capture the underlying cause.

**Notes on intentional asymmetry (NOT drift)**:
- `gen_ok` carries `fittingRung`/`retries`/`model` because they are useful for product analytics and retry-rate dashboards. Other events have no equivalent payload to surface.
- `gen_rate_limited` is the only event with `hashedIp`. This is intentional and useful: the value lets on-call correlate a deny-event with the Firestore document that triggered it. The hash is salted with a daily-rotating salt (`IP_SALT_BASE:YYYY-MM-DD`), so it cannot be cross-day correlated. Logging it once per deny-event is a reasonable forensic affordance, not a privacy regression.
- `console.log` vs `console.error` split tracks "control-flow event" vs "infrastructure failure" cleanly.

**Reason values** are mostly single-word (`slur`, `origin`, `format`, `specificity`, `tone`). The lone kebab-case value is `'real-person'`, which is a multi-word concept and is documented in [`CLAUDE.md:104`](../CLAUDE.md). Acceptable.

#### 4b. Client-side analytics (PostHog via `track()`)

All event names are snake_case. Two patterns coexist:
- `generation_*` for events directly tied to a generation outcome
- Action-named events for user-initiated UI actions

| Event | Where | Props | Pattern |
|---|---|---|---|
| `prompt_submitted` | `App.tsx:67` | `{ source, length }` | action |
| `generation_distress` | `App.tsx:76` | none | outcome |
| `generation_blocked` | `App.tsx:84` | `{ reason }` | outcome |
| `generation_rate_limited` | `App.tsx:92` | none | outcome |
| `generation_completed` | `App.tsx:102` | `{ fittingRung }` | outcome |
| `generation_safe_fallback` | `App.tsx:112` | none | outcome |
| `generation_error` | `App.tsx:121` | `{ kind: 'unknown' }` | outcome |
| `regenerate_clicked` | `App.tsx:134` | `{ regenDepth }` | action |
| `poster_downloaded` | `DownloadButton.tsx:25` | none | action |
| `distress_dismissed` | `DistressInterstitial.tsx:40` | none | action |

**Mild drift but not actionable**: some outcome events carry props (`fittingRung`, `reason`), others don't. This is intentional — `safe_fallback` and `rate_limited` and `distress` are categorical-only outcomes with nothing useful to slice on. Forcing a placeholder prop would be busywork. **No fix.**

The `generation_error.kind: 'unknown'` is a conscious placeholder for future expansion (e.g. `kind: 'network'` once `api.ts` distinguishes network from server). Worth a follow-up but out of scope for this audit.

#### 4c. Contract / type drift

`GenerateResponse.rate_limited` includes optional `retryAfterSec` and `resetAt`. The handler emits both. The integration test ([`generate-rate-limit-integration.test.ts:303-324`](../tests/server/generate-rate-limit-integration.test.ts)) asserts the values. The contract schema in `generate-contract.test.ts:RateLimitedResponseSchema` did **not** enumerate them, so a future refactor that drops or retypes the fields would only fail the integration test, never the contract suite — exactly the gap the contract suite exists to close.

**Fix**: added `retryAfterSec: z.number().int().nonnegative().optional()` and `resetAt: z.number().int().nonnegative().optional()`. Schema now mirrors the type.

### Phase 5 — Timezone & Date/Time Handling Consistency

| Location | Operation | Library | Timezone | Format | Storage Type | Canonical? |
|---|---|---|---|---|---|---|
| `rateLimit.ts:9` | Salt date | native `Date` | UTC | `YYYY-MM-DD` (`toISOString().slice(0,10)`) | string (in salt only) | ✅ |
| `rateLimit.ts:32, 40, 57` | Window start / expiry | `firebase-admin/firestore Timestamp` | UTC (Firestore stores UTC) | Firestore Timestamp | DB Timestamp column | ✅ |
| `rateLimit.ts:34, 51, 67` | Millis math | `.toMillis()` (UTC ms) | UTC | epoch ms | n/a | ✅ |
| `rateLimit.ts:46, 63, 68` | `resetAt` field | epoch math | UTC | epoch seconds | n/a | ✅ |

**No third-party date library**. No `moment`/`dayjs`/`luxon`/`date-fns`. No mixed `TIMESTAMP` vs `TIMESTAMPTZ` (Firestore's `Timestamp` is UTC by definition).

**Date-only boundary (UTC-day)**: the rate-limit salt rotates at UTC midnight. A user in UTC+14 hitting the endpoint at 11:30pm local crosses the salt boundary mid-day from their perspective. This is intentional — the salt rotation is for privacy (preventing long-term hashed-IP tracking), not user-facing day boundaries. There is no "today's records" or per-day quota that a user would notice rotating mid-day.

**No drift; no recommendation.**

### Phase 6 — Currency & Numeric Precision Consistency

**Skipped**: the application never handles money, prices, exchange rates, or any precision-sensitive numeric quantity. Every numeric field is either an integer (counts, lengths, fitting rungs, epoch seconds) or a normalized 0–1 float (photo `textZone` coordinates, `capacity` ratios). None of these have rounding, currency, or precision-cumulative-error concerns.

### Phase 7 — Multi-Tenancy & Data Isolation Consistency

**Skipped**: the product is single-tenant by design. No accounts, no workspaces, no per-user persisted state, no per-org data. The only persisted record (the rate-limit document) is keyed by hashed-IP and is intentionally global to that hash. There is no `tenant_id` analog; therefore there are no missing-tenant-filter risks.

### Phase 8 — Error Response & Status Code Consistency

The error model is small enough to enumerate in full:

| Scenario | HTTP Status | Body shape | Where pinned |
|---|---|---|---|
| Method != POST | `405` | `{status:'error', message, retryable:false}` + `Allow: POST` header | `generate-contract.test.ts:161-184` |
| Origin not allowlisted (CSRF shield) | `403` | `{status:'error', message, retryable:false}` | `generate-contract.test.ts:191-235` |
| Malformed JSON / Zod fail | `400` | `{status:'error', message, retryable:false}` | `generate-contract.test.ts:304-398` |
| Rate-limited (allowed=false) | `200` | `{status:'rate_limited', message, retryAfterSec?, resetAt?}` + `Retry-After` + `X-RateLimit-*` headers | `generate-rate-limit-integration.test.ts:303-324`, contract schema (now updated) |
| Slur / real-person block | `200` | `{status:'blocked', message}` | `generate-contract.test.ts:414-432` |
| Distress | `200` | `{status:'distress', hotline}` | `generate-contract.test.ts:434-538` |
| Generation retries exhausted | `200` | `{status:'safe_fallback', line1, line2, photoId}` | `generate-contract.test.ts:445-458` |
| Photo-selection exhausted | `200` | same `safe_fallback` shape as above | shared safe-fallback path in `generate.ts:227-262` |
| Successful generation | `200` | `{status:'ok', line1, line2, photoId, fittingRung}` | `generate-contract.test.ts:405-412` |
| (Client-side) network error | n/a | `{status:'error', message, retryable:true}` | `src/lib/api.ts:23-28`, `tests/client/api.test.ts` |
| (Client-side) HTTP 5xx | n/a | `{status:'error', message:errorCopy.generation.anthropicError, retryable:true}` | `src/lib/api.ts:16-18` |
| (Client-side) HTTP 4xx (non-200) | n/a | `{status:'error', message:errorCopy.generation.unknown, retryable:true}` | `src/lib/api.ts:19` |

**Single canonical error shape**: `{status:'error', message:string, retryable:boolean}`. ✅ uniform.

**Wrapper pattern is consistent**: every business outcome is `200` with a body discriminator. Only connection-level rejections (`400`, `403`, `405`) escape it, and those are explicitly enumerated in the API guide and the contract suite.

**One observation (intentional, not drift)**: `src/lib/api.ts:15-19` always returns `retryable: true` for any `!response.ok` response, ignoring the server's stated `retryable: false` when the body is a 400/403/405. In practice, the SPA can't legitimately produce a 400/403/405 (it constrains input length to match the server's max, only POSTs, and ships from an allowlisted origin), so the client never relies on the server's `retryable` value for those error classes — it just provides a sensible default if something unexpected slips through. This is fine. Documenting only.

**No drift; no recommendation.**

---

## Synthesis & Drift Map

### Root Cause Analysis

The two log-detail gaps (`tone_check_failed`, `distress_check_failed`) are best explained by chronology: when those `try/catch` blocks were written, the catches used `catch {}` because the verdicts had no fall-through value to log other than "it failed." The richer pattern (`catch (err) { console.error({ ..., error: String(err) }) }`) was established later in `generate.ts:148, 222` for ops where the error is more important. The two safety helpers were never updated.

The contract-schema gap (`RateLimitedResponseSchema`) is best explained by the order in which the optional fields were added: `retryAfterSec` and `resetAt` were added to the type after the contract test was first authored, and only the integration test (which exercises behavior) was updated. The contract test shape was not refreshed.

### Prevention Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Add a `console.error`-with-error-string convention note to `CLAUDE.md` § Backend | Future fail-open paths capture cause by default | Low — repeats this drift over time | Probably | One line: "fail-open `console.error` calls must include `error: String(err)`. The on-call has only the event name otherwise." |
| 2 | Add a CI check that diffs `GenerateResponse` (TypeScript type) against `GenerateResponseSchema` (Zod schema in `generate-contract.test.ts`) | Catch type/schema drift automatically | Low — caught manually in this audit | Only if time | Could be a one-off `tsc` check that asserts the schema covers every variant of the type. The existing contract tests would still cover field-by-field shape. The benefit is mostly stylistic — a test agent won't generally drift these. |
| 3 | Document the "single canonical error shape" rule in `CLAUDE.md` § Architectural Rules / Backend, not just in the API guide | Surface where agents read first | Low — already documented in API_DESIGN_GUIDE.md and reinforced by contract tests | No | The API guide is reachable in two hops via the existing `Recipe: Adding an API Field, Endpoint, or Response Variant` recipe. Re-stating it in CLAUDE.md would duplicate, not clarify. |

Order is by impact descending. Only #1 is meaningfully worth doing as a preventive note.

### Future-Looking

When the codebase eventually grows beyond a single endpoint:

- **Pagination**: API guide is already pre-decided. First list endpoint must use `cursor`/`limit`/`items`/`nextCursor` and add a contract test pinning it.
- **Soft delete**: if user-generated posters become persisted (saved boards, gallery), choose `deleted_at: Timestamp` and write a single `excludeDeleted` query helper before the second consumer is added — the time to standardise is at consumer #2, not #5.
- **Multi-tenancy**: not anticipated. If accounts ever ship, scope every Firestore reference by `userId` from day one; do not add it incrementally.

---

## Recommendations Summary

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Add a one-line convention to `CLAUDE.md`: "fail-open `console.error` must include `error: String(err)`" | Future fail-open paths capture cause | Low | Probably | Prevents the drift this audit just fixed from recurring. Single sentence, no code change. |
| 2 | Add a CI step that asserts `GenerateResponseSchema` covers every `GenerateResponse` variant | Auto-catch type/schema drift | Low | Only if time | Gap is small enough that contract tests catch most issues; this would be belt-and-braces. |

Both are documentation/CI improvements, not code changes. No structural drift was found that justifies a third recommendation.

---

## Verification Trail

- ✅ Test suite before fixes: 345 / 345 passing (baseline `vitest run`, ~840 ms wall clock)
- ✅ Test suite after fixes: 345 / 345 passing (~840 ms wall clock)
- ✅ TypeScript: `tsc -b --noEmit` clean (no diagnostics)
- ✅ Lint-photos: not re-run (no `photos.json` change)
- ✅ Test count unchanged — no tests added or removed; existing tests already cover the affected code paths

## Files Touched

- `src/server/safety.ts` — capture `error` in `distress_check_failed` log
- `src/server/anthropic.ts` — capture `error` in `tone_check_failed` log
- `tests/server/generate-contract.test.ts` — add optional `retryAfterSec`/`resetAt` to `RateLimitedResponseSchema`

No new files created. No files deleted. No branch operations.

## Report Location

Full report: [`audit-reports/13_CROSS_CUTTING_CONSISTENCY_REPORT_001_2026-05-04_0041.md`](./13_CROSS_CUTTING_CONSISTENCY_REPORT_001_2026-05-04_0041.md)
