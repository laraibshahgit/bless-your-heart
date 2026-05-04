# Data Integrity & Validation Audit — Run 24/001

- **Date:** 2026-05-04 17:45 PST
- **Branch:** `nightytidy/run-2026-05-01-1532`
- **Test baseline:** 365 → 375 passing (10 new tests added; 0 regressions)
- **Build:** `npm run build` clean (lint-photos + typecheck + vite)

---

## Executive Summary

**Overall integrity: GOOD.** This is a stateless web app with no user accounts, no relational schema, no soft deletes, and no migration history — most of the high-stakes data-integrity failure modes (orphaned FKs, cascade gaps, schema drift between ORM and DB) simply don't exist here. The data surface is narrow:

- One HTTP boundary: `POST /.netlify/functions/generate`
- One Firestore collection: `rateLimits/{hashedIp}` (transient, TTL-controlled)
- One static JSON file: `src/data/photos.json` (lint-validated at build)
- One sessionStorage key: `byh:lastPrompt` (UX-only persistence)

The audit covered each of those boundaries plus every `process.env` read in `src/server/` and `netlify/functions/`. Total tally:

| Category | Findings | Fixed | Documented |
|---|---|---|---|
| Input validation gaps | 4 | 4 | 0 |
| Constraint gaps (no migrations needed; Firestore is schemaless) | 0 | — | — |
| Orphan / cleanup risks | 1 deployment-side concern | 0 | 1 |
| Schema-vs-application drift | 3 minor | 0 | 3 |
| Business invariants needing eyes | 2 questions for the team | 0 | 2 |

No critical or high-severity gaps. Four medium-severity input-validation gaps were closed. Three drift items are non-blocking and tracked for future passes.

---

## Phase 1 — Input Validation

### Boundaries identified

| # | Boundary | Validator | Notes |
|---|---|---|---|
| 1 | `POST /.netlify/functions/generate` body | `RequestSchema` (Zod) in `netlify/functions/generate.ts:34-39` | Trims, enforces 1–200 char prompt + 0–50 excludePhotoIds |
| 2 | `event.headers.origin` | `isOriginAllowed` (allowlist) in `generate.ts:92-98` | CSRF shield, env-driven |
| 3 | `event.headers['x-country']` | None (uppercased + map lookup with fallback) | Graceful fallback to INTL hotline; no validation needed |
| 4 | `event.headers['x-nf-client-connection-ip']` / `x-forwarded-for` | None (string-only; missing → `'unknown'`) | Hashed before any use; un-IP'd requests collide on same hash by design |
| 5 | `process.env.RATE_LIMIT_PER_HOUR` | `parseInt` only — no NaN/negative/zero check | **GAP** (now fixed) |
| 6 | `process.env.IP_SALT_BASE` | None (default `'byh-default-salt'` is published in source) | Documented operational risk |
| 7 | `process.env.ALLOWED_ORIGINS` | Split-on-comma + lowercase | Misconfig (typo) silently blocks all real traffic; acceptable |
| 8 | `process.env.ANTHROPIC_API_KEY` | None | SDK throws on bad/missing key → caught by retry loop → safe_fallback. Acceptable |
| 9 | `process.env.FIREBASE_*` | None | Init failure throws → caught by transaction catch → fail-open. Acceptable |
| 10 | `process.env.ENABLE_TONE_CHECK` | Strict `=== 'false'` literal | Documented behavior; any other value leaves enabled |
| 11 | `process.env.ANTHROPIC_MODEL_GEN` / `_SAFETY` | None | Falls back to documented defaults; unsafe model name → SDK error → retry loop |
| 12 | `process.env.VITE_FIREBASE_STORAGE_BASE_URL` | None (frontend `??` to `''`) | Missing → malformed photo URLs → 404; obvious in QA |
| 13 | `sessionStorage['byh:lastPrompt']` | `<input maxLength>` (does NOT enforce on programmatic set) | **GAP** (now fixed) |
| 14 | Client `App.tsx` `excludePhotoIds` accumulator | None — append-only across regenerates | **GAP** (now fixed): could exceed server's 50-element bound |
| 15 | Static `src/data/photos.json` | `tools/lint-photos.ts` at build + `photos-library-schema.test.ts` at every test run | Well-covered by existing dual-validation |

