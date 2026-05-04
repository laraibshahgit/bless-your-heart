/**
 * Tests for the lambda health endpoint at netlify/functions/health.ts.
 *
 * The endpoint distinguishes liveness (zero-IO, "is the lambda up") from
 * readiness ("can it serve a /generate request" — checks env config and
 * Firestore connectivity). These tests pin the contract:
 *   - 200 ok / 200 degraded / 503 unhealthy mapping
 *   - GET and HEAD acceptance; everything else 405
 *   - Liveness path NEVER touches Firestore (cost / blast-radius guard)
 *   - Readiness path probe times out at FIRESTORE_PROBE_TIMEOUT_MS
 *   - Probe never returns env-var values (security boundary)
 *
 * Audit run 40/001.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { firestoreGet, getDbMock } = vi.hoisted(() => {
  const firestoreGet = vi.fn();
  const getDbMock = vi.fn(() => ({
    collection: () => ({
      doc: () => ({ get: firestoreGet }),
    }),
  }));
  return { firestoreGet, getDbMock };
});

vi.mock('@/server/firebaseAdmin', () => ({
  getDb: getDbMock,
}));

// Inline import after the mock — health.ts imports getDb lazily inside the
// readiness branch, so the mock only needs to be in place at handler-call
// time, not at import time.
import { handler } from '../../netlify/functions/health';

function callHealth(
  query: Record<string, string> = {},
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' = 'GET'
) {
  return handler(
    {
      httpMethod: method,
      headers: {},
      queryStringParameters: query,
    } as any,
    {} as any,
    () => undefined
  );
}

beforeEach(() => {
  firestoreGet.mockReset();
  getDbMock.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  // Default: production-required env vars present so readiness can pass.
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.FIREBASE_PROJECT_ID = 'test-project';
  process.env.FIREBASE_CLIENT_EMAIL = 'firebase@example.com';
  process.env.FIREBASE_PRIVATE_KEY = 'test-key';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('health endpoint — method handling', () => {
  it('GET is accepted', async () => {
    firestoreGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    const result = await callHealth({ mode: 'live' });
    expect((result as any).statusCode).toBe(200);
  });

  it('HEAD is accepted and returns empty body', async () => {
    const result = await callHealth({ mode: 'live' }, 'HEAD');
    expect((result as any).statusCode).toBe(200);
    expect((result as any).body).toBe('');
  });

  it.each(['POST', 'PUT'] as const)(
    '%s returns 405 with Allow header naming GET, HEAD',
    async (method) => {
      const result = await callHealth({}, method);
      expect((result as any).statusCode).toBe(405);
      expect((result as any).headers.Allow).toBe('GET, HEAD');
    }
  );
});

describe('health endpoint — liveness (mode=live)', () => {
  it('returns 200 status=ok with empty checks array — no I/O', async () => {
    const result = await callHealth({ mode: 'live' });
    expect((result as any).statusCode).toBe(200);
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('ok');
    expect(body.mode).toBe('live');
    expect(body.checks).toEqual([]);
  });

  it('does NOT touch Firestore even when configured', async () => {
    await callHealth({ mode: 'live' });
    expect(getDbMock).not.toHaveBeenCalled();
    expect(firestoreGet).not.toHaveBeenCalled();
  });

  it('does NOT touch Firestore even with required env vars missing', async () => {
    delete process.env.FIREBASE_PROJECT_ID;
    const result = await callHealth({ mode: 'live' });
    expect((result as any).statusCode).toBe(200);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('returns ISO timestamp + duration_ms', async () => {
    const result = await callHealth({ mode: 'live' });
    const body = JSON.parse((result as any).body);
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(typeof body.duration_ms).toBe('number');
    expect(body.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

describe('health endpoint — readiness (default mode)', () => {
  it('returns 200 status=ok when config + Firestore both pass', async () => {
    firestoreGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    const result = await callHealth({});
    expect((result as any).statusCode).toBe(200);
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('ok');
    expect(body.mode).toBe('ready');
    const checkNames = body.checks.map((c: { name: string }) => c.name);
    expect(checkNames).toEqual(expect.arrayContaining(['config', 'firestore']));
    const firestoreCheck = body.checks.find((c: { name: string }) => c.name === 'firestore');
    expect(firestoreCheck.status).toBe('ok');
    expect(firestoreCheck.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns 503 status=unhealthy when ANTHROPIC_API_KEY missing (config check fails)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    firestoreGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    const result = await callHealth({});
    expect((result as any).statusCode).toBe(503);
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('unhealthy');
    const configCheck = body.checks.find((c: { name: string }) => c.name === 'config');
    expect(configCheck.status).toBe('fail');
    expect(configCheck.message).toContain('ANTHROPIC_API_KEY');
  });

  it('returns 200 status=degraded when Firestore probe fails but config passes', async () => {
    firestoreGet.mockRejectedValueOnce(new Error('firestore unreachable'));
    const result = await callHealth({});
    expect((result as any).statusCode).toBe(200);
    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('degraded');
    const fsCheck = body.checks.find((c: { name: string }) => c.name === 'firestore');
    expect(fsCheck.status).toBe('fail');
    expect(fsCheck.message).toBe('firestore unreachable');
  });

  it('Firestore probe failures do NOT leak the underlying error string into the response body', async () => {
    // The full error string contains the stack trace and possibly internal
    // hostnames / project IDs. Surface only a generic message; full error
    // goes to the structured log only.
    firestoreGet.mockRejectedValueOnce(
      new Error('PERMISSION_DENIED: project bless-your-heart-prod-12345 IAM denied')
    );
    const result = await callHealth({});
    const body = JSON.parse((result as any).body);
    const fsCheck = body.checks.find((c: { name: string }) => c.name === 'firestore');
    // Body must not contain the project ID, IAM, or PERMISSION_DENIED text.
    expect(fsCheck.message).not.toContain('PERMISSION_DENIED');
    expect(fsCheck.message).not.toContain('bless-your-heart-prod-12345');
    expect(fsCheck.message).not.toContain('IAM');
  });

  it('Firestore probe skips (not fails) when Firebase config is missing', async () => {
    // When firebase env vars are absent, `getDb()` would throw on init.
    // The probe short-circuits to skipped rather than producing a confusing
    // "fail" with a credential error. The config check still surfaces the
    // root cause.
    delete process.env.FIREBASE_PROJECT_ID;
    const result = await callHealth({});
    const body = JSON.parse((result as any).body);
    const fsCheck = body.checks.find((c: { name: string }) => c.name === 'firestore');
    expect(fsCheck.status).toBe('skipped');
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('readiness body never contains env-var values (security boundary)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-supersecret-do-not-leak';
    process.env.IP_SALT_BASE = 'salt-do-not-leak';
    firestoreGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    const result = await callHealth({});
    const bodyText = (result as any).body as string;
    expect(bodyText).not.toContain('sk-ant-supersecret-do-not-leak');
    expect(bodyText).not.toContain('salt-do-not-leak');
  });

  it('readiness times out the Firestore probe at ~2 seconds', async () => {
    // A hung Firestore connection MUST NOT hang the readiness probe past
    // FIRESTORE_PROBE_TIMEOUT_MS = 2000. We use fake timers + a never-
    // resolving get() so the race resolves to the timeout reject. The
    // result should still be a degraded response, not a stalled handler.
    vi.useFakeTimers();
    firestoreGet.mockReturnValueOnce(new Promise(() => undefined)); // never resolves

    const promise = callHealth({});
    await vi.advanceTimersByTimeAsync(2001);
    const result = await promise;

    const body = JSON.parse((result as any).body);
    expect(body.status).toBe('degraded');
    const fsCheck = body.checks.find((c: { name: string }) => c.name === 'firestore');
    expect(fsCheck.status).toBe('fail');
  });

  it('emits a structured log line on Firestore probe failure (ops signal)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firestoreGet.mockRejectedValueOnce(new Error('boom'));
    await callHealth({});

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
      .filter((e): e is { event: string; error?: string } => e !== null);

    const probeFail = events.find((e) => e.event === 'health_firestore_probe_failed');
    expect(probeFail).toBeTruthy();
    expect(probeFail?.error).toContain('boom');
  });
});

describe('health endpoint — response shape contract', () => {
  it('always returns Content-Type: application/json; charset=utf-8', async () => {
    firestoreGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    const result = await callHealth({});
    expect((result as any).headers['Content-Type']).toBe('application/json; charset=utf-8');
  });

  it('always returns Cache-Control: no-store (probes must hit the lambda each time)', async () => {
    firestoreGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    const result = await callHealth({});
    expect((result as any).headers['Cache-Control']).toBe('no-store');
  });

  it('returns valid JSON in the body for both modes', async () => {
    firestoreGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
    const ready = await callHealth({});
    expect(() => JSON.parse((ready as any).body)).not.toThrow();
    const live = await callHealth({ mode: 'live' });
    expect(() => JSON.parse((live as any).body)).not.toThrow();
  });
});
