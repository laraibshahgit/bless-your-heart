# Observability & Monitoring Readiness — Run 40/001

**Date**: 2026-05-04 22:41 (local)
**Branch**: `nightytidy/run-2026-05-01-1532` (no branching, per orchestrator constraint)
**Scope**: full observability + monitoring readiness audit + targeted implementation
**Mode**: IMPLEMENTATION
**Tests**: 450 passed (was 406; +44 new)
**Build**: ✓ TypeScript clean, ✓ photo lint, ✓ Vite production build

---

## Executive Summary

**Maturity level — before this run**: **basic**.
The codebase shipped with disciplined structured logging (every event is `JSON.stringify({event, ...})`), bounded timeouts on every external call, and explicit fail-open postures for non-critical infrastructure. But it had no health endpoint, no per-request correlation, no operational runbooks, and no inventoried alert thresholds. Detection speed depended entirely on Netlify's first-party log feed and Anthropic billing dashboards. Diagnostic capability was high if you knew where to look (logs are well-structured) but low for an on-call who doesn't.

**Maturity level — after this run**: **moderate**.
Health probes can now distinguish "lambda is up" from "lambda can serve a request." Every server log line carries a `request_id` matching the response's `X-Request-Id` header — a single user's request is grep-able end-to-end across retries and helper modules. A 12-runbook playbook covers every plausible production failure mode an on-call would page on. No new infrastructure dependencies were added.

**Top 5 gaps closed by this run**:
1. **No health endpoint** → Added `GET /api/health` (readiness) and `GET /api/health?mode=live` (liveness) at `netlify/functions/health.ts`. 503 only when lambda CANNOT serve a request; degraded (200) when Firestore is unreachable but generation still works.
2. **No request correlation** → Added `src/server/log.ts` with AsyncLocalStorage-backed `runWithRequestContext` / `logEvent` / `logError`. Honors inbound `x-nf-request-id` (Netlify-provided) so app logs correlate end-to-end with Netlify's own function invocation logs. Returns `X-Request-Id` on every response.
3. **No runbooks** → `docs/RUNBOOKS.md` with 12 failure-mode runbooks: symptoms, diagnosis, resolution, prevention. Cross-references the existing log events and CLAUDE.md guarantees.
4. **No alerting recommendations** → §6 of this report inventories the recommended alert definitions, with thresholds derived from the codebase's own timeout / retry-budget constants.
5. **No documented observability conventions** → CLAUDE.md and `docs/CONFIGURATION.md` updated to thread the new logger and health endpoint into the cold-start agent context.

**Top 5 gaps still open** (not addressed; see §7):
1. No metrics export (Prometheus / OTel / statsd). Logs are structured but not pre-aggregated; ops dashboards must aggregate from Netlify's log feed or pipe logs to a SIEM.
2. No alerting infrastructure (PagerDuty / Opsgenie / similar). Alert *definitions* are documented; the team must wire them to a paging tool.
3. No distributed tracing (OTel). The single-lambda architecture makes this less important, but Anthropic-side latency isn't decomposable into request lifecycle without spans.
4. No Firestore TTL policy *enforcement* — `expiresAt` is written correctly but the project-level TTL config is not testable from code (CLAUDE.md already documents this).
5. No client-side error reporting (Sentry / equivalent). `error_boundary` and `gen_client_error` console.error lines exist but are observable only with browser dev-tools open.

---

## 1. Health Checks

### Before
**None existed.** No `/health`, `/healthz`, `/ready`, `/status`, or `/ping` route. The single Netlify function was `generate.ts`, returning 200 only after a full Anthropic round-trip. Uptime monitors had to either probe a paid endpoint (cost) or hit the SPA `index.html` (proves only the CDN, not the lambda).

### After
New endpoint: `netlify/functions/health.ts`. Mounted at `/api/health` via the existing `/api/* → /.netlify/functions/:splat` rewrite in `netlify.toml` — no infra change required.