### Findings & Fixes

#### F1 — `excludePhotoIds` element strings were unbounded `[fixed]`

**Severity:** Medium (defense-in-depth) | **Status:** ✅ Fixed in `netlify/functions/generate.ts:34`

The original schema bounded the array length (50) but not per-element string length. A determined attacker could fit ~50 strings of ~120KB each under Netlify's 6MB body cap and force expensive Zod validation on a multi-MB payload before the request hit any business logic. Photo IDs in the library follow the slug pattern `^[a-z]+(-[a-z]+)*-\d{2,}$` (≤30 chars in practice), so 64 is generous headroom.

Fix:
```typescript
excludePhotoIds: z
  .array(z.string().min(1).max(MAX_EXCLUDE_PHOTO_ID_LENGTH))  // was: z.string()
  .max(MAX_EXCLUDE_PHOTO_IDS)
  .default([]),
```

Tests pinning the new boundary in `tests/server/generate-contract.test.ts`:
- accepts entries up to 64 chars (upper boundary, allowed)
- rejects entries longer than 64 chars (just over the boundary)
- rejects empty-string entries (lower boundary)

#### F2 — Client accumulator could exceed server's 50-element bound `[fixed]`

**Severity:** Medium (real bug — silent 400 after 50 regenerates) | **Status:** ✅ Fixed in `src/App.tsx`

The `excludePhotoIds` accumulator in `App.tsx:104` appended on every successful generation without cap:
```typescript
setExcludePhotoIds((prev) => [...prev, result.photoId]);
```

After 50 regenerates the array would outgrow the server's `MAX_EXCLUDE_PHOTO_IDS = 50` bound and the next request would 400. The user would see a generic error with no clue why.

Fix:
- Promoted `MAX_EXCLUDE_PHOTO_IDS` and `MAX_EXCLUDE_PHOTO_ID_LENGTH` to `src/types/index.ts` (single source of truth).
- Updated `App.tsx` to slice the accumulator: `[...prev, result.photoId].slice(-MAX_EXCLUDE_PHOTO_IDS)`. Slice-from-right keeps the most recent entries — matches the "don't repeat the last few photos" intent.

#### F3 — `RATE_LIMIT_PER_HOUR` parsing accepted NaN / negative / zero `[fixed]`

**Severity:** Medium (silent pathological misconfig) | **Status:** ✅ Fixed in `src/server/rateLimit.ts`

`parseInt(process.env.RATE_LIMIT_PER_HOUR ?? '25', 10)` produced these silent failure modes:
- `'abc'` → `NaN` → `count >= NaN` always false → **rate limiter is effectively off**
- `'-5'` → `-5` → `count=1 >= -5` is true on the first hit → **every request blocked from the first call**
- `'0'` → `0` → same as above
- `''` → `NaN` → same as `'abc'`

Fix: introduced `parseRateLimit()` helper with `Number.isFinite(parsed) && parsed > 0` validation, falling back to the documented default 25 on any misconfig.

Tests pinning the fallback in `tests/server/rateLimit-extended.test.ts` (parametrized `it.each`):
- non-numeric string, empty string, negative integer, zero, negative float → all fall back to 25
- undefined → falls back to 25
- positive integer → respected as-is

#### F4 — sessionStorage prompt restoration bypassed length cap `[fixed]`

**Severity:** Low (UX glitch — server still rejects) | **Status:** ✅ Fixed in `src/components/PromptInput.tsx`

The browser's `<input maxLength>` only enforces user typing — a value set programmatically (e.g. tampered or migrated sessionStorage) can exceed it. A stale key with >200 chars would be restored as-is, the user could submit, and the server would 400. Defensive truncation closes the loop at the UI layer.

Fix: `onChange(saved.slice(0, MAX_PROMPT_LENGTH))` in the restore effect.

No render test added — the codebase has no `@testing-library/react` (intentional per CLAUDE.md). Server's `accepts prompt at exactly 200 chars` / `rejects 201` boundary tests in `generate-contract.test.ts` remain the load-bearing security boundary.

### Frontend ↔ backend consistency

The four bounds shared across the boundary now all reference the same constants:

