import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

// Request-scoped logging context. Solves the per-request correlation
// problem without threading a `requestId` parameter through every helper
// signature.
//
// HOW IT WORKS
// AsyncLocalStorage is Node's built-in request-context primitive
// (stable since 16.4). The handler wraps its work in `runWithRequestContext`,
// which seeds a per-request store. Any code that runs inside that callback —
// including awaited helpers in anthropic.ts / safety.ts / validation.ts —
// can call `logEvent('foo')` and the resulting log line picks up the
// `request_id` automatically.
//
// WHY IT MATTERS FOR OPS
// Pre-fix, the existing structured-log lines emitted per request did not
// share an identifier. A single user request that retried twice and then
// safe-fell-back produced ~6 separate JSON lines (`gen_retry × 2`,
// `gen_anthropic_error × N`, `gen_safe_fallback`) with no way to tell
// they belonged to the same request — especially under concurrent traffic
// where lines from many requests interleave. With a `request_id` field,
// `grep '"request_id":"abc123"'` returns the full timeline of one user's
// generation: which retry attempts, which classifier, which photo rung.
//
// REQUEST ID SOURCE PRIORITY
//   1. `x-nf-request-id` header — Netlify sets this on every function
//      invocation. It's the same ID the Netlify dashboard displays, which
//      means a customer's request ID is searchable end-to-end through the
//      Netlify Function Logs UI.
//   2. Random 16-char hex — fallback when the header is absent
//      (server-to-server clients, local `netlify dev`, or some custom
//      edge configurations).
//
// COST
// AsyncLocalStorage has near-zero overhead in modern V8 — a couple of
// nanoseconds per async hop, which is invisible against the 12s Anthropic
// budget. crypto.randomBytes(8) is similarly cheap (microsecond range)
// and only fires on the rare miss path.
//
// SCOPE
// This is server-only — `node:async_hooks` is a Node API and would crash
// the browser bundle. The module sits under `src/server/` so the existing
// CLAUDE.md "never import server into client" guard catches accidental
// reuse.
//
// Audit run 40/001.

interface RequestContext {
  requestId: string;
  // Future expansion: clientIp hash, geo, user-agent class, etc. Adding
  // fields here is a 1-line change in the helper functions below.
}

const storage = new AsyncLocalStorage<RequestContext>();

// 16 hex chars (64 bits of entropy) — same shape as Netlify's own
// request-id format, plenty for non-collision in any realistic traffic
// volume. We don't need cryptographic uniqueness; we need
// human-greppable, dashboard-friendly correlation. Truncating to 16
// chars keeps log lines compact.
function generateRequestId(): string {
  return randomBytes(8).toString('hex');
}

// Pull a stable request ID from headers if available. Netlify provides
// `x-nf-request-id` on every function invocation; honoring it lets ops
// correlate Netlify-side logs (function invocation timing, edge cache
// hits/misses) with our application logs. If the header is missing we
// generate one — that path is hit during local `netlify dev`, in tests,
// and on the rare event Netlify omits the header.
export function resolveRequestId(headers: Record<string, string | undefined>): string {
  // Netlify always sends lowercase header keys, but we normalize for
  // safety against future runtime changes.
  const fromHeader = headers['x-nf-request-id'] ?? headers['X-Nf-Request-Id'];
  if (typeof fromHeader === 'string' && fromHeader.trim() !== '') {
    return fromHeader.trim();
  }
  return generateRequestId();
}

// Run `fn` with the given request context active for its entire async
// subtree. `logEvent` and `logError` calls inside `fn` (or any awaited
// helper) will pick up the context automatically.
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

// Structured event log. Auto-merges the request_id field when called from
// inside a `runWithRequestContext` scope. Outside a scope the field is
// omitted entirely (rather than logged as `undefined` or `null`) so cold
// boot/init logs stay clean.
//
// The shape mirrors the existing `console.log(JSON.stringify({ event,
// ...fields }))` convention used across the codebase — drop-in
// replacement.
export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  const context = storage.getStore();
  const line: Record<string, unknown> = { event, ...fields };
  if (context !== undefined) line.request_id = context.requestId;
  console.log(JSON.stringify(line));
}

// Same as `logEvent` but routes through `console.error`. Use for
// fail-open / unexpected-but-recovered cases (matches the existing
// `*_failed` event-naming convention).
export function logError(event: string, fields: Record<string, unknown> = {}): void {
  const context = storage.getStore();
  const line: Record<string, unknown> = { event, ...fields };
  if (context !== undefined) line.request_id = context.requestId;
  console.error(JSON.stringify(line));
}
