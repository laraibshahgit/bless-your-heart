# External Integration Reliability Audit — Run 33/001

**Date:** 2026-05-04
**Branch:** `nightytidy/run-2026-05-01-1532` (orchestrator-managed)
**Scope:** Every boundary where the application talks to a system it doesn't control — Anthropic, Firebase Firestore, Firebase Storage CDN, PostHog. Inventory, failure-mode analysis, fix application, evidence.
**Baseline:** 27 test files / 381 tests passing.
**Post-fix:** 27 test files / 392 tests passing (+11 new). Build clean. Smoke test 7/7 in 317 ms.

---

## Phase 1 — External Service Inventory

| Service | SDK / Client | Version | Criticality | Operations | Credential Storage | Data Sensitivity | Actively Maintained? |
|---|---|---|---|---|---|---|---|
| Anthropic API (Claude) | `@anthropic-ai/sdk` | ^0.92.0 | **Critical** | Generation (Sonnet) + tone-check (Haiku) + distress-check (Haiku) | `ANTHROPIC_API_KEY` (Netlify env) | User prompt text leaves the app — but **never logged**, never persisted | Yes — official, weekly releases |
| Firebase Firestore | `firebase-admin` | ^13.8.0 | **Critical** (rate-limit fail-open mitigates) | Read/write to `rateLimits/{hashedIp}` — `runTransaction` | `FIREBASE_*` env vars (cert credential) | Hashed IP only (SHA-256, daily-salt-rotated, truncated 32 chars) | Yes — Google-maintained |
| Firebase Storage CDN | `<img>` + `decode()` (browser) | n/a | **Critical** (each poster requires a photo) | Read public photo at `firebasestorage.googleapis.com/.../photos/{id}.jpg` | None (public bucket) | None | Yes |
| PostHog | `posthog-js` | ^1.372.6 | **Low** | Init + `capture()` (event analytics) | `VITE_POSTHOG_KEY` (browser-exposed by design) | Anonymous events only — no prompt content, no PII | Yes |
| Self / `/.netlify/functions/generate` | browser `fetch` | n/a | (Internal) | App-to-own-lambda — out of scope | n/a | n/a | n/a |

**Out of scope (local-tools only, never run in production):**
- `tools/upload-real-photos.mjs` fetches `picsum.photos` (no timeout, no retry — local-only seed script).
- `tools/upload-photos.mjs` writes to Firebase Storage (one-time admin task).
- `tools/optimize-hero-examples.mjs` — pure local file work (sharp).

**Webhook handlers:** None. The only Netlify function (`netlify/functions/generate.ts`) is a request-response endpoint; no incoming webhook signatures, no outgoing event delivery. **Phase 6 is N/A.**

---

## Phase 2 — Failure Mode Matrix

| Service | Outage Behavior | Latency Behavior | Unexpected Response | Cascading? | Fallback? | Resilience |
|---|---|---|---|---|---|---|
| Anthropic | Per-request 12 s timeout → catch in retry loop → 2 retries → `safe_fallback` (curated line + photo) | 12 s × up to 3 attempts; tone-check adds another 12 s; lambda kill at 26 s caps blast radius | `parseGenerationOutput` returns null on bad JSON / wrong shape → `gen_retry` reason=`format`; specificity check rejects generic output → retry | No — isolated in retry loop; lambda budget enforced | **Yes** — `safeFallbacks[]` curated set | **Resilient** |
| Firestore (rate-limit) | 3 s outer Promise.race → `rate_limit_check_failed` → fail-open (request proceeds without rate-limit header) | Same 3 s race cap; if Firestore is slow but responds, normal | `snap.data()` undefined-guarded; types via `RateLimitDoc`. Bad data → unreachable branch resets the doc | No | **Yes** (fail-open is the fallback) | **Resilient** |
| Firebase Storage CDN | `loadImage()` 15 s timeout; `onCanvasFailure` → state=`error` with retryable copy (`errorCopy.frontend.canvasWriteFailed`) | Same 15 s cap; user sees retry copy on stall | `decode()` rejects on corrupt bytes → catch path → same retryable error | No | **No** (no spare photo on transient failure) — user must regenerate | **Fragile** |
| PostHog | Init/capture failures previously **propagated into the calling component** (App.tsx handleGenerate) and could abandon a generation mid-flight. **Fixed in this audit** — both wrapped in try/catch with structured log events. | PostHog SDK queues internally; no app blocking | Init may throw on locked-down browsers (Safari Private Mode, Brave hard mode) | Was → **No longer** — was potential to crash bootstrap or generation handler | **Yes** (skip-gracefully now) | **Resilient** (post-fix) — was Fragile pre-fix |

