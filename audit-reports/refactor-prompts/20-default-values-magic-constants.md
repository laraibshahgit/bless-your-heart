You are running an overnight default values and magic constants audit. Your job is to systematically inventory every hardcoded default, timeout, limit, threshold, TTL, pool size, and magic constant in the codebase, evaluate whether each is appropriate, and extract the most dangerous ones into named constants or configuration.

Every hardcoded default is a silent assumption about scale, environment, and usage patterns. These are the values that work in dev, work in staging, and break at 3am in production when traffic spikes 10x. A 30-second timeout on a 50ms database call is effectively no timeout. A default page size of 10 when users have 500+ items is death by pagination. A connection pool of 5 on a 200-rps service is a guaranteed bottleneck. Find them all.

Work on branch default-values-audit-[date].

Every network call, database query, lock acquisition, and queue operation needs a timeout. Missing timeouts are worse than bad timeouts — they hang forever.

Step 1: Find every timeout value in the codebase

Timeouts exist at every layer of the stack. A comprehensive search must cover all of them — missing one layer creates a gap where operations can hang indefinitely.

Search for all of these categories:

| Category | What to search for | |----------|-------------------| | HTTP client timeouts | timeout, connectTimeout, readTimeout, socketTimeout, requestTimeout, AbortSignal.timeout, signal: AbortSignal | | Database timeouts | statement_timeout, lock_timeout, idle_in_transaction_session_timeout, connectTimeoutMS, socketTimeoutMS, query_timeout, pool.query timeout options, acquireTimeout, connectionTimeout | | Cache timeouts | Redis BLPOP/BRPOP timeout, connection timeout, command timeout, socket_timeout, connect_timeout | | Queue timeouts | visibilityTimeout, waitTimeSeconds, receiveMessageWaitTimeSeconds, heartbeatTimeout, processingTimeout, acknowledgementTimeout | | Lock timeouts | lockTimeout, acquireTimeout, waitTimeout, distributed lock TTL, mutex timeout | | Session timeouts | maxAge, expires, sessionTimeout, idleTimeout, cookie Max-Age, JWT exp | | WebSocket timeouts | pingTimeout, pingInterval, connectTimeout, handshakeTimeout | | External API timeouts | SDK-specific timeout configurations, REST client timeout settings, gRPC deadline | | Custom timeouts | setTimeout with hardcoded durations, Promise.race with timeout patterns, polling intervals |

Step 2: For each timeout found, document:

Step 3: Find every retry configuration

Search for: retry, retries, maxRetries, retryCount, retryDelay, backoff, backoffMultiplier, maxBackoff, retryAfter, attempts, maxAttempts, exponential backoff patterns, retry-on-error patterns, while loops that catch and retry, recursive calls on failure.

Also check framework-level retry configs that may not be obvious:

For each retry configuration, document:

Calculate the worst-case retry timeline for each configuration:
3 retries with exponential backoff (base 1s, multiplier 2):
Attempt 1: immediate
Attempt 2: +1s
Attempt 3: +2s
Attempt 4: +4s
Total: up to 7 seconds before final failure
Is this total duration acceptable for the calling context? If the API client has a 5s timeout but the retry strategy takes 7s, the client will timeout during retry attempt 3 — wasting the work of attempts 1-2.

Step 4: Flag dangerous timeout and retry patterns

Rate each finding as Critical / High / Medium / Low:

| Pattern | Severity | Example | |---------|----------|---------| | No timeout at all on a network call | Critical | fetch(url) with no timeout — hangs forever if server doesn't respond | | No timeout on database query | Critical | Long-running query holds connection from pool indefinitely | | Timeout longer than caller's timeout | High | Service A gives 5s to Service B, but Service B gives 30s to the DB — Service A already timed out and retried, doubling load | | Retry on non-idempotent operations | High | Retrying a payment charge on timeout — may double-charge | | Library default timeout never overridden | High | Axios default timeout is 0 (infinite), node-fetch default is none | | Retry without backoff | Medium | Hammering a failing service 5 times in <100ms | | Retry without jitter | Medium | All instances retry at the same interval — thundering herd on recovery | | Round-number timeout with no rationale | Medium | timeout: 30000 — was this measured or just "30 seconds sounds right"? | | Timeout set but never tested | Low | Timeout exists but no test verifies the behavior when it triggers |

