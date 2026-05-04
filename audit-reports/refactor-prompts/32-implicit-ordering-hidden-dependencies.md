You are running an overnight implicit ordering and hidden dependency audit. Your job: find every place in the codebase where code produces correct results by coincidence — because things happen to execute in the right order, load in the right sequence, or return in the right arrangement — but nothing enforces that order. These are the bugs that appear when you upgrade Node, change your bundler, add a database index, or scale to multiple servers.

This is primarily a READ-ONLY analysis. Do not create a branch. Only apply fixes where adding an explicit ORDER BY, inserting a documenting comment, or making an ordering constraint explicit is purely mechanical and cannot change behavior.

Other prompts analyze what the code does. This one asks what the code assumes. A query that returns rows in insertion order works perfectly — until autovacuum rearranges the heap, a parallel sequential scan reads pages out of order, or a new index changes the planner's strategy. Middleware that runs auth before permissions works perfectly — until someone reorders a require() call. An initialization sequence that connects to the database before warming the cache works perfectly — until an async refactor lets both run concurrently.

Everything "suddenly" breaks even though "nothing changed." The code was never correct. It was lucky.

This prompt finds every place the code is lucky, quantifies the blast radius when luck runs out, and either makes the ordering explicit (where mechanical and safe) or documents exactly what will break and when.

The most common source of implicit ordering bugs. Databases do NOT guarantee row order unless you ask for it.
Search the entire codebase for:

For each query found, record: file, line number, the query or ORM call, and whether an ORDER BY is present.
For every query without ORDER BY, follow the data to where it's used:

Search specifically for these high-risk patterns:

| # | File:Line | Query / ORM Call | Has ORDER BY? | Consumer Location | Consumer Assumes Order? | What Breaks | Severity | |---|-----------|-----------------|---------------|-------------------|------------------------|-------------|----------| | 1 | users.repo.ts:47 | prisma.user.findMany({ where: ... }) | No | user-list.tsx:12 | Yes — renders as ordered list | List order randomizes on DB engine upgrade | High |

Severity guide:

Middleware frameworks execute handlers in registration order. That order is often implicit — defined by which file gets loaded first, or which app.use() call appears earlier in a file nobody reads carefully.
For every middleware that reads something from the request/context (e.g., req.user, req.session, context.auth, req.body), trace backward:

Common dangerous patterns:

Search for middleware registration (app.use, router.use, plugin registration) across all files. If middleware is registered in more than one file:

Search for middleware that modifies the request object, response object, context, or any shared state:

| # | Middleware | File:Line | Reads | Writes | Depends On | Order Enforced? | Risk If Reordered | |---|-----------|-----------|-------|--------|------------|-----------------|-------------------|

Mark each as: Enforced (explicit documentation or framework guarantee), Convention (team knows the order but nothing prevents reordering), or Coincidental (just happens to work).

Application startup is a directed acyclic graph of dependencies. If the graph is implicit, adding a new service or changing an initialization to be async can cascade failures.
Starting from the entry point (main.ts, index.ts, app.py, server.js, etc.), trace every initialization step in order:

For each, record: what it does, what it depends on, whether it's synchronous or asynchronous, and whether the dependency is enforced or coincidental.
Look for:

| # | Initialization Step | File:Line | Depends On | Async? | Awaited? | Order Enforced? | Failure Mode If Reordered | |---|-------------------|-----------|------------|--------|----------|-----------------|--------------------------|

Event-driven code is inherently unordered unless explicitly sequenced. Multiple listeners on the same event, multiple promises in flight, async callbacks in loops — all of these have ordering assumptions that may not hold.
Find every event emitter in the codebase (Node.js EventEmitter, custom event buses, DOM events, framework-specific events like Angular @Output(), Vue $emit, Svelte dispatch):

Search for patterns where code assumes promises execute or resolve in a specific order:

``javascript   // DANGEROUS: These may execute in any order   await Promise.all(users.map(u => createUser(u)));   // If user B references user A (foreign key), this may fail intermittently   ``

Search for these specific anti-patterns:

```javascript   // BUG: All callbacks fire simultaneously, order is not guaranteed   items.forEach(async (item) => {     await processItem(item);   });

// CORRECT: Sequential processing   for (const item of items) {     await processItem(item);   }   ```

| # | Pattern | File:Line | Event/Promise | Ordering Assumption | Enforced? | Breaks When | Severity | |---|---------|-----------|---------------|--------------------|-----------|-----------  |----------|

Module loading order is one of the most invisible sources of ordering dependencies. Side effects on import create hidden contracts between modules.
Search for modules that execute code at the top level (outside of function/class definitions):