---

## Phase 3 — Connection Configuration

| Service | Connection Timeout | Response Timeout | Appropriate? | Pool Config | TLS | Issues |
|---|---|---|---|---|---|---|
| Anthropic | (SDK default) | **12 s** explicit (`ANTHROPIC_REQUEST_TIMEOUT_MS`, threaded to all 3 call sites) | Yes — fits twice in the 26 s lambda budget with margin | SDK-managed (HTTPS keep-alive) | Verified by SDK | None |
| Firestore | (admin SDK default) | **3 s** outer race (`RATE_LIMIT_TIMEOUT_MS` in `generate.ts:50,180`) | Yes — fail-open is acceptable here | gRPC-managed | Cert credential, verified | None |
| Firebase Storage CDN (browser) | Browser default | **15 s** explicit (`IMAGE_LOAD_TIMEOUT_MS` in `compositor.ts:55`) | Yes — fits user attention span | Browser-managed; preconnect warmed in `index.html:26` | Verified by browser | None |
| Browser fetch → `/generate` | Browser default | **30 s** (`AbortSignal.timeout` in `api.ts:11,22`) | Yes — outer cap on the entire pipeline | Browser-managed | Verified | None |
| PostHog | Browser default | (SDK-managed) | n/a — non-blocking, queued | Browser-managed | Verified | None |

**Verdict:** Every boundary that can stall has a timeout. No default-of-10-minutes-from-the-SDK exposure.

---

## Phase 4 — Error Handling Assessment

| Location | Service | Type Discrimination? | Per-Type Handling? | User Message | Logged? | Leaked? | Rating |
|---|---|---|---|---|---|---|---|
| `generate.ts:277-294` (retry loop) | Anthropic | **NEW (this audit)** — duck-types `err.status` and bails on 4xx (auth/bad-request/rate-limit). 5xx + network errors retry. | Yes — 4xx bails to `safe_fallback`; 5xx retries up to budget | `safe_fallback` line + photo (in-voice) | Yes — `gen_anthropic_error` with `error`, `status`, `attempt` | No | **Thorough** (was Generic pre-fix) |
| `anthropic.ts:175-187` (`checkTone` catch) | Anthropic | **NEW** — logs `status` for ops; behavior is fail-open | Fail-open (correct intent) | n/a — silent (defensive) | Yes — `tone_check_failed` with `status` | No | **Thorough** |
| `safety.ts:93-104` (`checkDistressWithHaiku` catch) | Anthropic | **NEW** — logs `status`; fail-open | Fail-open (correct intent) | n/a | Yes — `distress_check_failed` with `status` | No | **Thorough** |
| `generate.ts:204-209` (rate-limit catch) | Firestore | Generic (acceptable — only outcome is fail-open) | Fail-open | n/a | Yes — `rate_limit_check_failed` with `error` | No | **Thorough** |
| `api.ts:25-42` (client fetch) | Self/Anthropic chain | Yes — distinguishes 5xx, 4xx, network offline (`navigator.onLine`), generic | Distinct copy per case | Per-case in-voice via `errorCopy.generation.*` | Yes — `gen_client_error` | No (no headers leaked) | **Thorough** |
| `PosterCanvas.tsx:79-87` (image load) | Photo CDN | Generic (treats all failures as fit-failure) | Routes through `onFitFailure` → app `error` phase | `errorCopy.frontend.canvasWriteFailed` | Yes — `poster_render_failed` | No | **Partial** — could discriminate timeout from decode error |
| `analytics.ts` (PostHog) | PostHog | **NEW** — both init and capture wrapped in try/catch | Skip-gracefully (correct for non-critical) | n/a | Yes — `analytics_init_failed`, `analytics_track_failed` | No | **Thorough** (was Missing pre-fix) |

