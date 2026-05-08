// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const FAKE_FACE = { family: 'Cormorant Garamond' } as unknown as FontFace;

beforeEach(() => {
  vi.resetModules();
  vi.useRealTimers();
});

describe('ensureFontsReady', () => {
  it('caches the promise — second call returns the same instance', async () => {
    const load = vi.fn().mockResolvedValue([FAKE_FACE]);
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve(), load },
      configurable: true,
    });

    const { ensureFontsReady } = await import('@/lib/fonts');

    const first = ensureFontsReady();
    const second = ensureFontsReady();
    expect(first).toBe(second);

    await first;
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('returns immediately on third call when fonts verified', async () => {
    const load = vi.fn().mockResolvedValue([FAKE_FACE]);
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve(), load },
      configurable: true,
    });

    const { ensureFontsReady } = await import('@/lib/fonts');
    await ensureFontsReady();
    expect(load).toHaveBeenCalledTimes(3);

    load.mockClear();
    await ensureFontsReady();
    expect(load).not.toHaveBeenCalled();
  });

  it('awaits document.fonts.ready and loads all three font variants', async () => {
    const load = vi.fn().mockResolvedValue([FAKE_FACE]);
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve(), load },
      configurable: true,
    });

    const { ensureFontsReady } = await import('@/lib/fonts');
    await ensureFontsReady();

    expect(load).toHaveBeenCalledWith('700 64px "Cormorant Garamond"');
    expect(load).toHaveBeenCalledWith('italic 600 44px "Cormorant Garamond"');
    expect(load).toHaveBeenCalledWith('400 18px "Cormorant Garamond"');
  });

  it('retries once when initial load returns empty faces, then clears cache', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue([]);
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve(), load },
      configurable: true,
    });

    const { ensureFontsReady } = await import('@/lib/fonts');
    const p = ensureFontsReady();

    // Initial load: 3 calls
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(3);

    // Retry delay fires, then 3 more calls
    await vi.advanceTimersByTimeAsync(100);
    expect(load).toHaveBeenCalledTimes(6);

    await p;

    // Cache cleared — next call creates a new promise
    load.mockClear();
    const next = ensureFontsReady();
    expect(next).not.toBe(p);
    // Clean up the new in-flight promise
    await vi.advanceTimersByTimeAsync(100);
    await next;
  });

  it('verifies on first load and skips retry when all faces returned', async () => {
    const load = vi.fn().mockResolvedValue([FAKE_FACE]);
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve(), load },
      configurable: true,
    });

    const { ensureFontsReady } = await import('@/lib/fonts');
    await ensureFontsReady();

    // Only 3 calls (no retry)
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('rejects if document.fonts.load rejects and clears cache for retry', async () => {
    const load = vi.fn().mockRejectedValue(new Error('font load failed'));
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve(), load },
      configurable: true,
    });

    const { ensureFontsReady } = await import('@/lib/fonts');
    const first = ensureFontsReady();
    await expect(first).rejects.toThrow('font load failed');

    // Cache cleared on rejection — next call retries instead of returning
    // the stale rejected promise permanently.
    load.mockClear();
    load.mockResolvedValue([FAKE_FACE]);
    const second = ensureFontsReady();
    expect(second).not.toBe(first);
    await expect(second).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('returns a Promise<void>', async () => {
    const load = vi.fn().mockResolvedValue([FAKE_FACE]);
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve(), load },
      configurable: true,
    });

    const { ensureFontsReady } = await import('@/lib/fonts');
    const result = ensureFontsReady();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });
});
