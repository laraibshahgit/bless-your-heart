/**
 * Boundary test — bundled photos.json contract.
 *
 * The `photos.json` file is a data contract that crosses THREE boundaries:
 *   1. The Netlify function (server) imports it and casts it to Photo[] without
 *      runtime validation (`netlify/functions/generate.ts:18`).
 *   2. The client imports it and casts it to Photo[] (`src/lib/photos.ts:4`).
 *   3. The build pipeline lints it via `tools/lint-photos.ts` — but ONLY at
 *      build time. `vitest run` never invokes the linter, so a developer who
 *      edits the JSON directly and runs only tests would not catch a broken
 *      entry.
 *
 * This test re-asserts the lint contract at test time so the gap is closed for
 * any workflow that runs `npm test` but not `npm run build`. It mirrors the
 * rules in `tools/lint-photos.ts` — when a rule is added there, mirror it here.
 *
 * Why a separate file (not extending photos.test.ts):
 *   photos.test.ts validates the CLIENT lib functions against the bundled data.
 *   This file validates the BUNDLED DATA itself, independent of consumers.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import photos from '../../src/data/photos.json';

const PhotoSchema = z.object({
  id: z.string().regex(/^[a-z]+(-[a-z]+)*-\d{2,}$/, 'invalid id format'),
  width: z.number().positive(),
  height: z.number().positive(),
  textZone: z.object({
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  capacity: z.object({
    line1: z.number().positive(),
    line2: z.number().positive(),
  }),
  textColor: z.enum(['white', 'dark']),
  watermarkPosition: z.enum(['lower-left', 'lower-right', 'upper-left', 'upper-right']),
  tier: z.enum(['standard', 'high-capacity']),
  credit: z.string(),
});

const PhotoLibrarySchema = z.array(PhotoSchema).min(1);

describe('photos.json — runtime schema validation (the contract crossing server/client/lint)', () => {
  it('every entry conforms to the Photo schema', () => {
    // .parse throws on the FIRST violation with a descriptive path — we want
    // the failure message to say WHICH photo and WHICH field was bad, so we
    // call parse on the whole array and let Zod produce a path-prefixed error.
    expect(() => PhotoLibrarySchema.parse(photos)).not.toThrow();
  });

  it('every photo id is unique (lint contract — no duplicates)', () => {
    const ids = (photos as Array<{ id: string }>).map((p) => p.id);
    const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
    expect(dupes).toEqual([]);
  });

  it('every textZone fits inside the photo (x+width <= 1, y+height <= 1)', () => {
    // Mirrors lint-photos.ts:31 — the 1.001 tolerance comes from the linter
    // (rounds floating-point fractions). Match it here so a passing lint
    // never fails this test.
    for (const p of photos as Array<{
      id: string;
      textZone: { x: number; y: number; width: number; height: number };
    }>) {
      expect(p.textZone.x + p.textZone.width, `${p.id}: x+width`).toBeLessThanOrEqual(1.001);
      expect(p.textZone.y + p.textZone.height, `${p.id}: y+height`).toBeLessThanOrEqual(1.001);
    }
  });

  it('every high-capacity photo has capacity >= 60/100 (lint contract)', () => {
    // Mirrors lint-photos.ts:52 — the high-capacity tier promises that line 1
    // and line 2 hard caps (60/100) will always fit. If a high-capacity entry
    // drifts below this, photoSelection's rung-1 contract silently breaks.
    for (const p of photos as Array<{
      id: string;
      tier: string;
      capacity: { line1: number; line2: number };
    }>) {
      if (p.tier === 'high-capacity') {
        expect(p.capacity.line1, `${p.id}: line1 capacity`).toBeGreaterThanOrEqual(60);
        expect(p.capacity.line2, `${p.id}: line2 capacity`).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it('library has at least 8 high-capacity photos (lint contract)', () => {
    // Mirrors lint-photos.ts:62 — the 3-rung selection algorithm relies on
    // a healthy pool of high-capacity photos. Below 8, regenerate-with-exclude
    // can exhaust the rung-1 pool too quickly and degrade quality.
    const highCapacity = (photos as Array<{ tier: string }>).filter(
      (p) => p.tier === 'high-capacity'
    );
    expect(highCapacity.length).toBeGreaterThanOrEqual(8);
  });

  it('every photoId in safeFallbacks references a real photo in the library', async () => {
    // Boundary check: src/server/fallbacks.ts hardcodes photoIds. If the
    // library renames or removes a photo without updating fallbacks, the
    // last-rung safety net silently breaks. The function returns a 200 OK
    // response with a photoId the client cannot resolve.
    const { safeFallbacks } = await import('@/server/fallbacks');
    const libraryIds = new Set((photos as Array<{ id: string }>).map((p) => p.id));
    for (const fb of safeFallbacks) {
      expect(libraryIds.has(fb.photoId), `safeFallback photoId "${fb.photoId}" not in library`).toBe(true);
    }
  });
});
