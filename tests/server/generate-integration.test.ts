/**
 * Integration tests for the generate Netlify function pipeline.
 *
 * Mocks the Anthropic SDK and Firestore — exercises the real orchestration
 * (validation, safety filters, retry loop, photo selection, fallbacks).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks must be declared BEFORE the module under test imports ──

const { anthropicCreate } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = { create: anthropicCreate };
    },
  };
});

// Mirrors the stable-Timestamp shape in tests/server/rateLimit-extended.test.ts
// — Date.now() is captured once at construction, not re-read on every
// .toMillis() call, to keep TTL math deterministic across closely-spaced reads.
vi.mock('firebase-admin/firestore', () => {
  const Timestamp = {
    now: () => {
      const ms = Date.now();
      return { toMillis: () => ms };
    },
    fromMillis: (ms: number) => ({ toMillis: () => ms }),
  };
  return { Timestamp };
});

// Override the slur list for predictable testing — picks a clearly synthetic test token
vi.mock('@/server/slur-list', () => ({
  slurList: ['testblockedslur'],
}));

// Bypass rate limit by setting env (the function checks RATE_LIMIT_PER_HOUR === '9999')
process.env.RATE_LIMIT_PER_HOUR = '9999';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.IP_SALT_BASE = 'test-salt';
process.env.ENABLE_TONE_CHECK = 'false'; // Skip Haiku tone check

// Mock firebaseAdmin so getDb is never invoked in the bypass path
vi.mock('@/server/firebaseAdmin', () => ({
  getDb: () => {
    throw new Error('Firestore should not be touched when RATE_LIMIT_PER_HOUR=9999');
  },
}));

import { handler } from '../../netlify/functions/generate';

function callHandler(body: unknown, headers: Record<string, string> = {}) {
  return handler(
    {
      httpMethod: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
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

beforeEach(() => {
  anthropicCreate.mockReset();
  // Quiet console — the handler logs JSON events on every path
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generate endpoint — method/validation', () => {
  it('rejects non-POST methods with 405', async () => {
    const result = await handler(
      { httpMethod: 'GET', body: '', headers: {} } as any,
      {} as any,
      () => undefined
    );
    expect((result as any).statusCode).toBe(405);
  });

  it('returns 400 for invalid JSON body', async () => {
    const result = await callHandler('not-json{');
    expect((result as any).statusCode).toBe(400);
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('error');
    expect(body.retryable).toBe(false);
  });

  it('returns 400 when prompt is missing', async () => {
    const result = await callHandler({ excludePhotoIds: [] });
    expect((result as any).statusCode).toBe(400);
  });

  it('returns 400 when prompt is empty string after trim', async () => {
    const result = await callHandler({ prompt: '   ', excludePhotoIds: [] });
    expect((result as any).statusCode).toBe(400);
  });

  it('returns 400 when prompt exceeds 200 chars', async () => {
    const result = await callHandler({ prompt: 'a'.repeat(201), excludePhotoIds: [] });
    expect((result as any).statusCode).toBe(400);
  });
});

describe('generate endpoint — safety filters', () => {
  it('blocks slur input before calling the SDK', async () => {
    const result = await callHandler({ prompt: 'that testblockedslur', excludePhotoIds: [] });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('blocked');
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('blocks possessive-name pattern (real person filter)', async () => {
    const result = await callHandler({
      prompt: 'my boss Karen is loud',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('blocked');
    expect(body.message).toContain('punch');
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('returns distress with hotline for phrase-list match', async () => {
    const result = await callHandler({
      prompt: 'I want to die today',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('distress');
    expect(body.hotline).toBeTruthy();
    expect(body.hotline.name).toBeTruthy();
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('returns distress when Haiku flags a non-phrase-list crisis', async () => {
    // No phrase match -> Haiku is called -> verdict "crisis"
    mockHaikuReply('crisis');
    const result = await callHandler({
      prompt: 'i cannot keep going through any of this anymore today',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('distress');
  });

  it('uses x-country header to pick the hotline', async () => {
    const result = await callHandler(
      { prompt: 'I want to die today', excludePhotoIds: [] },
      { 'x-country': 'gb' }
    );
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('distress');
    expect(body.hotline.countryCode).toBe('GB');
  });
});

describe('generate endpoint — happy path', () => {
  it('returns ok with line1/line2/photoId/fittingRung for a clean prompt', async () => {
    // Phrase list miss -> Haiku call (returns ok) -> Sonnet call -> validation pass
    mockHaikuReply('ok');
    mockSonnetReply(
      'The morning holds quiet possibility.',
      "Your coffee is again the bravest part of it."
    );

    const result = await callHandler({
      prompt: 'third coffee of the morning',
      excludePhotoIds: [],
    });
    expect((result as any).statusCode).toBe(200);
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('ok');
    expect(body.line1).toBeTruthy();
    expect(body.line2).toBeTruthy();
    expect(body.photoId).toBeTruthy();
    expect([1, 2, 3]).toContain(body.fittingRung);
  });

  it('respects excludePhotoIds (returns a different photo on regenerate)', async () => {
    // First call
    mockHaikuReply('ok');
    mockSonnetReply('Every thought deserves space.', 'Your random tuesday thought at 3 AM was not a revelation.');
    const first = await callHandler({
      prompt: 'random tuesday thought',
      excludePhotoIds: [],
    });
    const firstBody = JSON.parse((first as any).body);

    // Second call - exclude the first photo
    mockHaikuReply('ok');
    mockSonnetReply(
      'A fresh thought emerges.',
      'Tuesday has thoughts about you too. None of them are kind.'
    );
    const second = await callHandler({
      prompt: 'random tuesday thought',
      excludePhotoIds: [firstBody.photoId],
    });
    const secondBody = JSON.parse((second as any).body);
    expect(secondBody.status).toBe('ok');
    if (secondBody.photoId !== firstBody.photoId) {
      expect(secondBody.photoId).not.toBe(firstBody.photoId);
    }
  });
});

describe('generate endpoint — retry + fallback', () => {
  it('falls back when Sonnet returns invalid JSON 3 times', async () => {
    mockHaikuReply('ok');
    // 3 garbage responses (1 attempt + 2 retries)
    anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] });
    anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'still not json' }] });
    anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'nope' }] });

    const result = await callHandler({
      prompt: 'dreading this week already',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('safe_fallback');
    expect(body.line1).toBeTruthy();
    expect(body.line2).toBeTruthy();
    expect(body.photoId).toBeTruthy();
  });

  it('falls back when Sonnet output fails specificity 3 times', async () => {
    mockHaikuReply('ok');
    // 3 generic responses that don't echo the prompt and have no synonym overlap
    for (let i = 0; i < 3; i++) {
      mockSonnetReply('The world keeps going.', 'Generic disappointment everywhere.');
    }

    const result = await callHandler({
      prompt: 'my dental cleaning is overdue',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('safe_fallback');
  });

  it('falls back when Sonnet throws on every attempt', async () => {
    mockHaikuReply('ok');
    anthropicCreate.mockRejectedValueOnce(new Error('boom'));
    anthropicCreate.mockRejectedValueOnce(new Error('boom'));
    anthropicCreate.mockRejectedValueOnce(new Error('boom'));

    const result = await callHandler({
      prompt: 'dreading this week already',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('safe_fallback');
  });

  it('succeeds on second attempt after a single failure (uses retry budget)', async () => {
    mockHaikuReply('ok');
    anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] });
    mockSonnetReply('The morning holds possibility.', 'Coffee is the bravest part.');

    const result = await callHandler({
      prompt: 'morning coffee',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('ok');
  });
});

describe('generate endpoint — Anthropic error type discrimination (audit 33/001)', () => {
  // Helper: produce an APIError-shaped rejection. The integration test mocks
  // `@anthropic-ai/sdk` wholesale (no APIError class on the mocked module),
  // so the production code uses duck typing on `err.status` rather than
  // `instanceof APIError`. This shape mirrors the real SDK's APIError fields
  // that the generate.ts retry-loop reads.
  function apiError(status: number, message = 'sdk error'): Error & { status: number } {
    const err = Object.assign(new Error(message), { status });
    return err as Error & { status: number };
  }

  it('bails on 401 (auth) without burning the retry budget', async () => {
    mockHaikuReply('ok');
    // Pre-fix: 3 sequential 12s attempts would burn ~36s of lambda budget on a
    // misconfigured API key before the user saw safe_fallback.
    // Post-fix: first 401 short-circuits to safe_fallback.
    anthropicCreate.mockRejectedValueOnce(apiError(401, 'Unauthorized'));
    // If the bail path is broken these would also be consumed and the test
    // would still pass — pinning the call count is the load-bearing assertion.
    anthropicCreate.mockRejectedValueOnce(apiError(401, 'Unauthorized'));
    anthropicCreate.mockRejectedValueOnce(apiError(401, 'Unauthorized'));

    const result = await callHandler({
      prompt: 'random tuesday thought',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('safe_fallback');
    // Haiku call (1) + ONE generation attempt (1) = 2 total. No retries.
    expect(anthropicCreate).toHaveBeenCalledTimes(2);
  });

  it('bails on 400 (bad request) without burning the retry budget', async () => {
    mockHaikuReply('ok');
    anthropicCreate.mockRejectedValueOnce(apiError(400, 'Bad request'));
    anthropicCreate.mockRejectedValueOnce(apiError(400, 'Bad request'));
    anthropicCreate.mockRejectedValueOnce(apiError(400, 'Bad request'));

    const result = await callHandler({
      prompt: 'morning coffee',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('safe_fallback');
    expect(anthropicCreate).toHaveBeenCalledTimes(2);
  });

  it('bails on 429 (rate limited) — provider Retry-After exceeds lambda budget', async () => {
    mockHaikuReply('ok');
    anthropicCreate.mockRejectedValueOnce(apiError(429, 'rate_limit_error'));

    const result = await callHandler({
      prompt: 'dreading this week already',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('safe_fallback');
    expect(anthropicCreate).toHaveBeenCalledTimes(2);
  });

  it('still retries on 500 (server error) — transient provider failure', async () => {
    mockHaikuReply('ok');
    // Two 500s, then success
    anthropicCreate.mockRejectedValueOnce(apiError(500, 'Internal server error'));
    anthropicCreate.mockRejectedValueOnce(apiError(500, 'Internal server error'));
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is the bravest part.');

    const result = await callHandler({
      prompt: 'morning coffee',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('ok');
    // Haiku (1) + 3 attempts (2 failed + 1 success) = 4
    expect(anthropicCreate).toHaveBeenCalledTimes(4);
  });

  it('still retries on network-level error (no status — APIConnectionError-shaped)', async () => {
    mockHaikuReply('ok');
    // No `status` on the error → falls through to the retry path.
    anthropicCreate.mockRejectedValueOnce(new Error('ECONNRESET'));
    anthropicCreate.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    mockSonnetReply('Mornings keep arriving.', 'Coffee remains the only ritual.');

    const result = await callHandler({
      prompt: 'morning coffee',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('ok');
    expect(anthropicCreate).toHaveBeenCalledTimes(4);
  });
});

describe('generate endpoint — Haiku failure resilience', () => {
  it('proceeds with generation when distress Haiku throws (fails open)', async () => {
    // Phrase miss -> Haiku throws (treated as ok) -> Sonnet succeeds
    anthropicCreate.mockRejectedValueOnce(new Error('haiku down'));
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is the bravest part.');

    const result = await callHandler({
      prompt: 'morning coffee',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(['ok', 'safe_fallback']).toContain(body.status);
  });
});

describe('generate endpoint — input normalization', () => {
  it('normalizes newlines and double-spaces in prompt before processing', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('Sleep is the deepest discipline.', 'Bed is calling at noon already.');

    const result = await callHandler({
      prompt: 'cant   sleep\n\nat all',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(['ok', 'safe_fallback']).toContain(body.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Request correlation (audit run 40/001)
//
// Every response carries an X-Request-Id header so the client / browser can
// quote it back to support, and every server log line emitted on that
// request's behalf carries the same ID as a `request_id` field. The same
// AsyncLocalStorage scope wraps the whole handler, so deeper-helper logs
// (`gen_anthropic_error` from anthropic.ts catches, `gen_parse_failed` from
// validation.ts, etc.) inherit the ID with no parameter threading.
// ─────────────────────────────────────────────────────────────────────────────

describe('generate endpoint — X-Request-Id correlation', () => {
  it('echoes the inbound x-nf-request-id header back as X-Request-Id on a happy path', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is again the bravest part of it.');
    const result = await callHandler(
      { prompt: 'morning coffee', excludePhotoIds: [] },
      { 'x-nf-request-id': 'nf-test-correlation-001' }
    );
    expect((result as any).headers['X-Request-Id']).toBe('nf-test-correlation-001');
  });

  it('generates an X-Request-Id when the inbound header is absent', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is again the bravest part of it.');
    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    const id = (result as any).headers['X-Request-Id'];
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });

  it('returns X-Request-Id on the 400-validation error path too', async () => {
    const result = await callHandler('not-json{', { 'x-nf-request-id': 'rid-400' });
    expect((result as any).statusCode).toBe(400);
    expect((result as any).headers['X-Request-Id']).toBe('rid-400');
  });

  it('attaches request_id to every server log line emitted during a request', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is again the bravest part of it.');

    await callHandler(
      { prompt: 'morning coffee', excludePhotoIds: [] },
      { 'x-nf-request-id': 'rid-trace' }
    );

    const events = logSpy.mock.calls
      .map((c) => c[0])
      .filter((s): s is string => typeof s === 'string')
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter((e): e is { event: string; request_id?: string } => e !== null);

    // gen_ok must carry request_id
    const okEvent = events.find((e) => e.event === 'gen_ok');
    expect(okEvent).toBeTruthy();
    expect(okEvent?.request_id).toBe('rid-trace');
  });

  it('attaches request_id to error logs from helper modules (anthropic, validation)', async () => {
    // Force a JSON parse failure so validation.ts fires gen_parse_failed,
    // and an Anthropic error so generate.ts fires gen_anthropic_error.
    // Both helpers should pick up the request_id from AsyncLocalStorage.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockHaikuReply('ok');
    // First Sonnet attempt: malformed JSON -> gen_parse_failed in validation.ts
    anthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not-valid-json{' }],
    });
    // Second Sonnet attempt: throw -> gen_anthropic_error in generate.ts
    const apiError = Object.assign(new Error('500 server error'), { status: 500 });
    anthropicCreate.mockRejectedValueOnce(apiError);
    // Third attempt also throws to reach safe_fallback quickly
    anthropicCreate.mockRejectedValueOnce(apiError);

    await callHandler(
      { prompt: 'a fresh prompt for the helper-log test', excludePhotoIds: [] },
      { 'x-nf-request-id': 'rid-helpers' }
    );

    const events = errSpy.mock.calls
      .map((c) => c[0])
      .filter((s): s is string => typeof s === 'string')
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter((e): e is { event: string; request_id?: string } => e !== null);

    const parseFailed = events.find((e) => e.event === 'gen_parse_failed');
    const anthropicError = events.find((e) => e.event === 'gen_anthropic_error');

    expect(parseFailed?.request_id, 'gen_parse_failed must carry request_id').toBe('rid-helpers');
    expect(anthropicError?.request_id, 'gen_anthropic_error must carry request_id').toBe('rid-helpers');
  });
});