| Bound | Frontend | Backend |
|---|---|---|
| Prompt length 1–200 | `<input maxLength={MAX_PROMPT_LENGTH}>` + sessionStorage truncate | `z.string().trim().min(1).max(MAX_PROMPT_LENGTH)` |
| `excludePhotoIds` array max 50 | `App.tsx` accumulator slice `-MAX_EXCLUDE_PHOTO_IDS` | `z.array(...).max(MAX_EXCLUDE_PHOTO_IDS)` |
| `excludePhotoIds` element max 64 | (not actively built by client; bounded server-side) | `z.string().min(1).max(MAX_EXCLUDE_PHOTO_ID_LENGTH)` |
| Origin allowlist | (browser sets Origin automatically) | `isOriginAllowed` env-driven |

All four constants live in `src/types/index.ts` — single source of truth, no drift surface.

### Remaining gaps (documented, not fixed)

| ID | Gap | Severity | Why not fixed |
|---|---|---|---|
| D1 | `IP_SALT_BASE` defaults to a published string (`'byh-default-salt'`) if unset | Low | Operational concern — the `.env.example` warns to set it. Adding a runtime check that throws would gate prod start on env config; the daily date suffix already rotates the salt. Document in deploy checklist. |
| D2 | `ALLOWED_ORIGINS` parses by split-on-comma with no normalization beyond `trim+lowercase` | Low | Misconfig (e.g. trailing slash, port mismatch) silently blocks legitimate traffic. The 403 response shape is observable in monitoring; not worth the complexity of per-Origin diagnostic logging. |
| D3 | `event.headers['x-country']` is uppercased without 2-char ISO validation | Low | The `getHotlineForCountry` map lookup falls back to INTL hotline on miss. Pinned by contract test `unknown x-country (e.g. "ZZ") falls back to INTL hotline`. |

---

## Phase 2 — Database Constraints

### Schema map

This codebase uses Firestore in admin mode for **one collection** with **one document type**:

```
rateLimits/{hashedIp}
  count: number             // request count in current window
  windowStart: Timestamp    // start of the 1-hour window
  expiresAt: Timestamp      // = windowStart + 1 hour, used by Firestore TTL
```

No relational schema. No migrations. No foreign keys. No cascades. Firestore documents are schemaless — the server's only guarantee is that `RateLimitDoc` (in `src/types/index.ts`) describes the shape it writes and reads.

### Constraint gaps

| Concern | Status |
|---|---|
| `count` must be ≥ 0 | Enforced implicitly: server only writes `count: 1` (initial/reset) or `data.count + 1` (increment). No negative-count code path exists. A manual edit could violate it; the existing `data.count >= limit` comparison would be unaffected. |
| `expiresAt = windowStart + 1 hour` | Enforced + pinned by `TTL contract` tests in `rateLimit-extended.test.ts` (initial-create, window-reset, count-increment-no-touch). |
| `windowStart` must be a Timestamp | No read-time check. Corrupt docs make `data.windowStart.toMillis()` throw — pinned by `rejects when windowStart exists but is not a Timestamp-shaped value` test. The handler's try/catch wrapper around `checkAndIncrementRateLimit` catches the throw and fails open (allowed) — pinned by `rate_limit_check_failed` log assertion. |
| Document-key shape (32-char hex hash) | Not validated on read; only written by `hashIp()` which guarantees the shape. A manual write with a non-hash key would be inert (the collision space is large). |

### Migration files

**None needed.** Firestore has no schema migrations — fields are added/removed by code change. The `firestore.rules` file is locked down to `allow read, write: if false;` at the deny-by-default root, meaning only the admin SDK (server-side service account) can touch any collection. There is no migration risk.

### `photos.json` (static data contract)

The dual-validation pattern (`tools/lint-photos.ts` at build + `tests/server/photos-library-schema.test.ts` at every test run) covers:

- ✅ Slug-format ID (`^[a-z]+(-[a-z]+)*-\d{2,}$`)
- ✅ Unique IDs across the library
- ✅ `textZone.x + width ≤ 1.001` and `y + height ≤ 1.001`
- ✅ High-capacity tier requires `capacity ≥ 60/100`
- ✅ ≥ 8 high-capacity photos in library
- ✅ Every `safeFallbacks` photoId resolves to a real library entry

