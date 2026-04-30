# Photo Curation Tool

## Overview

A local-only admin tool for attaching metadata to photos at intake. The curator drags a text-zone box, picks a watermark corner, confirms text color, and the tool emits a JSON entry to append to `photos.json`. Build it once, use it for the launch library and every quarterly rotation thereafter.

This is not part of the deployed product. It lives in `tools/curation/` and runs locally. No authentication, no deployment, no public exposure.

## Dependencies
- `11_Photo_Library.md` — Source-of-truth for what's being curated
- `12_Photo_Metadata.md` — The fields the tool produces

## What the Tool Does

For each new photo:

1. Loads the processed JPG from disk
2. Renders it with overlay UI for setting metadata
3. Computes `capacity` automatically from the drawn text-zone
4. Auto-flags `tier: 'high-capacity'` if capacity exceeds thresholds
5. Previews the rendered poster with sample text + watermark in each corner
6. Outputs a JSON entry the curator can copy into `photos.json`

Total time per photo, with practice: ~30 seconds. A 75-photo launch library is roughly half a focused afternoon.

## Architecture

A small standalone web app that runs locally via `npm run curate`. Uses the same React + Vite + Tailwind stack as the main app (avoids learning a separate framework). Lives in `tools/curation/` with its own `package.json` and `vite.config.ts`, or as a sibling Vite entry in the main repo.

```
tools/curation/
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── PhotoCanvas.tsx        # Renders the photo with the zone overlay
│   ├── ZoneEditor.tsx          # Drag-to-define rectangle UI
│   ├── ColorToggle.tsx         # white/dark text preview
│   ├── WatermarkPreview.tsx    # Cycles through 4 corner options
│   ├── PosterPreview.tsx       # Live preview using the production compositor
│   └── computeCapacity.ts      # Calibrated character-budget calculator
└── public/
    └── inputs/                 # Drop processed JPGs here for curation
```

## Workflow

### 1. Drop photos into `tools/curation/public/inputs/`