Step 5: Find MISSING timeouts

This is the most critical substep. Missing timeouts are silent killers — the code works perfectly until a downstream service hangs, and then the entire application grinds to a halt. Search for operations that should have timeouts but don't:

For each missing timeout, estimate the blast radius: What happens when this operation hangs? Does it block a request? Exhaust a connection pool? Freeze a worker? Map the failure cascade:

Good finding: "CRITICAL: paymentService.charge() in checkout.ts:89 calls Stripe with no timeout. If Stripe is slow (happens during outages), requests queue behind the stuck call. The connection pool (max 10) exhausts in ~50 requests. All subsequent checkout attempts fail with 'connection pool exhausted' for the duration of the Stripe outage. Blast radius: 100% of checkout flow."

Bad finding: "Some HTTP calls don't have timeouts."

Step 6: Timeout chain analysis

For critical request paths (checkout, login, data mutation), trace the full timeout chain from the outermost caller to the innermost dependency:
Client (browser) → Load balancer (60s) → API server (30s) → Service B (???) → Database (???)

Unbounded operations are time bombs. Every list, query, and batch operation needs limits. The most dangerous form is an endpoint that works perfectly with 100 rows and silently OOMs the server at 100,000 rows — and nobody notices until the table crosses that threshold 18 months after deployment.

Step 1: Find every page size and limit default

Search for: pageSize, page_size, limit, perPage, per_page, count, take, first, top, maxResults, max_results, batchSize, batch_size, chunkSize, chunk_size, LIMIT, fetchSize, bufferSize, rows, size (in pagination context).

Also check framework-specific pagination:

For each:

Step 2: Find every maximum / upper bound

Search for: maxFileSize, max_file_size, maxBodySize, MAX_, maxItems, maxConnections, maxConcurrent, maxRetries, rateLimit, rate_limit, throttle, MAX_SAFE_INTEGER, upload size limits, request body parsers with size config.

For each:

Step 3: Find MISSING limits — unbounded operations

This is more dangerous than wrong limits. An unbounded operation is a denial-of-service vulnerability waiting to happen — sometimes self-inflicted. Search for:

For each missing limit, estimate: What's the largest realistic input? What happens at 10x that? 100x? Does it OOM? Timeout? Degrade gracefully?

Good finding: "HIGH: GET /api/admin/audit-logs in audit-controller.ts:23 returns all audit logs with no pagination. Table currently has 2.3M rows (based on migration history showing creation 18 months ago). Response would serialize ~500MB of JSON, likely OOMing the server process."

Bad finding: "Some endpoints don't have pagination."

Step 4: Flag problematic pagination patterns

| Pattern | Severity | Example | |---------|----------|---------| | No pagination on a growing table | Critical | SELECT * FROM audit_logs — fine with 100 rows, OOM with 10M | | Default page size mismatched to usage | Medium | Page size 10, most users have 500+ items — 50+ pages to see everything | | No maximum page size (client can request limit=999999) | High | Client sends ?limit=1000000, server loads entire table into memory | | Inconsistent page sizes across similar endpoints | Low | /users?limit=20 default, /orders?limit=50 default — confusing API | | Offset-based pagination on large tables | Medium | OFFSET 100000 scans and discards 100K rows — use cursor-based | | No total count / has-more indicator | Low | Client can't show "page 3 of 47" or know when to stop paginating |

Step 5: Find duplicate or inconsistent limit values

Search for the same logical limit defined in multiple places:

