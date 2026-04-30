import photosData from '@/data/photos.json';
import type { Photo } from '@/types';

const photos: Photo[] = photosData as Photo[];

interface PhotoSelectionResult {
  photoId: string;
  fittingRung: 1 | 2 | 3 | 4;
  credit: string;
}

export function selectPhoto(
  line1: string,
  line2: string,
  excludePhotoIds: string[]
): PhotoSelectionResult | null {
  const line1Len = line1.length;
  const line2Len = line2.length;

  let candidates = photos.filter(
    (p) =>
      p.capacity.line1 >= line1Len &&
      p.capacity.line2 >= line2Len &&
      !excludePhotoIds.includes(p.id)
  );

  if (candidates.length > 0) {
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    return { photoId: selected.id, fittingRung: 1, credit: selected.credit };
  }

  candidates = photos.filter(
    (p) => p.tier === 'high-capacity' && !excludePhotoIds.includes(p.id)
  );

  if (candidates.length > 0) {
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    return { photoId: selected.id, fittingRung: 2, credit: selected.credit };
  }

  candidates = photos.filter((p) => p.tier === 'high-capacity');

  if (candidates.length > 0) {
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    return { photoId: selected.id, fittingRung: 3, credit: selected.credit };
  }

  return null;
}