No additional constraints recommended. The lint+test mirror is well-engineered.

---

## Phase 3 — Orphaned Data & Referential Integrity

### Deletion patterns audited

There are **no deletion code paths** in the runtime application:

| Asset | Lifecycle |
|---|---|
| User accounts | None — app is fully anonymous |
| User-generated content | Never persisted on the server (poster downloads happen client-side via Canvas → blob → file-saver) |
| `rateLimits/*` Firestore docs | Auto-deleted by Firestore TTL on `expiresAt` field |
| Firebase Storage `photos/*.jpg` | Curated by `tools/upload-real-photos.mjs` only; no runtime delete code. `storage.rules` blocks all writes |
| `sessionStorage['byh:lastPrompt']` | Per-tab; cleared on tab close |
| Client `excludePhotoIds` state | Per-render; cleared on page reload |

There is no possibility of dangling FKs, partial cascade, soft-deleted parents with active children, or multi-step deletion failure — the data model is too small to support them.

### Documented operational concern

| ID | Concern | Severity | Action |
|---|---|---|---|
| O1 | Firestore TTL policy on `rateLimits.expiresAt` must be enabled in the Firebase console | Medium | The `expiresAt` field is **written correctly** by the code (verified by 3 TTL-contract tests), but Firestore's TTL feature requires explicit policy configuration in `gcloud firestore` or the Firebase console. This is invisible from the codebase. **If the TTL policy is not enabled, `rateLimits` documents accumulate indefinitely** and the collection will eventually exceed the free-tier quota. **Action for the team:** verify in the Firebase console that a TTL policy exists on `rateLimits` with field `expiresAt`. Diagnostic query below. |

### Diagnostic queries (run manually after review)

```javascript
// Q1 — rateLimits collection size
// Run in Firebase console → Firestore → rateLimits → "Get document count"
// Expected: ≤ ~5–10× hourly active IPs (TTL deletes after 1 hour)
// If much larger: TTL policy is not configured

// Q2 — Stale rateLimits docs (run after Q1 if count is suspicious)
// Find docs whose expiresAt is older than now — these should not exist if TTL is on
// Firestore console query: rateLimits where expiresAt < <epoch_now_ms>/1000
// Expected: 0 results (TTL has a few-hour grace period but should drain)

// Q3 — Malformed rateLimits docs (defense-in-depth check)
// Expected shape: { count: number, windowStart: Timestamp, expiresAt: Timestamp }
// Find docs missing windowStart (would throw on read; handler fails open):
//   Cannot be expressed as a single Firestore query — export collection and grep
//   The handler-level catch makes this self-healing, but worth a one-time spot-check
```

---

## Phase 4 — Schema vs. Application Drift

### Findings (all minor, documented for future passes)

#### S1 — `fittingRung: 1 | 2 | 3 | 4` is wider than the server contract

**Where:** `src/types/index.ts:62` declares `fittingRung: 1 | 2 | 3 | 4`. The server's `selectPhoto` (`src/server/photoSelection.ts`) only ever returns `1 | 2 | 3`. The `4` value is set client-side in `App.tsx:118` for `safe_fallback` responses (a different status discriminator that doesn't carry `fittingRung` on the wire).

**Impact:** Type permits a value the server never produces on `status: 'ok'` responses. The contract test `accepts fittingRung=4 even though no current code path emits it` (in `generate-contract.test.ts`) intentionally pins this. Cosmetic — no runtime risk.

**Recommendation:** Either narrow the wire-format type to `1 | 2 | 3` and use a separate client-side enum that includes 4 for UI presentation, or leave as-is. Defer to product preference.

#### S2 — Client analytics `reason` derived from substring match on `result.message`

**Where:** `src/App.tsx:84`:
```typescript
track('generation_blocked', { reason: result.message.includes('people') ? 'real_person' : 'slur' });
```

**Impact:** Couples the analytics tagging to the **string content** of `errorCopy.realPersonBlock` ("…doesn't punch at people…"). If a copy revision drops the word "people", every real-person block silently gets re-tagged as `slur`. The server already knows the reason — it logs `gen_block` with `reason: 'slur' | 'real-person' | 'origin'` server-side — but does not expose the reason field on the wire to the client.