Every cache is a bet that stale data is acceptable for some duration. Audit whether those bets are well-placed.

Step 1: Inventory every cache and TTL

Search for: ttl, TTL, maxAge, max_age, expire, expires, expiresIn, expires_in, EX, PX, PXAT, EXAT, cache-control, Cache-Control, max-age, s-maxage, stale-while-revalidate, stale-if-error, setex, psetex, EXPIRE, PEXPIRE, cacheDuration, cacheTime, staleTTL, gcTime, cachePolicy.

For each cache entry:

Step 2: Evaluate TTL appropriateness

For each cached value, ask:

Flag these patterns:

| Pattern | Severity | Example | |---------|----------|---------| | Permissions/auth cached > 5 minutes | High | User's role cached for 1 hour — revoked admin access still works for up to 1 hour | | Pricing/inventory cached > 1 minute | High | Product price cached 30 minutes — user sees $10, charges $15 | | Round-number TTL with no rationale | Medium | ttl: 3600 — why exactly 1 hour? Was this measured or arbitrary? | | Same TTL for all cache keys | Medium | User profile (changes monthly) and inventory count (changes per second) both cached 5 minutes | | No TTL at all (cache grows forever) | Critical | In-memory cache with no expiration and no eviction — slow memory leak to OOM | | TTL longer than data's useful life | High | Caching a "currently online" status for 15 minutes — useless after 30 seconds | | TTL shorter than query cost justifies | Low | Caching a 2ms query for 60 seconds — overhead of cache management exceeds benefit |

Step 3: Find conflicting TTLs across layers

Trace the full cache stack for important data paths:

Step 4: Find missing cache invalidation

For every write operation that modifies data that's also cached:

Good finding: "HIGH: User permissions cached in Redis with key user:{id}:permissions (TTL 30 minutes). The PUT /api/admin/users/:id/role endpoint updates the role in the database but does NOT invalidate this cache key. After an admin changes a user's role, the user retains their old permissions for up to 30 minutes."

Bad finding: "Cache invalidation could be improved."

Step 5: Token and session expiration

Special attention to security-sensitive TTLs:

For each: Is the duration appropriate for the security sensitivity? Is there a refresh/rotation mechanism? What happens when it expires — graceful redirect or error?

Security TTL guidelines (flag violations):

| Token Type | Recommended Max | Common Mistake | |------------|----------------|----------------| | JWT access token | 15-60 minutes | 24 hours or no expiration — compromised token usable indefinitely | | Refresh token | 7-30 days | No expiration, no rotation — stolen refresh token grants permanent access | | Session cookie | 1-8 hours idle | 30 days or "remember me" with no re-auth for sensitive actions | | Password reset | 15-60 minutes | 24 hours — link forwarded via email is usable the next day | | Email verification | 24-72 hours | No expiration — verification links work forever | | API key | Rotate annually | No expiration, no rotation, no revocation mechanism | | CSRF token | Per-session or per-request | Static across sessions — defeats the purpose | | OAuth access token | 1 hour (provider-dependent) | Not checking expires_in, using token after expiration |

Connection pools and concurrency limits are the valves between your application and its dependencies. Wrong values cause either resource exhaustion (too high) or artificial bottlenecks (too low).

Step 1: Find every connection pool configuration

Search for: pool, poolSize, pool_size, maxConnections, max_connections, minConnections, min_connections, connectionLimit, maxPoolSize, minPoolSize, maxIdle, minIdle, idleTimeoutMillis, acquireTimeoutMillis, createTimeoutMillis, reapIntervalMillis, max, min (in pool config context).

Inventory every pool:

| Pool | Backend | Min | Max | Idle Timeout | Acquire Timeout | Configured or Library Default? | |------|---------|-----|-----|--------------|-----------------|-------------------------------| | Database (primary) | Postgres/MySQL/etc. | ? | ? | ? | ? | ? | | Database (replica) | | ? | ? | ? | ? | ? | | Redis | | ? | ? | ? | ? | ? | | HTTP client | | ? | ? | ? | ? | ? | | Queue consumer | | ? | ? | ? | ? | ? |

