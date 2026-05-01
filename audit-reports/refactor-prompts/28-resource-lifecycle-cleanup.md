You are running an overnight resource lifecycle and cleanup audit. Your job is to find every resource the application creates — connections, handles, listeners, timers, temp files, child processes — trace each one from creation to destruction, and verify that destruction actually happens on every code path, especially error paths. Resource leaks are invisible during testing and only surface in production after hours or days of uptime. Find them before they find your users.

Work on branch resource-lifecycle-[date].

Catalog every resource type the codebase creates, acquires, or opens. This inventory is the foundation for all subsequent phases.

Step 1: Database connections

Search for every database connection creation, pool initialization, and connection acquisition.

Flag immediately:

Step 2: HTTP client connections

Search for HTTP client creation: axios.create, fetch, got, node-fetch, undici, http.request, https.request, custom API client classes.

Flag immediately:

Step 3: File handles

Search for all file system operations that open handles: fs.open, fs.createReadStream, fs.createWriteStream, fs.promises.open, file descriptor operations, temp file creation (tmp, tempfile, os.tmpdir()).

Flag immediately:

Step 4: Network sockets and WebSockets

Search for: net.createServer, net.createConnection, WebSocket, ws, socket.io, Socket, raw TCP/UDP sockets, gRPC channels.

Step 5: Cloud service clients

Search for: AWS SDK clients (S3Client, DynamoDBClient, SQSClient, SNSClient), Google Cloud clients, Azure clients, Stripe, Twilio, SendGrid, etc.

Step 6: Other resource types

Search for and catalog any additional resources:

Step 7: Produce the resource inventory table

| # | Resource Type | Creation Location | File:Line | Pool/Singleton? | Max Size | Cleanup Method | Cleanup Location | Notes | |---|---|---|---|---|---|---|---|---| | 1 | Postgres pool | db/connection.ts | :12 | Singleton pool | max: 20 | .end() | server.ts shutdown handler | OK | | 2 | Redis client | cache/redis.ts | :8 | Singleton | N/A | .quit() | None found | MISSING CLEANUP | | 3 | File handle | services/export.ts | :34 | Per-call | N/A | .close() | :42 inside try block | NOT IN FINALLY |

This table is the master reference for all subsequent phases.

For each resource in the inventory, trace the complete lifecycle on the happy path (no errors thrown).

Step 1: Creation-to-cleanup tracing

For each resource instance:

Flag:

Step 2: ORM and database query lifecycle

For each database query pattern:

Example of a subtle leak:
// BAD: if processResults throws, connection is never released
const conn = await pool.getConnection();
const results = await conn.query('SELECT ...');
await processResults(results);  // throws here
conn.release();                  // never reached

// GOOD: finally guarantees release
const conn = await pool.getConnection();
try {
const results = await conn.query('SELECT ...');
await processResults(results);
} finally {
conn.release();
}
Step 3: Stream lifecycle

For every readable and writable stream:

Step 4: HTTP response lifecycle

For every outgoing HTTP request:

Step 5: Produce the happy path verification table

| # | Resource | Created | Cleaned Up | Same Scope? | Lifecycle Rating | |---|---|---|---|---|---| | 1 | DB connection in getUser() | :47 | :62 (release) | Yes, try/finally | OK | | 2 | File stream in exportCSV() | :23 | :41 (.end) | Yes, but no finally | FRAGILE | | 3 | Redis connection in cacheWarm() | :12 | Never | N/A | LEAK |

This is the most critical phase. Most code cleans up resources on the happy path. Leaks live in catch blocks, rejected promises, and early returns after acquisition.

Step 1: try/catch without finally

Search for every try { ... } catch { ... } block that acquires or uses a resource. For each:

Pattern to find:
// LEAK: catch logs but does not release
const conn = await pool.getConnection();
try {
await conn.query('INSERT ...');
} catch (err) {
logger.error('Insert failed', err);
throw err;  // connection leaked
}
Correct pattern:
const conn = await pool.getConnection();
try {
await conn.query('INSERT ...');
} catch (err) {
logger.error('Insert failed', err);
throw err;
} finally {
conn.release();  // always runs
}
Step 2: Resource creation before try block