**Recommendation:** Add `reason: 'slur' | 'real_person'` to the `BlockedResponseSchema` discriminator. Wire-format change; defer to a contract-update pass coordinated with the contract test.

#### S3 — Client `callGenerate` casts JSON response to `GenerateResponse` without runtime validation

**Where:** `src/lib/api.ts:32`: `return (await response.json()) as GenerateResponse;`

**Impact:** If the lambda response shape ever drifted from the type (intentional or not), the client's `switch (result.status)` narrowing would silently fall through to a default case. The server-side `generate-contract.test.ts` pins the wire shape from the producer side — but it can't catch a bad deploy of a partner consumer. Adding client-side Zod validation would catch malformed responses with a clear error.

**Recommendation:** Defer. The contract test is the load-bearing pin and the consumer surface is just one app. Track for a future pass if a second consumer of `/generate` is added.

#### S4 — `Photo.width` / `Photo.height` are unused at runtime

**Where:** `src/types/index.ts:31-32`. The fields are read by `tools/lint-photos.ts` at build but not by any runtime code. The Canvas compositor (`src/lib/compositor.ts`) sizes from the loaded `<img>` not from the metadata.

**Impact:** Documented as "schema-vs-app drift in reverse" — the metadata is more detailed than the runtime needs. Not a bug; could be removed if the lint contract were also relaxed.

**Recommendation:** No action. Useful for future use cases (e.g. responsive image variants).

### Raw query risks

`firebase-admin/firestore` is the only DB client. There is **no raw SQL** in the codebase. The single `runTransaction` call in `src/server/rateLimit.ts:43-115` uses typed Firestore APIs (`tx.get`, `tx.set`, `tx.update`) with structural (not string-based) field references. No injection or column-drift risk.

### Enum / status consistency

`GenerateResponse.status` discriminator: `ok | distress | blocked | rate_limited | safe_fallback | error`.

**All six values are handled** in:
- `App.tsx` `handleGenerate` switch: ✅ all six covered
- `tests/server/generate-contract.test.ts` Zod discriminated union: ✅ all six covered

Other enum-shaped fields:
- `Photo.textColor: 'white' | 'dark'` — used in `tools/lint-photos.ts`, `tests/server/photos-library-schema.test.ts`, `src/lib/compositor.ts`. All handlers exhaustive.
- `Photo.watermarkPosition` (4 corners) — used in `compositor.ts` with explicit switch; pinned by `it.each` corner tests in `tests/client/compositor.test.ts`.
- `Photo.tier: 'standard' | 'high-capacity'` — used in `photoSelection.ts` and the lint mirror.

No drift detected.

---

## Phase 5 — Business Invariants

### Multi-system invariants (cannot be expressed as single-table constraints)

| Invariant | Currently Enforced? | Diagnostic | Recommendation |
|---|---|---|---|
| Line 1 ≤ 60 chars (hard cap; format IS the joke) | ✅ Server Zod (`validation.ts`) + contract test boundaries (60 / 61) | `tests/server/generate-contract.test.ts > rejects line1 longer than the 60-char hard cap` | None — well-pinned |
| Line 2 ≤ 100 chars (hard cap) | ✅ Same | Same | None |
| Every `safeFallbacks[*].photoId` resolves to a real library entry | ✅ `photos-library-schema.test.ts > every photoId in safeFallbacks references a real photo` | At test-time | None |
| Library has ≥ 8 high-capacity photos | ✅ Lint + test mirror | At build + test time | None |
| `expiresAt = windowStart + 1 hour` on every TTL-touching write | ✅ 3 TTL-contract tests | At test time | None |
| `count` increment within window must NOT slide `windowStart` / `expiresAt` | ✅ `count-increment within the window does NOT rewrite windowStart or expiresAt` test | At test time | None |
| Daily salt rotates at UTC midnight (multi-region determinism) | ✅ `hashIp — UTC-anchored salt rotation` block | At test time | None |
| Frontend `excludePhotoIds` accumulator never exceeds server's MAX_EXCLUDE_PHOTO_IDS | ✅ Now enforced via shared constant + slice (run 24/001) | App.tsx slice + contract test 50/51 boundary | None |
| Frontend prompt input never exceeds MAX_PROMPT_LENGTH on programmatic restore | ✅ Now enforced via slice on sessionStorage restore (run 24/001) | Slice in PromptInput effect | None |
| Firestore TTL policy on `rateLimits.expiresAt` is configured in the Firebase project | ⚠️ Cannot be verified from code | Q1/Q2 from Phase 3 | **Confirm with team** — ops checklist item |