Step 2: Evaluate pool sizes against load

For each pool:

Common library defaults to check (these are often wrong for production):

| Library/Framework | Default Pool Size | Appropriate For | |-------------------|-------------------|-----------------| | Knex.js (Postgres) | min: 2, max: 10 | Small apps, not high-traffic | | Sequelize | min: 0, max: 5 | Very small apps only | | TypeORM | 10 | Small-to-medium apps | | Prisma | num_cpus * 2 + 1 | Reasonable for many cases | | HikariCP (Java) | 10 | Small-to-medium apps | | Go sql.DB | 0 (unlimited!) | NEVER appropriate — always set MaxOpenConns | | Python psycopg2 | No pool by default | Connection-per-query overhead | | Redis (ioredis) | 1 connection | Very small apps only | | Axios | Infinity (no limit) | NEVER appropriate — will open unlimited sockets |

Flag these patterns:

| Pattern | Severity | Example | |---------|----------|---------| | Pool size is library default on a production service | High | Default pool size of 5 on a service handling 200 rps — constant pool exhaustion | | No maximum pool size | Critical | Pool grows unbounded under load — exhausts database connections or file descriptors | | No acquire timeout | High | Request waits forever for a pool connection — user sees infinite spinner | | Pool min = max | Medium | No ability to release connections during low traffic — wastes resources | | Idle timeout too short | Medium | Connections constantly churned during normal traffic — overhead of reconnection | | Idle timeout too long or none | Medium | Stale connections held open — may hit database connection limits | | Pool per-request (no pooling) | Critical | New database connection per request — connection setup overhead on every call |

Step 3: Find every concurrency limit

Search for: concurrency, maxConcurrency, max_concurrent, parallelism, workers, threads, maxWorkers, workerCount, prefetch, prefetchCount, maxInFlight, semaphore, throttle, rateLimit, maxParallel.

For each:

Step 4: Find MISSING concurrency limits

Search for parallel/concurrent operations with no cap:

For each: What happens at 10x normal load? 100x? Does it exhaust connections, file descriptors, memory, or CPU?

Good finding: "HIGH: syncAllUsers() in sync-service.ts:34 calls Promise.all(users.map(u => fetchExternalProfile(u))). With 50,000 users, this fires 50,000 concurrent HTTP requests simultaneously. The external API will rate-limit at ~100 rps, and the local HTTP agent will run out of sockets. Should use p-limit or p-map with concurrency cap."

Bad finding: "Concurrency could be limited in some places."

Step 5: Check pool and connection accounting

For every pool found in Step 1:

Find numeric literals and hardcoded strings that embed business decisions, environment assumptions, or undocumented thresholds directly in code. Magic numbers are the most common source of "why does it do that?" questions from new team members and the most common cause of "we changed it in one place but forgot the other three" bugs.

Step 1: Find magic numbers in logic

Search for numeric literals used in conditionals, calculations, and thresholds. Ignore obvious cases (0, 1, -1 as loop bounds; HTTP status codes like 200, 404, 500; array indices; mathematical constants like Math.PI).

Focus on:

| Category | Examples | Why it matters | |----------|---------|---------------| | Business thresholds | if (amount > 10000), if (age >= 18), if (score < 0.7) | Business rules buried in code, not discoverable or changeable without a deploy | | Size limits | 1024 * 1024 * 50 (50MB), 8192 (buffer size), 255 (varchar limit) | Environment-specific assumptions | | Timing values | 1000 (1 second), 86400000 (24 hours), 300 (5 minutes in seconds) | Should be named constants with units in the name | | Scoring/weighting | * 0.8, + 100, / 1.5 | Algorithm parameters that may need tuning | | Counts/quantities | if (results.length > 100), take(50), slice(0, 25) | Arbitrary limits that affect user experience | | Ports | 3000, 8080, 5432, 6379, 27017 | Environment-specific, should be configurable | | Precision/rounding | .toFixed(2), Math.round(x * 100) / 100 | Business decision about decimal precision | | Retry/polling | setInterval(fn, 5000), for (let i = 0; i < 3; i++) | Retry and polling counts embedded in loops |

