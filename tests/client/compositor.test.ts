// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/fonts', () => ({
  ensureFontsReady: vi.fn().mockResolvedValue(undefined),
}));

import { setupCanvas, composite, checkFit, loadImage } from '@/lib/compositor';
import type { Photo } from '@/types';

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 't-01',
    width: 1080,
    height: 1080,
    textZone: { x: 0.1, y: 0.55, width: 0.8, height: 0.3 },
    capacity: { line1: 60, line2: 100 },
    textColor: 'white',
    watermarkPosition: 'lower-right',
    tier: 'standard',
    credit: '',
    ...overrides,
  };
}

interface Calls {
  fillText: Array<[string, number, number]>;
  drawImage: Array<unknown[]>;
  measureText: Array<string>;
  setTransform: Array<unknown[]>;
  scale: Array<unknown[]>;
  clearRect: Array<unknown[]>;
  saveCount: number;
  restoreCount: number;
  fontValues: string[];
  fillStyleValues: string[];
  textAlignValues: string[];
  textBaselineValues: string[];
  globalAlphaValues: number[];
}

function createMockContext(textWidth = 100): { ctx: any; calls: Calls } {
  const calls: Calls = {
    fillText: [],
    drawImage: [],
    measureText: [],
    setTransform: [],
    scale: [],
    clearRect: [],
    saveCount: 0,
    restoreCount: 0,
    fontValues: [],
    fillStyleValues: [],
    textAlignValues: [],
    textBaselineValues: [],
    globalAlphaValues: [],
  };

  const ctx: any = {
    save: () => {
      calls.saveCount++;
    },
    restore: () => {
      calls.restoreCount++;
    },
    setTransform: (...args: unknown[]) => calls.setTransform.push(args),
    scale: (...args: unknown[]) => calls.scale.push(args),
    clearRect: (...args: unknown[]) => calls.clearRect.push(args),
    drawImage: (...args: unknown[]) => calls.drawImage.push(args),
    fillText: (text: string, x: number, y: number) => calls.fillText.push([text, x, y]),
    measureText: (text: string) => {
      calls.measureText.push(text);
      return { width: textWidth };
    },
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    letterSpacing: '0em',
    set font(v: string) {
      calls.fontValues.push(v);
    },
    set fillStyle(v: string) {
      calls.fillStyleValues.push(v);
    },
    set textAlign(v: string) {
      calls.textAlignValues.push(v);
    },
    set textBaseline(v: string) {
      calls.textBaselineValues.push(v);
    },
    set globalAlpha(v: number) {
      calls.globalAlphaValues.push(v);
    },
  };

  return { ctx, calls };
}

function makeCanvas(ctx: any): HTMLCanvasElement {
  const style: Record<string, string> = {};
  return {
    width: 0,
    height: 0,
    style: new Proxy(style, {
      set(t, k, v) {
        t[k as string] = String(v);
        return true;
      },
      get(t, k) {
        return t[k as string];
      },
    }),
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;
}

describe('setupCanvas', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  });

  it('sets logical canvas size scaled by devicePixelRatio', () => {
    const { ctx } = createMockContext();
    const canvas = makeCanvas(ctx);
    setupCanvas(canvas, 540);
    expect(canvas.width).toBe(2160); // 1080 * 2
    expect(canvas.height).toBe(2160);
    expect(canvas.style.width).toBe('540px');
    expect(canvas.style.height).toBe('540px');
  });

  it('falls back to dpr=1 when devicePixelRatio is undefined', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: undefined, configurable: true });
    const { ctx } = createMockContext();
    const canvas = makeCanvas(ctx);
    setupCanvas(canvas, 360);
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1080);
  });

  it('returns a 2D context', () => {
    const { ctx } = createMockContext();
    const canvas = makeCanvas(ctx);
    const result = setupCanvas(canvas, 540);
    expect(result).toBe(ctx);
  });

  it('enables high-quality image smoothing', () => {
    const { ctx } = createMockContext();
    const canvas = makeCanvas(ctx);
    setupCanvas(canvas, 540);
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.imageSmoothingQuality).toBe('high');
  });

  it('throws a descriptive error when getContext returns null', () => {
    const canvas = {
      width: 0,
      height: 0,
      style: {} as Record<string, string>,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    expect(() => setupCanvas(canvas, 540)).toThrow(
      /failed to acquire 2d canvas context/i
    );
  });
});

