import photosData from '@/data/photos.json';
import type { Photo } from '@/types';

const photos = photosData as Photo[];

export function getPhotoUrl(photoId: string): string {
  const base = import.meta.env.VITE_FIREBASE_STORAGE_BASE_URL ?? '';
  return `${base}/photos/${photoId}.jpg`;
}

export function getPhotoById(photoId: string): Photo | undefined {
  return photos.find((p) => p.id === photoId);
}

export function getAllCredits(): { id: string; credit: string }[] {
  return photos
    .filter((p) => p.credit.length > 0)
    .map((p) => ({ id: p.id, credit: p.credit }));
}
