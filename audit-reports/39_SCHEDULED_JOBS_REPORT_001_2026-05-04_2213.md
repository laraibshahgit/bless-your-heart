# Scheduled Job & Background Process Audit — Run 39/001

**Date:** 2026-05-04 22:13 local
**Branch:** `nightytidy/run-2026-05-01-1532`
**Mode:** IMPLEMENTATION (no code changes warranted — see below)

---

## Executive Summary

| Metric | Value |
|---|---|
| Total scheduled jobs found | **0 traditional, 1 platform-managed** |
| Healthy | 1 (Firestore TTL — code-side correct) |
| At-risk | 1 (same — operational-config dependency) |
| Dangerous | 0 |
| Broken | 0 |
| Missing jobs identified | 0 (problem domain genuinely doesn't need any) |
| Safe code fixes applied | **0** (no targets exist; see Phase 4) |

**If you read nothing else:** The Bless Your Heart codebase is a stateless event-driven SPA + serverless backend. It contains **zero traditional scheduled jobs** — no cron, no GitHub Actions schedules, no Netlify scheduled functions, no Firebase scheduled functions, no scheduler library imports, no `setInterval` server-side, no long-running workers. The single platform-managed background process is **Firestore TTL on the `rateLimits` collection**, which the application code does not own — it writes the `expiresAt` field correctly on every rate-limit doc, but the TTL *policy* must be configured in the Firebase console / `gcloud firestore`. **If that policy is missing in production, the `rateLimits` collection grows forever despite a green test suite, and there is no in-app monitoring to detect this.** This is already called out in [`CLAUDE.md`](../CLAUDE.md) and [`docs/CONFIGURATION.md`](../docs/CONFIGURATION.md), but worth re-flagging because it is the single highest-risk "silent failure" surface in the codebase.

---

## Phase 1: Job Inventory

### Search exhaustiveness

Searched for and confirmed **absent**:

| Category | Status | Evidence |
|---|---|---|
| `.github/workflows/*` | **does not exist** | `Glob('.github/**/*')` → no files |
| Netlify scheduled functions | none | [`netlify.toml`](../netlify.toml) `[functions]` block has no `schedule = "..."` field |
| Firebase scheduled / Cloud Functions | none | [`firebase.json`](../firebase.json) has only `firestore` + `storage` rules; no `functions` block |
| Scheduler library imports | none | `package.json` has no `node-cron`, `bull`, `bullmq`, `agenda`, `bree`, `node-schedule`, `croner`, `kue`, `toad-scheduler`, `cron`, or similar |
| Server-side `setInterval` | none | grep across `src/server/`, `netlify/functions/`, `tools/` returns zero hits |
| Long-running queue consumers | none | no worker scripts in `tools/` or root that loop forever |
| Service-worker / PWA background sync | none | no `service-worker.js`; no `workbox`; no PWA manifest with `periodic-sync` |
| Health-check / heartbeat endpoints | none | no `/health`, `/ping`, or `/heartbeat` routes |
| Database cleanup scripts | none | no `cleanup`/`purge`/`prune`/`archive`/`rotate` scripts |
| Kubernetes CronJobs / systemd timers | N/A | serverless architecture — no container/host orchestration |
| AWS EventBridge / CloudWatch | N/A | not deployed to AWS directly (Netlify Functions wrap Lambda but don't expose EventBridge) |

### What *does* run automatically or in the background

| # | Item | Type | File:Line | Schedule / Trigger |
|---|---|---|---|---|
| **1** | **Firestore TTL on `rateLimits` collection** | Platform-managed scheduled task | [`src/server/rateLimit.ts:8-15, 68, 88, 104`](../src/server/rateLimit.ts) | Firestore deletes documents whose `expiresAt` ≤ now, on a schedule managed by Firestore (typically within a few hours of the timestamp) |
| 2 | Per-request rate-limit timeout | Defensive timeout (not a job) | [`netlify/functions/generate.ts:181-219`](../netlify/functions/generate.ts) | `RATE_LIMIT_TIMEOUT_MS = 3000` `Promise.race` — fires per request only |
| 3 | Per-request image-load timeout | Defensive timeout (not a job) | [`src/lib/compositor.ts:55-83`](../src/lib/compositor.ts) | `IMAGE_LOAD_TIMEOUT_MS = 15_000` `Promise.race` — fires per render only |
| 4 | Per-request Anthropic SDK timeout | Defensive timeout (not a job) | [`src/server/anthropic.ts`](../src/server/anthropic.ts) (`ANTHROPIC_REQUEST_TIMEOUT_MS = 12_000`) | SDK option, threaded into `generateLines` / `checkTone` / `checkDistressWithHaiku` |
| 5 | `prefetchPhoto()` fire-and-forget | One-time, user-initiated | [`src/lib/photos.ts:43-51`](../src/lib/photos.ts), called from [`src/App.tsx:149-151`](../src/App.tsx) | Once per generation, after `/generate` returns a `photoId` |
| 6 | `void initAnalytics()` at boot | One-time async init | [`src/main.tsx:34`](../src/main.tsx), implementation in [`src/lib/analytics.ts:64-117`](../src/lib/analytics.ts) | Once at app load; deferred via `requestIdleCallback` (audit run 37/001) |
| 7 | `void ensureFontsReady()` at boot | One-time async init | [`src/main.tsx:35`](../src/main.tsx), implementation in [`src/lib/fonts.ts:5-18`](../src/lib/fonts.ts) | Once at app load; cached promise reused by `PosterCanvas` |
| 8 | Download-button banner auto-reset | Per-interaction setTimeout | [`src/components/DownloadButton.tsx:11-12, 20, 38, 50`](../src/components/DownloadButton.tsx) | After download success/error, resets after 2.5s/3s; cleared on unmount |
| 9 | Prompt-input sessionStorage debounce | Per-interaction setTimeout | [`src/components/PromptInput.tsx:38, 61-63`](../src/components/PromptInput.tsx) | 300ms debounce per keystroke; cleared on unmount |
| 10 | `App.tsx` LOAD_FLOOR_MS hold | Per-interaction `sleep()` | [`src/App.tsx:19-23, 153-155`](../src/App.tsx) | 800ms minimum after `/generate` returns, before `settled` phase |
| 11 | `PosterCanvas` `resize` rAF coalesce | Lifecycle-driven | [`src/components/PosterCanvas.tsx:32-44`](../src/components/PosterCanvas.tsx) | Only fires while window is being resized; cancelled on unmount |
| 12 | `CreditsDialog` lazy-import preload | One-time, user-hover/focus | [`src/components/CreditsDialog.tsx:31`](../src/components/CreditsDialog.tsx) | `void import('@/components/CreditsDialogContent').catch(...)` on hover/focus |
| 13 | Bundle-time photo lint | One-time, build-time | [`tools/lint-photos.ts`](../tools/lint-photos.ts), wired via `npm run build` | Runs once per `npm run build`; fails the build on a malformed `photos.json` entry |

**Items 2–13 are not "jobs" in the sense this audit cares about** — they are per-request defensive timeouts, per-interaction UI timers, one-time module init, or build-time scripts. They have no recurring schedule, no concurrency exposure beyond a single user session, and (per the audit notes that follow) all carry the appropriate cleanup/timeout/error-handling for what they do.

### Detail — Item #1 (the only true background process)

| Field | Detail |
|---|---|
| **Name / identifier** | Firestore TTL policy on `rateLimits.expiresAt` |
| **Location** | Code: [`src/server/rateLimit.ts`](../src/server/rateLimit.ts) writes `expiresAt: Timestamp.fromMillis(nowMs + RATE_LIMIT_WINDOW_MS)` at lines 68, 88, 104. Policy: Firebase console → Firestore → TTL Policies. |
| **Schedule** | Firestore runs a continuous background task that deletes expired documents. SLA: "within 24 hours" of the timestamp; in practice usually within a few hours. |
| **Purpose** | Prevent the `rateLimits` collection from growing unbounded as new IPs hit the endpoint daily. The daily salt rotation means each IP gets a fresh document each UTC day. Without TTL, the collection grows forever. |
| **Runtime** | N/A — managed by Firestore. |
| **Data scope** | Single collection (`rateLimits`); deletes documents where `expiresAt <= now()`. Bounded by document count. |
| **Dependencies** | Firebase project config (TTL policy must be active). The policy is **not** declared in [`firebase.json`](../firebase.json) — TTL is a runtime resource, not a deployable artifact. |
| **Trigger mechanism** | Firestore platform internal scheduler. |
| **Concurrency protection** | N/A (single Firestore-managed process). |
| **Timeout** | N/A. |
| **Error handling** | N/A — Firestore handles deletion failures internally. The only application-side touchpoint is the `expiresAt` write, which is wrapped in the same Firestore transaction as the count update (atomic). |
| **Monitoring** | **None in the application.** No log line records "TTL ran"; no doc-count metric is emitted; no alarm fires if the collection grows past a threshold. The only signal is Firestore billing — and only if cost spikes enough to be noticed. |
| **Idempotency** | Yes — repeated TTL passes are no-ops on already-deleted documents. |
| **Last modified** | TTL contract pinned by tests added in audit run 20/002 (May 2026); `expiresAt` write present since rate-limit feature was introduced. The contract has been stable. |

---

## Phase 2: Health Assessment

| # | Item | Silent-failure risk | Overlap risk | Timeout risk | Idempotency | Data correctness | Monitoring | Overall |
|---|---|---|---|---|---|---|---|---|
| 1 | Firestore TTL `rateLimits` | **HIGH** (no in-app probe — if policy is missing, only billing surfaces it) | None (Firestore-internal) | N/A | Yes | Correct: `expiresAt` written on initial-create + window-reset, NOT on count-increment (sliding-TTL bug avoided) | **None** | **At-risk (operational only)** |
| 2 | Rate-limit timeout | LOW | None (per-request) | N/A — IS the timeout | Yes (transactional) | Fail-open is intentional; logged via `rate_limit_check_failed` with `error: String(err)` | Logged | Healthy |
| 3 | Image-load timeout | LOW | None (per-render) | N/A — IS the timeout | Yes | Logged via `poster_render_failed` from PosterCanvas catch | Logged | Healthy |
| 4 | Anthropic SDK timeout | LOW | None | N/A — IS the timeout (12s, well under 26s lambda budget) | Yes | Retries handled in generate.ts loop with 4xx-bail / 5xx-retry discrimination | `gen_anthropic_error` with `status` and `attempt` | Healthy |
| 5 | `prefetchPhoto()` | LOW (intentional silence — see CLAUDE.md audit-37/001 note) | None | None needed | Yes (idempotent — re-set src is a no-op for cached URLs) | Browser cache miss is graceful | Intentionally none | Healthy by design |
| 6 | `initAnalytics()` | LOW | Synchronous-flip mutex prevents double-init (audit-30/001 + 37/001) | Yes — `requestIdleCallback({ timeout: 2000 })` | Yes | Failures wrapped in try/catch + `analytics_init_failed` log | Logged | Healthy |
| 7 | `ensureFontsReady()` | LOW (failure means fallback to Georgia — visible regression but not crash) | None (cached promise reused) | None | Yes (cached) | Acceptable degradation | None — but failure mode is graceful and visible | Healthy |
| 8 | Download banner reset | None | None | N/A | Yes | Cleared on unmount via `useRef` (audit-25/001) | N/A | Healthy |
| 9 | Prompt debounce | None | None | N/A | Yes | Cleared on unmount via `useRef` (audit-25/001) | N/A | Healthy |
| 10 | LOAD_FLOOR_MS hold | None | Stale-response guard (`generationIdRef`) handles re-roll-during-hold | N/A | Yes | Audit-29/001 mutex + audit-36/001 ready-flag-reset prevent stale renders | N/A | Healthy |
| 11 | Resize rAF coalesce | None | None | N/A | Yes | Cancelled on unmount; `passive: true` on listener | N/A | Healthy |
| 12 | CreditsDialog preload | None | Browser handles concurrent `import()` calls — same module promise returned | N/A | Yes | `.catch(() => {})` on the preload (intentional — fallback is the eager mount) | None | Healthy |
| 13 | Photo lint | None | None (build-time) | None | Yes | Build fails on bad entry | Stderr | Healthy |

**Headline:** Item #1 is the only finding worth attention. Items 2–13 are well-understood patterns already hardened by prior audit runs (25/001, 27/001, 28/001, 29/001, 30/001, 33/001, 36/001, 37/001).

---

## Phase 3: Missing Jobs

The standard "missing job" categories from the audit prompt are evaluated below. **None apply** — the problem domain genuinely doesn't need them.

| Category | Applies here? | Reasoning |
|---|---|---|
| Orphan cleanup (soft-deleted records, temp files, expired sessions/tokens, abandoned uploads) | **No** | No user accounts → no sessions/tokens. No persistent user-generated content (posters are composited client-side and downloaded — never stored server-side). No file uploads. No multi-step records. The only persisted data is the `rateLimits` collection, which TTL handles. |
| Data hygiene (expired invites, stale cache entries, orphaned file refs) | **No** | No invites. No application-managed cache (PostHog manages its own session-storage; HTTP cache is browser-managed). The photo library in [`src/data/photos.json`](../src/data/photos.json) is static and bundled — no orphans possible. |
| Compliance (audit log rotation, GDPR deletion, consent expiry) | **No** | No user data persisted. PostHog `persistence: 'sessionStorage'` (so PostHog data is wiped when the tab closes; nothing for us to delete). Distress-classifier output is not stored (single-request lifetime). |
| Operational (log rotation, metric aggregation, certificate expiry, backup verification) | **No** | Logs go to Netlify (rotated by platform). Metrics (PostHog) are external. TLS certs are managed by Netlify. No backups (stateless backend; the photo library is the only "data" and lives in git + Firebase Storage). |
| User-facing (reminder emails, subscription renewal, trial expiry, scheduled reports, digests) | **No** | No accounts, no subscriptions, no email integration. Land-to-share-in-10s product. |
| Health pings to external uptime monitors | **Worth considering** | Currently no external uptime probe. Netlify provides basic up/down monitoring; if the team wanted "is `/generate` returning `ok`s?" health, that would need to be added. **Out of audit scope** (the prompt forbids creating new jobs.) |

The single near-miss is **uptime probing of `/generate`**, but adding it would create a new job and is excluded by the audit's safe-fix rules ("**Do NOT** … create new jobs").

---

## Phase 4: Safe Fixes — None Applied

The audit prompt's safe-fix list is:

1. Add logging to jobs that have none.
2. Add timeouts to jobs without them.
3. Add idempotency guards.
4. Add overlap protection.
5. Fix silent error swallowing.
6. Remove clearly obsolete jobs.

**None of these have a target in this codebase:**

| Safe-fix category | Target? | Why no |
|---|---|---|
| Add logging to jobs that have none | None | The only background process (Firestore TTL) is platform-managed — there is no code-side "job ran" event to log. Application-side touchpoints (the `expiresAt` write) already log via the rate-limit transaction's enclosing `gen_rate_limited` / `rate_limit_check_failed` events. |
| Add timeouts to jobs without them | None | Every per-request defensive timeout already has one (rate-limit 3s, image-load 15s, Anthropic SDK 12s). The fire-and-forget inits don't await on anything that needs a timeout (or carry one — `requestIdleCallback({ timeout: 2000 })` for analytics). |
| Add idempotency guards | None | No recurring code requires them. The user-initiated handlers that need them (`handleGenerate`) already have them via the `inFlightRef` mutex + `generationIdRef` token (audit-29/001). |
| Add overlap protection | None | No multi-instance scheduler exists. Netlify lambdas are isolated per-invocation; concurrent invocations against the *same* IP serialize through a Firestore `runTransaction` (single-doc atomicity). |
| Fix silent error swallowing | None | The two intentionally-silent fire-and-forgets (`prefetchPhoto`, `ensureFontsReady`) are explicitly documented as silent by design (audit-37/001 for prefetchPhoto; fonts fall back to Georgia). Adding logging would violate the documented contract. All other catches have the structured `{ event, error: String(err) }` shape (audit-23/001). |
| Remove clearly obsolete jobs | None | No jobs to remove. |

**Verdict:** Writing speculative fixes here would violate the audit prompt's "Safe fixes only" rule and the global CLAUDE.md "no premature optimization or abstraction" / "minimal impact" principles. **No code changes are warranted.**

The audit prompt's exclusions reinforce this: "**Do NOT:** change job schedules, modify business logic, add infrastructure (Redis locks, distributed schedulers), or create new jobs." Combined with "no scheduled jobs exist," the disciplined answer is to document the absence and move on.

---

## Phase 5: Resource & Scheduling Analysis

Not applicable — there are no scheduled jobs to compete with user-facing requests for resources, and no peak-hour conflicts to surface. The Firestore TTL deletion is throttled and prioritized by Firestore internally; it does not affect query performance for `runTransaction` calls in the rate-limit hot path.

The one resource consideration worth noting is **the `rateLimits` collection growth bound under daily salt rotation**: at UTC 00:00 every active IP gets a fresh document, so the collection peaks at `~24 × distinct_daily_IPs` documents during the 24-hour TTL grace window before deletion. For a hobby-tier deployment this is well under Firestore free-tier limits; for any future scale (≥10K daily IPs) it's worth verifying the TTL policy is actually configured (see Recommendations).

---

## Phase 6: Recommendations

Priority-ordered. None are mandatory; all are optional improvements.

| # | Recommendation | Owner | Impact | Risk if ignored | Effort |
|---|---|---|---|---|---|
| 1 | **Verify Firestore TTL policy is active in production** (Firebase console → Firestore → TTL Policies → confirm `rateLimits.expiresAt` exists and is enabled) | Operator | Prevents unbounded `rateLimits` growth | Collection grows forever; eventually hits Firestore quota or starts costing real money. **Silent until billing notices.** | 5 min, one-time per environment |
| 2 | (Future, out of audit scope) Add a tiny `/health` endpoint that returns `{ ok: true, ts }` so an external uptime monitor (UptimeRobot, BetterUptime, Netlify-built-in) can probe `/generate`'s availability without consuming rate-limit budget | Engineering | Detects backend outages without waiting for a user report | Outages may go unnoticed for hours | ~30 min — but requires a new endpoint + a decision on which monitor to use |
| 3 | (Future, out of audit scope) Document the TTL policy as Terraform / `gcloud firestore` config-as-code so it can't drift between environments | Engineering | Eliminates the "did someone configure TTL on the new staging project?" failure mode | Same as #1 — but worse because new environments inherit the gap | 1–2 hours including verification |

**Why I am not implementing #2 or #3:** The audit prompt explicitly forbids "create new jobs" and "add infrastructure." Both recommendations require crossing those lines. Surfaced here for the operator to plan, not for me to do unilaterally.

---

## Final Notes

This audit is unusual in that the most useful output is **a confident "no findings"** rather than a list of fixes. The codebase has been through 38 prior audits over the past four days; the patterns that would normally surface in a scheduled-job audit (silent catches, missing timeouts, overlap-unsafe handlers) have already been hardened by audit-23/001 (logging shape), 25/001 (timer cleanup + setTimeout-in-Promise.race finally-clear), 27/001 (loadImage timeout), 28/001 (cancelled-flag pattern), 29/001 (mutex + stale-token), 30/001 (synchronous singleton flip), 33/001 (PostHog defensive wrap + Anthropic 4xx-bail), 36/001 (parent-side ready-flag reset), and 37/001 (deferred analytics + photo prefetch).

The single residual risk surface is **operational**, not code: the Firestore TTL policy is the closest thing to a scheduled job in the system, and it lives outside the repo. Future engineers spinning up a new Firebase environment must re-verify it — there is no test that can catch its absence.