Search for patterns where a resource is created, then additional code runs before the try block. If that intermediate code throws, the try/finally never executes and the resource leaks.
// LEAK: if validateInput throws, the connection leaks
const conn = await pool.getConnection();
const validated = validateInput(data);  // throws here — no try block yet
try {
await conn.query('INSERT ...', validated);
} finally {
conn.release();
}
Correct pattern:
const conn = await pool.getConnection();
try {
const validated = validateInput(data);  // now inside the try
await conn.query('INSERT ...', validated);
} finally {
conn.release();
}
Search for this pattern with every resource type: connection acquisition followed by non-trivial code before the protective try block.

Step 3: Promise chains without cleanup

Search for .then().catch() chains that acquire resources:

// LEAK: catch swallows the error, resource never cleaned up
getConnection()
.then(conn => conn.query('SELECT ...'))
.catch(() => null);  // connection silently leaked
Step 4: Async/await without try/finally

Search for async functions that acquire resources but lack try/finally:
// LEAK: if query throws, handle is never closed
async function processFile(path) {
const handle = await fs.promises.open(path, 'r');
const data = await handle.readFile();  // throws here
await handle.close();                   // never reached
}
Check every async function that acquires a resource. Does it protect cleanup with try/finally or the using keyword?

Step 5: Conditional returns that skip cleanup

Search for early returns or conditional branches after resource acquisition:
// LEAK: early return skips cleanup
const conn = await pool.getConnection();
const user = await conn.query('SELECT ...');
if (!user) {
return null;  // connection leaked
}
// ... more work ...
conn.release();
Step 6: Callback-based resource acquisition

For callback-style APIs (common in older Node.js code):
// LEAK: if processData throws, the file descriptor leaks
fs.open('file.txt', 'r', (err, fd) => {
if (err) return callback(err);
processData(fd);  // throws — fd never closed
fs.close(fd, callback);
});
Check every callback that receives a resource handle. Is there error handling that includes cleanup?

Step 7: Error paths in constructors and initialization

Search for classes that acquire resources in their constructor or init() method:

// LEAK: if Redis connection fails, DB pool is never closed
class AppServices {
constructor() {
this.db = new Pool(dbConfig);      // acquired
this.redis = new Redis(redisUrl);  // throws — db pool leaked
}
}
Step 8: Produce the error path findings table

| # | Resource | File:Line | Error Path Issue | Severity | Fix Complexity | |---|---|---|---|---|---| | 1 | DB conn in createOrder() | orders.ts:89 | catch block at :95 logs but never releases connection | High | Low — add finally | | 2 | File handle in importCSV() | import.ts:23 | No try/finally around file operations | High | Low — wrap in try/finally | | 3 | Temp file in generatePDF() | pdf.ts:45 | Error at :52 skips unlink at :67 | Medium | Low — move unlink to finally |

Event listeners and subscriptions are a distinct leak category: they pin objects in memory, accumulate silently, and degrade performance gradually rather than crashing immediately.

Step 1: Inventory all event registrations

Search for every:

For each registration, document: event name, target object, handler function, file and line.

Step 2: Match registrations to removals

For every event listener added, find the corresponding removal:

Step 3: Detect accumulating listeners

These are the hardest leaks to spot — listeners added repeatedly without removal:

``javascript   // LEAK: adds a new listener on every iteration   items.forEach(item => {     eventBus.on('update', () => handleUpdate(item));   });   ``

``javascript   // LEAK: called on every route change, adds a new listener each time   function setupPage() {     window.addEventListener('resize', handleResize);     // never removed — accumulates on every navigation   }   ``

``javascript   // LEAK: new listener on every render, old ones never removed   useEffect(() => {     socket.on('message', handleMessage);     // missing: return () => socket.off('message', handleMessage);   });   ``

``javascript   // CANNOT REMOVE: anonymous function creates a new reference each time   element.addEventListener('click', () => doSomething());   // element.removeEventListener('click', ???) — no reference to remove   ``

