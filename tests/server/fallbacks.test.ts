import { describe, it, expect } from 'vitest';
import { safeFallbacks } from '@/server/fallbacks';
import photos from '@/data/photos.json';
import type { Photo } from '@/types';

const knownPhotoIds = new Set((photos as Photo[]).map((p) => p.id));

describe('safeFallbacks', () => {
  it('contains at least one entry (otherwise the safety net silently breaks)', () => {
    expect(safeFallbacks.length).toBeGreaterThan(0);
  });

  it('every fallback respects the line1 hard cap of 60 chars', () => {
    for (const fb of safeFallbacks) {
      expect(fb.line1.length, `line1 "${fb.line1}" exceeds cap`).toBeLessThanOrEqual(60);
    }
  });

  it('every fallback respects the line2 hard cap of 100 chars', () => {
    for (const fb of safeFallbacks) {
      expect(fb.line2.length, `line2 "${fb.line2}" exceeds cap`).toBeLessThanOrEqual(100);
    }
  });

  it('every fallback has non-empty lines', () => {
    for (const fb of safeFallbacks) {
      expect(fb.line1.trim().length).toBeGreaterThan(0);
      expect(fb.line2.trim().length).toBeGreaterThan(0);
    }
  });

  it('every fallback references a photoId that exists in photos.json', () => {
    for (const fb of safeFallbacks) {
      expect(
        knownPhotoIds.has(fb.photoId),
        `safeFallback photoId "${fb.photoId}" not found in photos.json`
      ).toBe(true);
    }
  });

  it('fallback line1 entries are visually distinct (no exact duplicates)', () => {
    const lines = safeFallbacks.map((f) => f.line1);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('fallback line2 entries are visually distinct', () => {
    const lines = safeFallbacks.map((f) => f.line2);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('no fallback uses an exclamation point (voice rule)', () => {
    for (const fb of safeFallbacks) {
      expect(fb.line1).not.toContain('!');
      expect(fb.line2).not.toContain('!');
    }
  });
});