For each, record: what side effect occurs, what depends on it, and whether importing this module first is documented anywhere.
Barrel files (index.ts, index.js) that re-export from multiple modules:
// index.ts - what order do these execute?
export * from './config';      // Sets up environment
export * from './database';    // Connects to DB using environment
export * from './models';      // Registers models on the connection
export * from './routes';      // Uses the models

Search for dynamic import() calls (ESM) and conditional require() calls (CJS):

| # | Module | File:Line | Side Effect | Depends On (Order) | Enforced? | Breaks When | Severity | |---|--------|-----------|-------------|--------------------|-----------|-----------  |----------|

If the project has no frontend, skip this phase entirely and note "Phase 6 skipped — no frontend code detected" in the report.

CSS specificity is the explicit ordering mechanism. But when specificity is equal, source order determines which rule wins — and source order in bundled CSS depends on import order, chunk splitting, and build tool behavior that can change between builds.
Search for cases where two CSS rules target the same element with the same specificity:

If the project uses CSS-in-JS (styled-components, Emotion, vanilla-extract, Stitches, Linaria):

If the project uses Tailwind CSS or similar utility frameworks:

| # | Conflict | Files Involved | Resolution Mechanism | Currently Works Because | Breaks When | Severity | |---|----------|---------------|---------------------|------------------------|-------------|----------|

Tests that pass in sequence but fail in isolation or random order are the canary in the coal mine — they prove that implicit ordering exists somewhere in the codebase.
Search test files for:

| # | Test File | Depends On | Shared State | Breaks When | Currently Caught? | Severity | |---|-----------|------------|-------------|-------------|------------------|----------|

Apply mechanical, behavior-preserving fixes where safe. Document everything else with specific "will break when..." scenarios.
For every query identified in Phase 1 where:

Add the explicit ORDER BY. This makes the existing behavior guaranteed rather than coincidental.

Do NOT add ORDER BY where:

For every implicit ordering dependency found in Phases 2-6 that cannot be mechanically fixed, add a code comment at the dependency site:
// ORDER DEPENDENCY: This middleware must run after authMiddleware (registered in server.ts:42)
// because it reads req.user which authMiddleware populates.
// If middleware registration order changes, this will fail silently — requests will
// appear unauthenticated to this handler.
// ORDER DEPENDENCY: This import must appear before ./models because it registers
// the database connection that models use at module scope.
// See also: ./models/index.ts:3 (first usage of connection)
The comment format is: ORDER DEPENDENCY: followed by what depends on what, why, and what breaks if the order changes. This makes implicit ordering searchable (grep "ORDER DEPENDENCY") and visible during code review.
If the project lacks startup order documentation, create or update a section in an appropriate documentation file (README, ARCHITECTURE.md, or inline at the entry point) that lists the initialization sequence and why the order matters:
## Startup Order
1. Load environment variables (dotenv) — must be first, everything reads process.env
2. Initialize logger — must be before database, logs connection events
3. Connect to PostgreSQL — must be before ORM model registration
4. Register ORM models — must be before route handlers that query them
5. Connect to Redis — must be before session middleware
6. Register middleware (see Middleware Order below)
7. Register routes
8. Start HTTP server — must be last, only accept traffic when ready
If middleware order is not documented, add a block comment at the middleware registration site listing the order and the reasoning:
// MIDDLEWARE ORDER (do not reorder without understanding dependencies):
// 1. requestId    — Generates unique ID, must be first for tracing
// 2. logger       — Logs request start, needs requestId
// 3. cors         — Must run before auth to handle preflight
// 4. bodyParser   — Must run before validation
// 5. rateLimit    — Must run before expensive operations
// 6. auth         — Populates req.user, must run before authz
// 7. authz        — Checks permissions, needs req.user from auth
// 8. validation   — Validates parsed body, needs bodyParser
// 9. routes       — Application logic, needs everything above
// 10. errorHandler — Must be last to catch all errors
If the initialization sequence is a flat list of await calls and the dependencies between them are clear, convert to an explicit dependency structure. Only do this if the conversion is mechanical (reordering await calls, adding await to un-awaited promises) and does not require architectural changes.

Example of a safe mechanical fix:
// BEFORE: Order happens to be correct, but nothing prevents reordering
await connectDatabase();
await connectRedis();
await warmCache();        // Depends on both database and Redis
await startHttpServer();  // Depends on everything

// AFTER: Dependencies explicit in code structure
await connectDatabase();
await connectRedis();
// Both connections must be established before cache warming
await warmCache();
// All services must be ready before accepting traffic
await startHttpServer();
Add comments explaining the dependency — even if the code order doesn't change, the comments prevent future reordering.

