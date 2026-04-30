import sharp from 'sharp';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const bucket = getStorage().bucket();

const SIZE = 1080;

const photos = [
  { id: 'misty-fjord-01', colors: ['#4a6741', '#7b9a8c', '#b8c9c2', '#d5dfe0', '#8fa9b0'] },
  { id: 'sunrise-meadow-02', colors: ['#e8a849', '#d4894a', '#c77b5a', '#8b9e6b', '#5a7a4e'] },
  { id: 'quiet-woods-03', colors: ['#2d3a2e', '#4a5c3e', '#6b7d54', '#8a9d6a', '#3e4f35'] },
  { id: 'foggy-coastline-04', colors: ['#8899a6', '#a5b5c0', '#c2cfd8', '#dde5ea', '#6b7f8e'] },
  { id: 'golden-field-05', colors: ['#d4a843', '#c89535', '#b8862e', '#a0783e', '#7a8f5c'] },
  { id: 'mountain-lake-06', colors: ['#3b5998', '#4a7ab5', '#6b9ec0', '#8db5c8', '#5a7a6b'] },
  { id: 'lavender-dawn-07', colors: ['#9b7db8', '#b89cc8', '#d0b8d8', '#e8d5e8', '#c0a0c0'] },
  { id: 'winter-pines-08', colors: ['#cdd8e0', '#b0bec5', '#8da0aa', '#607d8b', '#4a5f6a'] },
  { id: 'rolling-hills-09', colors: ['#6b8e50', '#8aad68', '#a8c480', '#c8d8a0', '#5a7a42'] },
  { id: 'calm-shore-10', colors: ['#4a8fa8', '#6baec0', '#8dc5d0', '#b0d8e0', '#d0c8a0'] },
];

async function createGradientImage(colors) {
  const svg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="0.6">
        <stop offset="0%" stop-color="${colors[3]}"/>
        <stop offset="100%" stop-color="${colors[1]}"/>
      </linearGradient>
      <linearGradient id="ground" x1="0" y1="0.4" x2="0" y2="1">
        <stop offset="0%" stop-color="${colors[2]}"/>
        <stop offset="50%" stop-color="${colors[0]}"/>
        <stop offset="100%" stop-color="${colors[4]}"/>
      </linearGradient>
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feBlend in="SourceGraphic" mode="multiply"/>
      </filter>
    </defs>
    <rect width="${SIZE}" height="${SIZE * 0.55}" fill="url(#sky)"/>
    <rect y="${SIZE * 0.45}" width="${SIZE}" height="${SIZE * 0.55}" fill="url(#ground)"/>
    <rect width="${SIZE}" height="${SIZE}" fill="${colors[1]}" opacity="0.08" filter="url(#noise)"/>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#sky)" opacity="0.05"/>
  </svg>`;

  return sharp(Buffer.from(svg))
    .resize(SIZE, SIZE)
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function uploadPhoto(id, buffer) {
  const file = bucket.file(`photos/${id}.jpg`);
  await file.save(buffer, {
    metadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    },
  });
  await file.makePublic();
  console.log(`  ✓ ${id}.jpg uploaded (${(buffer.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  console.log('Generating and uploading photos to Firebase Storage...\n');

  for (const photo of photos) {
    const buffer = await createGradientImage(photo.colors);
    await uploadPhoto(photo.id, buffer);
  }

  console.log(`\n✓ ${photos.length} photos uploaded to gs://${process.env.FIREBASE_STORAGE_BUCKET}/photos/`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
