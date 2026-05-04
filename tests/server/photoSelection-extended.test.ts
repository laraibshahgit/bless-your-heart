import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { selectPhoto } from '@/server/photoSelection';
import type { Photo } from '@/types';

function makePhoto(id: string, line1: number, line2: number, tier: Photo['tier'] = 'standard'): Photo {
  return {
    id,
    width: 1080,
    height: 1080,
    textZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 },
    capacity: { line1, line2 },
    textColor: 'white',
    watermarkPosition: 'lower-right',
    tier,
    credit: '',
  };
}

describe('selectPhoto (extended)', () => {
  beforeEach(() => {
    // Force deterministic randomness — picks the first eligible photo
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for empty photo library', () => {
    expect(selectPhoto([], 30, 70, [])).toBeNull();
  });

  it('rung 1: prefers any eligible standard photo over any high-cap fallback', () => {
    const photos = [
      makePhoto('std-01', 60, 100, 'standard'),
      makePhoto('hc-01', 80, 120, 'high-capacity'),
    ];
    const result = selectPhoto(photos, 30, 70, []);
    expect(result?.rung).toBe(1);
  });

  it('rung 1: matches when capacity exactly equals line length (boundary)', () => {
    const photos = [makePhoto('exact-01', 50, 100, 'standard')];
    const result = selectPhoto(photos, 50, 100, []);
    expect(result?.rung).toBe(1);
    expect(result?.photoId).toBe('exact-01');
  });

  it('rung 1: rejects when line1Length is 1 over capacity', () => {
    const photos = [
      makePhoto('std-01', 49, 100, 'standard'),
      makePhoto('hc-01', 60, 100, 'high-capacity'),
    ];
    const result = selectPhoto(photos, 50, 100, []);
    // std-01 not eligible (49 < 50). hc-01 eligible — still rung 1 (it's high-cap but eligible)
    expect(result?.rung).toBe(1);
    expect(result?.photoId).toBe('hc-01');
  });

  it('rung 2: falls back to non-excluded high-capacity when nothing fits', () => {
    const photos = [
      makePhoto('std-01', 30, 50, 'standard'),
      makePhoto('hc-01', 40, 60, 'high-capacity'),
      makePhoto('hc-02', 40, 60, 'high-capacity'),
    ];
    const result = selectPhoto(photos, 80, 120, []);
    expect(result?.rung).toBe(2);
    expect(['hc-01', 'hc-02']).toContain(result?.photoId);
  });

  it('rung 2: respects excludeIds when picking the high-cap fallback', () => {
    const photos = [
      makePhoto('std-01', 30, 50, 'standard'),
      makePhoto('hc-01', 40, 60, 'high-capacity'),
      makePhoto('hc-02', 40, 60, 'high-capacity'),
    ];
    const result = selectPhoto(photos, 80, 120, ['hc-01']);
    expect(result?.rung).toBe(2);
    expect(result?.photoId).toBe('hc-02');
  });

  it('rung 3: ignores excludeIds when no eligible or non-excluded high-cap remains', () => {
    const photos = [
      makePhoto('hc-01', 40, 60, 'high-capacity'),
      makePhoto('hc-02', 40, 60, 'high-capacity'),
    ];
    const result = selectPhoto(photos, 80, 120, ['hc-01', 'hc-02']);
    expect(result?.rung).toBe(3);
    expect(['hc-01', 'hc-02']).toContain(result?.photoId);
  });

  it('rung 3: still null when there are no high-cap photos at all', () => {
    const photos = [makePhoto('std-01', 30, 50, 'standard')];
    const result = selectPhoto(photos, 80, 120, []);
    expect(result).toBeNull();
  });

  it('Math.random=0 deterministically picks the first eligible photo', () => {
    const photos = [
      makePhoto('a-01', 60, 100, 'standard'),
      makePhoto('b-02', 60, 100, 'standard'),
      makePhoto('c-03', 60, 100, 'standard'),
    ];
    const result = selectPhoto(photos, 30, 70, []);
    expect(result?.photoId).toBe('a-01');
  });

  it('Math.random=0.99 picks the last eligible photo', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const photos = [
      makePhoto('a-01', 60, 100, 'standard'),
      makePhoto('b-02', 60, 100, 'standard'),
      makePhoto('c-03', 60, 100, 'standard'),
    ];
    const result = selectPhoto(photos, 30, 70, []);
    expect(result?.photoId).toBe('c-03');
  });

  it('handles zero-length lines (degenerate but valid)', () => {
    const photos = [makePhoto('a-01', 60, 100, 'standard')];
    const result = selectPhoto(photos, 0, 0, []);
    expect(result?.rung).toBe(1);
  });
});
