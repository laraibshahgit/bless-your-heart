// Optimize hero example images for the landing page.
//
// The original PNGs in `public/examples/hero-{1,2,3}.png` are ~2.1–2.7 MB each
// (so ~7 MB total) and ship eagerly with `fetchPriority="high"` on every page
// load. They render at a max display size of 280–540 px (HeroExamples.tsx),
// so a 1080×1080 PNG is ~3.7× larger than any device needs.
//
// This tool produces three companion outputs per source PNG:
//   • <name>-720.webp   — for desktop DPR≤2 (max display ~540 px) and mobile DPR=3
//   • <name>-540.webp   — for tablet/desktop standard pixel ratio
//   • <name>.png        — kept as the legacy fallback (untouched)
//
// Run with `node tools/optimize-hero-examples.mjs` after replacing any
// hero image. Idempotent — re-runs overwrite previous outputs.
//
// Cost rationale: at $55/100GB Netlify bandwidth overage, every 1 MB of hero
// payload removed saves ~$0.55 per 1k page loads. Going 7 MB → ~150 KB is a
// 97% bandwidth cut on the largest single asset shipped to every visitor.

import sharp from 'sharp';
import { readdir, stat } from 'node:fs/promises';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '..', 'public', 'examples');

// Two widths cover the responsive breakpoints in HeroExamples.tsx.
// 540 — desktop grid renders at 280–300 px each; DPR=2 wants 600. Round to 540
//        (close enough; lossy WebP at q=82 hides the difference).
// 720 — mobile single image renders up to 360 px wide; DPR=3 wants 1080.
//        720 is a deliberate cap — DPR=3 phones are rare and the WebP at
//        720 already looks crisper than the original PNG was at 1080.
const SIZES = [
  { width: 540, label: '540' },
  { width: 720, label: '720' },
];

// WebP quality 82: visually indistinguishable from PNG at this content type
// (photographic + soft typography), 25–30× smaller than the source PNG.
const WEBP_QUALITY = 82;

async function optimize(srcPath) {
  const ext = extname(srcPath);
  if (ext.toLowerCase() !== '.png') return null;
  const name = basename(srcPath, ext);
  if (!name.startsWith('hero-')) return null;

  const original = await stat(srcPath);
  const results = [];
  for (const { width, label } of SIZES) {
    const outPath = join(SRC_DIR, `${name}-${label}.webp`);
    await sharp(srcPath)
      .resize(width, width, { fit: 'cover', position: 'center' })
      .webp({ quality: WEBP_QUALITY })
      .toFile(outPath);
    const out = await stat(outPath);
    results.push({ outPath, label, bytes: out.size });
  }
  return { srcPath, originalBytes: original.size, results };
}

async function main() {
  const entries = await readdir(SRC_DIR);
  let totalOriginal = 0;
  let totalOptimized = 0;

  for (const entry of entries) {
    const result = await optimize(join(SRC_DIR, entry));
    if (!result) continue;
    totalOriginal += result.originalBytes;
    console.log(`\n${entry}  (${(result.originalBytes / 1024).toFixed(0)} KB original)`);
    for (const { outPath, label, bytes } of result.results) {
      totalOptimized += bytes;
      console.log(`  → ${basename(outPath)}  ${(bytes / 1024).toFixed(0)} KB  (${label}px webp)`);
    }
  }

  if (totalOriginal > 0) {
    const savedBytes = totalOriginal - totalOptimized;
    const savedPct = (savedBytes / totalOriginal) * 100;
    console.log(
      `\nTotal: ${(totalOriginal / 1024).toFixed(0)} KB → ${(totalOptimized / 1024).toFixed(0)} KB ` +
      `(${savedPct.toFixed(1)}% smaller across all sizes)`
    );
  }
}

main().catch((err) => {
  console.error('Optimization failed:', err);
  process.exit(1);
});
