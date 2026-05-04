/**
 * Boundary integration tests — rate-limit BEHAVIOR through the handler.
 *
 * The other integration test (`generate-integration.test.ts`) bypasses the
 * rate-limit branch entirely via `RATE_LIMIT_PER_HOUR=9999`. The contract test
 * (`generate-contract.test.ts`) covers the rate_limited response SHAPE for
 * a single mocked-deny case but does not exercise the timeout race or the
 * fail-open path.
 *
 * This file fills three operational gaps in `netlify/functions/generate.ts:55-72`:
 *
 *   1. The 3-second `Promise.race` timeout. If Firestore stalls, the function
 *      MUST log `rate_limit_check_failed` and continue serving the user — the
 *      product contract ("user always gets a poster") trumps strict rate
 *      limiting under infrastructure failure.
 *
 *   2. The catch-block fail-open. If `checkAndIncrementRateLimit` throws
 *      synchronously OR rejects, the request MUST proceed to generation.
 *
 *   3. The deny-allowed boundary. When rate-limit returns `allowed: false`,
 *      the handler MUST short-circuit before any Anthropic call.
 *
 * Why a separate file:
 *   - generate-integration.test.ts uses module-scope env writes that DISABLE
 *     the rate-limit branch (RATE_LIMIT_PER_HOUR='9999'). Per CLAUDE.md, those
 *     module-scope writes are load-bearing — they MUST sit above the import.
 *     Mixing the two regimes in one file would either re-import the module
 *     (slow) or leak env state.
 *   - This file's env writes intentionally enable the rate-limit branch so
 *     the wrapper code in generate.ts:55-72 is actually exercised.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { anthropicCreate, rateLimitCheck } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  rateLimitCheck: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

// Stable Timestamp.now() — captures Date.now() at construction so .toMillis()
// returns the same value on repeated reads (matches the shape used in
// rateLimit-extended.test.ts to avoid 1ms-drift TTL flakes).
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => {
      const ms = Date.now();
      return { toMillis: () => ms };
    },
    fromMillis: (ms: number) => ({ toMillis: () => ms }),
  },
}));

vi.mock('@/server/slur-list', () => ({ slurList: ['testblockedslur'] }));

vi.mock('@/server/firebaseAdmin', () => ({
  getDb: () => {
    throw new Error('getDb should not be called when checkAndIncrementRateLimit is mocked');
  },
}));

// Crucial: this mock OVERRIDES the dynamic `await import('../../src/server/rateLimit')`
// inside the handler. Each test reassigns rateLimitCheck.mockImplementation.
vi.mock('@/server/rateLimit', async () => {
  const actual = await vi.importActual<typeof import('@/server/rateLimit')>('@/server/rateLimit');
  return {
    ...actual,
    checkAndIncrementRateLimit: rateLimitCheck,
  };
});

// Module-scope env: ENABLE the rate-limit branch.
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.IP_SALT_BASE = 'test-salt';
process.env.ENABLE_TONE_CHECK = 'false';
// Set to a real number so generate.ts:55 takes the rate-limited branch (not bypass).
process.env.RATE_LIMIT_PER_HOUR = '25';

import { handler } from '../../netlify/functions/generate';

function callHandler(body: unknown, headers: Record<string, string> = {}) {
  return handler(
    {
      httpMethod: 'POST',
      body: JSON.stringify(body),
      headers,
    } as any,
    {} as any,
    () => undefined
  );
}

function mockSonnetReply(line1: string, line2: string) {
  anthropicCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify({ line1, line2 }) }],
  });
}

function mockHaikuReply(verdict: string) {
  anthropicCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: verdict }],
  });
}

// Helper: queue the standard "clean prompt" anthropic call sequence (Haiku
// distress=ok, then Sonnet generation). The handler's distress check fires
// for any prompt NOT on the phrase list, so happy-path tests must always
// queue the Haiku response first.
function mockHappyPathAnthropic(line1: string, line2: string) {
  mockHaikuReply('ok');
  mockSonnetReply(line1, line2);
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleLogSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  anthropicCreate.mockReset();
  rateLimitCheck.mockReset();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('generate handler — rate-limit allowed path', () => {
  it('proceeds to generation when rate-limit allows the request', async () => {
    rateLimitCheck.mockResolvedValueOnce({ allowed: true, remaining: 24 });
    mockHappyPathAnthropic(
      'The morning holds quiet possibility.',
      'Coffee is again the bravest part of it.'
    );

    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('ok');
    expect(rateLimitCheck).toHaveBeenCalledOnce();
    expect(anthropicCreate).toHaveBeenCalled();
  });

  it('passes the hashed IP (NOT raw IP) to checkAndIncrementRateLimit', async () => {
    // Boundary contract: only the SHA-256 hash should ever reach Firestore.
    // Raw IP must never be persisted — it would defeat the daily-salt design.
    rateLimitCheck.mockResolvedValueOnce({ allowed: true, remaining: 24 });
    mockHappyPathAnthropic(
      'The morning holds quiet possibility.',
      'Coffee is again the bravest part of it.'
    );

    await callHandler(
      { prompt: 'morning coffee', excludePhotoIds: [] },
      { 'x-nf-client-connection-ip': '203.0.113.42' }
    );

    const arg = rateLimitCheck.mock.calls[0][0];
    expect(arg, 'rate-limit key must be a hex hash').toMatch(/^[a-f0-9]{32}$/);
    expect(arg, 'raw IP must never reach the rate-limit store').not.toBe('203.0.113.42');
  });
});

describe('generate handler — rate-limit denied path', () => {
  it('short-circuits with status=rate_limited (no Anthropic call) when allowed=false', async () => {
    rateLimitCheck.mockResolvedValueOnce({ allowed: false, retryAfterSec: 60 });

    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('rate_limited');
    expect(body.message).toBeTruthy();
    // Critical: the user-facing limit message is set in generate.ts and consumed
    // by App.tsx — pinning the gist of it kills accidental wording drift.
    expect(body.message.toLowerCase()).toMatch(/limit|try again/);
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('logs gen_rate_limited event with the hashed IP for observability', async () => {
    rateLimitCheck.mockResolvedValueOnce({ allowed: false, retryAfterSec: 60 });
    await callHandler(
      { prompt: 'morning coffee', excludePhotoIds: [] },
      { 'x-nf-client-connection-ip': '203.0.113.42' }
    );

    const events = consoleLogSpy.mock.calls
      .map((c) => c[0])
      .filter((s): s is string => typeof s === 'string')
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter((e): e is { event: string; hashedIp: string } => e !== null);

    const rateLimitedEvent = events.find((e) => e.event === 'gen_rate_limited');
    expect(rateLimitedEvent, 'gen_rate_limited log event must be emitted').toBeTruthy();
    expect(rateLimitedEvent?.hashedIp, 'log must include hashedIp, not raw IP').toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('generate handler — rate-limit fail-open under infrastructure failure', () => {
  it('proceeds to generation when checkAndIncrementRateLimit rejects', async () => {
    // Firestore unavailability MUST fail open — the product contract ("user
    // always gets a poster") wins over strict rate limiting when the limiter
    // itself is broken.
    rateLimitCheck.mockRejectedValueOnce(new Error('firestore unavailable'));
    mockHappyPathAnthropic(
      'The morning holds quiet possibility.',
      'Coffee is again the bravest part of it.'
    );

    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    const body = JSON.parse((result as any).body);
    expect(['ok', 'safe_fallback']).toContain(body.status);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('logs rate_limit_check_failed when the rate-limit call rejects', async () => {
    rateLimitCheck.mockRejectedValueOnce(new Error('firestore unavailable'));
    mockHappyPathAnthropic(
      'The morning holds quiet possibility.',
      'Coffee is again the bravest part of it.'
    );
    await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });

    const events = consoleErrorSpy.mock.calls
      .map((c) => c[0])
      .filter((s): s is string => typeof s === 'string')
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter((e): e is { event: string } => e !== null);

    expect(events.some((e) => e.event === 'rate_limit_check_failed')).toBe(true);
  });

  it('proceeds to generation when checkAndIncrementRateLimit hangs past 3s (timeout race)', async () => {
    // The 3s Promise.race timeout in generate.ts:58-60 is a hard SLA. Without
    // it, a slow Firestore could block users. We use fake timers + a never-
    // resolving rate-limit promise so the race resolves to the timeout reject.
    vi.useFakeTimers();
    rateLimitCheck.mockReturnValueOnce(new Promise(() => undefined)); // never resolves
    mockHappyPathAnthropic(
      'The morning holds quiet possibility.',
      'Coffee is again the bravest part of it.'
    );

    const resultPromise = callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    // Advance virtual time past the 3s timeout so the race rejects with
    // `rate limit timeout`. Use 3001 to step over the boundary.
    await vi.advanceTimersByTimeAsync(3001);
    const result = await resultPromise;

    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('ok');

    const errorEvents = consoleErrorSpy.mock.calls
      .map((c) => c[0])
      .filter((s): s is string => typeof s === 'string')
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter((e): e is { event: string; error?: string } => e !== null);

    const timeoutLog = errorEvents.find((e) => e.event === 'rate_limit_check_failed');
    expect(timeoutLog, 'timeout must be logged as rate_limit_check_failed').toBeTruthy();
    expect(timeoutLog?.error, 'log must mention rate limit timeout').toMatch(/timeout/i);
  });
});

describe('generate handler — rate-limit headers (X-RateLimit-* and Retry-After)', () => {
  it('emits X-RateLimit-Limit/Remaining/Reset on a successful (allowed) response', async () => {
    // Headers expose the rate-limit state to clients so they can self-throttle.
    // The handler MUST forward Limit/Remaining/Reset whenever the rate-limit
    // module returned them — not synthesise its own values.
    const fixedReset = Math.floor(Date.now() / 1000) + 3600;
    rateLimitCheck.mockResolvedValueOnce({
      allowed: true,
      remaining: 24,
      limit: 25,
      resetAt: fixedReset,
    });
    mockHappyPathAnthropic(
      'The morning holds quiet possibility.',
      'Coffee is again the bravest part of it.'
    );

    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    const headers = (result as any).headers;
    expect(headers['X-RateLimit-Limit']).toBe('25');
    expect(headers['X-RateLimit-Remaining']).toBe('24');
    expect(headers['X-RateLimit-Reset']).toBe(String(fixedReset));
  });

  it('emits Retry-After header AND retryAfterSec body field on rate_limited', async () => {
    // Retry-After is the standard HTTP signal for rate-limited clients; the
    // body field gives JSON consumers the same info without parsing headers.
    const fixedReset = Math.floor(Date.now() / 1000) + 1800;
    rateLimitCheck.mockResolvedValueOnce({
      allowed: false,
      retryAfterSec: 1800,
      resetAt: fixedReset,
      limit: 25,
    });

    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    const headers = (result as any).headers;
    const body = JSON.parse((result as any).body);

    expect(body.status).toBe('rate_limited');
    expect(headers['Retry-After']).toBe('1800');
    expect(headers['X-RateLimit-Limit']).toBe('25');
    expect(headers['X-RateLimit-Reset']).toBe(String(fixedReset));
    expect(body.retryAfterSec).toBe(1800);
    expect(body.resetAt).toBe(fixedReset);
  });

  it('does NOT emit X-RateLimit-* headers on bypass (no rate-limit state to surface)', async () => {
    // When the bypass env is set the handler never calls the rate-limit module,
    // so it has nothing to advertise. Empty headers are correct (rather than
    // fabricating values like "9999/9999").
    const original = process.env.RATE_LIMIT_PER_HOUR;
    process.env.RATE_LIMIT_PER_HOUR = '9999';
    try {
      mockHappyPathAnthropic(
        'The morning holds quiet possibility.',
        'Coffee is again the bravest part of it.'
      );
      const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
      const headers = (result as any).headers;
      expect(headers['X-RateLimit-Limit']).toBeUndefined();
      expect(headers['X-RateLimit-Remaining']).toBeUndefined();
      expect(headers['X-RateLimit-Reset']).toBeUndefined();
    } finally {
      process.env.RATE_LIMIT_PER_HOUR = original;
    }
  });

  it('does NOT emit X-RateLimit-* headers when the rate-limit call fails open', async () => {
    // The fail-open path resets rateResult to null; the handler MUST NOT pretend
    // it has fresh rate-limit state under infrastructure failure.
    rateLimitCheck.mockRejectedValueOnce(new Error('firestore unavailable'));
    mockHappyPathAnthropic(
      'The morning holds quiet possibility.',
      'Coffee is again the bravest part of it.'
    );
    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    const headers = (result as any).headers;
    expect(headers['X-RateLimit-Limit']).toBeUndefined();
    expect(headers['X-RateLimit-Remaining']).toBeUndefined();
    expect(headers['X-RateLimit-Reset']).toBeUndefined();
  });
});

describe('generate handler — RATE_LIMIT_PER_HOUR=9999 bypass', () => {
  it('does NOT call checkAndIncrementRateLimit when bypass env is set', async () => {
    // The bypass is the local-dev escape hatch documented in CLAUDE.md.
    // Pin the behavior so a refactor of the env check (e.g., switching to
    // === '9999' vs. parseInt) doesn't silently break local dev.
    const original = process.env.RATE_LIMIT_PER_HOUR;
    process.env.RATE_LIMIT_PER_HOUR = '9999';
    try {
      mockHappyPathAnthropic(
        'The morning holds quiet possibility.',
        'Coffee is again the bravest part of it.'
      );

      const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
      const body = JSON.parse((result as any).body);
      expect(body.status).toBe('ok');
      expect(rateLimitCheck, 'bypass env must skip the rate-limit call entirely').not.toHaveBeenCalled();
    } finally {
      // try/finally — never leak '9999' into the next describe block.
      process.env.RATE_LIMIT_PER_HOUR = original;
    }
  });
});