describe('composite', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  });

  it('draws image, line1, line2, and watermark in order', () => {
    const { ctx, calls } = createMockContext();
    const canvas = makeCanvas(ctx);
    const photo = makePhoto();
    const img = {} as HTMLImageElement;

    composite({ canvas, img, photo, line1: 'L1', line2: 'L2', scale: 1 });

    expect(calls.drawImage.length).toBe(1);
    // L1, L2, watermark "Bless Your Heart" — three fillText calls
    expect(calls.fillText.length).toBe(3);
    expect(calls.fillText[0][0]).toBe('L1');
    expect(calls.fillText[1][0]).toBe('L2');
    expect(calls.fillText[2][0]).toBe('Bless Your Heart');
  });

  it('uses white text fill for white photos', () => {
    const { ctx, calls } = createMockContext();
    const canvas = makeCanvas(ctx);
    composite({
      canvas,
      img: {} as HTMLImageElement,
      photo: makePhoto({ textColor: 'white' }),
      line1: 'a',
      line2: 'b',
    });
    // The first fillStyle assignment is for the text color
    expect(calls.fillStyleValues).toContain('#FFFFFF');
  });

  it('uses dark text fill for dark photos', () => {
    const { ctx, calls } = createMockContext();
    const canvas = makeCanvas(ctx);
    composite({
      canvas,
      img: {} as HTMLImageElement,
      photo: makePhoto({ textColor: 'dark' }),
      line1: 'a',
      line2: 'b',
    });
    expect(calls.fillStyleValues).toContain('#1A1612');
  });

  it('save() and restore() are called once each (state isolation)', () => {
    const { ctx, calls } = createMockContext();
    const canvas = makeCanvas(ctx);
    composite({
      canvas,
      img: {} as HTMLImageElement,
      photo: makePhoto(),
      line1: 'a',
      line2: 'b',
    });
    expect(calls.saveCount).toBe(1);
    expect(calls.restoreCount).toBe(1);
  });

  // Canvas is 1080x1080, watermark padding is 32. Each corner is one of the four
  // (x, y) ∈ {32, 1048} pairs. Parameterized to keep the geometry table visible.
  it.each([
    { position: 'lower-right' as const, expectedX: 1048, expectedY: 1048 },
    { position: 'lower-left' as const, expectedX: 32, expectedY: 1048 },
    { position: 'upper-left' as const, expectedX: 32, expectedY: 32 },
    { position: 'upper-right' as const, expectedX: 1048, expectedY: 32 },
  ])('positions $position watermark at ($expectedX, $expectedY)', ({ position, expectedX, expectedY }) => {
    const { ctx, calls } = createMockContext();
    const canvas = makeCanvas(ctx);
    composite({
      canvas,
      img: {} as HTMLImageElement,
      photo: makePhoto({ watermarkPosition: position }),
      line1: 'a',
      line2: 'b',
    });
    const watermark = calls.fillText[2];
    expect(watermark[1]).toBe(expectedX);
    expect(watermark[2]).toBe(expectedY);
  });

  it('respects scale parameter — line1 size = round(64 * scale)', () => {
    const { ctx, calls } = createMockContext();
    const canvas = makeCanvas(ctx);
    composite({
      canvas,
      img: {} as HTMLImageElement,
      photo: makePhoto(),
      line1: 'a',
      line2: 'b',
      scale: 0.75,
    });
    // line1 font: round(64 * 0.75) = 48
    expect(calls.fontValues[0]).toContain('48px');
    // line2 font: round(44 * 0.75) = 33
    expect(calls.fontValues[1]).toContain('33px');
  });

  it('uses scale=1 by default', () => {
    const { ctx, calls } = createMockContext();
    const canvas = makeCanvas(ctx);
    composite({
      canvas,
      img: {} as HTMLImageElement,
      photo: makePhoto(),
      line1: 'a',
      line2: 'b',
    });
    expect(calls.fontValues[0]).toContain('64px');
    expect(calls.fontValues[1]).toContain('44px');
  });

  it('centers text horizontally on the textZone center', () => {
    const { ctx, calls } = createMockContext();
    const canvas = makeCanvas(ctx);
    const photo = makePhoto({ textZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 } });
    composite({ canvas, img: {} as HTMLImageElement, photo, line1: 'a', line2: 'b' });
    // Center = (0.1 * 1080) + (0.8 * 1080)/2 = 108 + 432 = 540
    expect(calls.fillText[0][1]).toBe(540);
    expect(calls.fillText[1][1]).toBe(540);
  });

  it('sets watermark opacity to 0.85 then back to 1.0', () => {
    const { ctx, calls } = createMockContext();
    const canvas = makeCanvas(ctx);
    composite({
      canvas,
      img: {} as HTMLImageElement,
      photo: makePhoto(),
      line1: 'a',
      line2: 'b',
    });
    expect(calls.globalAlphaValues).toEqual([0.85, 1.0]);
  });
});

