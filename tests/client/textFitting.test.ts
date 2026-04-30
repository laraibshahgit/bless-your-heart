import photos from '@/data/photos.json';
import type { Photo } from '@/types';

const typedPhotos = photos as Photo[];

describe('photos.json data integrity', () => {
  it('contains at least one photo', () => {
    expect(typedPhotos.length).toBeGreaterThan(0);
  });

  describe('capacity values', () => {
    it('every photo has positive line1 and line2 capacity', () => {
      for (const photo of typedPhotos) {
        expect(photo.capacity.line1, `${photo.id} line1`).toBeGreaterThan(0);
        expect(photo.capacity.line2, `${photo.id} line2`).toBeGreaterThan(0);
      }
    });
  });

  describe('high-capacity tier', () => {
    const highCap = typedPhotos.filter((p) => p.tier === 'high-capacity');

    it('has at least one high-capacity photo', () => {
      expect(highCap.length).toBeGreaterThan(0);
    });

    it('high-capacity photos have line1 >= 60', () => {
      for (const photo of highCap) {
        expect(photo.capacity.line1, photo.id).toBeGreaterThanOrEqual(60);
      }
    });

    it('high-capacity photos have line2 >= 100', () => {
      for (const photo of highCap) {
        expect(photo.capacity.line2, photo.id).toBeGreaterThanOrEqual(100);
      }
    });
  });

  describe('standard vs high-capacity ordering', () => {
    const standard = typedPhotos.filter((p) => p.tier === 'standard');
    const highCap = typedPhotos.filter((p) => p.tier === 'high-capacity');

    it('standard photos have lower capacity than high-capacity photos', () => {
      if (standard.length === 0 || highCap.length === 0) return;

      const maxStandardLine1 = Math.max(...standard.map((p) => p.capacity.line1));
      const maxStandardLine2 = Math.max(...standard.map((p) => p.capacity.line2));
      const minHighCapLine1 = Math.min(...highCap.map((p) => p.capacity.line1));
      const minHighCapLine2 = Math.min(...highCap.map((p) => p.capacity.line2));

      expect(maxStandardLine1).toBeLessThan(minHighCapLine1);
      expect(maxStandardLine2).toBeLessThan(minHighCapLine2);
    });
  });

  describe('textZone bounds', () => {
    it('all textZone values are in 0-1 range', () => {
      for (const photo of typedPhotos) {
        const { x, y, width, height } = photo.textZone;
        expect(x, `${photo.id} x`).toBeGreaterThanOrEqual(0);
        expect(x, `${photo.id} x`).toBeLessThanOrEqual(1);
        expect(y, `${photo.id} y`).toBeGreaterThanOrEqual(0);
        expect(y, `${photo.id} y`).toBeLessThanOrEqual(1);
        expect(width, `${photo.id} width`).toBeGreaterThanOrEqual(0);
        expect(width, `${photo.id} width`).toBeLessThanOrEqual(1);
        expect(height, `${photo.id} height`).toBeGreaterThanOrEqual(0);
        expect(height, `${photo.id} height`).toBeLessThanOrEqual(1);
      }
    });

    it('textZone x + width does not exceed 1.01', () => {
      for (const photo of typedPhotos) {
        const sum = photo.textZone.x + photo.textZone.width;
        expect(sum, `${photo.id} x+width=${sum}`).toBeLessThanOrEqual(1.01);
      }
    });

    it('textZone y + height does not exceed 1.01', () => {
      for (const photo of typedPhotos) {
        const sum = photo.textZone.y + photo.textZone.height;
        expect(sum, `${photo.id} y+height=${sum}`).toBeLessThanOrEqual(1.01);
      }
    });
  });
});