The curator copies processed JPGs (per `11_Photo_Library.md`'s pipeline output — 1080×1080, color-graded, EXIF-stripped) into the `inputs/` folder.

### 2. Run `npm run curate`

Vite dev server starts, browser opens to `localhost:5174` (or whatever port). The tool lists every JPG in `inputs/` and shows curation status for each (un-curated photos appear at the top).

### 3. For each photo

The curator selects a photo. The tool displays it full-size in a working canvas, with controls beside it.

**Step A: Suggest an `id`.** The tool prompts for a 2–3 word descriptor; auto-suffixes with `-NN` based on existing IDs in `photos.json`. Validates the kebab-case format inline.

**Step B: Define the text zone.** The curator drags a rectangle directly on the photo canvas. The rectangle:

- Snaps to a 1% normalized grid (avoids pixel-precision fiddliness)
- Cannot extend past the photo edge
- Shows live capacity (e.g., "Line 1: 52 chars · Line 2: 95 chars") as it's resized
- Shows a faint "24px padding" inset border so the curator can see the actual usable area

**Step C: Pick `textColor`.** A toggle between `white` and `dark`. The tool overlays a sample line ("The path is not always clear") at the chosen color inside the zone. The curator picks whichever stays legible.

**Step D: Pick `watermarkPosition`.** Four corner buttons. Each click previews the watermark in that corner. The curator picks one that doesn't overlap a focal subject and doesn't fall inside the `textZone`. The tool warns if the curator picks a corner that does overlap.

**Step E: Confirm `tier`.** The tool auto-flags `high-capacity` if capacity meets thresholds. The curator can override (rarely needed).

**Step F: Enter `credit`.** Single text field, free-form. Defaulted to a template (e.g., `"  / Unsplash+"`) for the curator to fill the photographer name.

**Step G: Live poster preview.** Below the controls, the tool renders a live composite using:

- The photo
- A representative sample text pair (line 1 ~40 chars, line 2 ~80 chars)
- Current `textColor`, `textZone`, `watermarkPosition` settings

The curator confirms the visual reads as a good poster before committing. If the text crashes into a focal subject or the watermark looks off, they iterate.

**Step H: Commit.** Click "Save." The tool:

- Writes a new JSON entry to a working file `tools/curation/output/queue.json`
- Marks the photo as curated in the input list
- Auto-advances to the next un-curated photo

### 4. Merge the queue into `photos.json`

When the batch is done, the curator reviews `queue.json`, then runs:

```
npm run curate:merge
```

…which appends the queued entries into `src/data/photos.json` and clears `queue.json`. Manual review before merging catches any oversights from rapid curation.

### 5. Upload photos to Firebase Storage

Separate one-time script `tools/upload-photos.ts` reads `photos.json` and uploads any photo files in `tools/curation/public/inputs/` that match an `id` to Firebase Storage at `/photos/{id}.jpg`. Idempotent — re-running skips already-uploaded files.

The upload script needs `serviceAccountKey.json` (per `02_Project_Setup.md`) and uses the Firebase Admin SDK. Configure `Cache-Control: public, max-age=31536000, immutable` on each upload (per `11_Photo_Library.md`).

## Capacity Calibration

The `computeCapacity` function depends on accurate per-glyph advance widths for Cormorant Garamond at the canonical typography sizes. Calibrate once before first use:

1. Render a known string ("The quick brown fox jumps over the lazy dog ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789" — covers letter mix) to a hidden canvas at the line-1 typography spec
2. Measure pixel width via `ctx.measureText(...).width`
3. Divide by string length to get average advance
4. Repeat for line-2 typography (smaller, italic)
5. Commit the resulting constants

```ts
// Calibrated values — re-measure if typography spec changes
export const ADVANCE_LINE1 = 27.4;  // px per glyph at Cormorant Garamond 64px regular
export const ADVANCE_LINE2 = 16.1;  // px per glyph at Cormorant Garamond 44px italic
```

Re-calibrate any time the typography in `04_UI_Design_System.md` changes.

## CI Lint

A pre-build check that runs against `photos.json`. Implemented as a Node script (`tools/lint-photos.ts`) wired into the build:

```json
// package.json
"scripts": {
  "lint:photos": "tsx tools/lint-photos.ts",
  "build": "npm run lint:photos && tsc && vite build"
}
```

The lint enforces every rule listed in `12_Photo_Metadata.md`'s "CI Lint Rules" section. On failure, the build fails with a clear error message identifying the offending photo and the violated rule.

```ts
// tools/lint-photos.ts (sketch)
import photos from '../src/data/photos.json';

const errors: string[] = [];

for (const p of photos) {
  if (!/^[a-z]+(-[a-z]+)*-\d{2,}$/.test(p.id)) {
    errors.push(`${p.id}: invalid id format`);
  }
  if (p.textZone.x + p.textZone.width > 1) {
    errors.push(`${p.id}: textZone extends past photo width`);
  }
  // ... full rule set
}

const highCapacityCount = photos.filter(p => p.tier === 'high-capacity').length;
if (highCapacityCount < 8) {
  errors.push(`Library has only ${highCapacityCount} high-capacity photos; need ≥ 8`);
}

if (errors.length > 0) {
  console.error('photos.json lint errors:');
  errors.forEach(e => console.error('  ' + e));
  process.exit(1);
}
console.log(`✓ ${photos.length} photos validated`);
```

Run the lint locally before committing curation changes:

```
npm run lint:photos
```

## EXIF Sanity Check

Optional but recommended. The lint can also validate that uploaded photos have no residual EXIF (per `11_Photo_Library.md`). Use a Node EXIF library (e.g., `exif-parser`) to scan each photo file in `inputs/`. Fail the lint if EXIF is present.

This catches accidents — a photo skipped through the EXIF-strip step in the processing pipeline.

## Manual Re-Curation

If a photo's metadata needs updating after launch (the production analytics flag a photo as a frequent fallback-rung trigger, for example), the curator:

1. Re-runs the curation tool on the photo
2. The tool detects the existing entry in `photos.json` and pre-populates with current metadata
3. The curator adjusts and saves
4. The tool emits an updated entry; merge as usual

The tool should never lose existing metadata silently — always pre-populate before allowing edits.

## Why Build a Tool Instead of Hand-Editing

Hand-editing `photos.json` for 75 photos is error-prone in ways the lint can't fully catch (a `textZone` that's *technically valid* but *visually wrong*). The tool's live poster preview is what makes the curation actually correct, not just well-formed.

The cost is half a day to build the tool. The savings are: every quarter the library rotates, the workflow is fast and the metadata stays consistent. Over the product's lifetime, that pays back many times over.

## Gaps & Assumptions

- **One curator at a time**: no multi-user collaboration. The queue file is a single-user artifact. If multiple curators were ever needed, switch to per-user queue files.
- **Browser compatibility for the tool**: Chrome and Firefox only. Safari's drag handling and Canvas behavior are slightly different and not worth supporting for a local-only tool.
- **No undo within the tool**: edits are committed on Save. If the curator regrets a save, edit `queue.json` directly before merging or re-curate after merging.
- **Photo deletion from the library**: not handled by the tool. Manually edit `photos.json` and (optionally) delete from Storage with a one-off script.
- **Tool styling**: Tailwind utility classes are sufficient; no need to import the production design system. The tool is internal and aesthetics are not the priority.