Step 4: Listeners on long-lived objects

Check for listeners registered on objects that outlive the registering component:

Each of these accumulates listeners over the lifetime of the application.

Step 5: Node.js MaxListeners warnings

Search for:

Step 6: Produce the listener lifecycle table

| # | Event | Target | Registered At | Removed At | Lifecycle Rating | |---|---|---|---|---|---| | 1 | resize | window | Dashboard.tsx:34 useEffect | Dashboard.tsx:36 cleanup | OK | | 2 | message | socket | Chat.tsx:22 useEffect | Never | LEAK | | 3 | data | stream | processor.ts:67 | processor.ts:89 .off() | OK but fragile — not in finally | | 4 | error | process | middleware.ts:12 | Never (intentional — global) | OK — singleton |

Timers and intervals are the second most common "silent accumulator" after event listeners. An orphaned setInterval runs forever, consuming CPU and potentially triggering side effects long after its purpose has passed.

Step 1: Inventory all timers

Search for every:

For each timer, document: type, purpose, interval/delay, file and line, the variable holding the timer ID.

Step 2: Match creation to cleanup

For every setInterval: is there a clearInterval with the same timer ID? Under what conditions is it cleared?

For every setTimeout: in most cases, setTimeout is fire-and-forget and does not need clearing. But check:

For requestAnimationFrame loops: is there a cancelAnimationFrame when the animation should stop?

Step 3: Detect orphaned intervals

These are the highest-risk timer leaks:

``javascript   // LEAK: interval survives component unmount   useEffect(() => {     const id = setInterval(fetchData, 5000);     // missing: return () => clearInterval(id);   }, []);   ``

