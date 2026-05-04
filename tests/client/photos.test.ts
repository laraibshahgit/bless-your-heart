import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Single afterEach handles both module reset and env restoration. The previous
// version registered TWO file-level afterEach hooks — one early (unstub) and
// one after the describes (restore original) — which made the order of cleanup
// non-obvious and easy to break by reordering blocks.
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getPhotoUrl', () => {
  it('builds the URL using the configured base, percent-encodes the path, and appends ?alt=media', async () => {
    vi.stubEnv('VITE_FIREBASE_STORAGE_BASE_URL', 'https://example.com/v0/b/bucket/o');
    const { getPhotoUrl } = await import('@/lib/photos');

    const url = getPhotoUrl('misty-fjord-01');
    // URLencode of "photos/misty-fjord-01.jpg" -> "photos%2Fmisty-fjord-01.jpg"
    expect(url).toBe('https://example.com/v0/b/bucket/o/photos%2Fmisty-fjord-01.jpg?alt=media');
  });

  it('returns "/photos%2F<id>.jpg?alt=media" when base is missing (falsy fallback to empty string)', async () => {
    vi.stubEnv('VITE_FIREBASE_STORAGE_BASE_URL', '');
    const { getPhotoUrl } = await import('@/lib/photos');
    const url = getPhotoUrl('a-01');
    expect(url).toBe('/photos%2Fa-01.jpg?alt=media');
  });

  it('encodes id characters that are URL-meaningful', async () => {
    vi.stubEnv('VITE_FIREBASE_STORAGE_BASE_URL', 'https://x');
    const { getPhotoUrl } = await import('@/lib/photos');
    // Hypothetical id with a space — encodeURIComponent escapes it
    const url = getPhotoUrl('weird id-99');
    expect(url).toContain('photos%2Fweird%20id-99.jpg');
  });

  it('produces a double-slashed URL when base ends with "/" (documented behavior, not normalized)', async () => {
    // BOUNDARY DOC: the env var format is implicitly "no trailing slash".
    // `getPhotoUrl` does `${base}/${path}` — if `base` ends with "/", the URL
    // contains a literal "//". Firebase Storage's REST endpoint tolerates
    // this in practice (it normalizes), but a stricter CDN or signed-URL
    // proxy could reject it. Pinning the current behavior so a future env
    // change to a stricter host produces a clear test failure here BEFORE
    // it produces a 404 in production.
    vi.stubEnv('VITE_FIREBASE_STORAGE_BASE_URL', 'https://example.com/');
    const { getPhotoUrl } = await import('@/lib/photos');
    const url = getPhotoUrl('a-01');
    expect(url).toBe('https://example.com//photos%2Fa-01.jpg?alt=media');
  });
});

describe('getPhotoById', () => {
  it('returns the photo for a known id', async () => {
    const { getPhotoById } = await import('@/lib/photos');
    const photo = getPhotoById('misty-fjord-01');
    expect(photo).toBeDefined();
    expect(photo?.id).toBe('misty-fjord-01');
  });

  it('returns undefined for an unknown id', async () => {
    const { getPhotoById } = await import('@/lib/photos');
    expect(getPhotoById('does-not-exist-99')).toBeUndefined();
  });

  it('returns undefined for empty string', async () => {
    const { getPhotoById } = await import('@/lib/photos');
    expect(getPhotoById('')).toBeUndefined();
  });
});

describe('getAllCredits', () => {
  // Merged from two tests ('returns objects with id and credit fields' and
  // 'skips photos with empty credit'): the original "skips empty credit" assertion
  // is fully implied by the >0-length check, and both iterated the same array.
  it('returns objects with non-empty id and credit (skipping any photos with empty credit)', async () => {
    const { getAllCredits } = await import('@/lib/photos');
    const credits = getAllCredits();
    for (const c of credits) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.credit).toBe('string');
      expect(c.credit.length).toBeGreaterThan(0);
    }
  });
});

// `prefetchPhoto` is a fire-and-forget photo warm. It must:
//   1) Not throw when Image is undefined (SSR / hostile test env).
//   2) Set crossOrigin to 'anonymous' so the prefetch hits the same browser
//      cache key as `loadImage()` in compositor.ts. Without this, the
//      prefetch and the subsequent canvas-side fetch would land in
//      separate cache buckets and the photo would download twice — the
//      whole point of the optimization is wasted.
//   3) Set src to the URL produced by getPhotoUrl(photoId) — the same URL
//      used by PosterCanvas's loadImage call, or the cache miss again.
// Audit run 37/001.
describe('prefetchPhoto', () => {
  it('is a no-op when Image is undefined (does not throw)', async () => {
    // Node default test env has no `Image` global. Importing photos and
    // calling prefetchPhoto must not throw — the helper guards on
    // `typeof Image === 'undefined'`.
    vi.stubEnv('VITE_FIREBASE_STORAGE_BASE_URL', 'https://example.com');
    const { prefetchPhoto } = await import('@/lib/photos');
    expect(() => prefetchPhoto('misty-fjord-01')).not.toThrow();
  });

  it('creates an Image with crossOrigin="anonymous" and the photo URL', async () => {
    vi.stubEnv('VITE_FIREBASE_STORAGE_BASE_URL', 'https://example.com');
    // Stub a global Image constructor that captures construction. This
    // mirrors the cache-key contract: any drift in crossOrigin or URL
    // between this prefetch and `loadImage()` in compositor.ts breaks
    // the warm-cache hit.
    type CapturedImage = { crossOrigin?: string; src?: string };
    const captured: CapturedImage[] = [];
    class MockImage {
      crossOrigin?: string;
      private _src?: string;
      get src() { return this._src; }
      set src(v: string | undefined) {
        this._src = v;
        captured.push({ crossOrigin: this.crossOrigin, src: this._src });
      }
    }
    const original = (globalThis as { Image?: unknown }).Image;
    (globalThis as { Image: unknown }).Image = MockImage;
    try {
      const { prefetchPhoto } = await import('@/lib/photos');
      prefetchPhoto('misty-fjord-01');
      expect(captured).toHaveLength(1);
      expect(captured[0].crossOrigin).toBe('anonymous');
      expect(captured[0].src).toBe('https://example.com/photos%2Fmisty-fjord-01.jpg?alt=media');
    } finally {
      if (original === undefined) {
        delete (globalThis as { Image?: unknown }).Image;
      } else {
        (globalThis as { Image: unknown }).Image = original;
      }
    }
  });
});

