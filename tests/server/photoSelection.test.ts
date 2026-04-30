import { describe, it, expect } from 'vitest';
import { selectPhoto } from '@/server/photoSelection';
import type { Photo } from '@/types';

const mockPhotos: Photo[] = [
  { id: 'a-01', width: 1080, height: 1080, textZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 }, capacity: { line1: 40, line2: 80 }, textColor: 'white', watermarkPosition: 'lower-right', tier: 'standard', credit: '' },
  { id: 'b-02', width: 1080, height: 1080, textZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 }, capacity: { line1: 60, line2: 100 }, textColor: 'white', watermarkPosition: 'lower-right', tier: 'high-capacity', credit: '' },
  { id: 'c-03', width: 1080, height: 1080, textZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 }, capacity: { line1: 55, line2: 95 }, textColor: 'white', watermarkPosition: 'lower-right', tier: 'high-capacity', credit: '' },
];

describe('selectPhoto', () => {
  it('selects from eligible standard photos', () => {
    const result = selectPhoto(mockPhotos, 30, 70, []);
    expect(result).not.toBeNull();
  });

  it('excludes photos in excludeIds', () => {
    const result = selectPhoto(mockPhotos, 30, 70, ['a-01', 'b-02', 'c-03']);
    expect(result).not.toBeNull();
    expect(result!.rung).toBe(3);
  });

  it('falls back to high-capacity when standard cannot fit', () => {
    const result = selectPhoto(mockPhotos, 50, 90, []);
    expect(result).not.toBeNull();
    expect(['b-02', 'c-03']).toContain(result!.photoId);
  });

  it('returns null only when impossible', () => {
    const tiny: Photo[] = [
      { id: 'x-01', width: 1080, height: 1080, textZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 }, capacity: { line1: 10, line2: 10 }, textColor: 'white', watermarkPosition: 'lower-right', tier: 'standard', credit: '' },
    ];
    const result = selectPhoto(tiny, 50, 90, []);
    expect(result).toBeNull();
  });
});
