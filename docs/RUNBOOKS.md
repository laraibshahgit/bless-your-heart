# Runbooks

Operational playbooks for the most likely failure modes of the Bless Your
Heart lambda + photo CDN + client SPA. Each runbook is structured the same
way: **Symptoms** (what you'll see) → **Diagnosis** (where to look) →
**Resolution** (what to do) → **Prevention** (how to avoid recurrence).

This document is meant to be readable cold by an on-call who has never
worked on this codebase.

> **Field reference**: every server log line is JSON with at least an
> `event` field (e.g. `gen_ok`, `gen_anthropic_error`). Inside a request
> scope every line also carries a `request_id` field that is the same as
> the response's `X-Request-Id` header. Grep `'"request_id":"<value>"'` in
> the Netlify Function Logs to get the full timeline of one user's
> request, including retries and downstream classifier calls.
>
> **Health endpoint**: `GET /api/health` for readiness (config + Firestore
> probe), `GET /api/health?mode=live` for liveness (zero-IO ping). See
> `netlify/functions/health.ts`.

---

## Table of contents

1. [Anthropic API authentication failure (401/403)](#1-anthropic-api-authentication-failure-401403)
2. [Anthropic provider outage / 5xx storm](#2-anthropic-provider-outage--5xx-storm)
3. [Anthropic rate-limit (429) storm](#3-anthropic-rate-limit-429-storm)
4. [Firestore unreachable / rate limit fail-open](#4-firestore-unreachable--rate-limit-fail-open)
5. [Firestore TTL policy missing — `rateLimits` collection growth](#5-firestore-ttl-policy-missing--ratelimits-collection-growth)
6. [Cost spike on Anthropic (sustained traffic / abuse)](#6-cost-spike-on-anthropic-sustained-traffic--abuse)
7. [CSRF shield disabled in production (`config_validation_failed`)](#7-csrf-shield-disabled-in-production-config_validation_failed)
8. [Client `gen_client_error` spike (network / fetch failures)](#8-client-gen_client_error-spike-network--fetch-failures)
9. [Photo CDN outage (`firebasestorage.googleapis.com`)](#9-photo-cdn-outage-firebasestoragegoogleapiscom)
10. [Lambda timeout / cold-start latency](#10-lambda-timeout--cold-start-latency)
11. [Distress classifier misfire (false positives or missing crisis cases)](#11-distress-classifier-misfire-false-positives-or-missing-crisis-cases)
12. [Health endpoint reports `unhealthy` (503)](#12-health-endpoint-reports-unhealthy-503)

---

## 1. Anthropic API authentication failure (401/403)

**Severity**: **CRITICAL** — every generation degrades to `safe_fallback`,
user-visible quality drops to ~10 fixed posters and the joke specificity
is lost.

### Symptoms
- Sustained `gen_anthropic_error` events with `"status":401` or
  `"status":403` in the structured logs.
- All user requests resolve as `safe_fallback` (the cap-at-2-retries-then-fallback
  contract — see CLAUDE.md "Anthropic retry loop" §). Customer-facing
  status is technically 200 but the posters are clichéd.
- Anthropic billing dashboard shows zero token usage for the affected window.
- `health` readiness probe still reports `ok` (the probe doesn't call
  Anthropic — see `netlify/functions/health.ts`).

### Diagnosis
1. Pull the last 30 minutes of structured logs, filter for `event:"gen_anthropic_error"`.
2. Confirm the `status` field is consistently 401 or 403 across many requests.
3. Check the Netlify dashboard env vars: `ANTHROPIC_API_KEY` is set? Was
   it edited recently? Each value-change requires a redeploy or new
   cold-start to take effect.
4. Hit Anthropic console: is the key still active? Was it revoked or
   downgraded?
5. If the key is correct, check Anthropic's status page
   (https://status.anthropic.com) — provider-side identity outages are
   rare but possible.

### Resolution
- If the key was rotated externally without updating Netlify: paste the
  new key into Netlify env vars → redeploy or trigger a manual function
  cold-start (push a no-op commit on master, or "Clear cache and deploy
  site" in Netlify UI).
- If the key was accidentally deleted: same as above — the
  `config_validation_failed` log line at lambda cold-start would have
  warned us; check whether that line is also present.
- Verify recovery: every new request should now log `gen_ok` and
  Anthropic billing should resume showing token usage within ~5 minutes.

### Prevention
- The `validateProdEnv()` cold-start check (`src/server/configValidation.ts`)
  emits `config_validation_failed` with the missing var name when
  `ANTHROPIC_API_KEY` is missing in production. Set up a Netlify log
  drain alert on the literal `"event":"config_validation_failed"` so the
  team is paged the moment a deploy ships with a broken env var.
- Document the key rotation procedure in your team's secret-rotation
  doc; coordinate Anthropic console rotation with Netlify env-var update.

---

## 2. Anthropic provider outage / 5xx storm

**Severity**: **HIGH** — same user-visible degradation as auth failure,
but transient.

### Symptoms
- `gen_anthropic_error` events with `"status":500..504` or
  `"status":undefined` (network-level failures: connection timeout, DNS
  failure, socket drop).
- Mixed retry counts in the same user's request: `gen_retry` events
  show `attempt:0`, `attempt:1` before the loop bails to safe_fallback.
- `duration_ms` field on `gen_safe_fallback` events stays close to
  `12000` (one Anthropic request timeout) or `24000` (two retries).

### Diagnosis
1. Filter logs for `event:"gen_anthropic_error"` in the last 15 minutes.
2. Check whether `status` is mostly undefined (network issues) or 5xx
   (provider-side errors). Network issues sometimes resolve themselves
   in <5 minutes.
3. Check Anthropic's status page (https://status.anthropic.com).
4. Check whether the issue is region-specific by comparing log lines
   from Netlify's different function regions.

### Resolution
- **Short-lived (<15 min)**: do nothing — the retry loop + safe_fallback
  already isolates user impact. The product still serves a poster on
  every request.
- **Sustained (>30 min)**: consider toggling cost levers to limit
  collateral damage:
  - `ENABLE_TONE_CHECK=false` skips the second Haiku call per request,
    halving the per-request Anthropic dependency surface (still calls
    Sonnet for generation).
  - Note: there is currently no "disable generation entirely" toggle.
    `docs/CONFIGURATION.md` § *Missing kill switches* documents the
    `ENABLE_GENERATION` recommendation; consider adding it during
    extended outages.
- **Catastrophic (>2 hours)**: post a banner on the SPA stating "the AI
  is taking a sabbatical, here are some pre-written posters" — every
  user already gets safe_fallback, so the experience is graceful.
- Recovery is automatic; the user-perceived outage ends as soon as
  Anthropic's 5xx rate drops.

### Prevention
- Retry budget is capped at 2 (CLAUDE.md "retry budget = 2") to bound
  lambda burn during provider degradation.
- Per-request 12s timeout (`ANTHROPIC_REQUEST_TIMEOUT_MS` in
  `src/server/anthropic.ts`) prevents a hung Anthropic from eating the
  whole 26s lambda budget.
- Recommended alert (see report): error_rate(`gen_anthropic_error`) > 5%
  over 5 minutes paged to on-call; tells you about provider issues
  before users complain.

---

## 3. Anthropic rate-limit (429) storm

**Severity**: **MEDIUM** — usually means we're being rate-limited by
Anthropic at the org/account tier, not the user-IP tier.

### Symptoms
- `gen_anthropic_error` events with `"status":429`, repeated and
  affecting many requests.
- `gen_safe_fallback` rate climbs sharply.
- Anthropic console shows the org hitting its tier limit.

### Diagnosis
1. Filter logs for `"status":429` in the last 30 minutes.
2. Anthropic console → org settings → check rate-limit tier and current
   usage.
3. Review whether `ANTHROPIC_MODEL_GEN` was recently changed
   (Sonnet→Opus, etc.); model changes shift token-rate budgets.
4. Look for traffic-source bias: is one IP responsible for a
   disproportionate share? (We rate-limit per-IP at 25/hr; abuse from a
   single IP shouldn't push the org over.)

### Resolution
- **Capacity exceeded for legitimate traffic**: file a tier upgrade with
  Anthropic. They typically respond within hours.
- **Suspected abuse leak**: confirm `ALLOWED_ORIGINS` env var is set
  correctly in production — if absent, the CSRF shield is open and any
  origin can spam our endpoint. The validator logs this at cold-start
  (`config_validation_failed` event), but a probe to `/api/health`
  can confirm config status without log access.
- **Stop-gap**: lower the per-IP cap with `RATE_LIMIT_PER_HOUR=10`
  during the incident window, then return to 25 once Anthropic relaxes.
- The 4xx-bail change (CLAUDE.md, audit run 33/001) means we no longer
  retry 429s in-loop, so the lambda budget isn't burned waiting for a
  Retry-After we can't honor.

### Prevention
- Make sure `ALLOWED_ORIGINS` is set in production (the validator's
  `config_validation_failed` log catches this; alert on it).
- Rate-limit tier on Anthropic should be sized for expected peak
  traffic + 2× headroom.
- Recommended alert: `gen_anthropic_error` events with `status=429`
  exceeding 1% of requests over 5 minutes.

---

## 4. Firestore unreachable / rate limit fail-open

**Severity**: **MEDIUM** — rate limiter goes silent (fail-open is by
design); cost surface widens.

### Symptoms
- `rate_limit_check_failed` events emitting steadily with various
  errors (DNS, auth, transaction conflict, timeout).
- `health` readiness probe reports `degraded` (Firestore check fails,
  config check passes — see `netlify/functions/health.ts`).
- `health_firestore_probe_failed` event in error logs.
- User requests still succeed: rate-limit failures fall open by design
  ("user always gets a poster" wins over strict limits).

### Diagnosis
1. Filter logs for `"event":"rate_limit_check_failed"` in the last 15
   minutes.
2. Check Firestore status: https://status.firebase.google.com
3. Hit `/api/health` (readiness): if `firestore` check is `fail`, the
   issue is on the lambda's path to Firestore; if it's `skipped`, the
   Firebase env vars are missing.
4. Review whether Firebase credentials were recently rotated or the
   service account changed. Check `validateProdEnv()`'s cold-start log
   line for the `config_validation_failed` event with `FIREBASE_*` vars
   in `missing[]`.

### Resolution
- **Transient outage**: do nothing. The fail-open design accepts
  temporary cost-control gaps in exchange for not breaking user
  generations. Every request still goes through the slur/distress/tone
  filters — the only thing not enforced is the per-IP cap.
- **Sustained outage (>30 min)**: monitor abuse vectors. Watch for
  unusual traffic spikes during the window. If Anthropic spend climbs
  alarmingly, set `RATE_LIMIT_PER_HOUR=9999` to acknowledge the limiter
  is offline (so logs stop emitting `rate_limit_check_failed`) and
  consider deploying a temporary bypass-limit-by-domain via
  `ALLOWED_ORIGINS` if needed.
- **Auth failure (Firebase key revoked)**: rotate the Firebase Admin
  SDK private key in the Firebase console, paste into Netlify env vars
  with `\\n`-escaped newlines (CLAUDE.md "FIREBASE_PRIVATE_KEY"),
  redeploy.

### Prevention
- The rate-limit catch already falls open (see `generate.ts:217`); no
  additional guard needed on the user-visible path.
- Recommended alert: `rate_limit_check_failed` events > 5% of requests
  over 10 minutes (signals an actual outage vs. occasional transaction
  conflicts).
- Firestore TTL policy must be configured separately — see runbook §5.

---

## 5. Firestore TTL policy missing — `rateLimits` collection growth

**Severity**: **LOW** but **chronic** — the collection grows without
bound until the free-tier quota trips.

### Symptoms
- Firestore billing alerts firing (`reads/day` or `storage_bytes`
  approaching free-tier ceilings).
- Firebase console shows `rateLimits` collection with thousands of
  documents.
- `audit-reports/14_DATETIME_HANDLING_REPORT_001_*.md` and `24_DATA_INTEGRITY_REPORT_001_*.md` already document this dependency.
- No application-level signal — the code writes `expiresAt` correctly;
  the policy that auto-deletes expired docs is project-level config
  that isn't enforceable from inside the lambda.

### Diagnosis
1. Firebase console → Firestore → `rateLimits` collection: count
   documents. Healthy steady state is roughly equal to unique-IPs-per-day
   (most docs auto-delete via TTL within ~24h).
2. Firebase console → Firestore → TTL: confirm a policy exists on
   `rateLimits.expiresAt`.
3. If the policy is absent, doc count will be roughly
   *unique IPs since the project began*.

### Resolution
- Configure the TTL policy via Firebase Console or `gcloud firestore
  fields ttls update`:
  - Collection: `rateLimits`
  - Field: `expiresAt`
- Backfill is automatic; documents past `expiresAt` are deleted within
  24 hours of the policy being set.
- Verify by re-counting after 48 hours.

### Prevention
- This MUST be set on every new Firebase environment. Add to the
  deployment checklist in `docs/CONFIGURATION.md`.
- Consider adding a startup probe that queries `rateLimits` collection
  size on a sample interval and alerts if it crosses a threshold (e.g.
  100 000 docs).

---

## 6. Cost spike on Anthropic (sustained traffic / abuse)

**Severity**: **HIGH** — direct $/hour impact.

### Symptoms
- Anthropic billing dashboard shows usage 5×+ the recent baseline.
- High `gen_ok` rate in logs (sustained, not bursty).
- Possibly: high `gen_block` rate with `reason:"slur"` or
  `reason:"real-person"` from a single hashedIp pattern.

### Diagnosis
1. Filter logs by hashedIp distribution (in `gen_rate_limited` and
   `gen_block` events). Any single hash dominating?
2. Check `ALLOWED_ORIGINS` env var in production. If unset, anyone can
   POST `/generate` from any browser origin, which makes us trivially
   easy to abuse from an attacker's web page.
3. Check if `RATE_LIMIT_PER_HOUR` is set to `9999` (bypass mode) — it
   should be `25` in production.
4. Look for traffic-time pattern: organic spikes correlate with social
   posts; abuse spikes look mechanical (steady RPS for hours).

### Resolution
- **CSRF shield disabled (no `ALLOWED_ORIGINS`)**: set the env var to
  the production domain (e.g. `https://blessyourheart.app`), redeploy.
  Within seconds new lambda invocations enforce the check.
- **Single-IP abuse despite rate-limit**: the per-IP cap is 25/hour;
  abuse exceeding that means the attacker is rotating IPs. Mitigations:
  drop `RATE_LIMIT_PER_HOUR` to 5 temporarily; add a Cloudflare /
  Netlify Edge rate-limit at the network level; consider an IP block
  list.
- **Tone-check is the cost dominator**: set `ENABLE_TONE_CHECK=false`
  during the storm. Halves per-request Anthropic spend. Roll back when
  traffic normalizes.
- **Last resort**: pull the deploy. A static "down for maintenance" page
  costs nothing.

### Prevention
- The CSRF shield (`ALLOWED_ORIGINS`) is the primary cost-amplification
  defense. The validator logs `config_validation_failed` if it's missing
  in production — alert on this.
- Consider adding `ENABLE_GENERATION` as documented in
  `docs/CONFIGURATION.md` § *Missing kill switches* — gives a clean
  per-request short-circuit during cost incidents without a deploy.
- Recommended alert: Anthropic daily spend exceeding $X (set X based
  on expected baseline + 3×).

---

## 7. CSRF shield disabled in production (`config_validation_failed`)

**Severity**: **HIGH** — leaves the endpoint open to cross-origin
cost-amplification.

### Symptoms
- Single `config_validation_failed` log line at lambda cold-start with
  `ALLOWED_ORIGINS` in the `missing[]` array, context `"production"`.
- `health` readiness probe still reports `ok` (we deliberately don't
  fail readiness on this — see `docs/CONFIGURATION.md`).
- Possibly: cost spike on Anthropic (see runbook §6).

### Diagnosis
1. Grep for the log line: `"event":"config_validation_failed"`.
2. Check the `missing` array — `ALLOWED_ORIGINS` present means CSRF
   shield is open.
3. Confirm in Netlify env-var dashboard: the value should be the
   production origin(s), e.g. `https://blessyourheart.app`.

### Resolution
- Set `ALLOWED_ORIGINS` in Netlify dashboard, redeploy or trigger a
  cold-start.
- The next cold-start should log no `config_validation_failed` event.
- Confirm via curl that off-origin requests get 403:
  ```
  curl -X POST https://blessyourheart.app/api/generate \
    -H 'Origin: https://evil.example' \
    -d '{"prompt":"test"}'
  ```
  Expect: HTTP 403 with `{ "status": "error", "message": "Forbidden." }`.

### Prevention
- Same as runbook §1: alert on `config_validation_failed` log line
  emission.
- Add `ALLOWED_ORIGINS` to the deployment checklist.

---

## 8. Client `gen_client_error` spike (network / fetch failures)

**Severity**: **MEDIUM** — users see retryable error copy; no server
work was done so cost impact is zero.

### Symptoms
- Spike in PostHog events `generation_error` (or whatever the funnel
  step is named) without a corresponding spike in server-side
  `gen_anthropic_error`.
- Browser console errors `{ "event": "gen_client_error", ... }` from
  `src/lib/api.ts:37` — these aren't visible to the server but appear
  in browser-side error reporting (if connected).

### Diagnosis
1. Are users on flaky networks? `navigator.onLine` already routes
   offline cases to `errorCopy.generation.networkOffline` and exits
   before the catch.
2. Is the server reachable from the user's network? Run the SPA's
   network diagnostic: open the deployed site, hit `/api/health` from
   the browser console with `fetch('/api/health').then(r => r.json())`.
3. Is the SPA shipping a stale build that points to an old endpoint?
   Check Netlify for recent deploys; check the build assets' content-hashes.

### Resolution
- **CDN routing issue**: pull a Netlify support ticket; verify the
  `/api/*` redirect is intact in `netlify.toml`.
- **TLS cert issue**: hit Netlify status page; certs auto-rotate, but
  outages happen.
- **Stale SPA cache**: the SPA bundles are content-hashed, so a stale
  cache should resolve on next hard refresh. If a CDN cache is poisoned,
  invalidate via Netlify dashboard.

### Prevention
- 30s client-fetch timeout (`GENERATE_FETCH_TIMEOUT_MS` in
  `src/lib/api.ts`) prevents a hung response from pinning the user's
  tab indefinitely.

---

## 9. Photo CDN outage (`firebasestorage.googleapis.com`)

**Severity**: **HIGH** — server returns valid JSON, but the SPA can't
render the poster.

### Symptoms
- No server-side log signal (the lambda doesn't fetch photos itself).
- Client-side `poster_render_failed` event from
  `src/components/PosterCanvas.tsx:85`.
- User-facing: a blank poster area or the canvas-write-failed error
  copy.
- Possibly: `loadImage` timeout (15s) firing, surfaced via the
  `onCanvasFailure` callback.

### Diagnosis
1. Hit a known photo URL directly in your browser:
   `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/photos%2F<id>.jpg?alt=media`
   (substitute a real photo ID from `src/data/photos.json`).
2. Check Firebase Storage status: https://status.firebase.google.com
3. Check the CSP `img-src` allowlist in `netlify.toml` — has the storage
   host changed?

### Resolution
- **Outage on Firebase side**: nothing to do but wait. The photo CDN
  is the single point of failure for the visual half of the product.
- **CDN config drift (host change)**: update `VITE_FIREBASE_STORAGE_BASE_URL`
  AND the `<link rel="preconnect">` in `index.html` AND the `img-src`
  CSP allowlist in `netlify.toml` AND `getPhotoUrl()` in
  `src/lib/photos.ts` (CLAUDE.md flags all three).
- **Cache poisoning**: invalidate via Firebase Storage admin.

### Prevention
- All photo URLs go through `loadImage()` which has a 15s timeout
  (CLAUDE.md "Photo loads MUST go through `loadImage()`"). The
  user-visible failure is bounded; not infinite hang.
- Consider mirroring photos to a secondary host for redundancy (out of
  scope for current architecture).

---

## 10. Lambda timeout / cold-start latency

**Severity**: **MEDIUM** — long generations break the 26s budget;
user sees error copy.

### Symptoms
- `gen_ok` events with `duration_ms` approaching 26000.
- Increased rate of `gen_safe_fallback`.
- `health` readiness probe reports `degraded` with high `firestore`
  latency.

### Diagnosis
1. Filter logs for `"event":"gen_ok"` and graph `duration_ms` over
   time. Healthy P95 is well under 8 seconds.
2. Filter for `"event":"gen_safe_fallback"` — has the rate increased?
3. Compare cold-start vs warm timing by looking at consecutive
   invocations from the same IP — Netlify functions warm-cache for
   15-60 minutes.
4. Hit `/api/health?mode=live` to measure raw lambda dispatch latency.

### Resolution
- **Anthropic-side**: see runbook §2.
- **Cold-start dominated**: ensure no new heavy imports landed at
  module-level. The lambda init imports `firebase-admin` lazily
  (only when rate-limit fires) and Anthropic SDK at module load.
  Adding new top-level imports inflates cold-start.
- **Firestore-side**: see runbook §4.
- **Lambda budget exhausted**: per-Anthropic-call timeout is 12s, retry
  budget is 2, so worst case is ~24s + small constants. If `gen_ok`
  ever ships with `duration_ms` > 24000, something has slipped past
  the timeout — investigate.

### Prevention
- Per-request Anthropic timeout (`ANTHROPIC_REQUEST_TIMEOUT_MS = 12_000`).
- Retry budget cap (`MAX_RETRIES = 2`).
- Rate-limit timeout (3s) prevents Firestore from eating the budget.

---

## 11. Distress classifier misfire (false positives or missing crisis cases)

**Severity**: **HIGH** — for the false-negative case (missed crisis), this
is a duty-of-care failure. For false positives (showing the hotline to
healthy users) it's a UX bug.

### Symptoms
- User reports either "showed me the hotline modal when I just typed
  about a bad meeting" (false positive) or "joked back at me when I
  said something serious" (false negative).
- `gen_distress` event rate spikes or falls dramatically without a
  corresponding traffic change.

### Diagnosis
- We **don't** log prompt content (CLAUDE.md "NEVER log prompt or
  output content"), so individual cases can't be retraced from logs.
- Reproduce locally: paste the offending prompt into a dev environment
  with `ENABLE_TONE_CHECK=true` and observe whether
  `checkDistressPhraseList()` or `checkDistressWithHaiku()` fires.
- Check `src/server/distress-phrases.ts` — was it edited recently?
- Check `ANTHROPIC_MODEL_SAFETY` env var — has the Haiku model been
  pinned to a different version that regresses on this category?

### Resolution
- **False positive (over-firing)**:
  - If from phrase list: edit `src/server/distress-phrases.ts`,
    remove or narrow the offending phrase.
  - If from Haiku: lower the temperature isn't viable (already 0).
    Consider tweaking `DISTRESS_CHECK_PROMPT` in `src/server/safety.ts`
    to be more selective.
- **False negative (missed crisis)**: this is the higher-stakes case.
  - Add the missed phrase to `distress-phrases.ts` (the cheap,
    reliable layer) immediately.
  - Review `DISTRESS_CHECK_PROMPT` for the Haiku layer.
  - Add a regression test in `tests/server/safety.test.ts`.
  - The product's policy is "err on the side of crisis if there is
    genuine ambiguity around safety" — see the prompt in `safety.ts`.

### Prevention
- The two-layer design (phrase list + Haiku) is itself a defense-in-depth
  posture; either layer firing routes the user to the hotline.
- Maintain a regression test corpus in `tests/server/safety.test.ts`
  for known-positive and known-negative cases.

---

## 12. Health endpoint reports `unhealthy` (503)

**Severity**: depends on cause. `unhealthy` only fires when the config
check fails (i.e. the lambda fundamentally can't serve a request).
Firestore-only failures produce `degraded` (200) — see runbook §4.

### Symptoms
- Uptime monitor pages on 503 from `/api/health`.
- Response body `{ status: "unhealthy", checks: [{ name: "config",
  status: "fail", message: "missing: <var-list>" }, ...] }`.

### Diagnosis
1. Read the `message` field on the failed `config` check — it lists the
   missing env var names (never values).
2. Check Netlify env vars dashboard for the listed variables.
3. Check `validateProdEnv()` log line at the most recent cold-start —
   should match.

### Resolution
- Set the missing env vars in Netlify, redeploy or trigger cold-start.
- Hit `/api/health` again — should now return 200 with `status: ok`.

### Prevention
- The `validateProdEnv()` cold-start check + alerting on
  `config_validation_failed` (runbook §1) catches this BEFORE the next
  health probe. Treat the `/api/health` 503 as a backstop, not the
  primary signal.

---

## Appendix: Useful commands

### Pull all log lines for one user's request
```
# In Netlify Function Logs UI, search:
"request_id":"<id-from-X-Request-Id-response-header>"
```

### Confirm production config
```
curl -fsSL https://blessyourheart.app/api/health | jq
```

### Confirm CSRF shield is active
```
curl -X POST https://blessyourheart.app/api/generate \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"test"}'
# Expect: HTTP 403
```

### Confirm rate-limit headers
```
curl -fsSL -X POST https://blessyourheart.app/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"morning coffee"}' \
  -D - -o /dev/null
# Expect: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
#         X-Request-Id (audit run 40/001)
```

### Trigger lambda cold-start (no code change)
```
# Netlify dashboard → Deploys → "Trigger deploy" → "Clear cache and deploy site"
# Or push an empty commit:
git commit --allow-empty -m "trigger cold-start"
```

---

## Escalation

(Leave blank for the team to fill in: who to page, paging tool,
secondary contact, severity-to-response-time mapping.)