**Errors NEVER leak to the user:**
- No raw stack traces in response bodies (verified by Zod schema in `generate-contract.test.ts`)
- No internal paths in API responses
- All response messages route through `errorCopy.*`

---

## Phase 5 — Retry & Idempotency

| Location | Service | Retry? | Backoff | Jitter | Idempotent? | Idempotency Key? | Issues |
|---|---|---|---|---|---|---|---|
| `generate.ts:251-296` Sonnet generation loop | Anthropic | Yes — 2 retries | **None** (no sleep between attempts) | n/a | **Intentionally non-idempotent** — `temperature: 0.9` means each retry returns DIFFERENT lines, which is *the desired behavior* (new joke per retry) | n/a — no key needed; retries don't risk duplicate "charges" because the operation is "generate text," not financial | **Acceptable.** Lambda budget is 26 s; exponential backoff would push retries past kill. The trade-off is documented: no backoff = slight risk of slamming a stressed Anthropic, mitigated by the 4xx bail (this audit). |
| `safety.ts` distress check | Anthropic | No | n/a | n/a | n/a | n/a | Single attempt, fail-open. Acceptable. |
| `anthropic.ts` tone check | Anthropic | No | n/a | n/a | n/a | n/a | Single attempt, fail-open. Acceptable. |
| `rateLimit.ts` Firestore txn | Firestore | No (one shot, 3 s race) | n/a | n/a | Yes (txn-safe) | n/a | Acceptable — fail-open is the fallback |
| `compositor.ts` photo CDN load | Firebase Storage | **No** | n/a | n/a | Yes (idempotent GET) | n/a | **Gap** — a single dropped packet kills the user's poster. Documented as a Medium-priority improvement (one-shot retry would close this). Not safe to apply mechanically because it would double-fire the network request to a stuck CDN before the timeout fires. |
| `api.ts` browser fetch | Lambda | No | n/a | n/a | Yes (server-side has no side effects beyond rate-limit increment) | n/a | **Gap** — on transient `5xx`, app shows error and asks user to click again. Manually retryable. |

**Crucial dangerous-retry pattern check:** **None present.** The only "external write" the app makes is the Firestore rate-limit increment, which is inside a transaction. Every other Anthropic call is a "read" (LLM inference) that is safe to retry. There are NO payment, email, or resource-creation external calls anywhere in the codebase.

---

## Phase 6 — Webhook Assessment

**N/A — no webhooks.** Single inbound endpoint (`POST /.netlify/functions/generate`) is a request-response handler. No outbound event notifications.

---

## Phase 7 — Rate Limit & Quota Awareness

| Service | Known Limits | Client-Side Limiting? | 429 Handling? | Batch Endpoints Used? | Vulnerable Patterns | Rating |
|---|---|---|---|---|---|---|
| Anthropic | Tier-dependent (typical: 50 RPM Sonnet, 1000 RPM Haiku); per-org rate limits | **Yes** — IP-rate-limit at 25/hour (Firestore-backed) bounds per-user spend; `inFlightRef` mutex prevents double-fire on form submit | **NEW (this audit)** — 429 now bails immediately to `safe_fallback` instead of burning two 12 s retries on a doomed call | n/a — no batch APIs used; one inference per request | None | **Thorough** (was Partial pre-fix) |
| Firestore | Free tier 50k reads + 20k writes/day; one read + one write per request | Yes — own rate-limit caps usage; daily-salt rotation creates fresh keys (low cardinality) | n/a (transactional) | n/a | One known: at UTC 00:00:00, daily-salt rotation gives every IP a fresh doc → user can do 25 req at 23:59:59 UTC and 25 more at 00:00:01 UTC. Documented in `audit-reports/14`. Acceptable. | **Adequate** |
| Firebase Storage | Free tier: 1 GB stored + 10 GB/month bandwidth | Photo library is 10 entries; CDN-cached aggressively | n/a (public read) | n/a | None | **Adequate** |
| PostHog | Free tier: 1 M events/month | App fires ~5 events per generation, capped at 25 generations/IP/hour | n/a (SDK-queued) | Yes — SDK batches automatically | None | **Adequate** |

---

## Phase 8 — Credential Safety

| Service | Credential Type | Storage | In VCS? | Scoped? | Per-Env? | Rotatable? | Exposed Anywhere? | Issues |
|---|---|---|---|---|---|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` (Bearer) | Netlify env | **No** (`.env.example` is a template only) | Org-level (no per-env scoping in Anthropic console — known platform constraint) | Per-deploy (Netlify supports preview vs. prod) | Yes — manual via Anthropic console | **No** — never logged, never returned in any response, never imported by client code (verified — `src/server/` boundary enforced by code-organization rule in `CLAUDE.md`) | None |
| Firebase | `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (cert) | Netlify env | No | Service account — scoped to a single project (Firestore + Storage) | Per-deploy | Yes — generate new service account key, swap in Netlify | No — never logged | Private key arrives with literal `\n` and is normalized in `firebaseAdmin.ts:9` (`replace(/\\n/g, '\n')`). Standard pattern for Netlify env. |
| `IP_SALT_BASE` | Application secret (HMAC pepper) | Netlify env | No | n/a | Per-deploy | Yes — but rotating invalidates all in-flight rate-limit windows (acceptable consequence) | No — only used inside `createHash('sha256')` | None |
| PostHog | `VITE_POSTHOG_KEY` (publishable, project-scoped) | Netlify env (build-time) | No | Project-scoped (PostHog publishable keys are designed for browser exposure) | Per-deploy | Yes | **Yes — by design.** Browser-exposed via Vite's `import.meta.env.VITE_*`. This is the intended PostHog deployment model — the key is publishable and analytics-only-scoped. | None |
| `ALLOWED_ORIGINS` | CSRF allowlist (config, not a credential) | Netlify env | No | n/a | Per-deploy | Trivially | No | **Documented operational dep:** must be set in production to enforce CSRF shield (currently `unset = no-op` for back-compat). CLAUDE.md flags this. |

**Startup validation:** None of the env vars are validated at module-load time. The application starts successfully without them and fails on first request. **Documented; not fixed in this run** because the existing tests rely on lazy initialization (env writes happen at module-scope in `tests/server/generate-contract.test.ts:53-56` etc., before `import { handler }`). Adding startup throws would invert that order. Recommendation table flags it.

---

## Phase 9 — Monitoring & Observability

| Service | Latency Tracked? | Error Rate Tracked? | Alerts? | Log Quality | Health Check? | Diagnosable? | Rating |
|---|---|---|---|---|---|---|---|
| Anthropic | **NEW (this audit)** — `gen_ok` now includes `duration_ms`; `gen_anthropic_error` now includes `status` and `attempt` | Yes — every outcome emits a discrete event (`gen_ok`, `gen_safe_fallback`, `gen_anthropic_error`, `gen_retry`, etc.) | None — no APM / no alerting layer (Netlify function logs only) | Structured JSON one-liner per event; greppable; status code now included | No dedicated endpoint | Yes — `gen_ok` rate vs. `gen_safe_fallback` rate is the SLI; `gen_anthropic_error` with `status` distinguishes auth from infra | **Observable** (post-fix) — was Partially Observable pre-fix |
| Firestore | No | Yes — `rate_limit_check_failed` on fail-open | None | Structured | No | Partially — bind to Firebase Console for query latency | **Partially Observable** |
| Firebase Storage CDN | No (browser-side only) | `poster_render_failed` event | None | Structured | No | Partially — browser console logs are user-side, not aggregated | **Partially Observable** |
| PostHog | n/a (it IS the monitoring) | New: `analytics_init_failed`, `analytics_track_failed` | None on PostHog itself | Structured | No | Partially — analytics gaps would manifest as missing events | **Partially Observable** |

**Logging policy compliance:** Every fail-open `console.error` includes `error: String(err)` per CLAUDE.md convention. New fields added in this audit (`status`, `attempt`, `duration_ms`) are additive and don't disrupt existing log-grep workflows.

**No alerting layer exists.** This is a known architectural gap — the app is currently low-traffic and operates under "watch the function-logs dashboard" discipline. Documented as a Medium recommendation.

---

## Phase 10 — Critical Path Analysis

