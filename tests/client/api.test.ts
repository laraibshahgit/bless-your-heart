// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callGenerate } from '@/lib/api';
import { errorCopy } from '@/content/copy';

// jsdom directive above is required: this file modifies `navigator.onLine` and
// stubs `fetch`. Running under the default `node` env worked only because Node 21+
// added a built-in `globalThis.navigator` — older Node and CI images that pin
// the minor would silently fail.

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    value: true,
    configurable: true,
  });
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('callGenerate', () => {
  it('returns parsed response on successful fetch', async () => {
    const mockBody = {
      status: 'ok' as const,
      line1: 'The universe sees you',
      line2: 'It sees you eating cereal at 3am again',
      photoId: 'misty-fjord-01',
      fittingRung: 1 as const,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBody),
    });

    const result = await callGenerate('my career', []);

    expect(fetch).toHaveBeenCalledWith(
      '/.netlify/functions/generate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'my career', excludePhotoIds: [] }),
      })
    );
    expect(result).toEqual(mockBody);
  });

  // Outer fetch timeout contract — see api.ts comment. The signal is the only
  // guard the browser has if a Netlify lambda hangs mid-response (e.g. the
  // platform returns headers but never closes the stream). Without this the
  // user's tab spinner runs forever; with it, the timeout-rejected fetch
  // falls into the catch block and surfaces errorCopy.generation.unknown.
  it('attaches an AbortSignal to the fetch call (timeout cap)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          line1: 'a',
          line2: 'b',
          photoId: 'x',
          fittingRung: 1,
        }),
    });

    await callGenerate('test', []);

    const init = (fetch as any).mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns retryable error on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await callGenerate('my commute', []);

    expect(result).toEqual({
      status: 'error',
      message: errorCopy.generation.unknown,
      retryable: true,
    });
  });

  it('returns offline message when navigator.onLine is false', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: false,
      configurable: true,
    });
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await callGenerate('my commute', []);

    expect(result).toEqual({
      status: 'error',
      message: errorCopy.generation.networkOffline,
      retryable: true,
    });
  });

  it('passes through API error responses', async () => {
    const errorBody = {
      status: 'error' as const,
      message: 'bad request',
      retryable: false,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(errorBody),
    });

    const result = await callGenerate('whatever', ['id-1']);

    expect(result).toEqual(errorBody);
  });

  it('returns retryable error on 5xx server response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await callGenerate('stress', []);

    expect(result).toEqual({
      status: 'error',
      message: errorCopy.generation.anthropicError,
      retryable: true,
    });
  });

  it('returns retryable error on non-5xx failure response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });

    const result = await callGenerate('stress', []);

    expect(result).toEqual({
      status: 'error',
      message: errorCopy.generation.unknown,
      retryable: true,
    });
  });

  it('sends excludePhotoIds in the request body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          line1: 'a',
          line2: 'b',
          photoId: 'x',
          fittingRung: 1,
        }),
    });

    await callGenerate('test', ['id-1', 'id-2']);

    expect(fetch).toHaveBeenCalledWith(
      '/.netlify/functions/generate',
      expect.objectContaining({
        body: JSON.stringify({ prompt: 'test', excludePhotoIds: ['id-1', 'id-2'] }),
      })
    );
  });
});