Step 2: Find hardcoded strings

Search for string literals that represent environment-specific or changeable values:

Language-specific search patterns:

Step 3: Find hardcoded dates and versions

Step 4: Classify each finding

Not all magic numbers are bad. Classify each:

| Classification | Action | Example | |----------------|--------|---------| | Business rule | Extract to named constant, document the rule | MAX_FREE_TIER_PROJECTS = 5 | | Environment-specific | Make configurable (env var or config file) | DATABASE_URL, API_BASE_URL | | Algorithm parameter | Extract to named constant with explanation | RELEVANCE_DECAY_FACTOR = 0.8 // Exponential decay for search ranking | | Convention/standard | Leave as-is, add comment if not obvious | HTTP 200, UTF-8, base64 alphabet | | Duplicated value | Extract to single constant, reference everywhere | Same timeout value in 5 files | | Dangerous hardcode | Flag for immediate attention | API keys, secrets, credentials in code |

Find values that should differ between dev, staging, and production but might be hardcoded to a single value. The most dangerous defaults are "dev-friendly" values that are permissive, verbose, and forgiving — exactly the opposite of what production needs. These defaults work so well in development that nobody thinks to override them for production, and the app launches with debug logging, permissive CORS, disabled rate limits, and long session timeouts.

Step 1: Audit environment variable usage

Produce a complete environment variable inventory:

| Variable | Read In | Default Fallback | Fallback Safe for Prod? | Required? | Documented? | In .env.example? | |----------|---------|------------------|------------------------|-----------|-------------|-------------------|

Step 2: Find "dev-friendly" defaults dangerous in production

| Pattern | Risk | What to check | |---------|------|---------------| | Debug mode defaults to on | High | DEBUG=true, NODE_ENV defaults to development, LOG_LEVEL defaults to debug | | CORS defaults to permissive | High | Access-Control-Allow-Origin: * as default, credentials: true with wildcard origin | | Rate limiting disabled by default | High | Rate limiter only active when explicitly configured | | SSL/TLS verification disabled | Critical | rejectUnauthorized: false, verify=False, InsecureSkipVerify: true as defaults | | Session secrets with default values | Critical | secret: 'keyboard cat', SESSION_SECRET with a fallback string | | Verbose error responses as default | Medium | Full stack traces returned in API responses unless explicitly disabled | | Long session timeouts | Medium | 24-hour sessions in dev that ship to prod — should be 1-2 hours | | Missing security headers | Medium | No Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options | | Admin/debug endpoints with no auth | Critical | /admin/debug, /metrics, /health exposing internals with no auth gate |

Step 3: Check configuration hierarchy and validation

Step 4: Find environment-leaked values

Step 5: Startup behavior on missing configuration

Trace what happens when the application starts with zero configuration (no env vars, no config files, just the code):

Good finding: "CRITICAL: Application starts successfully with no SESSION_SECRET env var — falls back to 'changeme' in auth.ts:12. Every session cookie is signed with the same predictable key. An attacker who knows the codebase (or guesses 'changeme') can forge any session."

Bad finding: "Some config could be better validated."

Consolidate all findings from Phases 1-6 and perform safe mechanical improvements. The inventory is the primary deliverable — it gives the engineering team a complete map of every hidden assumption in the codebase. Extractions (renaming magic numbers to constants) are the secondary deliverable — they make the inventory permanent and the code self-documenting.

Priority: inventory completeness > extraction count. A thorough inventory with zero extractions is more valuable than extracting 50 constants while missing 200 dangerous defaults.

