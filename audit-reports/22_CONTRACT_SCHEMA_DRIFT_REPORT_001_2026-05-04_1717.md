# Contract & Schema Drift Audit — Report 001

**Run:** Step 22, Run 001
**Date:** 2026-05-04 17:17 (user local) → 2026-05-04 17:25 finish
**Auditor:** Claude Opus 4.7 (1M context), via NightyTidy orchestrator
**Branch:** `nightytidy/run-2026-05-01-1532` (orchestrator-managed; per safety rules, no branch switching)
**Baseline:** 362 tests passing, type-check clean, build clean
**End state:** 365 tests passing (+3 contract pins), type-check clean, build clean

---

## Executive Summary

The repo is small, single-deploy, no ORM, no database migrations, no GraphQL/WebSockets, no multi-service surface. The audit-relevant contract surfaces are:

| Surface | Status |
|---|---|
| Database/ORM ↔ Code | N/A — Firestore is used only for rate-limit docs; the `RateLimitDoc` type matches the writer (`rateLimit.ts`) exactly |
| API contract (server ↔ test ↔ type) | **One mechanical drift** (excludePhotoIds optional/required mismatch) — fixed |
| Frontend ↔ Backend types | **No structural drift**; one duplicated wire-format copy block — fixed |
| Validation (Zod) ↔ TypeScript | Aligned everywhere; the request schema's `.default([])` was the only deviation — fixed |
| Configuration (`.env.example` ↔ code) | **Fully aligned** — every `process.env.*` and `import.meta.env.VITE_*` read corresponds to a documented variable |
| Serialization boundaries (JSON, Firestore, sessionStorage) | All deserialization paths validate via Zod or are pinned by tests |
| Migration / version drift | Single deploy, no version split; model env vars have aligned defaults across `anthropic.ts`, `safety.ts`, and `.env.example` |

Three pieces of orphaned type structure were also removed: an unused `FitResult` union (compositor used a duplicate local declaration), an unused `'revealing'` `PosterPhase` branch (no producer, no consumer).

**Bottom line:** the contract surface is healthy. The five fixes in this run remove the only drift the audit could justify changing without a product/engineering decision; the rest of the surface is solid and well-pinned by the existing test suite.

---

## Phase-by-Phase Findings

### Phase 1 — Database / ORM Alignment

**N/A.** The application has no relational database, no ORM (no Prisma, Drizzle, TypeORM, etc.), no migration directory.

The only persistent store is Firestore, used exclusively to record rate-limit windows at `rateLimits/{hashedIp}`. The data contract:

| Field | Type (`RateLimitDoc` in `src/types/index.ts`) | Writer (`rateLimit.ts`) | Drift? |
|---|---|---|---|
| `count` | `number` | `count: 1` (set) / `count: data.count + 1` (update) | None |
| `windowStart` | `FirebaseFirestore.Timestamp` | `Timestamp.now()` | None |
| `expiresAt` | `FirebaseFirestore.Timestamp` | `Timestamp.fromMillis(nowMs + RATE_LIMIT_WINDOW_MS)` | None — TTL contract pinned by `tests/server/rateLimit-extended.test.ts` |

No multi-tenant schema, no read replica, no migration history to verify. **No drift.**

### Phase 2 — API Contract Drift

The application has a single Netlify function endpoint: `POST /.netlify/functions/generate`. The wire format is pinned by `tests/server/generate-contract.test.ts` against a Zod schema that mirrors `GenerateResponse`.

**Drift items found and addressed:**

| # | Endpoint / Surface | Issue | Severity | Fix Side | Resolution |
|---|---|---|---|---|---|
| 1 | `POST /generate` request body | `GenerateRequest.excludePhotoIds` typed as required `string[]`; Zod schema has `.default([])` so the field is optional on the wire | Medium | Type | **Fixed** — type is now `excludePhotoIds?: string[]` with a comment pinning the wire-format reality |
| 2 | `POST /generate` `rate_limited`, `blocked` (slur), `blocked` (real-person) responses | Server hardcodes the user-facing `message` strings as literals (`generate.ts:165, 183, 194`) while the canonical copy lives in `src/content/copy.ts` (`errorCopy.rateLimit`, `errorCopy.slurBlock`, `errorCopy.realPersonBlock`). A copy edit on one side would silently drift the other. | High | Both | **Fixed** — `generate.ts` now imports `errorCopy` and references the canonical strings. Three new pinning tests in `generate-contract.test.ts` assert response messages equal `errorCopy.*` so any future regression to a literal fails CI. |

**Surfaces verified clean:**

- HTTP status code policy is explicit and pinned: `405` for non-POST (with `Allow: POST` header), `403` for Origin-allowlist failure, `400` for Zod validation failure, `200` everywhere else (the `status` discriminator carries business outcomes — `ok`, `distress`, `blocked`, `rate_limited`, `safe_fallback`, `error`).
- Response headers (`Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, conditional rate-limit headers) are pinned in the contract suite.
- Origin allowlist (CSRF shield) behavior is pinned for unset / set / case-insensitive / absent-header cases.
- Body input boundaries pinned: `prompt` 1..200 chars (rejects 201), `excludePhotoIds` ≤ 50 entries (rejects 51).
- The discriminated-union response schema accepts every documented `status` and rejects unknown values.

### Phase 3 — Frontend ↔ Backend Type Drift

The frontend imports `GenerateResponse` (and `Hotline`, `Photo`, etc.) from `src/types/index.ts` — the same module the server uses. There is no codegen and no separate API client; the type is the contract.

| Frontend Type | Backend Source | Drift? |
|---|---|---|
| `GenerateResponse` (discriminated union) | `netlify/functions/generate.ts` `jsonResponse(...)` | None — every emit path matches a discriminator; pinned by `GenerateResponseSchema` in `generate-contract.test.ts` |
| `Hotline` | `src/server/hotlines.ts` `getHotlineForCountry(...)` | None — the INTL fallback's `phone: ''` is documented and the consumer (`DistressInterstitial.tsx`) already guards `hotline.phone && telHref` |
| `Photo` | `src/data/photos.json` (cast as `Photo[]` on both sides) | None — pinned at runtime by `tests/server/photos-library-schema.test.ts` |
| `RateLimitDoc`, `RateLimitResult` | `src/server/rateLimit.ts` | None |
| `PosterPhase` | `src/App.tsx` setState call sites | **One dead branch** — `phase: 'revealing'` was in the type but no producer emits it and no consumer narrows on it. **Fixed** — branch removed from the union. |
| `FitResult` | `src/lib/compositor.ts` `checkFit(...)` | **Orphan type** — `FitResult` was exported from `src/types/index.ts` but never imported; `compositor.ts` declared a structurally-identical local `FitCheckResult`. **Fixed** — `compositor.ts` now imports and returns `FitResult`; the local type alias was removed. |

**Type assertion audit at API boundaries:**

The frontend has exactly one type assertion at the API boundary: `(await response.json()) as GenerateResponse` in `src/lib/api.ts:32`. This is acceptable because the server-side wire format is contract-tested via Zod schema in `generate-contract.test.ts` — the only way for the cast to be wrong is for the server to violate its own pinned contract, which would fail CI. No quantification problem; this is not a systemic over-use of `as`.

The server has one similar assertion: `photos as Photo[]` in `netlify/functions/generate.ts:26` and `src/lib/photos.ts:4`. Both are pinned by `photos-library-schema.test.ts` — a runtime Zod-validated mirror of the JSON contract.

The Firestore read in `rateLimit.ts:65` does `snap.data() as RateLimitDoc | undefined`. The function controls the writer (the same module), so the assertion is sound; the `| undefined` branch is exercised defensively even though a non-existent doc would have failed `snap.exists` first.

### Phase 4 — Validation Schema ↔ TypeScript Type Drift

| Validation Schema | TypeScript Type | Drift? |
|---|---|---|
| `RequestSchema` (Zod) in `generate.ts` | `GenerateRequest` | **One drift** (excludePhotoIds optional/required) — see Phase 2 #1, **Fixed** |
| `GenerationSchema` (Zod, `.strict()`) in `validation.ts` | `GenerationOutput` | None — both expose only `line1` and `line2`; `.strict()` forbids extra fields |
| `PhotoSchema` (Zod) in `photos-library-schema.test.ts` | `Photo` | None — fields, types, and enum values mirror exactly |
| `HotlineSchema` (Zod) in `generate-contract.test.ts` | `Hotline` | None — pinned that `phone` is required string (even when empty) and `url` is optional |

**Cross-boundary validation gaps checked:** the only data-write boundary in this app is the Firestore rate-limit write, which is performed inside a server-controlled transaction with no user-controlled fields. No webhook ingestion, no queue consumer, no CSV/file upload, no admin panel. There is no place where validation exists at one boundary but is missing at another.

The `.strict()` modifier on `GenerationSchema` (validation.ts:31) is the safety harness for the LLM-output → wire-format boundary: any extra field hallucinated by the model is rejected as a parse failure, triggering the retry loop.

### Phase 5 — Configuration Drift

Every `process.env.*` and `import.meta.env.VITE_*` read in production code was checked against `.env.example`:

| Variable | Read In | Read Type | In `.env.example` | Drift? |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | `anthropic.ts:35` | string \| undefined | ✓ | None |
| `ANTHROPIC_MODEL_GEN` | `anthropic.ts:93`, `generate.ts:273` | string \| undefined (default `claude-sonnet-4-6`) | ✓ (`claude-sonnet-4-6`) | None |
| `ANTHROPIC_MODEL_SAFETY` | `anthropic.ts:136`, `safety.ts:58` | string \| undefined (default `claude-haiku-4-5`) | ✓ (`claude-haiku-4-5`) | None |
| `FIREBASE_PROJECT_ID` | `firebaseAdmin.ts:13` | string \| undefined | ✓ | None |
| `FIREBASE_CLIENT_EMAIL` | `firebaseAdmin.ts:14` | string \| undefined | ✓ | None |
| `FIREBASE_PRIVATE_KEY` | `firebaseAdmin.ts:9` | string \| undefined | ✓ | None |
| `FIREBASE_STORAGE_BUCKET` | `firebaseAdmin.ts:17` | string \| undefined | ✓ | None |
| `RATE_LIMIT_PER_HOUR` | `rateLimit.ts:39`, `generate.ts:149` | parsed int (default 25) / string compare `'9999'` | ✓ (`25`) | None — string-compare bypass and parsed-int reads agree on the same env var |
| `IP_SALT_BASE` | `rateLimit.ts:23` | string \| undefined (default `byh-default-salt`) | ✓ | None |
| `ALLOWED_ORIGINS` | `generate.ts:86` | string \| undefined | ✓ | None |
| `ENABLE_TONE_CHECK` | `anthropic.ts:131` | string compare `'false'` | ✓ | None |
| `VITE_FIREBASE_STORAGE_BASE_URL` | `lib/photos.ts:7` | string \| undefined | ✓ | None |
| `VITE_POSTHOG_KEY` | `lib/analytics.ts:8, 10` | string \| undefined | ✓ | None |
| `VITE_POSTHOG_HOST` | `lib/analytics.ts:11` | string \| undefined | ✓ | None |
| `import.meta.env.PROD` | `lib/analytics.ts:7` | Vite-injected boolean | N/A (built-in) | None |

**No drift.** Every variable in `.env.example` has at least one consumer; every consumer has documentation. No type assumptions misuse string env vars (every numeric coercion goes through `parseInt` with a default; every boolean check is an explicit string compare). The defaults documented in CLAUDE.md (`claude-sonnet-4-6`, `claude-haiku-4-5`, 25 req/hr, etc.) match both the code defaults and the `.env.example` values.

### Phase 6 — Serialization Boundary Drift

| Boundary | Location | Validation | Drift? |
|---|---|---|---|
| HTTP request body → app | `generate.ts:135` `RequestSchema.parse(JSON.parse(...))` | Zod `.parse()` after `JSON.parse` | None |
| Anthropic response → app | `validation.ts:42` `GenerationSchema.safeParse(JSON.parse(cleaned))` | Zod `.safeParse()` after `JSON.parse`; markdown fences stripped first | None |
| Firestore doc → app | `rateLimit.ts:65` `snap.data() as RateLimitDoc` | Type assertion; writer controls the shape; `undefined` branch handled | None — server-controlled writer, fixed schema, never user-supplied |
| `photos.json` → server | `generate.ts:26` `photos as Photo[]` | Build-time lint (`tools/lint-photos.ts`) + runtime test (`photos-library-schema.test.ts`) | None |
| `photos.json` → client | `lib/photos.ts:4` `photosData as Photo[]` | Same as above | None |
| `sessionStorage` → app | `PromptInput.tsx:42` `safeSessionGet(SESSION_KEY)` | Treated as `string \| null`, no parsing required | None — value is plain text, not JSON |
| App → `sessionStorage` | `PromptInput.tsx:30` `safeSessionSet(...)` | Wrapped in try/catch for quota/security errors | None |
| Canvas → blob → file save | `download.ts:18` `canvas.toBlob(...)` | Native browser API; null-handled | None |
| Browser → API request | `lib/api.ts:21` `JSON.stringify({prompt, excludePhotoIds} satisfies GenerateRequest)` | `satisfies` constraint pins the shape against the type | None |
| API → browser response | `lib/api.ts:32` `(await response.json()) as GenerateResponse` | Cast on a contract-pinned wire format (see Phase 3) | Acceptable — pinned by `generate-contract.test.ts` |

**Date / Number handling:** the only date used in production code is `new Date().toISOString().slice(0, 10)` in `rateLimit.ts:22`, the UTC-anchored daily salt. No locale-dependent rendering, no BigInt, no NaN traps, no custom `toJSON`. Audit run 14 (`14_DATETIME_HANDLING_REPORT_001`) already verified the suite passes identically across UTC/PST/IST/NZST.

**No drift.**

### Phase 7 — Migration / Version Drift

Single Netlify deploy, no API versioning, no service mesh, no read replicas. There are no on-disk vs applied migrations to compare. Anthropic model versions are env-driven with code defaults that match `.env.example` (Phase 5).

`firebase-admin@13.8.0` is the latest release; the transitive-vuln cluster (~10 advisories) is documented as accepted in CLAUDE.md and `audit-reports/11_DEPENDENCY_HEALTH_REPORT_001`. None are exploitable in this code path. **No drift.**

---

## Cross-Boundary Severity Matrix

| Boundary Path | Critical | High | Medium | Low | Overall |
|---|---|---|---|---|---|
| Database ↔ ORM | 0 | 0 | 0 | 0 | N/A (no DB) |
| API ↔ Docs / Tests | 0 | 1 | 1 | 0 | Solid (after fix) |
| Frontend ↔ Backend Types | 0 | 0 | 0 | 2 | Solid (after fix — orphan `FitResult` and dead `revealing` removed) |
| Validation ↔ Types | 0 | 0 | 1 | 0 | Solid (after fix) |
| Config ↔ Code | 0 | 0 | 0 | 0 | Solid |
| Serialization | 0 | 0 | 0 | 0 | Solid |
| Migrations / Versions | 0 | 0 | 0 | 0 | Solid |

---

## Files Changed

| File | Change | Phase Source | Source of Truth | Lines Changed |
|---|---|---|---|---|
| `src/types/index.ts` | Made `GenerateRequest.excludePhotoIds` optional with explanatory comment; removed orphan `'revealing'` `PosterPhase` branch | Phase 2 #1, Phase 3 dead branch | Zod schema in `generate.ts` (Zod is the runtime contract); App.tsx call sites (no producer/consumer) | -2 / +7 |
| `netlify/functions/generate.ts` | Imported `errorCopy` from `@/content/copy`; replaced three hardcoded message literals with `errorCopy.rateLimit`, `errorCopy.slurBlock`, `errorCopy.realPersonBlock` | Phase 2 #2 | `src/content/copy.ts` (canonical in-voice copy) | +9 / -10 (net: +9 import block, -1 literal in three places, +1 `errorCopy.*` reference in three places) |
| `src/lib/compositor.ts` | Removed local `FitCheckResult` type alias; imported and returned the shared `FitResult` from `@/types` | Phase 3 orphan type | `src/types/index.ts` (already exported) | -7 / +2 |
| `tests/server/generate-contract.test.ts` | Updated comment in "accepts a request omitting excludePhotoIds" to reflect aligned type; added new `errorCopy parity` describe block with three pinning tests (slur, real-person, rate_limited) | Phase 2 fixes | The fix-side changes themselves | +60 / -3 |

---

## Issues Found But Not Fixed

| Issue | Phase | Why Not Fixed | Recommended Action |
|---|---|---|---|
| `errorCopy.generation.timeout`, `errorCopy.frontend.canvasWriteFailed`, `errorCopy.frontend.fontLoadTimeout` are referenced only in `tests/client/content.test.ts` (no production consumer) | Phase 2 — auxiliary | These are reserved in-voice copy entries, not contract drift. Removing them is a YAGNI judgment call rather than a mechanical fix; they may serve future error surfaces (canvas failures, font-load timeouts, client AbortSignal timeouts surfaced explicitly). | Re-evaluate in a future content-pass; either delete with the test cases or wire into the `PosterCanvas` `onFitFailure` / `lib/api.ts` timeout branch. |
| `PUBLIC_FIGURES` array in `safety.ts:24` is empty (`string[] = []`); the loop body never iterates | Phase 2 — auxiliary | Documented in CLAUDE.md as "currently empty" — the regex check above it does the actual real-person filtering. Empty-array drift could be intentional (placeholder for future names) or dead code, but removing it is a product-policy decision, not contract drift. | Either populate with the names that have failed past Sonnet generations, or remove if the regex-only check is the long-term plan. |
| Synonym for the "Just one of those days" preset has no entry in `synonyms.ts` (content words after stopword/length filter: `['days']`, no key) | Phase 2 — auxiliary | The specificity check's direct-overlap and stem branches still work for typical Sonnet outputs ("day", "days"), so the missing synonym entry rarely causes retries. Adding one would be a tuning improvement, not drift. | Optional: add `days: ['day', 'today', 'morning', 'tomorrow', 'evening', 'hour']` to `synonymMap`. |
| `tests/` directory is not in the `tsconfig.json` `include` list (`include: ["src", "netlify", "tools"]`) | Phase 2 — auxiliary | Vitest performs its own TypeScript transform at test-run time, so this isn't a runtime gap. Adding `"tests"` would surface type errors at `npm run typecheck` instead of only at `vitest run`. | Optional: extend `include` to `["src", "netlify", "tools", "tests"]` to catch test type-mismatch at `tsc -b`. |

---

## Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Add a CI step that grep-checks for hardcoded user-facing strings in `netlify/functions/` (`message: '...'` outside `errorCopy.*`) | Pins the new `errorCopy` import as a one-way ratchet | Low | Probably | A small lint script (or `knip`-style scan) that flags any string literal assigned to `message:` in the generate handler. The new contract test pins the three known strings, but future status discriminators could re-introduce the duplication. |
| 2 | Move `RequestSchema` from `generate.ts` into `src/types/` as a shared Zod schema and infer `GenerateRequest` via `z.infer<typeof RequestSchema>` | Eliminates the type/schema two-source pattern entirely; would have prevented the `excludePhotoIds` drift fixed in this run | Low | Only if time allows | The shape is small enough today that hand-keeping the two in sync is cheap, and `RequestSchema` is server-only (it's the input parser, not part of the wire-format response). Worth doing only if a future change adds two or three more request fields. |
| 3 | Promote the `Content-Security-Policy-Report-Only` header in `netlify.toml:40` to enforced after a production observation window | Removes the `Report-Only` qualifier so CSP actually blocks violations | Medium | Probably | Independently flagged in `audit-reports/10_SECURITY_AUDIT_REPORT_001`; not contract drift, but worth pinning in a future pass once you have a week of report data. |

---

## Verification

Final state — run after all fixes were applied:

| Check | Result |
|---|---|
| `npm test` | **365 passed (365)** in 1.10s — 3 new contract pins (errorCopy parity), no regressions |
| `npm run typecheck` (`tsc -b --noEmit`) | Clean, zero errors |
| `npm run build` (`lint:photos && tsc -b --noEmit && vite build`) | Built in 521ms, 0 errors |
| Smoke check (`npx vitest run tests/smoke.test.ts`) | Implicitly passes as part of the full run |

---

## End of Report