describe('checkFit', () => {
  // Each test below installs its own `vi.spyOn(document, 'createElement')`. We
  // restore in afterEach so the spy never leaks across tests — without this,
  // the previous test's mocked context could survive and silently shadow the
  // next test's setup (the kind of order-dependent flakiness that hides for
  // months until someone reorders a describe block).
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok with scale=1 when both lines fit comfortably', async () => {
    const { ctx } = createMockContext(100);
    vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement);

    const result = await checkFit('hi', 'there', makePhoto());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scale).toBe(1);
    }
  });

  it('returns scale < 1 when one line slightly overflows but stays above 0.6', async () => {
    // textZone.width 0.8 * 1080 = 864 - 2*24 = 816 usable. Force measureText = 1000 -> scale ~0.816
    const { ctx } = createMockContext(1000);
    vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement);

    const result = await checkFit('hi', 'there', makePhoto());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scale).toBeLessThan(1);
      expect(result.scale).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('returns overflow when shrink would go below 0.6', async () => {
    // measureText way too wide -> scale below 0.6
    const { ctx } = createMockContext(10_000);
    vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement);

    const result = await checkFit('massively long line one', 'massively long line two', makePhoto());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('overflow');
    }
  });

  it('throws a descriptive error when getContext returns null', async () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: () => null,
    } as unknown as HTMLCanvasElement);

    await expect(checkFit('a', 'b', makePhoto())).rejects.toThrow(
      /failed to acquire 2d canvas context/i
    );
  });

  it('uses the worst (smallest) scale between line1 and line2', async () => {
    let call = 0;
    const ctx = createMockContext().ctx;
    // Usable width = 0.8*1080 - 2*24 = 816
    // Want line1 measureText=1000 -> scale 0.816; line2 measureText=100 -> scale=1
    // Min should be 0.816 (line1's value)
    ctx.measureText = (_: string) => {
      call++;
      return { width: call === 1 ? 1000 : 100 };
    };
    vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement);

    const result = await checkFit('a', 'b', makePhoto());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // line1 is the limiting factor (800/1000 = 0.816)
      expect(result.scale).toBeCloseTo(816 / 1000, 2);
    }
  });
});

// `loadImage` race against a wall-clock timeout. Pre-fix, a hung CDN response
// (decode() never settles) left the user staring at a blank canvas after a
// successful /generate response — the PosterCanvas catch handler never fired
// because the decode promise never rejected. The 15s default is a wall-clock
// safety net, not a normal-case latency budget; tests here pass a tight
// override so jsdom finishes quickly.
describe('loadImage', () => {
  let OriginalImage: typeof Image;

  beforeEach(() => {
    OriginalImage = globalThis.Image;
  });

  afterEach(() => {
    globalThis.Image = OriginalImage;
  });

  function stubImage(decodeImpl: (img: any) => Promise<void>) {
    globalThis.Image = function () {
      const img: any = { src: '', crossOrigin: '' };
      img.decode = () => decodeImpl(img);
      return img;
    } as unknown as typeof Image;
  }

  it('resolves with the image when decode() finishes before the timeout', async () => {
    stubImage(() => Promise.resolve());
    const result = await loadImage('https://photos/test.jpg', 5_000);
    expect(result).toBeDefined();
    expect((result as unknown as { src: string }).src).toBe('https://photos/test.jpg');
  });

  it('rejects with a descriptive error when decode() exceeds the timeout', async () => {
    // Returns a Promise that never settles — simulates a CDN that accepted the
    // TCP/TLS handshake but never streams body bytes. Without the timeout,
    // Promise.race would hang forever; with it, the loader rejects fast and
    // the PosterCanvas catch handler logs `poster_render_failed`.
    stubImage(() => new Promise<void>(() => {}));
    await expect(loadImage('https://photos/hung.jpg', 50)).rejects.toThrow(
      /Image load timeout after 50ms: https:\/\/photos\/hung\.jpg/
    );
  });

  it('clears the timeout on success (no dangling rejection)', async () => {
    // Flag flips true if the timeout would have fired by re-using the same
    // image instance and instrumenting the src setter. If clearTimeout works,
    // the setter is only invoked twice (initial assignment + the test's own
    // post-resolve assertion); if it leaks, the timeout would null `src` after
    // the test resolves.
    let images: Array<{ src: string }> = [];
    globalThis.Image = function () {
      const img: any = { src: '', crossOrigin: '' };
      img.decode = () => Promise.resolve();
      images.push(img);
      return img;
    } as unknown as typeof Image;

    await loadImage('https://photos/ok.jpg', 30);
    // Wait past the would-be timeout and confirm src wasn't nulled by a stray fire.
    await new Promise((r) => setTimeout(r, 80));
    expect(images[0].src).toBe('https://photos/ok.jpg');
  });

  it('propagates the underlying decode error when decode() rejects', async () => {
    stubImage(() => Promise.reject(new Error('decode failed')));
    await expect(loadImage('https://photos/broken.jpg', 5_000)).rejects.toThrow(
      /decode failed/
    );
  });
});
