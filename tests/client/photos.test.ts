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

