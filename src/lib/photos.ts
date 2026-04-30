import photosData from '@/data/photos.json';
import type { Photo } from '@/types';

const photos: Photo[] = photosData as Photo[];

export function getPhotoById(id: string): Photo | undefined {
  return photos.find((p) => p.id === id);
}

export function getPhotoUrl(photoId: string): string {
  const base = import.meta.env.VITE_FIREBASE_STORAGE_BASE_URL;
  if (!base) return `/photos/${photoId}.jpg`;
  return `${base}/photos%2F${photoId}.jpg?alt=media`;
}

export function getAllCredits(): { id: string; credit: string }[] {
  return photos.map((p) => ({ id: p.id, credit: p.credit }));
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