``javascript   class Poller {     start() {       this.intervalId = setInterval(() => this.poll(), 1000);     }     // no stop() method, or stop() exists but is never called   }   ``

``javascript   // LEAK: timer ID lost — cannot clear it   function startPolling() {     setInterval(checkStatus, 5000);  // no variable stores the ID   }   ``

``javascript   // LEAK: every button click starts a new interval   button.addEventListener('click', () => {     setInterval(animate, 16);  // accumulates intervals   });   ``

Step 4: Overlapping execution detection

For intervals where the callback is async or long-running:

// DANGEROUS: if fetchData takes >5s, executions overlap
setInterval(async () => {
await fetchData();  // takes 6 seconds sometimes
}, 5000);

// SAFE: next execution waits for current to finish
async function pollLoop() {
await fetchData();
setTimeout(pollLoop, 5000);
}
Step 5: Produce the timer lifecycle table

| # | Timer Type | Purpose | Created At | Cleared At | Overlap Risk? | Lifecycle Rating | |---|---|---|---|---|---|---| | 1 | setInterval | Health check | monitor.ts:23 | monitor.ts:45 stop() | No (sync callback) | OK | | 2 | setInterval | Data refresh | Dashboard.tsx:18 | Never | No | LEAK | | 3 | setTimeout | Retry delay | api.ts:67 | N/A (fire-and-forget) | N/A | OK | | 4 | setInterval | Queue poll | worker.ts:34 | Shutdown handler | Yes — async callback | OVERLAP RISK |

Temporary files, in-memory buffers, caches, and generated artifacts accumulate silently and consume disk space and memory over time.

Step 1: Temporary file lifecycle

Search for all temporary file creation:

For each temp file creation:

Flag immediately:

Step 2: Upload handling lifecycle

For every file upload endpoint:

Step 3: In-memory buffer lifecycle

Search for large in-memory allocations:

Flag:

Step 4: Cache eviction audit

For every in-memory cache (Map, Object, LRU cache, node-cache, custom cache):

For every Redis/Memcached cache:

Flag immediately:

Step 5: Generated artifact cleanup

Search for code that generates files for export or download:

Step 6: Produce the temporary resource table

| # | Resource | Type | Created At | Cleaned Up At | On Error? | Accumulation Risk | |---|---|---|---|---|---|---| | 1 | Upload temp file | Disk | upload.ts:34 multer | upload.ts:78 unlink | No — error skips unlink | HIGH — files accumulate on errors | | 2 | Export CSV | Disk | export.ts:23 | Never | N/A | CRITICAL — ~500MB/month | | 3 | Session cache | Memory Map | auth.ts:12 | Never (no eviction) | N/A | HIGH — grows per-session forever | | 4 | Redis token cache | Redis | token.ts:45 | TTL: 1h | N/A | OK — TTL handles cleanup |

Child processes and worker threads consume OS resources (PIDs, memory, file descriptors) and can become zombies, orphans, or resource hogs if not properly managed.

Step 1: Inventory all child process creation

Search for every:

For each:

Step 2: Process cleanup verification

For each child process:

Step 3: Zombie process detection

A zombie process occurs when a child exits but the parent never reads its exit status (never listens for exit event). The OS keeps the process entry in the process table.

Search for:

Step 4: Worker thread lifecycle

For each Worker thread:

Step 5: Stdio handling

For child processes using pipe for stdio:

Flag immediately:

Step 6: Produce the process lifecycle table

| # | Process/Worker | Command | Created At | Killed/Terminated At | Error Handling? | Shutdown Cleanup? | Rating | |---|---|---|---|---|---|---|---| | 1 | FFmpeg transcode | ffmpeg -i ... | video.ts:34 | :67 on exit event | Yes | No — orphaned on restart | NEEDS FIX | | 2 | Worker pool | CPU-heavy computation | pool.ts:12 | Pool.terminate() | Yes | Yes — shutdown handler | OK | | 3 | Shell exec | git log | deploy.ts:56 | Fire-and-forget | No | No | ZOMBIE RISK |

Even if individual resources are cleaned up during normal operation, the application must also clean up everything when shutting down. This phase verifies the shutdown path specifically.

Step 1: Signal handler inventory

Search for SIGTERM, SIGINT, beforeExit, exit, and uncaughtException/unhandledRejection handlers.

Step 2: Shutdown resource checklist

Verify that the shutdown handler closes/releases every resource from the Phase 1 inventory:

| Resource | Closed on Shutdown? | How? | |---|---|---| | Database pool | ? | pool.end() in shutdown handler | | Redis client | ? | redis.quit() in shutdown handler | | HTTP server | ? | server.close() in shutdown handler | | WebSocket connections | ? | wss.close() in shutdown handler | | Background intervals | ? | clearInterval() in shutdown handler | | Child processes | ? | child.kill() in shutdown handler | | File watchers | ? | watcher.close() in shutdown handler | | Temp files | ? | Cleanup sweep in shutdown handler |

Flag every resource from Phase 1 that is NOT cleaned up during shutdown.

Step 3: Shutdown order

Shutdown must happen in the correct order:

Check whether the application's shutdown sequence follows this order or has dependencies that could deadlock (e.g., trying to log to a database that's already closed).

Step 4: Double-signal handling

What happens if SIGTERM is sent twice? (Common in container orchestration)

Apply fixes for clearly correct resource lifecycle issues found in Phases 1-8. Prioritize by severity and confidence.

Priority order:

For each fix:

Do NOT fix:

Write tests for resource cleanup:

Example test patterns:
// Test: connection released on error
it('releases connection when query fails', async () => {
const pool = createTestPool();
const activeCount = () => pool.totalCount - pool.idleCount;

try {
await serviceFunction({ causeError: true });
} catch {}

expect(activeCount()).toBe(0);  // connection was returned to pool
});

// Test: interval cleared on destroy
it('clears polling interval on destroy', () => {
const service = new PollingService();
service.start();
expect(service.intervalId).toBeDefined();

service.destroy();
expect(service.intervalId).toBeNull();
});

Create audit-reports/ in project root if it does not exist. Save as audit-reports/28_RESOURCE_LIFECYCLE_REPORT_[run-number]_[date]_[time in user's local time].md (e.g., 28_RESOURCE_LIFECYCLE_REPORT_01_2026-04-05_0317.md). Increment the run number based on any existing reports with the same prefix in that directory.
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
