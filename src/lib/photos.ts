import photosData from '@/data/photos.json';
import type { Photo } from '@/types';

const photos = photosData as Photo[];

export function getPhotoUrl(photoId: string): string {
  const base = import.meta.env.VITE_FIREBASE_STORAGE_BASE_URL ?? '';
  const path = encodeURIComponent(`photos/${photoId}.jpg`);
  return `${base}/${path}?alt=media`;
}

export function getPhotoById(photoId: string): Photo | undefined {
  return photos.find((p) => p.id === photoId);
}

export function getAllCredits(): { id: string; credit: string }[] {
  return photos
    .filter((p) => p.credit.length > 0)
    .map((p) => ({ id: p.id, credit: p.credit }));
}

// Fire-and-forget photo prefetch. Used by App.tsx the moment the API
// returns a `photoId` so the photo fetch runs in parallel with the
// LOAD_FLOOR_MS anticipation beat (800 ms minimum) instead of starting
// after PosterCanvas mounts. Without this, the user-perceived waterfall is:
//
//   click → API call (2–5s) → 800 ms hold → PosterCanvas mount →
//   photo fetch + decode (~200–2000 ms) → poster appears
//
// With this prefetch, the photo fetch overlaps the hold window:
//
//   click → API call (2–5s) → [prefetch + 800 ms hold concurrently] →
//   PosterCanvas mount → loadImage() hits HTTP cache → decode (~30 ms) →
//   poster appears
//
// The browser's HTTP cache matches by URL AND crossOrigin AND request
// mode. PosterCanvas's `loadImage()` in src/lib/compositor.ts sets
// `img.crossOrigin = 'anonymous'`; this prefetch must match exactly or
// the cache will miss and the photo will be fetched twice. The decode
// is NOT triggered here on purpose — that work runs synchronously and
// would block the main thread; we only want the bytes in cache. Audit
// run 37/001.
export function prefetchPhoto(photoId: string): void {
  // Guard against jsdom/SSR contexts where Image is undefined. In normal
  // browser runtime this branch is dead; in tests it keeps the helper
  // safe to import without mocking.
  if (typeof Image === 'undefined') return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = getPhotoUrl(photoId);
}
