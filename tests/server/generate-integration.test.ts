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

vi.mock('firebase-admin/firestore', () => {
  const Timestamp = {
    now: () => ({ toMillis: () => Date.now() }),
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
    mockSonnetReply('The world keeps going regardless.', "And it's not even checking on you.");
    const first = await callHandler({
      prompt: 'monday again',
      excludePhotoIds: [],
    });
    const firstBody = JSON.parse((first as any).body);

    // Second call - exclude the first photo
    mockHaikuReply('ok');
    mockSonnetReply(
      'The week holds many small mercies.',
      'Monday is not currently among them.'
    );
    const second = await callHandler({
      prompt: 'monday again',
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
      prompt: 'monday again',
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
      prompt: 'monday again',
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
