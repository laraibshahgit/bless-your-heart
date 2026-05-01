# Scheduled Job & Background Process Audit

You are running an overnight audit of every scheduled job, cron task, recurring process, and background worker in the codebase. These are the things that run silently — and fail silently. Your job: find every one, assess whether it's healthy, and surface the ones that are broken, missing, or dangerous.

Work on branch `scheduled-jobs-audit-[date]`. Safe fixes only (adding timeouts, logging, idempotency guards). Run tests after every change.

---

## Global Rules

- Background jobs fail *silently*. Treat missing monitoring as HIGH severity — a job that fails without anyone knowing is worse than a job that crashes loudly.
- For every job found, answer: "What happens if this hasn't run for a week and nobody noticed?"
- Be specific about failure modes. Not "this could overlap" but "this job runs every 5 min, averages 8 min on large datasets, has no overlap protection — two instances will process the same records."
- Commit format: `fix: [what] in [job/module]`

---

## Phase 1: Job Inventory

**Search everywhere.** Jobs hide in: cron config files, `crontab`, systemd timers, Kubernetes CronJobs, CI/CD scheduled pipelines, cloud scheduler configs (CloudWatch Events, Cloud Scheduler), application-level schedulers (node-cron, APScheduler, Sidekiq, Bull, Agenda, Celery Beat, Hangfire), `setInterval` in server startup, database-triggered jobs, queue consumers that run continuously, and health check / heartbeat processes.

**For each job, document:**

| Field | Detail |
|-------|--------|
| Name / identifier | How it's referenced in code and config |
| Location | File path(s) — definition, handler, and config |
| Schedule | Frequency and timing (cron expression decoded to plain English) |
| Purpose | What it does (read the handler, not just the name) |
| Runtime | Expected duration (infer from operations performed) |
| Data scope | What data it processes — full table scan? Incremental? Bounded? |
| Dependencies | External services, DB tables, APIs, file systems |
| Trigger mechanism | Scheduler, queue, event, manual-only |
| Concurrency protection | Locking? Single-instance guarantee? None? |
| Timeout | Configured? Appropriate relative to expected runtime? |
| Error handling | Retry? Dead letter? Alert? Silent swallow? |
| Monitoring | Logged? Alerted on failure? Tracked for success? |
| Idempotency | Safe to re-run? Safe to run twice simultaneously? |
| Last modified | Git blame — when was this last touched? |

---

## Phase 2: Health Assessment

For each job, evaluate against these failure modes:

### Silent Failure
- Does the job log start/completion/failure?
- If it throws, does anyone get notified? Or does it vanish into a void?
- Is there a "last successful run" timestamp anywhere? Could you tell if it stopped running?
- Jobs with `catch (e) {}` or `catch (e) { console.log(e) }` and no alerting = **HIGH** risk.

### Overlap & Concurrency
- Can two instances run simultaneously? (Scheduler fires again before previous finishes, multiple app instances each running their own scheduler, manual trigger during scheduled run.)
- If they overlap: do they process the same records? Corrupt shared state? Deadlock?
- Is there a distributed lock, advisory lock, unique constraint guard, or "running" flag?
- For jobs on multi-instance deployments: is the job running on *every* instance or just one? Is that intentional?

### Timeout & Runaway
- Is there a timeout? What happens when it fires — clean abort or orphaned state?
- Could the job run indefinitely on unexpected data volume? (Unbounded query, pagination without limit, growing backlog.)
- What's the worst-case runtime? Is it bounded?

### Data Correctness
- Is the job idempotent? If it runs twice on the same data, does it produce correct results or duplicates?
- Does it handle partial failure? (Processes 500 of 1000 records, crashes — does it resume or restart from zero? Are the 500 in a consistent state?)
- Does it use transactions appropriately?
- Race conditions with user-facing operations? (Job modifies records users are actively editing.)

### Resource Impact
- Does it run during peak hours? Should it?
- Does it lock tables, consume connection pool, spike CPU/memory?
- Does it compete with user-facing queries for database resources?

### Staleness & Relevance
- Is this job still needed? (Feature it supports still exists? Data it cleans still accumulates?)
- Has the schedule drifted from reality? (Runs hourly but data changes daily. Runs daily but SLA requires hourly.)
- Is it cleaning up data that accumulates faster than it's cleaned? (Backlog growing over time.)

---

## Phase 3: Missing Jobs

Identify jobs that *should* exist but don't:

- **Orphan cleanup**: Soft-deleted records never purged, temp files accumulating, expired sessions/tokens persisting, abandoned uploads, incomplete multi-step records
- **Data hygiene**: Expired invites, stale cache entries in DB, orphaned file storage references, unlinked records after cascading gaps
- **Compliance**: Audit log rotation, data retention enforcement, GDPR deletion deadlines, consent expiry
- **Operational**: Log rotation, metric aggregation, health pings to external monitors, certificate expiry checks, backup verification
- **User-facing**: Reminder emails, subscription renewal, trial expiry, scheduled report generation, digest/summary notifications

For each missing job: what it should do, what data it would operate on, suggested frequency, and consequences of continued absence.

---

## Phase 4: Safe Fixes

**Only fix mechanical, low-risk issues:**

- Add logging (start, completion with count/duration, failure with context) to jobs that have none
- Add timeouts to jobs without them
- Add idempotency guards (skip-if-already-processed checks) where missing and straightforward
- Add overlap protection using the project's existing locking patterns
- Fix silent error swallowing (empty catch blocks → log + alert using existing patterns)
- Remove clearly obsolete jobs (feature deleted, data store removed) — verify with full codebase search first

**Do NOT:** change job schedules, modify business logic, add infrastructure (Redis locks, distributed schedulers), or create new jobs.

Run tests after every change. Commit: `fix: add [protection type] to [job name]`

---

## Output

Save as `audit-reports/39_SCHEDULED_JOBS_REPORT_[run-number]_[date]_[time in user's local time].md`.

### Report Structure

1. **Executive Summary** — Total jobs found, health breakdown (healthy / at-risk / dangerous / broken), missing jobs count, "If you read nothing else: [worst finding]."
2. **Job Inventory** — Full table with all fields from Phase 1.
3. **Health Assessment** — Per-job evaluation: | Job | Silent Failure Risk | Overlap Risk | Timeout Risk | Idempotency | Data Correctness | Monitoring | Overall Health |
4. **Critical Findings** — Jobs that are actively broken, silently failing, or dangerous. Full detail per finding.
5. **Missing Jobs** — Table: | Purpose | Data/Scope | Suggested Frequency | Consequence of Absence | Effort |
6. **Fixes Applied** — What was changed, why, tests passing.
7. **Resource & Scheduling Analysis** — Peak-hour conflicts, resource competition, schedule optimization suggestions.
8. **Recommendations** — Priority-ordered: monitoring to add, locks to implement, schedules to adjust, new jobs to create, infrastructure improvements.

## Chat Output Requirement

Print a summary in conversation:

1. **Status Line** — What you did, tests passing.
2. **Key Findings** — Specific, actionable. "The `cleanExpiredSessions` job has no overlap protection and runs on all 4 app instances simultaneously — it's quadruple-deleting and hitting lock contention errors silently." Not "found some job issues."
3. **Changes Made** (if any).
4. **Recommendations** table (if warranted):

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| | ≤10 words | What improves | Low–Critical | Yes/Probably/If time | 1–3 sentences |

5. **Report Location** — Full path.
