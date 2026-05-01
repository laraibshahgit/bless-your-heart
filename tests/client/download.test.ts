// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const saveAsMock = vi.fn();

vi.mock('file-saver', () => ({
  saveAs: (...args: unknown[]) => saveAsMock(...args),
}));

import { isIOSSafari, downloadPoster } from '@/lib/download';

const ORIGINAL_USER_AGENT = navigator.userAgent;

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

afterEach(() => {
  setUserAgent(ORIGINAL_USER_AGENT);
  saveAsMock.mockReset();
});

describe('isIOSSafari', () => {
  it('returns true for iPhone Safari user agent', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
    );
    expect(isIOSSafari()).toBe(true);
  });

  it('returns true for iPad Safari user agent', () => {
    setUserAgent(
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1'
    );
    expect(isIOSSafari()).toBe(true);
  });

  it('returns false for iPhone Chrome (CriOS)', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1'
    );
    expect(isIOSSafari()).toBe(false);
  });

  it('returns false for iPhone Firefox (FxiOS)', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 FxiOS/120.0 Mobile/15E148 Safari/604.1'
    );
    expect(isIOSSafari()).toBe(false);
  });

  it('returns false for desktop Safari (no iP*)', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
    );
    expect(isIOSSafari()).toBe(false);
  });

  it('returns false for Android Chrome', () => {
    setUserAgent(
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'
    );
    expect(isIOSSafari()).toBe(false);
  });
});

describe('downloadPoster', () => {
  function makeCanvas(blob: Blob | null): HTMLCanvasElement {
    return {
      toBlob: vi.fn((cb: BlobCallback) => cb(blob)),
    } as unknown as HTMLCanvasElement;
  }

  beforeEach(() => {
    saveAsMock.mockReset();
  });

  it('calls saveAs with the canvas blob and a generated filename', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' });
    const canvas = makeCanvas(blob);

    const ok = await downloadPoster(canvas);

    expect(ok).toBe(true);
    expect(saveAsMock).toHaveBeenCalledOnce();
    const [savedBlob, filename] = saveAsMock.mock.calls[0];
    expect(savedBlob).toBe(blob);
    expect(filename).toMatch(/^bless-your-heart-[a-z0-9]{1,6}\.png$/);
  });

  it('returns false when canvas.toBlob produces null', async () => {
    const canvas = makeCanvas(null);
    const ok = await downloadPoster(canvas);
    expect(ok).toBe(false);
    expect(saveAsMock).not.toHaveBeenCalled();
  });

  it('returns false when toBlob throws synchronously', async () => {
    const canvas = {
      toBlob: vi.fn(() => {
        throw new Error('oh no');
      }),
    } as unknown as HTMLCanvasElement;
    const ok = await downloadPoster(canvas);
    expect(ok).toBe(false);
  });

  it('returns false when saveAs throws', async () => {
    saveAsMock.mockImplementation(() => {
      throw new Error('storage full');
    });
    const blob = new Blob(['fake'], { type: 'image/png' });
    const canvas = makeCanvas(blob);
    const ok = await downloadPoster(canvas);
    expect(ok).toBe(false);
  });

  it('produces unique filenames across calls', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' });
    await downloadPoster(makeCanvas(blob));
    await downloadPoster(makeCanvas(blob));
    const filenames = saveAsMock.mock.calls.map((c) => c[1]);
    expect(new Set(filenames).size).toBe(2);
  });

  it('passes "image/png" as the toBlob mime type', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' });
    const toBlob = vi.fn((cb: BlobCallback) => cb(blob));
    await downloadPoster({ toBlob } as unknown as HTMLCanvasElement);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  });
});