### Open questions for the team

| Q | Question | Why it matters |
|---|---|---|
| Q1 | Is the Firestore TTL policy on `rateLimits.expiresAt` actually enabled in the production Firebase project? | If unset, the collection grows forever despite the code writing `expiresAt` correctly. Free-tier exhaustion is silent until billing surprises someone. |
| Q2 | Should `BlockedResponseSchema` add a `reason: 'slur' \| 'real_person'` field on the wire so analytics doesn't depend on copy substring matches? (See S2 above.) | Decouples analytics from copy revisions. Wire-format change; needs contract-test coordination. |

---

## Recommendations (priority-ordered)

| # | Recommendation | Severity | Worth Doing? |
|---|---|---|---|
| R1 | Verify Firestore TTL policy is enabled on `rateLimits.expiresAt` in the production Firebase project | Medium | Yes — purely operational, 5-min check, prevents silent unbounded growth |
| R2 | Add `reason` field to `blocked` response so client analytics doesn't depend on copy substring matches (S2) | Low | Probably — small wire change, eliminates a brittle coupling |
| R3 | Set `IP_SALT_BASE` in production env (don't rely on the published default) | Low | Yes if not already done — operational, .env.example warns about it |
| R4 | Track depcheck/knip CI step (referenced in 11/dependency-health audit) — would prevent declared-but-unused-dep regressions like `react-hook-form` | Low | Only if time allows — already documented in run 11/002 |
| R5 | Narrow `fittingRung` wire type from `1 \| 2 \| 3 \| 4` to `1 \| 2 \| 3` and use a separate UI enum for the safe_fallback marker (S1) | Low | Only if time allows — cosmetic; type currently permits a value the server never emits on `ok` |

### Ongoing practices

1. **Keep the `MAX_*` constants in `src/types/index.ts` as the single source of truth.** Frontend bounds and backend Zod schemas now reference the same exports — drift is impossible without touching one place visible from both sides.
2. **When adding a new field to `GenerateResponse`, update `src/types/index.ts` AND `tests/server/generate-contract.test.ts` together.** The contract test's discriminated Zod schema is the wire-format pin.
3. **When adding a new env var, add a defensive parser** (matches `parseRateLimit` pattern) — bound the misconfig blast radius before it reaches business logic.
4. **When adding a new client-side accumulator that gets sent to the server, mirror the server's bound on the client** so the user never trips a 400 they can't recover from.
5. **Firestore docs have no schema enforcement at write time.** Treat the server's TypeScript types as advisory and ensure all read paths handle missing/corrupt fields without throwing — current `rateLimit.ts` does this; mirror the pattern if a second collection is added.

---

## Files Modified

- `src/types/index.ts` — added `MAX_EXCLUDE_PHOTO_IDS`, `MAX_EXCLUDE_PHOTO_ID_LENGTH` shared constants
- `netlify/functions/generate.ts` — imported shared constants; added per-element bound to `excludePhotoIds` Zod schema
- `src/server/rateLimit.ts` — added `parseRateLimit()` defensive parser for `RATE_LIMIT_PER_HOUR`
- `src/App.tsx` — capped `excludePhotoIds` accumulator at `MAX_EXCLUDE_PHOTO_IDS` to mirror server bound
- `src/components/PromptInput.tsx` — truncated sessionStorage-restored prompt to `MAX_PROMPT_LENGTH`
- `tests/server/generate-contract.test.ts` — 3 new tests pinning per-element `excludePhotoIds` bounds (≤ 64 / > 64 / empty-string)
- `tests/server/rateLimit-extended.test.ts` — 7 new tests pinning `RATE_LIMIT_PER_HOUR` defensive parsing (`it.each` over 5 misconfigs + undefined + valid)

**Test count:** 365 → 375 (+10). All passing. `npm run build` clean.