| Endpoint / Action | External Services Called | Critical Path? | Async? | Non-Critical Blocking Critical? | Issues |
|---|---|---|---|---|---|
| `POST /generate` (server) | (1) Firestore (rate-limit), (2) Anthropic Haiku (distress), (3) Anthropic Sonnet (gen), (4) Anthropic Haiku (tone) | **Yes** — all 4 are critical to the response | Sequential, all `await`ed | No — every external call here is part of the contract | None |
| Browser → `/generate` (`callGenerate`) | (1) Self lambda | Yes | Awaited | No | None |
| Poster render (`PosterCanvas`) | (1) Firebase Storage CDN | Yes — every poster needs a photo | Awaited | No | None |
| App boot (`main.tsx`) | (1) PostHog init | **No — was implicit blocking** (a throw from `posthog.init()` would crash the bootstrap before React mounts). **Fixed in this audit** with try/catch + log. | Sync (called outside React tree) | Was Yes → **No longer** | None (post-fix) |
| Generation (`handleGenerate` in App.tsx) | (1) PostHog `track('prompt_submitted')` BEFORE `callGenerate` | Was implicit blocking — a throw from `posthog.capture()` would abandon the generation. **Fixed in this audit.** | Sync call before `await callGenerate` | Was Yes → **No longer** | None (post-fix) |
| Generation completion (`handleGenerate` in App.tsx) | (1) PostHog `track('generation_completed')` etc. (4 sites) | Same — was implicit blocking | Sync after `await callGenerate` | Was Yes → **No longer** | None (post-fix) |

**Key finding (now closed):** PostHog had 5 critical-path call sites in App.tsx (`prompt_submitted`, `generation_distress`, `generation_blocked`, `generation_rate_limited`, `generation_completed`, `generation_safe_fallback`, `generation_error`, `regenerate_clicked`, `canvas_render_failed`). A throw from any of them — possible on locked-down browsers — would have crashed mid-generation. **This audit's analytics try/catch closes the entire class.**

---

## Phase 11 — Fixes Applied (with verification)

| File | Change Description | Category | Tests Pass? | Tests Added |
|---|---|---|---|---|
| `src/lib/analytics.ts` | Wrapped `posthog.init()` in try/catch — emits `analytics_init_failed` on throw, swallows so app bootstrap continues | Cat 5: Non-critical separation; Cat 6: structured logging | **Yes (392/392)** | 1 (init throw → swallow + log) |
| `src/lib/analytics.ts` | Wrapped `posthog.capture()` in try/catch — emits `analytics_track_failed`, swallows so generation handler is never abandoned by an analytics failure | Cat 5; Cat 6 | **Yes** | 1 (capture throw → swallow + log) |
| `src/server/anthropic.ts` | Added `getApiErrorStatus(err)` duck-type helper — extracts numeric `.status` from APIError-shaped throws without `instanceof` (works through wholesale SDK mocks) | Cat 6 (foundation for Cat 2) | **Yes** | 4 (number / undefined / non-numeric / non-object branches) |
| `src/server/anthropic.ts` | `checkTone` catch now logs `status` alongside `error` in `tone_check_failed` event | Cat 6: structured logging | **Yes** | (covered by existing fail-open test + lint) |
| `src/server/safety.ts` | `checkDistressWithHaiku` catch now logs `status` in `distress_check_failed` event | Cat 6 | **Yes** | (covered by existing fail-open test) |
| `netlify/functions/generate.ts` | Anthropic retry loop now bails on 4xx (any 400-499) — auth, bad-request, permission-denied, rate-limit. 5xx + network errors continue retrying within budget. | **Cat 2: error type discrimination** | **Yes** | 5 (401 bail / 400 bail / 429 bail / 500 retries / network-no-status retries) |
| `netlify/functions/generate.ts` | Anthropic retry loop logs `status` and `attempt` in `gen_anthropic_error`; `gen_ok` now logs cumulative `duration_ms` across all attempts | Cat 6 | **Yes** | (covered by integration tests via mock call counts) |
| `tests/client/analytics.test.ts` | +2 tests — capture/init throw resilience | — | Yes | n/a |
| `tests/server/anthropic.test.ts` | +4 tests — `getApiErrorStatus` shape coverage | — | Yes | n/a |
| `tests/server/generate-integration.test.ts` | +5 tests — Anthropic 4xx-bail behavior + 5xx-retry preservation | — | Yes | n/a |

