You are running an overnight error recovery and resilience audit. Find where the system fails badly — crashes instead of recovering, hangs instead of timing out, corrupts data instead of rolling back — and fix the safe ones while documenting the rest.

Branch: `resilience-[date]`

## General Rules
- Run tests after every change.
- Commit messages: `fix: [what you did] in [module]`
- DO NOT add new infrastructure dependencies. Use what exists or implement simple utilities.
- DO NOT change business logic or user-facing behavior.
- When adding timeouts, err generous — too-short causes false failures.
- Only retry idempotent operations. If unsure, document instead.
- Graceful shutdown must include a force-kill timeout to prevent hanging forever.
- Be specific about failure modes. Not "this could fail" but "if Redis is unreachable for >5s, all authenticated endpoints hang until the 30s default timeout fires, exhausting the connection pool."
- You have all night. Be thorough.

## Phase 1: Timeout Audit

**Step 1: Inventory every external call** — database queries, HTTP/API calls, cache ops, message queues, DNS, file storage (S3/GCS/NFS), email/SMS, WebSockets, gRPC/RPC.

**Step 2: Check each call's timeout configuration**
- Is there a timeout? Is it appropriate (a 30s default on a <100ms DB call is effectively none)?
- Are connection timeout and read timeout configured separately?
- What happens when the timeout fires — exception, null, retry, or silent hang?
- Flag any calls with NO timeout (most dangerous).

**Step 3: Fix missing/misconfigured timeouts**
- Add timeouts to every unprotected external call. Sensible defaults:
- Connection: 3-5s
- Read: 100ms-2s for DB, 5-30s for external APIs, configurable for long-running ops
- Make timeouts configurable via environment variables where they aren't already.

## Phase 2: Retry Logic Audit

**Step 1: Find all existing retry logic** — retry libraries, manual retry loops, queue/job retry config, webhook retry config.

**Step 2: Evaluate each retry**
- Is retry appropriate? Do NOT retry: non-idempotent ops without idempotency keys, client errors (4xx), auth errors, validation errors.
- Has exponential backoff with jitter? (Fixed intervals cause thundering herd)
- Has max retry limit and total timeout cap?
- Are the right errors retried? (Network/503 yes, 400/404 no)
- Is there logging on retry? Does the final error propagate meaningfully?

**Step 3: Find operations that need retries but lack them** — transient-failure-prone external API calls, DB connection issues, queue publishes, notification sending.

**Step 4: Add missing retries (safe operations only)**
Only for idempotent ops expected to fail transiently, not on hot paths. Include exponential backoff with jitter, max 3 retries, transient-error-only filtering, and logged attempts with context.

## Phase 3: Circuit Breaker & Fallback Assessment

**Step 1: Identify circuit breaker needs** — For each external dependency: does failure cascade? Does the app return errors to ALL users, even those not needing that dependency? Does it hang?

**Step 2: Identify fallback/degraded modes**
Examples: cache down → direct DB queries; search down → basic LIKE queries; email down → queue for later; analytics down → continue without tracking; third-party API down → cached/stale data or "temporarily unavailable" UI.

**Step 3: Document recommendations only** (do NOT implement overnight unless library already configured). For each: failure threshold, fallback behavior, recovery check, estimated effort.

## Phase 4: Partial Failure & Data Consistency

**Step 1: Find multi-step operations** with multiple side effects (e.g., create user + send email + create Stripe customer; process payment + update order + send confirmation + decrement inventory).

**Step 2: Analyze failure modes** — What happens if step N fails after step N-1 succeeds? Is there a transaction? Are external side effects inside/outside it? Is there rollback/compensation logic? Audit trail?

**Step 3: Fix safe issues**
- Move external side effects OUTSIDE database transactions.
- Add try/catch around non-critical side effects (notification failure should not fail the parent operation).
- Log progress on critical multi-step operations for failure diagnosis.
- Add idempotency guards for operations that might be retried after partial completion.

## Phase 5: Graceful Shutdown

**Step 1: Assess current behavior** — Does the app handle SIGTERM/SIGINT? On shutdown: does it kill in-flight requests, or drain them? Does it close DB/cache connections, drain queue consumers, flush logs/metrics? Is there a force-kill timeout?

**Step 2: Implement/improve** — Add signal handlers if missing. Stop accepting new work → finish in-flight (with timeout) → close connections → drain queues → flush buffers → exit cleanly.

## Phase 6: Dead Letter & Failure Queue Analysis

If the app uses message queues or background jobs:

**Step 1: Assess failure handling** — Are failed jobs retried with backoff? After max retries, where do they go? Is there a dead letter queue? Is it monitored? Can failed jobs be reprocessed? Are failure reasons logged with context?

**Step 2: Assess queue health** — Unbounded growth risks? Max depth/age limits? Zombie jobs (started but never completed)? Stuck job detection?

**Step 3: Fix what's safe** — Add DLQ config, failure logging, max retry limits, and error context to failed jobs.

## Output

Create `audit-reports/` in project root if needed. Save as `audit-reports/27_ERROR_RECOVERY_REPORT_[run-number]_[date]_[time in user's local time].md`, incrementing run number based on existing reports.

### Report Structure

1. **Executive Summary** — Resilience maturity (fragile / basic / moderate / resilient / robust). "What happens right now if [biggest dependency] goes down for 10 minutes?" Top 5 resilience gaps.

2. **Timeout Audit** — Table: Operation | File | Timeout Before | Timeout After | Notes. List operations still missing timeouts and why.

3. **Retry Logic** — Tables for: existing retries (Operation | Correct? | Issues | Fix), retries added (Operation | Strategy | Max Retries | Errors Retried), retries needed but not added (and why).

4. **Circuit Breaker Recommendations** — Table: Dependency | Current Failure Mode | Recommended Config | Fallback | Effort.

5. **Partial Failure Analysis** — Table: Operation | Steps | Failure Modes | Current Handling | Fixes Applied | Remaining Risk.

6. **Graceful Shutdown** — Before/after state. Resource cleanup checklist: Resource | Cleaned Up on Shutdown?

7. **Queue & Job Resilience** — Table: Queue/Job | Retry Config | Dead Letter? | Monitoring? | Fixes Applied.

8. **Cascading Failure Risk Map** — Dependency graph, critical paths with no fallback, blast radius per dependency.

9. **Recommendations** — Priority-ordered improvements, infrastructure needs, testing recommendations (chaos engineering, failure injection), incident response suggestions.

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
