# Observability & Monitoring Readiness

## Prompt

```
You are running an overnight observability and monitoring readiness audit. Assess whether the team can detect, diagnose, and resolve production issues — then close the most critical gaps.

This is a mix of analysis and implementation. Add health checks, improve instrumentation, and generate runbooks, but don't introduce new infrastructure dependencies.

Work on branch `observability-[date]`.

## Your Mission

### Phase 1: Health Check & Readiness Assessment

**Evaluate existing health endpoints** (`/health`, `/healthz`, `/readiness`, `/status`, etc.)
- Does it just return 200, or does it verify actual dependencies (database, cache, queues, external APIs, file storage)?
- Does it distinguish liveness (process running) from readiness (ready to serve traffic)?

**Implement or improve health checks.** A good health endpoint should:
- Check every critical dependency, returning structured JSON with per-component status and latency
- Return 200 when healthy, 503 when unhealthy
- Have per-check timeouts so a hung dependency doesn't hang the endpoint
- NOT expose credentials, internal IPs, or stack traces
- Be lightweight enough to call frequently

If appropriate, create separate `/health/live` and `/health/ready` endpoints.

Run tests. Commit: `feat: add comprehensive health check endpoint`

### Phase 2: Metrics & Instrumentation Audit

**Inventory existing instrumentation**, then identify and close gaps across these categories:

- **Request metrics**: Count, latency histogram, error rate — all by endpoint/method/status. Active request concurrency. Request/response sizes.
- **Business metrics**: Significant user actions, conversion funnel steps, user-affecting failures (failed payments, sends, imports).
- **Dependency metrics**: DB query duration (by type/table), connection pool utilization (active/idle/waiting/max), external API latency/success/error per service, cache hit/miss/eviction rate, queue depth and consumer lag.
- **System/runtime metrics**: Memory (heap, RSS), event loop lag / GC pauses / equivalent, open FDs, active connections, thread/worker pool utilization.

**Add missing instrumentation where safe** — instrument via existing metrics libraries, ORM hooks, HTTP client middleware. Don't add a metrics library if none exists; document the recommendation instead.

Run tests after each batch. Commit: `observability: add [metric type] instrumentation to [module]`

### Phase 3: Distributed Tracing & Correlation

**Assess request tracing:**
- Is a unique correlation ID generated per request, propagated through logs, included in response headers (`X-Request-Id`), and forwarded to downstream calls and background jobs?
- If using a tracing system (OTel, Jaeger, Zipkin): are spans created for DB queries, external calls, and queue operations — not just the top-level request?

**Implement or improve as needed:**
- No correlation ID? Add middleware to generate one, attach to logging context, include in response headers. Commit: `feat: add request correlation ID middleware`
- Incomplete propagation? Fix it. Commit: `fix: propagate request ID to [scope]`

Run tests after changes.

### Phase 4: Failure Mode Analysis & Runbooks

**Map critical dependencies.** For each (DB, cache, APIs, queue, file storage, auth):
- Impact if down, slow (10x latency), or intermittently erroring
- Does the app crash, hang, or degrade gracefully?
- Timeout configured? Retry logic (with backoff/max)? Circuit breaker/fallback?

**Map critical code paths** (signup, core workflow, payments, exports, etc.):
- What can go wrong at each step?
- How would you detect it (which metric/log)?
- How would you investigate and resolve?

**Generate `docs/RUNBOOKS.md`** with a runbook per critical failure mode. Each runbook:
- **Title**: e.g., "Database Connection Pool Exhausted"
- **Symptoms**: Alerts, metrics, logs, or user reports indicating this problem
- **Diagnosis steps**: Ordered — what to check, commands to run, logs to search, metrics to examine
- **Resolution steps**: Immediate mitigation → root cause fix → verification
- **Prevention**: Changes to prevent recurrence
- **Escalation**: When to escalate and to whom (leave blank for team to fill)

**Assess graceful degradation:**
- Can the app partially serve requests when non-critical deps fail?
- Feature flags to disable broken features without deploying? Maintenance mode? Circuit breakers?

Document current state and recommend improvements.

### Phase 5: Alerting Surface Area

**Inventory existing alerts** in the codebase (Prometheus rules, PagerDuty config, CloudWatch alarms, etc.).

**Recommend alert definitions** with specific thresholds inferred from the codebase (timeout values, pool sizes, expected traffic):
- Error rate spike, latency degradation (P95), health check failures
- Dependency failure rates, resource exhaustion (pool/memory/disk)
- Queue backup (depth/lag), business metric anomalies (drop in signups, orders)

## Output Requirements

Create `audit-reports/` in project root if needed. Save as `audit-reports/40_OBSERVABILITY_REPORT_[run-number]_[date]_[time in user's local time].md`. Increment run number based on existing reports.

### Report Structure

1. **Executive Summary** — Maturity level (blind/basic/moderate/good/excellent), detection speed, diagnostic capability, top 5 gaps
2. **Health Checks** — Before/after state, dependencies checked
3. **Metrics & Instrumentation** — Coverage table (Category | Present | Missing), what was added, what still needs infra changes
4. **Distributed Tracing** — Current state, improvements made, remaining gaps
5. **Failure Mode Analysis** — Dependency matrix (Dependency | Down Impact | Slow Impact | Timeout? | Retry? | Circuit Breaker? | Graceful Degradation?), link to runbooks
6. **Alerting Recommendations** — Table (Alert Name | Condition | Threshold | Severity), current gaps
7. **Recommendations** — Priority-ordered improvements, infra/tooling recs, quick wins vs. investments, on-call practices

## Rules
- Branch: `observability-[date]`
- Run tests after every code change
- DO NOT add new infrastructure dependencies
- DO NOT add heavy middleware on hot paths
- Health checks must be lightweight
- Runbooks must be actionable by someone unfamiliar with the system
- Be specific with recommendations — include metric names, thresholds, and durations, grounded in codebase evidence (timeouts, pool sizes, expected response times)
- You have all night. Be thorough.
```

## Chat Output Requirement

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish. Do not make the user open the report to get the highlights. The chat summary should include:

### 1. Status Line
One sentence: what you did, how long it took, and whether all tests still pass.

### 2. Key Findings
The most important things discovered — bugs, risks, wins, or surprises. Each bullet should be specific and actionable, not vague. Lead with severity or impact.

**Good:** "CRITICAL: No backup configuration found for the primary Postgres database — total data loss risk."
**Bad:** "Found some issues with backups."

### 3. Changes Made (if applicable)
Bullet list of what was actually modified, added, or removed. Skip this section for read-only analysis runs.

### 4. Recommendations

If there are legitimately beneficial recommendations worth pursuing right now, present them in a table. Do **not** force recommendations — if the audit surfaced no actionable improvements, simply state that no recommendations are warranted at this time and move on.

When recommendations exist, use this table format:

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| *Sequential number* | *Short description (≤10 words)* | *What improves if addressed* | *Low / Medium / High / Critical* | *Yes / Probably / Only if time allows* | *1–3 sentences explaining the reasoning, context, or implementation guidance* |

Order rows by risk descending (Critical → High → Medium → Low). Be honest in the "Worth Doing?" column — not everything flagged is worth the engineering time. If a recommendation is marginal, say so.

### 5. Report Location
State the full path to the detailed report file for deeper review.

---

**Formatting rules for chat output:**
- Use markdown headers, bold for severity labels, and bullet points for scannability.
- Do not duplicate the full report contents — just the highlights and recommendations.
- If you made zero findings in a phase, say so in one line rather than omitting it silently.
