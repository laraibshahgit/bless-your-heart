You are running an overnight performance analysis and optimization pass. Identify bottlenecks, optimize what's safe, and document everything else.

Branch: `performance-optimization-[date]`

## General Rules
- Run tests after every change
- DO NOT change behavior — only performance characteristics
- Database migrations: write files but DO NOT run them (need human review)
- Caching: document opportunities, don't implement complex infrastructure overnight
- Only parallelize provably independent operations
-  Frontend: no new dependencies. Attributes (`loading="lazy"`, `font-display: swap`, `async`, `defer`) are fine
-  Only add `React.memo`/`useMemo`/`useCallback` where unnecessary re-renders are demonstrable
- Focus on hot paths. Be honest about impact — a query on 50 rows once/day isn't worth optimizing
- Commit format: `perf: [action] in [location]` or `fix: [issue] in [module]`

## Phase 1: Database & Query Performance

**Step 1: Inventory all database queries**
For each query, note: calling endpoint/function, tables hit, joins/subqueries/aggregations, WHERE clauses, and whether results are paginated or unbounded.

**Step 2: Fix N+1 queries**
Look for: loops executing per-iteration queries, ORM lazy loading, endpoints fetching lists then querying details per item, GraphQL resolvers fetching nested data one-by-one. Fix with eager loading, joins, or batch queries.

**Step 3: Identify missing indexes**
Check every WHERE, JOIN, and ORDER BY column for index coverage. Consider single-column, composite, and partial indexes. Write migration files with documented expected impact.

**Step 4: Other query issues**
- `SELECT *` when few columns needed
- Unbounded queries on large tables / missing pagination
- Queries inside unnecessary transaction blocks
- Duplicate queries within a single request
- Sorting/filtering in app code that should be in the DB

## Phase 2: Application-Level Performance

**Step 1: Expensive operations**
- Nested loops (O(n²)+) on large datasets
- Synchronous/blocking operations on hot paths
- Large per-request data transformations that should be cached
- Missing memoization of repeated deterministic computations
- String concatenation in loops; unnecessary JSON.parse/stringify in hot paths

**Step 2: Caching opportunities**
Identify data that is: read-heavy/write-rare, expensive but deterministic, fetched from slow/rate-limited external APIs, or computed identically across requests. Document: what to cache, strategy (in-memory/Redis/HTTP headers), invalidation approach, estimated impact.

**Step 3: Async/concurrency improvements**
- Sequential calls that could be parallelized (`Promise.all` / `asyncio.gather`)
- Blocking I/O that could be async
- Missing connection pooling
- Missing request throttling for external APIs
- Heavy processing that should be a background job

## Phase 3: Memory & Resource Performance

**Step 1: Memory leak patterns**
- Event listeners added but never removed
- Growing collections never pruned (in-memory caches without eviction)
- Closures capturing large objects unnecessarily
- Unclosed streams/connections (especially in error paths)
- Uncleared intervals/timers
- Circular references; large objects in module-level variables

**Step 2: Resource management issues**
- DB connections not returned to pool (especially on error)
- File handles without guaranteed close (missing finally/using/with)
- Unterminated HTTP connections; unmanaged child processes; orphaned temp files

**Step 3: Fix safe issues** — add missing cleanup (event listeners, timers, finally blocks, connection handling). Test after each fix.

##  Phase 4: Frontend Performance

**Skip entirely if no frontend exists.**

**Step 1: Render performance**

*React (adapt for other frameworks):*
- Unnecessary re-renders (missing `React.memo`, `useMemo`/`useCallback`)
- State stored too high in the tree
- Large lists (50+ items) without virtualization
- Expensive computations in render bodies, unmemoized
- Context providers with inline object/array values causing consumer re-renders
- `useEffect` syncing derived state that should be `useMemo`
- Components subscribing to full global state but using a small slice

*Framework-agnostic:*
- Layout thrashing (interleaved DOM reads/writes in loops)
- Forced synchronous layouts (reading computed styles after mutations)
- Expensive CSS selectors in frequently re-rendered areas
- CSS animations on layout-triggering properties (`top`/`left`/`width`/`height`) instead of `transform`/`opacity`
- Large DOM trees (>1500 nodes)

**Step 2: Loading performance**

*Critical rendering path:* What blocks first paint? Synchronous `<head>` scripts, render-blocking CSS, large synchronous imports. Check for `async`/`defer`, inline critical CSS, meaningful loading states.

*Code splitting:* Are routes lazy-loaded? Heavy components (editors, charts, PDF viewers)? Modals/dialogs? Appropriate `Suspense` boundaries?

*Fonts:* Check `font-display` (should be `swap`/`optional`). Preloaded? Count and size of font files. System font fallback to prevent FOIT?

*Images:* `loading="lazy"` below fold? `srcset`/`sizes` for responsive images? Appropriately sized? Modern formats (WebP/AVIF)? Compressed? SVGs for icons where appropriate?

*Third-party scripts:* Inventory all (analytics, chat, A/B, ads, embeds). Loaded async? Blocking main thread? Deferrable? Total weight vs first-party?

**Step 3: Runtime event handlers**
- Scroll/resize handlers without throttle/debounce
- Input handlers triggering expensive ops per keystroke (search, API validation)
- Mouse move handlers on large areas
- Missing `passive: true` on scroll/touch listeners

**Step 4: Animation performance**
- JS animations that could be CSS transitions (compositor thread)
- `setInterval` instead of `requestAnimationFrame`
- Animations triggering layout recalc — use `transform`/`opacity` instead
- Missing `will-change` on confirmed-animated elements (use sparingly)

## Phase 5: Quick Performance Wins
Implement as you go: replace `Array.find` in loops with Map/Set, move invariants out of loops, replace sync file reads with async on hot paths, add early returns, debounce/throttle noisy handlers.

## Output

Save as `audit-reports/25_PERFORMANCE_REPORT_[run-number]_[date]_[time in user's local time].md`. Create directory if needed. Increment run number based on existing reports.

### Report Structure

1. **Executive Summary** — Top 5 issues, severity (critical/high/medium/low), quick wins implemented vs larger efforts needed

2. **Database Performance** — N+1s fixed (with before/after) and unfixed (with reasons). Missing indexes table: Table | Column(s) | Query Location | Migration File. Other query issues with recommendations.

3. **Application Performance** — Expensive operations: Location | Issue | Complexity | Recommendation. Caching: Data | Strategy | Invalidation | Impact. Parallelization implemented/documented.

4. **Memory & Resources** — Leaks fixed, potential leaks needing investigation, resource management gaps.

5.  **Frontend Performance** (skip if no frontend)
- Render: fixes applied (Component | Issue | Fix) and documented for review (Component | Issue | Impact | Effort)
- Loading: what blocks first paint, fixes applied (Area | Before | After), larger recommendations (Opportunity | Impact | Effort)
- Bundle: top 10 largest items (if analyzable)
- Images: Image/Pattern | Issue | Recommendation
- Third-party: Script | Purpose | Size | Async? | Deferrable?
- Event handler and animation fixes applied

6. **Optimizations Implemented** — Every change with before/after. All tests passing: yes/no.

7. **Optimization Roadmap** — Larger efforts ordered by impact with rough effort estimates.

8. **Monitoring Recommendations** — Key metrics, alert-worthy queries,  frontend vitals (LCP, INP, CLS, TTI, bundle size), suggested perf testing approach.

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