| Mode | Method | Body | Status code | Cost | Use case |
|---|---|---|---|---|---|
| `?mode=live` | GET, HEAD | `{ status: "ok", mode: "live", checks: [] }` | 200 always | Zero I/O | Cheap uptime monitors that should page only on lambda-down |
| (default `?mode=ready`) | GET, HEAD | `{ status: "ok"|"degraded"|"unhealthy", mode: "ready", checks: [...] }` | 200 ok / 200 degraded / 503 unhealthy | 1 Firestore doc read | Aggregator probes verifying lambda can serve `/generate` |

**Components verified by readiness**:
| Component | Check | Failure mode | Maps to status |
|---|---|---|---|
| `config` | Presence of `ANTHROPIC_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. **Names only — never values.** | Lambda fundamentally cannot serve `/generate`. | `unhealthy` (503) |
| `firestore` | Single-doc read against `rateLimits/__health__`. 2-second timeout (`FIRESTORE_PROBE_TIMEOUT_MS`). | Firestore unreachable; rate-limit fail-open per existing CLAUDE.md contract. | `degraded` (200) |

**Security boundary**: probe responses NEVER contain env-var values, credentials, or stack traces. Underlying error strings go to the structured log only (`health_firestore_probe_failed` event).

**Why no Anthropic check**: every probe would burn ~$0.001 of Sonnet input. Aggregator probes (60s intervals = 1440/day) would cost ~$1.44/day for zero added user-facing reliability — Anthropic outages are observed via the existing `gen_anthropic_error` log + RUNBOOKS §2.

**Cost**: Firestore free tier permits 50 000 doc reads/day. A 60s probe interval = 1 440 reads/day = 2.9% of quota.

**Tests**: 19 cases in `tests/server/health.test.ts` — method handling, mode discrimination, degraded vs unhealthy mapping, probe timeout, security boundary (no env values in body), structured log emission.

---

## 2. Metrics & Instrumentation

### Coverage table

| Category | Present | Missing | Action this run |
|---|---|---|---|
| **Structured request events** | `gen_ok`, `gen_block`, `gen_distress`, `gen_rate_limited`, `gen_retry`, `gen_safe_fallback`, `gen_anthropic_error`, `gen_parse_failed`, `rate_limit_check_failed`, `tone_check_failed`, `distress_check_failed`, `config_validation_failed` | None for the existing endpoint | + `health_firestore_probe_failed` for the new endpoint |
| **Request latency** | `duration_ms` on `gen_ok` (cumulative wall time including retries) | Per-attempt latency, P50/P95 quantile aggregation | None — adding quantile aggregation requires a metrics library |
| **Per-endpoint method/status counts** | Implicit via event types | No explicit counter | None — aggregate from logs |
| **Active concurrency** | None | Concurrent request count | None — would require shared state which Netlify Functions don't natively have |
| **Request/response sizes** | None | Bytes-in / bytes-out | None — Netlify provides this in its function logs UI |
| **Business metrics** | PostHog client funnel (`prompt_submitted`, `generation_*`, `regenerate_clicked`, `canvas_render_failed`, `download_*`) | None significant | None |
| **Per-dependency latency** | Anthropic: `duration_ms` on `gen_ok`. Firestore: `latency_ms` on `health_firestore_probe_failed`. | Per-call Anthropic latency without aggregation; per-Firestore-call latency on rate-limit path | None — log line provides the data, dashboards aggregate |
| **Connection pool utilization** | N/A | N/A | Netlify Functions don't expose pool state. firebase-admin manages its own pool internally. |
| **External API success/error** | Anthropic: `gen_anthropic_error` with `status` and `attempt`. Firestore: `rate_limit_check_failed` and `health_firestore_probe_failed`. | None | None |
| **Cache hit/miss** | None for Anthropic prompt cache (Anthropic provides this server-side; not surfaced in our logs) | Token usage breakdown (cached vs uncached) | None — would require parsing Anthropic response `usage` field |
| **Memory / GC / event loop** | None | Memory headroom, GC pauses | None — Node-runtime metrics not surfaced through Netlify Functions; would require explicit Node `process.memoryUsage()` snapshot per request, not worth the noise |

### What was added this run
- `health_firestore_probe_failed` event with `error` and `latency_ms` fields.
- `request_id` field auto-attached to **every** server log event when emitted inside the handler scope. Decorates 12 existing events (`gen_ok`, `gen_block`, `gen_distress`, `gen_rate_limited`, `gen_retry`, `gen_safe_fallback`, `gen_anthropic_error`, `gen_parse_failed`, `rate_limit_check_failed`, `tone_check_failed`, `distress_check_failed`) without modifying their existing field names — strictly additive.
- `X-Request-Id` response header on every response (200 / 400 / 403 / 405).

### What still needs infra changes
- A metrics library (Prometheus client / OTel / statsd) to emit pre-aggregated time-series. Out of scope per orchestrator constraint ("DO NOT add new infrastructure dependencies"). Recommendation: Netlify's log-drain feature pipes JSON lines to a SIEM (Datadog, New Relic, Honeycomb), and the SIEM's parser builds dashboards from the existing fields.
- Per-attempt Anthropic latency (currently only cumulative). Would require splitting `duration_ms` into `gen_ok` + `tone_check_ms` + `distress_check_ms`. Recommended only if Anthropic latency analysis becomes a recurring on-call task.

---

## 3. Distributed Tracing & Correlation

### Before
**No correlation IDs of any kind.** Each request emitted 1–6 structured log lines with no shared identifier. Under concurrent traffic, lines from many requests interleaved in the Netlify log feed with no way to correlate them per-request. The `gen_rate_limited` event's `hashedIp` field was the only weak grouping mechanism — but it grouped by IP across hours, not by request.

### After
- **Request ID resolution**: `resolveRequestId` honors inbound `x-nf-request-id` (Netlify provides this on every function invocation, the same ID surfaced in the Netlify Function Logs UI), else generates a fresh 16-hex-char ID.
- **AsyncLocalStorage propagation**: `runWithRequestContext` wraps the entire handler. Every awaited helper inside it (anthropic.ts, safety.ts, validation.ts) automatically picks up the context — no parameter threading needed. AsyncLocalStorage has near-zero V8 overhead and is stable since Node 16.4.
- **Auto-attachment**: `logEvent`/`logError` merge the `request_id` field into every emitted JSON line when called inside a context. Outside context (cold-boot init logs) the field is omitted cleanly.
- **Response header**: `X-Request-Id` is set on every response so the client can quote it back to support / on-call.

### Improvements made
| File | Change |
|---|---|
| `src/server/log.ts` (new) | `resolveRequestId`, `runWithRequestContext`, `logEvent`, `logError`, `getRequestContext` |
| `netlify/functions/generate.ts` | Wrap handler in `runWithRequestContext`; replace 12 `console.log/error(JSON.stringify(...))` calls with `logEvent`/`logError`; add `X-Request-Id` to every response header path |
| `src/server/anthropic.ts` | Replace `tone_check_failed` console.error with `logError` |
| `src/server/safety.ts` | Replace `distress_check_failed` console.error with `logError` |
| `src/server/validation.ts` | Replace `gen_parse_failed` console.error with `logError` |
| `tests/server/log.test.ts` (new) | 20 tests — ID resolution, propagation across `await`, concurrency isolation (two requests don't bleed into each other), context-overrides-user-supplied, log shape |
| `tests/server/generate-integration.test.ts` | +5 tests — `X-Request-Id` echoed on happy path / generated when absent / present on 400 / attached to `gen_ok` log / attached to helper-emitted error logs |
| `tests/server/health.test.ts` (new) | 19 tests — readiness contract, liveness zero-IO, security boundary, probe timeout, structured log emission |

### Remaining gaps
- **Anthropic-side spans**: we don't decompose request latency into "Sonnet generation," "tone check," "distress check." `gen_ok.duration_ms` is the cumulative total. Would require OTel spans.
- **Cross-service correlation**: there's only one server-side service (the lambda); the only cross-service hop is Anthropic, and we don't propagate any trace ID into Anthropic requests (Anthropic doesn't expose a customer-facing trace surface anyway).

---

## 4. Failure Mode Analysis

### Dependency matrix

| Dependency | Down impact | Slow impact (10×) | Timeout configured? | Retry? | Circuit breaker? | Graceful degradation? |
|---|---|---|---|---|---|---|
| **Anthropic API** | Every generation → `safe_fallback` (~10 fixed posters; user still gets a poster) | Lambda burns ~24s budget, then `safe_fallback` | Yes — 12s per call (`ANTHROPIC_REQUEST_TIMEOUT_MS`) | Yes — 2 retries on 5xx / network errors; bail on 4xx (audit 33/001) | No (single provider) | Yes — `safe_fallback` from `src/server/fallbacks.ts` |
| **Firestore (rate limit)** | Rate limiter falls open; user requests succeed but no per-IP cap | Lambda burns 3s budget (`RATE_LIMIT_TIMEOUT_MS`), then falls open | Yes — 3s race timeout | No (one transactional check per request) | No | Yes — fail-open is the design (`generate.ts:217`) |
| **Firestore (TTL policy)** | `rateLimits` collection grows without bound; eventually trips free-tier quota | N/A | N/A | N/A | N/A | No — operational dependency only enforceable via project config |
| **Firebase Storage (photo CDN)** | Server-side OK; client-side blank canvas | `loadImage()` 15s timeout; then `onCanvasFailure` → error copy | Yes — 15s client-side (`IMAGE_LOAD_TIMEOUT_MS`) | No | No | Partial — error copy with retry affordance |
| **PostHog (analytics)** | Analytics silently fails; user flow unaffected (try/catch, audit 33/001) | Same — wrapped in try/catch | Yes — 2s rIC timeout | No | No | Yes — try/catch swallow + log |
| **Netlify Function runtime** | 502 to user; SPA still loads from CDN | Cold-start latency (rare ≥1s); warm invocations <100ms | Yes — Netlify-side 26s lambda budget | N/A | N/A | None — this is the runtime itself |

### Critical code paths

| Path | What can go wrong | Detection | Investigation | Resolution |
|---|---|---|---|---|
| **Generation happy path** (`POST /generate`) | Anthropic 4xx, 5xx, parse failure, tone failure, photo selection failure | `gen_anthropic_error`, `gen_parse_failed`, `gen_retry`, `gen_safe_fallback` events | grep request_id; check `status`, `attempt`, `retries`, `duration_ms` | RUNBOOKS §1, §2, §3 |
| **Rate-limit check** | Firestore unreachable, slow, hung | `rate_limit_check_failed` event | `health` probe; Firestore status page | RUNBOOKS §4 |
| **Distress detection** | False positive (over-firing); false negative (missed crisis) | User reports; `gen_distress` rate spike/drop | Local repro with the prompt; phrase list & Haiku prompt review | RUNBOOKS §11 |
| **Safety filter (slur / real-person)** | New slur not in list; bypass via case/Unicode | User reports; offensive content shipping | Manual prompt review | Update `slur-list.ts`; never logged at content level (privacy) |
| **CSRF shield** | Missing `ALLOWED_ORIGINS` → cross-origin abuse | `config_validation_failed` at cold-start; cost spike | RUNBOOKS §6, §7 | Set env var + redeploy |
| **Photo CDN** | DNS failure, TLS failure, dropped socket on degraded mobile | `loadImage` timeout; `poster_render_failed` browser console | Client-side; manual reproduction | RUNBOOKS §9 |

### Graceful degradation assessment

The codebase has **strong** graceful-degradation discipline:
- Anthropic outage → `safe_fallback` (user still gets a poster).
- Firestore outage → rate-limit falls open (user requests succeed; cost surface widens but is bounded by `ALLOWED_ORIGINS` CSRF shield + `gen_anthropic_error` retries).
- PostHog outage → silent log + flow continues.
- Photo CDN outage → user-visible error copy with retry button (not a hang).

**Missing kill switches** (already documented in `docs/CONFIGURATION.md`):
- `ENABLE_GENERATION` — disable `/generate` entirely without a deploy. Useful for cost-spike incidents and Anthropic outages where even `safe_fallback` is overkill.
- `ENABLE_DISTRESS_CHECK` — independent control over the Haiku distress classifier (today only `ENABLE_TONE_CHECK` exists).
- `FORCE_SAFE_FALLBACK_PERCENT` — canary lever for verifying the safe-fallback rendering path under live traffic.

These remain open recommendations — adding them is ~5 lines per switch, but each has design-decision overhead and the team should weigh against current traffic / cost surface area.

**See** `docs/RUNBOOKS.md` for the full operational playbook covering 12 failure modes.

---

## 5. Alerting Recommendations

The codebase has no alerting infrastructure today. The recommendations below are *definitions* with thresholds derived from existing constants (timeout values, retry budgets, expected response times). The team must wire them to a paging tool (PagerDuty / Opsgenie / Slack / etc.).

### Page (wake on-call)

| Alert | Condition | Threshold | Severity |
|---|---|---|---|
| **Config validation failure** | Cold-start log line `event:"config_validation_failed"` with `context:"production"` | Any single occurrence | P1 — production deploy is misconfigured |
| **Anthropic error rate** | `event:"gen_anthropic_error"` count / total request count | > 5% over 5 minutes | P1 — provider issue (or auth problem); user posters are degrading |
| **Health 503** | `/api/health` (readiness) returns 503 | 2 consecutive failures, 60s probe interval | P1 — lambda fundamentally cannot serve a `/generate` request |
| **Anthropic auth failure** | `event:"gen_anthropic_error"` with `status:401` or `status:403` | > 1% of requests over 5 minutes | P1 — API key invalid / revoked |
| **Lambda latency P95** | `gen_ok.duration_ms` P95 | > 20 000 ms over 5 minutes | P1 — approaching 26s lambda budget |

### Notify (best-effort)

| Alert | Condition | Threshold | Severity |
|---|---|---|---|
| **Anthropic rate-limit (429)** | `gen_anthropic_error` with `status:429` | > 1% of requests over 5 minutes | P2 — org-tier rate-limit pressure |
| **Rate-limit infra failure** | `event:"rate_limit_check_failed"` count / total | > 5% over 10 minutes | P2 — Firestore unavailable; rate-limit falling open |
| **Health degraded** | `/api/health` returns `{status: "degraded"}` | > 5 minutes sustained | P2 — Firestore reachable but probe failing |
| **Safe-fallback rate spike** | `event:"gen_safe_fallback"` count / total | > 10% over 10 minutes | P2 — generation pipeline failing more than expected baseline |
| **Lambda latency P50** | `gen_ok.duration_ms` P50 | > 8 000 ms over 10 minutes | P2 — Anthropic getting slower; worth investigating before P95 climbs |

### Cost alerts

| Alert | Condition | Threshold | Severity |
|---|---|---|---|
| **Anthropic daily spend** | Anthropic billing dashboard | > 3× rolling 7-day average | P1 — possible abuse or runaway traffic |
| **Firestore reads/day** | Firebase billing dashboard | > 50% of free-tier quota | P2 — TTL policy may be missing (RUNBOOKS §5) |
| **Firestore storage** | Firebase billing dashboard | > 50% of free-tier quota | P2 — TTL policy missing |

### Recommended log-search patterns

For Netlify Function Logs UI search (or wherever logs are aggregated):

| Search | What it surfaces |
|---|---|
| `"event":"config_validation_failed"` | Missing prod env vars at cold-start |
| `"request_id":"<id>"` | Full timeline of one user's request, all helpers included |
| `"event":"gen_anthropic_error" "status":401` | Auth failures specifically |
| `"event":"gen_anthropic_error" "status":429` | Provider rate-limiting |
| `"event":"gen_safe_fallback"` | Pipeline-exhaustion events |
| `"event":"health_firestore_probe_failed"` | Firestore unreachable from probe |

---

## 6. Distributed Tracing — current state and gaps

### Current state
- One server-side service (Netlify Function `generate`).
- One downstream service (Anthropic API).
- No distributed-trace propagation (no `traceparent` header sent to Anthropic; Anthropic doesn't have a customer-facing trace surface anyway).
- **NEW**: per-request `request_id` propagated across all in-process async work via `AsyncLocalStorage`. Echoed to client as `X-Request-Id`. Honors inbound `x-nf-request-id` from Netlify so app logs correlate end-to-end with Netlify's first-party invocation logs.

### Gaps (not addressed)
- **Spans for sub-operations**: no breakdown of `gen_ok.duration_ms` into Anthropic generation vs tone check vs distress check vs photo selection. Adding OTel would close this; not done in this run because (a) it adds an infra dependency, and (b) the existing `retries` field already distinguishes the slow path.
- **Anthropic-side tracing**: Anthropic's response includes a `request_id` of its own. We don't capture or log it. Adding it would let us cross-reference our request_id with Anthropic's in incident comms — small win, ~3 lines of code, recommended.
- **Browser-side tracing**: client SDK calls (PostHog, image fetches, generate fetch) have no shared trace ID. Browser DevTools shows them per-tab; out of scope for server-side observability.

---

## 7. Recommendations

### Quick wins (≤30 min each)

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? |
|---|---|---|---|---|
| 1 | **Capture Anthropic's `request_id`** in `gen_anthropic_error` and `gen_ok` log lines. The Anthropic SDK exposes `_request_id` on the response. Pinning this lets ops cross-reference our trace with Anthropic's during incidents. | Better incident comms; faster Anthropic ticket triage. | Low. Loses some shared-language fidelity during Anthropic-side incidents. | **Yes** — 3 lines |
| 2 | **Add `ENABLE_GENERATION` env-var kill switch** as documented in `docs/CONFIGURATION.md` § Missing kill switches. Short-circuits to `safe_fallback` at the top of the handler when set to `'false'`. | Cost-spike lever; clean Anthropic-outage response without a deploy. | Medium. During an extended Anthropic outage there's no clean way to stop billing for partial-degraded service except pulling the deploy. | **Yes** — ~5 lines + 1 test |
| 3 | **Set up Netlify log drain to a SIEM** (Datadog, New Relic, Honeycomb, etc.). The structured JSON log lines plug directly into any of these without a parser; quantile aggregation falls out automatically. | Real dashboards; alerting on log patterns; long-term retention beyond Netlify's default window. | Medium. Today incident response depends on the on-call manually grepping Netlify's log UI. | **Probably** — depends on team budget; the structured-log foundation is already in place. |

### Larger investments (1–3 days each)

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? |
|---|---|---|---|---|
| 4 | **Add OpenTelemetry instrumentation** with auto-instrumentation for the Anthropic SDK and Firestore. Decomposes `gen_ok.duration_ms` into per-step spans. | Diagnostics for "is Anthropic slow or is the tone check slow"; visibility into Firestore transaction time. | Medium. Today the cumulative latency is observable; the breakdown isn't. Limits root-cause speed during latency incidents. | **Only if time allows** — adds an infra dependency the orchestrator advised against. Wait until traffic justifies it. |
| 5 | **Add Sentry / Bugsnag for client-side errors**. The existing `error_boundary`, `gen_client_error`, `download_failed`, and `poster_render_failed` console.error lines are observable only with browser DevTools open. | Visibility into client-side errors (canvas write failures, unexpected network shape, browser-specific bugs). | Medium. Production bugs that don't surface server-side go unobserved. | **Probably** — single SDK to add, well-understood pattern. |
| 6 | **Wire the recommended alerts to a paging tool**. The §6 thresholds are derived from codebase constants; the team needs to decide which ones page vs notify. | Detection speed: minutes instead of hours-on-customer-complaint. | High. Today the team is reactive to billing anomalies, not proactive on production incidents. | **Yes**, post-SIEM. |

### Infra / tooling recommendations
- A SIEM (Datadog, New Relic, Honeycomb, etc.) plugs into the structured logs natively — no parser needed. Recommended over a metrics library because the data is already structured.
- A metrics library (Prometheus client, OTel) is **not** recommended for this stage. The traffic profile (single function, finite known event types) doesn't justify the dependency vs. just aggregating from logs.

### On-call practices
- Runbooks (`docs/RUNBOOKS.md`) are written to be readable cold by an on-call. Every runbook references the specific log event names and `docs/CONFIGURATION.md` toggles needed to resolve.
- The `request_id` correlation closes the largest pre-existing gap: any user-reported issue can now be reproduced from logs given just the `X-Request-Id` header value the user can copy from their browser DevTools.

---

## Appendix A: Files added/modified

### Added
| Path | Purpose |
|---|---|
| `netlify/functions/health.ts` | Health endpoint (live + ready modes) |
| `src/server/log.ts` | AsyncLocalStorage-backed request-scoped logger |
| `tests/server/health.test.ts` | 19 tests for the health endpoint |
| `tests/server/log.test.ts` | 20 tests for the logger |
| `docs/RUNBOOKS.md` | 12 runbooks + appendix |
| `audit-reports/40_OBSERVABILITY_REPORT_001_2026-05-04_2241.md` | This report |

### Modified
| Path | Change |
|---|---|
| `netlify/functions/generate.ts` | Wrap handler in `runWithRequestContext`; replace 12 raw console.log/error with logEvent/logError; add `X-Request-Id` response header |
| `src/server/anthropic.ts` | `tone_check_failed` console.error → logError |
| `src/server/safety.ts` | `distress_check_failed` console.error → logError |
| `src/server/validation.ts` | `gen_parse_failed` console.error → logError |
| `tests/server/generate-integration.test.ts` | +5 tests for X-Request-Id correlation |
| `CLAUDE.md` | Thread the new logger conventions and health endpoint into the cold-start agent context |
| `docs/CONFIGURATION.md` | Add health endpoint and request-correlation references |

---

## Appendix B: Pre-existing flake (not introduced by this run)

`tests/server/rateLimit-extended.test.ts:367` — `writes expiresAt = windowStart + 1 hour when resetting an expired window (TTL contract)` is flaky.

Root cause: the mock `windowStart.toMillis()` returns `Date.now() - oneHourMs - 1` *at call time*, not at construction time. Between when `Timestamp.now()` is captured (at construction) and when `data.windowStart.toMillis()` is read (in the rateLimit module), the wall clock can advance enough that `windowAge` becomes ≤ `oneHourMs` and the window-reset branch isn't taken.

Reproduction: rerun the test suite a few times; ~1 in 5 runs fails this single test, all 405 others pass.

Fix (out of scope for this audit): the mock at line 373 should use the same shape as `Timestamp.now`'s mock at line 12 — capture `Date.now()` once at construction:

```ts
windowStart: (() => {
  const ms = Date.now() - oneHourMs - 1;
  return { toMillis: () => ms };
})(),
```

This matches the rationale comment at the top of the file ("capture `Date.now()` ONCE per Timestamp.now() call") and would close the same drift-during-paired-reads issue at the source.

---

*Run 40/001 — observability audit, audit-reports/40_OBSERVABILITY_REPORT_001_2026-05-04_2241.md*
