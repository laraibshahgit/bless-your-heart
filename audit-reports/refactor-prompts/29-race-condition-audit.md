# Concurrency & Race Condition Audit

You are running an overnight concurrency and race condition audit. Your job: find where simultaneous operations cause data corruption, lost updates, double-processing, or inconsistent state.

This is primarily analysis and documentation. Race conditions are dangerous to "fix" without deep understanding — fix only clear-cut cases, document everything else with specific, actionable recommendations.

Work on branch `concurrency-audit-[date]`.

---

## Global Rules

- Run tests after every change. Commit format: `fix: [concurrency protection type] in [module]`
- **Only fix** race conditions where the fix is clearly correct and low-risk: adding unique constraints (migration file, not run), replacing read-modify-write with atomic operations, adding `SELECT FOR UPDATE` to existing transactions, adding `WHERE` clause guards to status transitions, replacing read-compute-write cache patterns with atomic cache operations, adding missing cache invalidation to write paths, fixing invalidation ordering, adding button disable-on-submit.
- **Do NOT implement** overnight: distributed locking, leader election, event sourcing, global transaction isolation level changes, cache stampede protection (unless project already has a pattern), or TTL changes (unless clearly a framework default).
- When documenting a race condition, show the **interleaved timeline** — the specific sequence of events that causes the problem, with entity IDs and timing where relevant.
- Bad: "There's a race condition in the order system"
- Good: "In `orders_service.js:142`, two concurrent requests can both read `inventory_count=1`, both pass the `>0` check, and both decrement → `inventory_count=-1`. Fix: `SELECT FOR UPDATE` on the inventory row."
- For cache races, include timing windows: "DB write takes ~50ms, invalidation 10ms after → 60ms stale read window."

---

## Phase 1: Shared Mutable State Analysis

**Step 1: Find global and module-level mutable state**
Search for: global variables modified after init, module-level variables written during request handling, singletons with mutable properties, static variables that change at runtime, in-memory caches/registries read AND written during requests, module-level connection pools/rate limiters/counters.

For each: What data? Which code paths read/write it? Can two requests access it simultaneously? Consequence? (Stale read, lost update, corruption, crash?)

**Step 2: Find request-scoped state leaks**
Request data stored on shared objects, improperly isolated thread-local/async-context storage, middleware modifying shared state per-request, object pools retaining previous request state.

**Step 3: Fix clear-cut issues**
Convert mutable globals to request-scoped state where obvious. Add isolation. Make immutable what doesn't need to mutate. Document complex cases in the report.

---

## Phase 2: Database Race Conditions

**Step 1: Find read-modify-write patterns**
Code that reads a value, modifies it in application code, writes it back — counter increments, availability checks + reservation, balance updates, status transitions, list appends.

For each: Is it in a transaction? Appropriate isolation level? Optimistic concurrency (version/`updated_at`)? Pessimistic lock (`SELECT FOR UPDATE`)? What happens with two simultaneous requests right now?

**Step 2: Find check-then-act patterns**
Code that checks a condition then acts on it without concurrency protection — uniqueness checks without unique constraints, availability checks without locks, eligibility checks without guards.

For each: Is there a database constraint backing the check? A lock? Or just unprotected application logic?

