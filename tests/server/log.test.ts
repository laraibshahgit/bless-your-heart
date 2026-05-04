/**
 * Tests for src/server/log.ts — the AsyncLocalStorage-backed request-scoped
 * logger that auto-attaches `request_id` to every emitted event.
 *
 * Pins the contract:
 *   - resolveRequestId honors `x-nf-request-id` when present, else generates
 *   - generated IDs are non-empty hex
 *   - logEvent / logError attach `request_id` ONLY inside runWithRequestContext
 *   - bare logEvent / logError outside a context omit the field cleanly
 *   - context propagates across `await` (the whole point of AsyncLocalStorage)
 *   - concurrent contexts don't leak into each other
 *
 * Audit run 40/001.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveRequestId,
  runWithRequestContext,
  getRequestContext,
  logEvent,
  logError,
} from '@/server/log';

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function parseLastLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> | null {
  const calls = spy.mock.calls;
  if (calls.length === 0) return null;
  const lastArg = calls[calls.length - 1]?.[0];
  if (typeof lastArg !== 'string') return null;
  try {
    return JSON.parse(lastArg);
  } catch {
    return null;
  }
}

describe('resolveRequestId', () => {
  it('returns x-nf-request-id when the header is present', () => {
    const id = resolveRequestId({ 'x-nf-request-id': 'nf-abc-123' });
    expect(id).toBe('nf-abc-123');
  });

  it('honors the capitalized header variant (defensive)', () => {
    const id = resolveRequestId({ 'X-Nf-Request-Id': 'cap-test' });
    expect(id).toBe('cap-test');
  });

  it('trims surrounding whitespace from the header value', () => {
    const id = resolveRequestId({ 'x-nf-request-id': '  trimmed  ' });
    expect(id).toBe('trimmed');
  });

  it('generates a 16-char hex ID when the header is missing', () => {
    const id = resolveRequestId({});
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });

  it('generates a fresh ID per call (non-collision smoke check)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(resolveRequestId({}));
    // 64 bits of entropy across 100 generations should have zero
    // collisions in any realistic universe.
    expect(ids.size).toBe(100);
  });

  it('treats empty-string header as absent and generates a new ID', () => {
    const id = resolveRequestId({ 'x-nf-request-id': '' });
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });

  it('treats whitespace-only header as absent and generates a new ID', () => {
    const id = resolveRequestId({ 'x-nf-request-id': '   ' });
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe('runWithRequestContext + getRequestContext', () => {
  it('makes the context visible inside the callback', async () => {
    await runWithRequestContext({ requestId: 'req-1' }, async () => {
      const ctx = getRequestContext();
      expect(ctx).toEqual({ requestId: 'req-1' });
    });
  });

  it('returns undefined outside any context (cold-boot init logs stay clean)', () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it('propagates context across await boundaries', async () => {
    await runWithRequestContext({ requestId: 'req-deep' }, async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      expect(getRequestContext()?.requestId).toBe('req-deep');
    });
  });
});

describe('logEvent — request_id attachment', () => {
  it('attaches request_id when called inside runWithRequestContext', async () => {
    await runWithRequestContext({ requestId: 'rid-attached' }, async () => {
      logEvent('test_event', { foo: 'bar' });
    });
    const parsed = parseLastLine(logSpy);
    expect(parsed).toEqual({
      event: 'test_event',
      foo: 'bar',
      request_id: 'rid-attached',
    });
  });

  it('omits request_id field when called outside any context', () => {
    logEvent('cold_boot_event', { phase: 'init' });
    const parsed = parseLastLine(logSpy);
    expect(parsed).toEqual({ event: 'cold_boot_event', phase: 'init' });
    expect(parsed).not.toHaveProperty('request_id');
  });

  it('emits a single console.log call per event', async () => {
    await runWithRequestContext({ requestId: 'r1' }, async () => {
      logEvent('once');
    });
    expect(logSpy).toHaveBeenCalledOnce();
  });

  it('preserves field order: event first, then user fields, then request_id', async () => {
    // Stable field order isn't a hard contract but it makes log lines
    // easier to scan. event first matches the existing convention.
    await runWithRequestContext({ requestId: 'r2' }, async () => {
      logEvent('ordered', { a: 1, b: 2 });
    });
    const lastArg = logSpy.mock.calls[0]?.[0] as string;
    const eventIdx = lastArg.indexOf('"event"');
    const aIdx = lastArg.indexOf('"a"');
    const reqIdx = lastArg.indexOf('"request_id"');
    expect(eventIdx).toBeLessThan(aIdx);
    expect(aIdx).toBeLessThan(reqIdx);
  });

  it('user-supplied request_id field would be overwritten by context (context wins)', async () => {
    // Defensive: a helper that accidentally passes a different request_id
    // shouldn't be able to lie about which request the event belongs to.
    await runWithRequestContext({ requestId: 'context-wins' }, async () => {
      logEvent('test', { request_id: 'user-supplied' });
    });
    const parsed = parseLastLine(logSpy);
    expect(parsed?.request_id).toBe('context-wins');
  });
});

describe('logError — request_id attachment', () => {
  it('routes to console.error and attaches request_id inside context', async () => {
    await runWithRequestContext({ requestId: 'err-rid' }, async () => {
      logError('something_failed', { error: 'boom' });
    });
    const parsed = parseLastLine(errSpy);
    expect(parsed).toEqual({
      event: 'something_failed',
      error: 'boom',
      request_id: 'err-rid',
    });
    // Must not double-emit on console.log.
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('omits request_id outside context', () => {
    logError('cold_error');
    const parsed = parseLastLine(errSpy);
    expect(parsed).toEqual({ event: 'cold_error' });
    expect(parsed).not.toHaveProperty('request_id');
  });
});

describe('runWithRequestContext — concurrency isolation', () => {
  it('two concurrent contexts do not bleed into each other', async () => {
    // The whole point of AsyncLocalStorage. Two requests in flight at
    // once must each see ONLY their own request_id in their log lines.
    const seen: string[] = [];

    async function emit(id: string) {
      await runWithRequestContext({ requestId: id }, async () => {
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        const ctx = getRequestContext();
        seen.push(ctx?.requestId ?? 'NONE');
      });
    }

    await Promise.all([emit('A'), emit('B'), emit('C'), emit('D'), emit('E')]);

    // Each request's context was its own ID — no NONE, no cross-talk.
    expect(seen).toHaveLength(5);
    expect(seen.sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('logEvent called concurrently from different contexts attaches the correct request_id to each line', async () => {
    async function emit(id: string) {
      await runWithRequestContext({ requestId: id }, async () => {
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        logEvent('concurrent_event', { source: id });
      });
    }
    await Promise.all([emit('alpha'), emit('beta'), emit('gamma')]);

    const lines = logSpy.mock.calls
      .map((c) => c[0])
      .filter((s): s is string => typeof s === 'string')
      .map((s) => JSON.parse(s) as Record<string, unknown>);

    expect(lines).toHaveLength(3);
    for (const line of lines) {
      // The source field (passed at the logEvent call site) must equal
      // the request_id field (pulled from context). If contexts leaked,
      // these wouldn't match.
      expect(line.request_id).toBe(line.source);
    }
  });

  it('outer context is restored after a nested context completes', async () => {
    // Should never happen in practice — handler nesting isn't a pattern
    // in this codebase — but pinning the AsyncLocalStorage semantics
    // protects against future surprises.
    await runWithRequestContext({ requestId: 'outer' }, async () => {
      await runWithRequestContext({ requestId: 'inner' }, async () => {
        expect(getRequestContext()?.requestId).toBe('inner');
      });
      expect(getRequestContext()?.requestId).toBe('outer');
    });
  });
});
