/**
 * Smoke tests — fast, shallow checks that the app is alive.
 *
 * "Is it on fire?" — not "is every feature correct".
 * Run after every deploy. If any of these fail, stop and fix before going deeper.
 */

import { describe, it, expect } from 'vitest';
import photos from '@/data/photos.json';
import type { Photo } from '@/types';

describe('smoke', () => {
  it('photo library has at least one valid photo', () => {
    const typed = photos as Photo[];
    expect(typed.length).toBeGreaterThan(0);
    const first = typed[0];
    expect(first.id).toMatch(/^[a-z]+(-[a-z]+)*-\d{2,}$/);
    expect(first.capacity.line1).toBeGreaterThan(0);
    expect(first.capacity.line2).toBeGreaterThan(0);
  });

  it('safety filters import and run on a clean prompt without crashing', async () => {
    const { checkSlurFilter, checkRealPersonFilter, checkDistressPhraseList } = await import(
      '@/server/safety'
    );
    expect(checkSlurFilter('my morning routine')).toBe(false);
    expect(checkRealPersonFilter('my morning routine')).toBe(false);
    expect(checkDistressPhraseList('my morning routine')).toBe(false);
  });

  it('validation parses a well-formed Sonnet response', async () => {
    const { parseGenerationOutput } = await import('@/server/validation');
    const result = parseGenerationOutput(
      '{"line1":"The universe sees your effort","line2":"It also sees the laundry pile growing again"}'
    );
    expect(result).not.toBeNull();
    expect(result?.line1.length).toBeLessThanOrEqual(60);
    expect(result?.line2.length).toBeLessThanOrEqual(100);
  });

  it('photo selection returns a photo for typical line lengths', async () => {
    const { selectPhoto } = await import('@/server/photoSelection');
    const result = selectPhoto(photos as Photo[], 35, 70, []);
    expect(result).not.toBeNull();
    expect(result?.photoId).toBeTruthy();
    expect([1, 2, 3]).toContain(result?.rung);
  });

  it('fallbacks library is non-empty and well-formed', async () => {
    const { safeFallbacks } = await import('@/server/fallbacks');
    expect(safeFallbacks.length).toBeGreaterThan(0);
    for (const fb of safeFallbacks) {
      expect(fb.line1.length).toBeLessThanOrEqual(60);
      expect(fb.line2.length).toBeLessThanOrEqual(100);
      expect(fb.photoId).toBeTruthy();
    }
  });

  it('hotline lookup returns a usable resource when country missing', async () => {
    const { getHotlineForCountry } = await import('@/server/hotlines');
    const hotline = getHotlineForCountry('');
    expect(hotline).toBeTruthy();
    expect(hotline.name).toBeTruthy();
    // International fallback has no phone but must offer a URL so the user has *some* path forward
    expect(Boolean(hotline.phone) || Boolean(hotline.url)).toBe(true);
  });

  it('error copy is defined and non-empty', async () => {
    const { errorCopy } = await import('@/content/copy');
    expect(errorCopy.generation.unknown).toBeTruthy();
    expect(errorCopy.generation.networkOffline).toBeTruthy();
    expect(errorCopy.generation.anthropicError).toBeTruthy();
  });
});