**Step 3: Find transaction scope issues**
Transactions too narrow (partial protection), too broad (locks held during external API calls), external side effects inside transactions (HTTP calls, queue publishes that can't roll back), nested transaction behavior misunderstandings, missing transactions on multi-statement operations.

**Step 4: Fix safe issues**
Add unique constraints, replace read-modify-write with atomic operations (`UPDATE SET value = value + 1`), add `SELECT FOR UPDATE`, add `WHERE` clause guards on status transitions, add optimistic concurrency checks. Write migration files for new constraints (don't run them).

---

## Phase 3: Distributed Cache Race Conditions

**Step 1: Inventory all cache interactions**
For every cache layer (Redis, Memcached, in-memory, CDN, HTTP cache): What data is cached? Key structure? TTL? Where read, written, invalidated? Cache strategy (read-through, write-through, write-behind, cache-aside)?

**Step 2: Stale read races**
For every cached value, trace what happens when underlying data changes:
- Is cache invalidated on every write path? (Watch for new endpoints that modify data cached by older endpoints.)
- Invalidation ordering: after successful DB write, not before.
- Race window: Thread A updates DB → Thread B reads cache (stale hit) → Thread A invalidates. Thread B now has stale data.
- For dangerous stale data (permissions, balances, inventory): is there a cache bypass mechanism?
- Impact assessment: how long could stale data persist (TTL = worst case)? What's the consequence?

**Step 3: Cache stampede (thundering herd)**
When a popular key expires, many concurrent requests hit the DB simultaneously. Look for: high-read-rate keys with short TTLs, invalidation on popular keys without stampede protection, existing mitigations (cache locks, stale-while-revalidate, probabilistic early expiration).

**Step 4: Read-compute-write cache races**
Cache-layer read-modify-write: counter increments, incremental aggregation updates, list appends in cache. For each: can it use atomic cache commands (Redis `INCR`, `LPUSH`, `SADD`)? If not, is there locking?

**Step 5: Cache-database consistency divergence**
Look for: delete-then-cache races (stale "not found" cached between DB delete and cache delete), double-write inconsistency (cache write fails silently after DB write), cold-cache stampede on deploy, cross-service cache invalidation gaps.

**Step 6: Fix safe cache issues**
Replace read-compute-write with atomic operations, add missing cache invalidation to write paths, fix invalidation ordering. Document complex issues (stampede protection, distributed consistency) without implementing.

---

## Phase 4: Queue & Job Idempotency

**Step 1: Assess idempotency**
For every background job/message consumer: What happens if it runs twice? Is there deduplication (idempotency key, unique constraint, "already processed" check)? Can parallel instances of the same job type interfere? What about out-of-order execution?

**Step 2: Distributed concurrency**
Operations assuming single-instance execution? Scheduled jobs running on every instance? Missing distributed locks? Missing leader election?

**Step 3: Fix safe issues**
Add idempotency keys, unique constraints to prevent double-creation, "already processed" guards.

---

## Phase 5: Frontend Concurrency

**Step 1: Find user-facing race conditions**
Double submission (no button disable/request dedup), stale data actions (acting on changed/deleted resources), optimistic UI without proper rollback on failure, concurrent editing without conflict detection, out-of-order API responses overwriting newer data.

**Step 2: Fix safe issues**
Add button disable-on-submit, request debouncing, optimistic UI rollback.

---

## Phase 6: Concurrency Test Generation

**Step 1: Tests for critical race conditions**
Simulate concurrent execution for the most dangerous database and cache races. Use parallel test runners, un-awaited async operations, dual-connection transaction tests, cache invalidation timing tests. Mark failing tests as skipped: `// RACE CONDITION: [description]`.

**Step 2: Tests for idempotency**
Call each protected endpoint/job twice with the same input. Verify single side effect and appropriate second-call response.

---

## Output

Save as `audit-reports/29_RACE_CONDITION_REPORT_[run-number]_[date]_[time in user's local time].md`. Increment run number based on existing reports.

### Report Structure

1. **Executive Summary** — Safety level (dangerous/risky/moderate/safe/robust), race conditions by severity, "at 100 concurrent requests, these things WILL go wrong: [list]"

2. **Shared Mutable State** — Global/module mutable state: | Location | Data | Read By | Written By | Risk | Fix |. Request-scoped leaks. Fixes applied.

3. **Database Race Conditions** — Read-modify-write races: | Location | Operation | Current Protection | Risk | Recommendation |. Check-then-act races. Transaction scope issues. Fixes applied with before/after. Migration files created.

4. **Cache Race Conditions** — Cache inventory: | Cached Data | Backend | TTL | Read/Write/Invalidation Locations | Consistency Risk |. Stale read risks. Stampede risks. Read-compute-write races. Cache-DB consistency issues. Fixes applied.

5. **Queue & Job Idempotency** — | Job/Consumer | Idempotent? | Protection | Risk if Duplicated |. Distributed issues. Fixes applied.

6. **Frontend Concurrency** — Double-submission risks. Stale data actions. Optimistic UI issues. Fixes applied.

7. **Concurrency Tests Written** — Tests proving race conditions exist (skipped), tests verifying protections, idempotency tests, cache consistency tests.

8. **Risk Map** — All race conditions ranked by likelihood × impact. Highest risk first with remediation steps. Estimated manifestation frequency under normal load. Distinguish visible errors vs. silent wrong answers (stale data, lost updates) — silent ones are more dangerous.

9. **Recommendations** — Immediate fixes, patterns for new code (optimistic locking, idempotency keys, atomic operations, cache consistency patterns, stampede mitigation), infrastructure to consider, monitoring to add, load testing approach.

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