**Verification commands run:**

```bash
npx vitest run --reporter=dot
# Test Files: 27 passed (27)
# Tests: 392 passed (392)  [baseline 381 + 11 new]
# Duration: 1.11s

npm run build
# lint:photos: 10 photos validated
# tsc -b --noEmit: clean
# vite build: ✓ built in 488ms

npx vitest run tests/smoke.test.ts --reporter=dot
# Test Files: 1 passed (1)
# Tests: 7 passed (7)
# Duration: 317ms
```

---

## Findings That Were Considered But NOT Fixed

| # | Finding | Reason Skipped | Recommendation? |
|---|---|---|---|
| F1 | No retry on transient photo CDN failure (`compositor.ts:loadImage`) | Adding a retry could double-fire the network request to a stuck CDN before the 15 s timeout, increasing user-facing latency. The current "user clicks Generate again" flow is acceptable. | Yes — Medium priority |
| F2 | No exponential backoff on Anthropic 5xx retry | Lambda budget (26 s) doesn't accommodate it without losing the retry. Trade-off documented inline. | No |
| F3 | No startup validation of required env vars | Existing tests rely on module-scope env writes that happen *before* `import { handler }`. Adding startup throws would require refactoring multiple test files. | Yes — Low priority |
| F4 | No APM / alerting layer | Architectural change. App is low-traffic; current "Netlify function logs" discipline is acceptable. | Yes — Medium priority |
| F5 | `tools/upload-real-photos.mjs` no timeout on `fetch('https://picsum.photos/...')` | Local-only seed script; never runs in production | No |
| F6 | `firebase-admin` transitive `npm audit` advisories (10 moderate/low) | Already documented in CLAUDE.md as accepted baseline (no exploitable surface here; upstream constraint) | No |

---

## Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Add APM / alerting on `gen_safe_fallback` rate | Detect Anthropic degradation in <5 min instead of "next time someone notices" | **Medium** — production blind spot during provider blips | **Probably** | Wire Netlify function logs to a log-aggregator (Datadog, Better Stack, Logflare) and alert when `gen_safe_fallback` rate exceeds 5% for 5 min. The structured JSON events emitted today (now including `status` and `duration_ms`) are perfectly positioned to drive this. |
| 2 | One-shot retry on transient photo CDN load | Reduces user-visible failures from a single dropped packet | **Medium** — degrades poster reliability on shaky mobile networks | **Probably** | In `compositor.ts:loadImage`, on a `decode()` reject (NOT a timeout), retry once after 250 ms. Skip retry on timeout — that would compound the wait. Pin behavior with a new test that mocks `decode()` to fail-then-succeed. |
| 3 | Startup validation of required env vars | Faster failure on misconfigured deploys | Low — runtime failure is loud enough | **Only if time allows** | Add a `validateEnv()` pass at the top of `generate.ts` that throws if `ANTHROPIC_API_KEY`, `FIREBASE_*`, or `IP_SALT_BASE` are missing in production (`process.env.NETLIFY === 'true'` heuristic). Requires reordering several integration-test env writes. |
| 4 | Detect 429 Retry-After and surface to client | Better UX on provider rate-limit (rare) | Low — current behavior shows safe_fallback, which is in-voice and acceptable | **Only if time allows** | Read `err.headers?.get('retry-after')` from Anthropic 429s and route through the existing `rate_limited` response path with that value as `retryAfterSec`. Currently 429 just bails to `safe_fallback`. |
| 5 | Add a `/health` endpoint for uptime monitoring | Enables external uptime monitoring | Low — Netlify already monitors function availability | **Only if time allows** | A new lambda `netlify/functions/health.ts` returning `{ status: 'ok' }` would let UptimeRobot / Better Stack hit the lambda warm-path without spending Anthropic tokens. |

---

## Chat Summary (printed to user)

See the conversation message below this report file.

**Report path:** `audit-reports/33_EXTERNAL_INTEGRATION_REPORT_001_2026-05-04_1956.md`
