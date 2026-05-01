import sharp from 'sharp';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const bucket = getStorage().bucket();
const SIZE = 1080;

// Curated picsum.photos IDs that are scenic landscapes
const photos = [
  { id: 'misty-fjord-01', picsumId: 10 },       // forest/nature
  { id: 'sunrise-meadow-02', picsumId: 167 },    // golden field sunrise
  { id: 'quiet-woods-03', picsumId: 15 },        // river/forest
  { id: 'foggy-coastline-04', picsumId: 173 },   // misty coast
  { id: 'golden-field-05', picsumId: 106 },      // wheat field
  { id: 'mountain-lake-06', picsumId: 29 },      // mountains
  { id: 'lavender-dawn-07', picsumId: 142 },     // sunset sky
  { id: 'winter-pines-08', picsumId: 47 },       // ocean waves
  { id: 'rolling-hills-09', picsumId: 41 },      // green landscape
  { id: 'calm-shore-10', picsumId: 57 },         // beach shore
];

async function downloadPhoto(picsumId) {
  const url = `https://picsum.photos/id/${picsumId}/${SIZE * 2}/${SIZE * 2}`;
  console.log(`  Downloading picsum #${picsumId}...`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to fetch picsum #${picsumId}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function processPhoto(buffer) {
  return sharp(buffer)
    .resize(SIZE, SIZE, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 82 })
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
  console.log('Downloading and uploading real photos to Firebase Storage...\n');

  for (const photo of photos) {
    try {
      const raw = await downloadPhoto(photo.picsumId);
      const processed = await processPhoto(raw);
      await uploadPhoto(photo.id, processed);
    } catch (err) {
      console.error(`  ✗ ${photo.id} failed: ${err.message}`);
    }
  }

  console.log(`\n✓ Done! Photos uploaded to gs://${process.env.FIREBASE_STORAGE_BUCKET}/photos/`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
