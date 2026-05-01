// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('ensureFontsReady', () => {
  it('caches the promise — second call returns the same instance', async () => {
    const ready = Promise.resolve();
    const load = vi.fn().mockResolvedValue([]);
    Object.defineProperty(document, 'fonts', {
      value: { ready, load },
      configurable: true,
    });

    const { ensureFontsReady } = await import('@/lib/fonts');

    const first = ensureFontsReady();
    const second = ensureFontsReady();
    expect(first).toBe(second);

    await first;
    // load() should be called for each of the 3 weights/styles, but only once total
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('awaits document.fonts.ready and loads all three font variants', async () => {
    const load = vi.fn().mockResolvedValue([]);
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve(), load },
      configurable: true,
    });

    const { ensureFontsReady } = await import('@/lib/fonts');
    await ensureFontsReady();

    expect(load).toHaveBeenCalledWith('500 64px "Cormorant Garamond"');
    expect(load).toHaveBeenCalledWith('italic 400 44px "Cormorant Garamond"');
    expect(load).toHaveBeenCalledWith('400 18px "Cormorant Garamond"');
  });

  it('rejects if document.fonts.load rejects', async () => {
    const load = vi.fn().mockRejectedValue(new Error('font load failed'));
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve(), load },
      configurable: true,
    });

    const { ensureFontsReady } = await import('@/lib/fonts');
    await expect(ensureFontsReady()).rejects.toThrow('font load failed');
  });

  it('returns a Promise<void>', async () => {
    const load = vi.fn().mockResolvedValue([]);
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