Step 1: Create the complete default value inventory

For every default value found across Phases 1-6, create an inventory entry:

| # | Value | Location (file:line) | Category | Current Value | Configurable? | Documented? | Appropriate? | Risk | Recommendation | |---|-------|---------------------|----------|---------------|---------------|-------------|--------------|------|----------------|

Categories: Timeout, Retry, Pagination, Limit, Cache TTL, Pool Size, Concurrency, Magic Number, Hardcoded String, Environment-Specific, Token/Session.

Step 2: Extract dangerous magic numbers to named constants

For values classified as business rules, algorithm parameters, or duplicated values in Phase 5 Step 4:

Naming convention examples:
// Good: units in name, clear purpose
const HTTP_CLIENT_TIMEOUT_MS = 30_000;
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const SESSION_IDLE_TIMEOUT_MINUTES = 30;
const DEFAULT_PAGE_SIZE = 25;
const MAX_LOGIN_ATTEMPTS = 5;
const SEARCH_RELEVANCE_DECAY_FACTOR = 0.8;

// Bad: ambiguous, no units, unclear purpose
const TIMEOUT = 30000;
const MAX_SIZE = 50;
const LIMIT = 25;
const MAX = 5;
const FACTOR = 0.8;
Extraction priority:

Step 3: Add documentation to undocumented defaults

For every default value that has no inline explanation:

Comment format examples:
// Good comments — explain WHY, not WHAT
const PAYMENT_TIMEOUT_MS = 30_000; // Stripe recommends 30s for payment intents under load
const MAX_BATCH_SIZE = 500; // DynamoDB BatchWriteItem limit is 25 items per call, 500 = 20 batches
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min — PCI DSS requirement for payment-handling sessions
const CACHE_TTL_SECONDS = 300; // TODO: Rationale unknown — was this measured or arbitrary? Verify for production.

// Bad comments — restate the obvious
const TIMEOUT = 30000; // timeout is 30000
const MAX = 500; // maximum is 500
Step 4: Generate a configuration extraction plan

For values that should be configurable but aren't, generate a plan (do NOT implement):

Configuration extraction priority order:

For each value in the plan, document:
Variable:         DATABASE_POOL_MAX
Current hardcode: 5 (in db-config.ts:12)
Safe default:     5 (appropriate for dev, but...)
Prod guidance:    Set to 20-50 based on load testing. Formula: 2 * CPU cores + disk spindles.
Validation:       Integer, min 1, max 100
Risk if missed:   Pool exhaustion under prod traffic — 503 errors on all DB-dependent routes
This plan is for the engineering team to implement after review. Do not implement it overnight.

Step 5: Cross-reference defaults across the stack

Look for the same logical default set at different layers with different values:

For each inconsistency: Which value actually governs behavior? Does the mismatch cause incorrect behavior, confusing errors, or just wasted configuration?

Step 6: Identify defaults that should be tested

For critical defaults (timeouts, pool sizes, rate limits), are there tests that verify the behavior when the limit is hit?

Document which defaults have no test coverage for their edge behavior. These are the defaults most likely to surprise in production.

Step 7: Run tests

After all extractions and documentation additions:

Create the audit-reports/ directory in the project root if it doesn't already exist. Save the report as audit-reports/20_DEFAULT_VALUES_REPORT_[run-number]_[date]_[time in user's local time].md (e.g., 20_DEFAULT_VALUES_REPORT_01_2026-04-05_0312.md). Increment the run number based on any existing reports with the same name prefix in that folder.

| Metric | Count |    |--------|-------|    | Total defaults inventoried | X |    | Missing timeouts (Critical/High) | X / X |    | Unbounded operations | X |    | Cache entries with no/inappropriate TTL | X |    | Connection pools at library defaults | X |    | Magic numbers extracted to constants | X |    | Values needing configuration extraction | X |    | Hardcoded secrets/credentials | X |    | Tests still passing | yes/no |

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
