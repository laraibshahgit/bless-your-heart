import type { Photo } from '@/types';

interface PhotoSelectionResult {
  photoId: string;
  rung: 1 | 2 | 3;
}

export function selectPhoto(
  photos: Photo[],
  line1Length: number,
  line2Length: number,
  excludeIds: string[]
): PhotoSelectionResult | null {
  const eligible = photos.filter(
    (p) =>
      p.capacity.line1 >= line1Length &&
      p.capacity.line2 >= line2Length &&
      !excludeIds.includes(p.id)
  );

  if (eligible.length > 0) {
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    return { photoId: pick.id, rung: 1 };
  }

  const highCap = photos.filter(
    (p) => p.tier === 'high-capacity' && !excludeIds.includes(p.id)
  );

  if (highCap.length > 0) {
    const pick = highCap[Math.floor(Math.random() * highCap.length)];
    return { photoId: pick.id, rung: 2 };
  }

  const allHighCap = photos.filter((p) => p.tier === 'high-capacity');

  if (allHighCap.length > 0) {
    const pick = allHighCap[Math.floor(Math.random() * allHighCap.length)];
    return { photoId: pick.id, rung: 3 };
  }

  return null;
}
