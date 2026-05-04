import type { Photo } from '@/types';

interface PhotoSelectionResult {
  photoId: string;
  rung: 1 | 2 | 3;
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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
    return { photoId: randomPick(eligible).id, rung: 1 };
  }

  const highCap = photos.filter(
    (p) => p.tier === 'high-capacity' && !excludeIds.includes(p.id)
  );

  if (highCap.length > 0) {
    return { photoId: randomPick(highCap).id, rung: 2 };
  }

  const allHighCap = photos.filter((p) => p.tier === 'high-capacity');

  if (allHighCap.length > 0) {
    return { photoId: randomPick(allHighCap).id, rung: 3 };
  }

  return null;
}
