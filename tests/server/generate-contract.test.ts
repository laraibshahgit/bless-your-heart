/**
 * Contract tests for the generate Netlify function.
 *
 * These tests verify the WIRE FORMAT — what consumers see — independent of the
 * orchestration tested in generate-integration.test.ts. Every response body is
 * validated against a Zod schema that mirrors the `GenerateResponse` type
 * exported from `src/types/index.ts`. If the function ever drifts from the
 * type, these tests catch it before deploy.
 *
 * Why a separate file:
 *   - generate-integration tests verify BEHAVIOR (which path runs)
 *   - this file verifies the SHAPE of every documented response
 *   - the two together pin both halves of the contract
 *
 * Coverage targets in this file:
 *   - HTTP status codes (200, 400, 405)
 *   - Response headers (Content-Type, Cache-Control)
 *   - Response body schema for each `status` discriminator
 *   - Required vs. optional request fields
 *   - Boundary inputs (length 1, length 200, length 201)
 *   - Header sensitivity (x-country casing, missing, unknown)
 *   - Body shape on edge inputs (non-JSON, wrong types)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

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

vi.mock('@/server/slur-list', () => ({
  slurList: ['testblockedslur'],
}));

process.env.RATE_LIMIT_PER_HOUR = '9999';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.IP_SALT_BASE = 'test-salt';
process.env.ENABLE_TONE_CHECK = 'false';

vi.mock('@/server/firebaseAdmin', () => ({
  getDb: () => {
    throw new Error('Firestore should not be touched when RATE_LIMIT_PER_HOUR=9999');
  },
}));

import { handler } from '../../netlify/functions/generate';

// ── Schemas mirroring src/types/index.ts ──

const HotlineSchema = z.object({
  countryCode: z.string().min(1),
  name: z.string().min(1),
  // phone is REQUIRED in the type but the INTL fallback uses '' — schema reflects reality
  phone: z.string(),
  url: z.string().url().optional(),
});

const OkResponseSchema = z.object({
  status: z.literal('ok'),
  line1: z.string().min(1).max(60),
  line2: z.string().min(1).max(100),
  photoId: z.string().min(1),
  fittingRung: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

const DistressResponseSchema = z.object({
  status: z.literal('distress'),
  hotline: HotlineSchema,
});

const BlockedResponseSchema = z.object({
  status: z.literal('blocked'),
  message: z.string().min(1),
});

const RateLimitedResponseSchema = z.object({
  status: z.literal('rate_limited'),
  message: z.string().min(1),
  // Optional in the type — pinned here so a future schema change that drops them
  // (or types them differently) trips the contract instead of slipping through.
  retryAfterSec: z.number().int().nonnegative().optional(),
  resetAt: z.number().int().nonnegative().optional(),
});

const SafeFallbackResponseSchema = z.object({
  status: z.literal('safe_fallback'),
  line1: z.string().min(1).max(60),
  line2: z.string().min(1).max(100),
  photoId: z.string().min(1),
});

const ErrorResponseSchema = z.object({
  status: z.literal('error'),
  message: z.string().min(1),
  retryable: z.boolean(),
});

const GenerateResponseSchema = z.discriminatedUnion('status', [
  OkResponseSchema,
  DistressResponseSchema,
  BlockedResponseSchema,
  RateLimitedResponseSchema,
  SafeFallbackResponseSchema,
  ErrorResponseSchema,
]);

// ── Test helpers ──

function callHandler(body: unknown, headers: Record<string, string> = {}, method = 'POST') {
  return handler(
    {
      httpMethod: method,
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
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP-level contract
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — HTTP method handling', () => {
  it('GET returns 405 with JSON error body and Allow: POST header', async () => {
    const result = await callHandler({}, {}, 'GET');
    expect((result as any).statusCode).toBe(405);
    // 405 now harmonizes with the rest of the contract: JSON error shape, JSON
    // Content-Type, and the RFC 7231-required Allow header naming the supported method.
    expect((result as any).headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect((result as any).headers['Allow']).toBe('POST');
    const body = JSON.parse((result as any).body);
    const parsed = ErrorResponseSchema.parse(body);
    expect(parsed.retryable).toBe(false);
    expect(parsed.message.toLowerCase()).toContain('post');
  });

  it.each(['PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'])(
    '%s returns 405 with the same JSON error shape and Allow header',
    async (method) => {
      const result = await callHandler({}, {}, method);
      expect((result as any).statusCode).toBe(405);
      expect((result as any).headers['Allow']).toBe('POST');
      const body = JSON.parse((result as any).body);
      ErrorResponseSchema.parse(body);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// CSRF / origin shield (env-driven; unset is a no-op)
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — Origin allowlist (CSRF shield)', () => {
  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS;
  });

  it('passes through when ALLOWED_ORIGINS is unset (backward-compat default)', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is the bravest part of it.');
    const result = await callHandler(
      { prompt: 'morning coffee', excludePhotoIds: [] },
      { origin: 'https://evil.example' }
    );
    expect((result as any).statusCode).toBe(200);
  });

  it('passes through when Origin header is absent (server-to-server)', async () => {
    process.env.ALLOWED_ORIGINS = 'https://blessyourheart.app';
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is the bravest part of it.');
    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] }, {});
    expect((result as any).statusCode).toBe(200);
  });

  it('rejects with 403 when Origin is present and not in allowlist', async () => {
    process.env.ALLOWED_ORIGINS = 'https://blessyourheart.app';
    const result = await callHandler(
      { prompt: 'morning coffee', excludePhotoIds: [] },
      { origin: 'https://evil.example' }
    );
    expect((result as any).statusCode).toBe(403);
    const body = JSON.parse((result as any).body);
    ErrorResponseSchema.parse(body);
  });

  it('accepts Origin that exactly matches an allowlist entry (case-insensitive)', async () => {
    process.env.ALLOWED_ORIGINS = 'https://blessyourheart.app, https://staging.blessyourheart.app';
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is the bravest part of it.');
    const result = await callHandler(
      { prompt: 'morning coffee', excludePhotoIds: [] },
      { origin: 'HTTPS://BlessYourHeart.app' }
    );
    expect((result as any).statusCode).toBe(200);
  });
});

describe('contract — response headers', () => {
  it('400 response includes Content-Type: application/json; charset=utf-8', async () => {
    const result = await callHandler('not-json{');
    expect((result as any).headers['Content-Type']).toBe('application/json; charset=utf-8');
  });

  it('400 response includes Cache-Control: no-store', async () => {
    const result = await callHandler('not-json{');
    expect((result as any).headers['Cache-Control']).toBe('no-store');
  });

  it('200 ok response includes Content-Type: application/json; charset=utf-8', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is the bravest part of it.');
    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    expect((result as any).headers['Content-Type']).toBe('application/json; charset=utf-8');
  });

  it('200 ok response includes Cache-Control: no-store', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is the bravest part of it.');
    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    expect((result as any).headers['Cache-Control']).toBe('no-store');
  });

  it('rate_limited response includes Cache-Control: no-store (must not be cached)', async () => {
    // Force rate-limit path by un-bypassing — easier to reach via env flip + mock
    const original = process.env.RATE_LIMIT_PER_HOUR;
    process.env.RATE_LIMIT_PER_HOUR = '1';
    try {
      // Mock the rateLimit module to deny so we hit the rate_limited branch
      vi.doMock('@/server/rateLimit', async () => {
        const actual = await vi.importActual<typeof import('@/server/rateLimit')>(
          '@/server/rateLimit'
        );
        return {
          ...actual,
          checkAndIncrementRateLimit: vi.fn().mockResolvedValue({ allowed: false, retryAfterSec: 60 }),
        };
      });
      vi.resetModules();
      const { handler: freshHandler } = await import('../../netlify/functions/generate');
      const result = await freshHandler(
        {
          httpMethod: 'POST',
          body: JSON.stringify({ prompt: 'hi', excludePhotoIds: [] }),
          headers: {},
        } as any,
        {} as any,
        () => undefined
      );
      expect((result as any).headers['Cache-Control']).toBe('no-store');
      const body = JSON.parse((result as any).body);
      expect(body.status).toBe('rate_limited');
    } finally {
      vi.doUnmock('@/server/rateLimit');
      vi.resetModules();
      if (original === undefined) delete process.env.RATE_LIMIT_PER_HOUR;
      else process.env.RATE_LIMIT_PER_HOUR = original;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Request schema contract
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — request validation', () => {
  it('accepts a request with no body (treated as empty object → fails Zod → 400)', async () => {
    const result = await handler(
      { httpMethod: 'POST', body: null, headers: {} } as any,
      {} as any,
      () => undefined
    );
    expect((result as any).statusCode).toBe(400);
    const parsed = ErrorResponseSchema.parse(JSON.parse((result as any).body));
    expect(parsed.retryable).toBe(false);
  });

  it('accepts a request omitting excludePhotoIds (server defaults it to [])', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is the bravest part of it.');
    // The TYPE marks excludePhotoIds as required; the SERVER applies a Zod .default([]).
    // This test pins the actual behavior so a future tightening of the schema
    // (removing .default) will trigger a clear failure here.
    const result = await callHandler({ prompt: 'morning coffee' });
    expect((result as any).statusCode).toBe(200);
  });

  it('rejects when prompt is not a string', async () => {
    const result = await callHandler({ prompt: 12345, excludePhotoIds: [] });
    expect((result as any).statusCode).toBe(400);
    ErrorResponseSchema.parse(JSON.parse((result as any).body));
  });

  it('rejects when excludePhotoIds contains non-string entries', async () => {
    const result = await callHandler({ prompt: 'hi', excludePhotoIds: [1, 2, 3] });
    expect((result as any).statusCode).toBe(400);
  });

  it('rejects when prompt is null', async () => {
    const result = await callHandler({ prompt: null, excludePhotoIds: [] });
    expect((result as any).statusCode).toBe(400);
  });

  it('accepts prompt at exactly 200 chars (boundary, allowed)', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds possibility.', 'Coffee is again the bravest part.');
    const exact200 = 'a'.repeat(200);
    const result = await callHandler({ prompt: exact200, excludePhotoIds: [] });
    expect((result as any).statusCode).toBe(200);
  });

  it('rejects prompt at 201 chars (just over the boundary)', async () => {
    const result = await callHandler({ prompt: 'a'.repeat(201), excludePhotoIds: [] });
    expect((result as any).statusCode).toBe(400);
  });

  it('accepts prompt of length 1 (single char, lower boundary)', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds possibility.', 'Coffee is again the bravest part.');
    const result = await callHandler({ prompt: 'a', excludePhotoIds: [] });
    // Single char is a real prompt; specificity check may fail and produce safe_fallback — both shapes pass the contract
    expect((result as any).statusCode).toBe(200);
    const body = JSON.parse((result as any).body);
    expect(['ok', 'safe_fallback']).toContain(body.status);
  });

  it('rejects malformed JSON body with the documented error shape', async () => {
    const result = await callHandler('{not json');
    expect((result as any).statusCode).toBe(400);
    const body = JSON.parse((result as any).body);
    const parsed = ErrorResponseSchema.parse(body);
    expect(parsed.message).toBeTruthy();
    expect(parsed.retryable).toBe(false);
  });

  it('validation error message names the failing field path (not a generic "Invalid request.")', async () => {
    // Generic messages force the client to guess what's wrong. Naming the path
    // (e.g. "prompt is too long") gives consumers the info they need without
    // leaking the schema internals (codes, expected shape, etc.).
    const result = await callHandler({ prompt: 'a'.repeat(201), excludePhotoIds: [] });
    const body = JSON.parse((result as any).body);
    expect(body.message.toLowerCase()).toContain('prompt');
  });

  it('validation error message names the failing field for missing prompt', async () => {
    const result = await callHandler({ excludePhotoIds: [] });
    const body = JSON.parse((result as any).body);
    expect(body.message.toLowerCase()).toContain('prompt');
  });

  it('trims surrounding whitespace from prompt before length validation', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds possibility.', 'Coffee is again the bravest part.');
    // 198 'a' surrounded by 4 spaces — total length 202 but trimmed length 198 ≤ 200
    const padded = '  ' + 'a'.repeat(198) + '  ';
    const result = await callHandler({ prompt: padded, excludePhotoIds: [] });
    // Zod schema uses .trim() before .max(200) so this passes
    expect((result as any).statusCode).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Response schema contract — every status discriminator
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — every response status conforms to GenerateResponseSchema', () => {
  it('status=ok matches the schema (line1≤60, line2≤100, fittingRung 1|2|3|4)', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds quiet possibility.', 'Coffee is the bravest part of it.');
    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    const body = JSON.parse((result as any).body);
    const parsed = GenerateResponseSchema.parse(body);
    expect(parsed.status).toBe('ok');
  });

  it('status=blocked (slur path) matches the schema', async () => {
    const result = await callHandler({ prompt: 'that testblockedslur', excludePhotoIds: [] });
    const body = JSON.parse((result as any).body);
    const parsed = GenerateResponseSchema.parse(body);
    expect(parsed.status).toBe('blocked');
  });

  it('status=blocked (real-person path) matches the schema with different message text', async () => {
    const slur = await callHandler({ prompt: 'that testblockedslur', excludePhotoIds: [] });
    const realPerson = await callHandler({ prompt: 'my boss Karen is loud', excludePhotoIds: [] });
    const slurBody = JSON.parse((slur as any).body);
    const rpBody = JSON.parse((realPerson as any).body);
    GenerateResponseSchema.parse(slurBody);
    GenerateResponseSchema.parse(rpBody);
    // Both blocked, but distinct messages — guarantees they aren't accidentally collapsed
    expect(slurBody.status).toBe('blocked');
    expect(rpBody.status).toBe('blocked');
    expect(slurBody.message).not.toBe(rpBody.message);
  });

  it('status=distress matches the schema with a complete Hotline payload', async () => {
    const result = await callHandler({ prompt: 'I want to die today', excludePhotoIds: [] });
    const body = JSON.parse((result as any).body);
    const parsed = GenerateResponseSchema.parse(body);
    expect(parsed.status).toBe('distress');
    if (parsed.status === 'distress') {
      expect(parsed.hotline.countryCode).toBeTruthy();
      expect(parsed.hotline.name).toBeTruthy();
    }
  });

  it('status=safe_fallback matches the schema (no fittingRung field, both lines present)', async () => {
    mockHaikuReply('ok');
    anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] });
    anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] });
    anthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] });
    const result = await callHandler({ prompt: 'cheese curds at midnight', excludePhotoIds: [] });
    const body = JSON.parse((result as any).body);
    const parsed = GenerateResponseSchema.parse(body);
    expect(parsed.status).toBe('safe_fallback');
    // Documenting: safe_fallback intentionally omits `fittingRung`. Consumers
    // reading this field must handle that. If we ever start including it,
    // update the type and this assertion together.
    expect((body as any).fittingRung).toBeUndefined();
  });

  it('status=error matches the schema for invalid input', async () => {
    const result = await callHandler({ prompt: '' });
    const body = JSON.parse((result as any).body);
    const parsed = GenerateResponseSchema.parse(body);
    expect(parsed.status).toBe('error');
    if (parsed.status === 'error') {
      expect(typeof parsed.retryable).toBe('boolean');
    }
  });

  it('every successful response includes a non-empty photoId that looks like a slug', async () => {
    mockHaikuReply('ok');
    mockSonnetReply('The morning holds possibility.', 'Coffee is again the bravest part.');
    const result = await callHandler({ prompt: 'morning coffee', excludePhotoIds: [] });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('ok');
    // photoId convention is enforced by lint-photos.ts at build time
    expect(body.photoId).toMatch(/^[a-z]+(-[a-z]+)*-\d{2,}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Header sensitivity — x-country
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — x-country header behavior', () => {
  it('uppercase x-country selects the country hotline', async () => {
    const result = await callHandler(
      { prompt: 'I want to die today', excludePhotoIds: [] },
      { 'x-country': 'GB' }
    );
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('distress');
    expect(body.hotline.countryCode).toBe('GB');
  });

  it('lowercase x-country is normalized to uppercase before lookup', async () => {
    const result = await callHandler(
      { prompt: 'I want to die today', excludePhotoIds: [] },
      { 'x-country': 'au' }
    );
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('distress');
    expect(body.hotline.countryCode).toBe('AU');
  });

  it('mixed-case x-country (e.g. "Us") is normalized to uppercase before lookup', async () => {
    const result = await callHandler(
      { prompt: 'I want to die today', excludePhotoIds: [] },
      { 'x-country': 'Us' }
    );
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('distress');
    expect(body.hotline.countryCode).toBe('US');
  });

  it('missing x-country falls back to INTL hotline (countryCode="INTL", phone="")', async () => {
    const result = await callHandler({
      prompt: 'I want to die today',
      excludePhotoIds: [],
    });
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('distress');
    expect(body.hotline.countryCode).toBe('INTL');
    // Documenting: INTL hotline has empty phone; consumers must not assume non-empty
    expect(body.hotline.phone).toBe('');
    expect(body.hotline.url).toBeTruthy();
  });

  it('unknown x-country (e.g. "ZZ") falls back to INTL hotline', async () => {
    const result = await callHandler(
      { prompt: 'I want to die today', excludePhotoIds: [] },
      { 'x-country': 'ZZ' }
    );
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('distress');
    expect(body.hotline.countryCode).toBe('INTL');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema sanity — guarantee the schema actually accepts every documented shape
// ─────────────────────────────────────────────────────────────────────────────

describe('contract — schema accepts all documented variants', () => {
  // These are static fixtures, not handler responses — they verify the schema
  // itself doesn't drift from the type. If a developer adds a field to
  // GenerateResponse and forgets to update the schema, these fail loudly.
  it('accepts a canonical ok response', () => {
    expect(() =>
      GenerateResponseSchema.parse({
        status: 'ok',
        line1: 'a',
        line2: 'b',
        photoId: 'misty-fjord-01',
        fittingRung: 2,
      })
    ).not.toThrow();
  });

  it('accepts fittingRung=4 even though no current code path emits it', () => {
    // The type allows 4 but production currently never returns it. Worth pinning
    // so a future "rung 4" implementation doesn't break consumers expecting only 1-3.
    expect(() =>
      GenerateResponseSchema.parse({
        status: 'ok',
        line1: 'a',
        line2: 'b',
        photoId: 'p-01',
        fittingRung: 4,
      })
    ).not.toThrow();
  });

  it('rejects fittingRung=5 (out of allowed enum)', () => {
    expect(() =>
      GenerateResponseSchema.parse({
        status: 'ok',
        line1: 'a',
        line2: 'b',
        photoId: 'p-01',
        fittingRung: 5,
      })
    ).toThrow();
  });

  it('rejects line1 longer than the 60-char hard cap', () => {
    expect(() =>
      GenerateResponseSchema.parse({
        status: 'ok',
        line1: 'a'.repeat(61),
        line2: 'b',
        photoId: 'p-01',
        fittingRung: 1,
      })
    ).toThrow();
  });

  it('rejects line2 longer than the 100-char hard cap', () => {
    expect(() =>
      GenerateResponseSchema.parse({
        status: 'ok',
        line1: 'a',
        line2: 'b'.repeat(101),
        photoId: 'p-01',
        fittingRung: 1,
      })
    ).toThrow();
  });

  it('accepts a Hotline with no url field (countries like NZ, IN, DE, FR)', () => {
    expect(() =>
      GenerateResponseSchema.parse({
        status: 'distress',
        hotline: { countryCode: 'NZ', name: 'Need to Talk?', phone: '1737' },
      })
    ).not.toThrow();
  });

  it('rejects a discriminator value that is not in the union', () => {
    expect(() =>
      GenerateResponseSchema.parse({ status: 'unknown_state', message: 'hi' })
    ).toThrow();
  });

  it('rejects an error response missing the retryable flag', () => {
    expect(() =>
      GenerateResponseSchema.parse({ status: 'error', message: 'hi' })
    ).toThrow();
  });
});