Do NOT refactor initialization into a dependency injection container, a topological sort system, or any other architectural change. Those are recommendations, not overnight fixes.

Create audit-reports/ in project root if needed. Save as audit-reports/32_IMPLICIT_ORDERING_REPORT_[run-number]_[date]_[time in user's local time].md, incrementing run number based on existing reports with prefix 31_.

| Directory | DB Ordering | Middleware | Startup | Events | Imports | CSS | Tests | Total Findings |    |-----------|------------|------------|---------|--------|---------|-----|-------|---------------|

Complete table from Phase 1, Step 5. Every unordered query with consumer analysis.

Summary statistics:    | Metric | Count |    |--------|-------|    | Total multi-row queries found | |    | Queries without ORDER BY | |    | Queries where consumer assumes order | |    | "Take first" patterns without ORDER BY | |    | Safe ORDER BY fixes applied | |

Complete table from Phase 2, Step 5. Full middleware chain with dependency analysis.

Highlight any middleware pairs where: (a) the dependency is undocumented, (b) they are registered in different files, and (c) reordering would cause a security or data integrity issue.

Complete table from Phase 3, Step 5. Full startup sequence with dependency analysis.

Specific callouts for:    - Services accepting requests before fully initialized    - Async initialization not properly awaited    - Circular initialization dependencies

Complete table from Phase 4, Step 5. Every event emitter multi-listener situation and Promise ordering issue.

Specific callouts for:    - forEach with async callbacks (almost always a bug)    - Promise.all with order-dependent side effects    - Listeners that assume execution order

Complete table from Phase 5, Step 5. Every import with side effects and its dependencies.

Specific callouts for:    - Barrel files where re-export order matters    - Dynamic imports with timing dependencies    - Polyfill/patch imports that must load first

Complete table from Phase 6, Step 5. Every specificity tie resolved by load order.

Complete table from Phase 7, Step 5. Every test with implicit ordering dependency.

Specific callouts for:    - Tests that would fail if run in isolation    - Hardcoded auto-increment IDs in assertions    - Shared mutable state between test files

| # | File | Change | Type | Commit |     |---|------|--------|------|--------|

Types: ORDER BY added, Comment added, Documentation added, Await added

If no fixes were applied (everything was too risky for mechanical fixing), state that explicitly.

Priority-ordered list of ordering issues that require human judgment to fix:     | # | Issue | Location | What to Do | Risk if Ignored | Effort | Related Findings |     |---|-------|----------|-----------|-----------------|--------|-----------------|

Focus on:     - High-severity implicit ordering that can't be mechanically fixed     - Architectural changes that would eliminate entire categories of ordering issues (dependency injection, explicit middleware registries, etc.)     - Areas that need deeper investigation beyond this audit's scope (concurrency protections, infrastructure startup concerns)

For each Critical and High severity finding, write a concrete scenario:     | # | Finding Ref | Scenario | Trigger | Impact | Likelihood |     |---|------------|----------|---------|--------|------------|

Good example:     | 7 | DB-03 | User list displays in random order | DBA adds index on users.email column, causing PostgreSQL optimizer to prefer index scan over sequential scan | Users see contacts in random order instead of alphabetical; support tickets filed about "broken" contact list | High — any index change on the users table triggers this |

Bad example:     | 7 | DB-03 | Query might return wrong order | Database changes | List looks wrong | Medium |

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish. Do not make the user open the report to get the highlights. The chat summary should include:
One sentence: what you did, how long it took, and whether all tests still pass.
The most important things discovered — bugs, risks, wins, or surprises. Each bullet should be specific and actionable, not vague. Lead with severity or impact.

Good: "CRITICAL: No backup configuration found for the primary Postgres database — total data loss risk." Bad: "Found some issues with backups."
Bullet list of what was actually modified, added, or removed. Skip this section for read-only analysis runs.
If there are legitimately beneficial recommendations worth pursuing right now, present them in a table. Do not force recommendations — if the audit surfaced no actionable improvements, simply state that no recommendations are warranted at this time and move on.

When recommendations exist, use this table format:

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details | |---|---|---|---|---|---| | Sequential number | Short description (≤10 words) | What improves if addressed | Low / Medium / High / Critical | Yes / Probably / Only if time allows | 1–3 sentences explaining the reasoning, context, or implementation guidance |

Order rows by risk descending (Critical → High → Medium → Low). Be honest in the "Worth Doing?" column — not everything flagged is worth the engineering time. If a recommendation is marginal, say so.
State the full path to the detailed report file for deeper review.

Formatting rules for chat output:
