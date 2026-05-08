// Shared canvas/typography constants for poster generation.
//
// Why a dedicated module: these values are referenced from both `compositor.ts`
// (text drawing + fit measurement) and `fonts.ts` (font preloading). When the
// preloaded font weight/size doesn't match what the compositor renders, the
// browser falls back to the system serif on first paint and silently breaks
// the joke (see CLAUDE.md: "ALWAYS await ensureFontsReady() before measureText").
// One source of truth eliminates that drift.

// Poster output dimensions — the canvas is always rendered at this logical size,
// then scaled by devicePixelRatio for display. Photos in the library are 1080x1080
// (see src/data/photos.json width/height fields).
export const POSTER_LOGICAL_SIZE_PX = 1080;

// Inset between the textZone rectangle and the first line of poster text.
// Distinct from WATERMARK_PADDING_PX, which insets the watermark from the canvas
// edge — different references, intentionally different values.
export const TEXT_ZONE_PADDING_PX = 24;

// Distance between watermark text and the canvas edge. Kept separate from
// TEXT_ZONE_PADDING_PX so a future textZone padding tweak doesn't shift the
// watermark off the corner pinned by tests/client/compositor.test.ts.
export const WATERMARK_PADDING_PX = 32;

// Base font sizes at scale=1. The compositor multiplies these by the fit scale
// returned from checkFit(); fonts.ts preloads at exactly these sizes so the
// FontFace object the browser caches matches what fillText() will request.
export const LINE1_FONT_PX = 64;
export const LINE2_FONT_PX = 44;
export const WATERMARK_FONT_PX = 18;

// Vertical-rhythm constants for stacking line2 below line1.
// Final line2 Y = line1Y + LINE1_FONT_PX * LINE1_LINE_HEIGHT_RATIO + LINE_GAP_PX.
export const LINE1_LINE_HEIGHT_RATIO = 1.15;
export const LINE_GAP_PX = 16;

// Letter-spacing values are CSS units (em), not pixels — they scale with font
// size automatically. Kept as strings because the canvas API takes them as such.
export const LETTER_SPACING_LINE1 = '0.02em';
export const LETTER_SPACING_LINE2 = '0.01em';
export const LETTER_SPACING_WATERMARK = '0.04em';

// Watermark draws at this opacity, then resets to 1.0. Pinned by
// tests/client/compositor.test.ts ('sets watermark opacity to 0.85 then back to 1.0').
export const WATERMARK_OPACITY = 0.85;

// checkFit() returns overflow when both lines would need to shrink below this
// fraction of base size to fit the text zone. At 0.5 the text remains legible
// on the 1080px canvas (line1 ≥ 32px, line2 ≥ 22px) while accommodating
// wide character combinations (uppercase runs, M/W sequences) that the
// server's character-count validation allows but that exceed pixel budgets.
export const MIN_FIT_SCALE = 0.5;

// Watermark text. Defined here so a brand rename touches one constant rather
// than one string literal in compositor.ts; pinned by compositor tests.
export const WATERMARK_TEXT = 'Bless Your Heart';
