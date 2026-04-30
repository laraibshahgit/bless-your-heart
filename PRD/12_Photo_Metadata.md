# Photo Metadata

## Overview

Every photo in the library carries a structured metadata record that the text-fitting pipeline and the compositor consume. The schema replaces vague tagging ("top-third", "center") with precise machine-readable fields. This file specifies each field's semantics, computation, and edge cases.

If `03_Data_Schema.md` is "what the data looks like," this file is "what each field means and how it's set."

## Dependencies
- `03_Data_Schema.md` — TypeScript interface for `Photo`
- `11_Photo_Library.md` — Sourcing and processing context
- `13_Photo_Curation_Tool.md` — How metadata gets attached at intake
- `14_Text_Fitting_Pipeline.md` — Consumer of capacity and tier
- `15_Compositing_Engine.md` — Consumer of textZone, textColor, watermarkPosition

## Field Reference

### `id` — string

A stable, kebab-case identifier. Format: `{descriptor}-{nn}` (e.g., `misty-fjord-01`). Becomes the filename stem in Firebase Storage at `/photos/{id}.jpg`.

**Rules**:
- Lowercase only
- Dashes only — no underscores, no dots, no spaces
- Two- or three-word descriptor, suffix is a zero-padded counter
- Once shipped, never changed (live `photos.json` references it)
- Unique across the library — CI lint enforces

### `width` and `height` — number

Pixel dimensions of the source image. Always 1080 × 1080 at v1 (per `11_Photo_Library.md`'s processing pipeline). Stored explicitly so the compositor can scale rather than hard-coding 1080.

If the library ever ships non-square photos (deferred — `24_Future_Features.md` aspect-ratio variants), these fields decouple metadata from the assumption.

### `textZone` — bounding box

The rectangle inside which text must fit. **Normalized 0–1 coordinates** (multiply by `width`/`height` to get pixels).

```ts
{
  x: number;       // left edge, 0–1
  y: number;       // top edge, 0–1
  width: number;   // box width, 0–1
  height: number;  // box height, 0–1
}
```

**Set by the curator** using the curation tool's drag-to-define UI. The curator visually identifies a region of the photo where:

- The visual content is calm enough that text won't crash into focal subjects
- The contrast supports the photo's `textColor` (white text needs a darker backdrop region; dark text needs a lighter region)
- There's at least 24px of padding on all sides between the text and the photo's edge

**Typical zones**:

- **Lower third** (most common): `{ x: 0.10, y: 0.55, width: 0.80, height: 0.30 }` — text floats over the calmer foreground of a landscape
- **Upper sky**: `{ x: 0.10, y: 0.10, width: 0.80, height: 0.30 }` — useful for photos where the foreground is busy but the sky is open
- **Center band**: `{ x: 0.10, y: 0.35, width: 0.80, height: 0.30 }` — for photos with an empty horizon or fog-band running through the middle

**Asymmetric zones are valid.** A photo with rocks on the left and open sky on the right can have a zone biased to the right side.

### `capacity` — character budget

The maximum number of characters per line that fit inside the zone at canonical typography (`04_UI_Design_System.md`'s poster type spec).

```ts
{
  line1: number;   // characters that fit at line-1 typography (64px regular)
  line2: number;   // characters that fit at line-2 typography (44px italic)
}
```

**Computed automatically by the curation tool** from `textZone.width` × photo `width` (= zone pixel width) using:

- Cormorant Garamond's average glyph advance width at the relevant size and weight
- A 10% safety margin (avg-width is an approximation; safety margin handles unlucky letter combinations)
- Subtracting 2 × 24px (left + right padding inside the zone)

```ts
const advanceLine1 = 27;  // approx px per glyph at 64px regular
const advanceLine2 = 16;  // approx px per glyph at 44px italic
const padding = 24;

function computeCapacity(zonePxWidth: number) {
  const usableWidth = zonePxWidth - 2 * padding;
  return {
    line1: Math.floor((usableWidth / advanceLine1) * 0.9),
    line2: Math.floor((usableWidth / advanceLine2) * 0.9),
  };
}
```

The advance values above are **measured constants**, not guesses. Calibrate them once during build by rendering a known string ("The quick brown fox jumps over the lazy dog") to canvas and dividing the measured pixel width by the character count for each typography spec. Commit the constants as named values in the curation tool's source.

**Manual override**: the curator can override the computed values for irregular zones (e.g., a sliver between mountains and sky where the auto-computed width doesn't account for vertical constraint). The curation tool exposes the override input but pre-fills with the computed value.

**Why character count and not pixel measurement at curation time**: the actual text is generated at runtime; the curator can't measure something that doesn't yet exist. Character capacity is the proxy. Stage 4 of the fitting pipeline (`14_Text_Fitting_Pipeline.md`) does the real pixel measurement at render time and is the final arbiter.

### `textColor` — `'white' | 'dark'`

Which text color works on this photo's text zone.

| Value | When to set |
|-------|-------------|
| `white` | Default. Photo has darker tones in the text zone (overcast skies, twilight, deep forest, dim sand). White serif renders cleanly. |
| `dark` | Photo has bright, light tones in the text zone (sunlit snow, bright sand, white flowers, hazy bright sky). White text would disappear. |

About 85% of the library should be `white`; the wellness aesthetic skews toward muted, slightly-darkened photos. `dark` is reserved for the brighter outliers.

**Set by the curator** at intake by visual judgment. The curation tool displays a sample of both options overlaid on the photo's text zone for confirmation.

**Why not "auto-detect from luminance"**: zone luminance varies across the zone (a sky region might be bright top, dark bottom). Auto-detection is unreliable; visual judgment by the curator is faster and more correct.

### `watermarkPosition` — corner enum

Where the "Bless Your Heart" watermark renders on this photo. One of `'lower-left' | 'lower-right' | 'upper-left' | 'upper-right'`.

**Set by the curator** to a corner that:

- Doesn't overlap focal subjects (a peak, a flower, a person — though there shouldn't be people per `11_Photo_Library.md`)
- Doesn't fall inside the `textZone` (the watermark must be outside the text region)
- Has enough contrast that the watermark is legible (the watermark uses `poster-text-light` color at 0.85 opacity per `18_Watermark.md`)

The curation tool previews the watermark at all four corners and the curator picks the best fit.

**Default**: `lower-right`. About 60% of photos work with this default; the other 40% need an alternate corner because of focal-subject placement.

### `tier` — `'standard' | 'high-capacity'`

Whether this photo serves as a fallback in the fitting pipeline.

| Tier | Criteria |
|------|----------|
| `standard` | Most photos. Text zone fits typical generated text but not necessarily worst-case 60+100 chars. |
| `high-capacity` | Wide, central, simple-background zones. Capacity meets or exceeds the schema's hard maximums (line1 ≥ 60, line2 ≥ 100). Acts as the fitting pipeline's guaranteed fallback rung. |

About 10–15% of the library is `high-capacity` — that's ~10 photos at a 75-photo library. They are deliberately curated for capacity, not for being the most aesthetically distinctive photos in the library; they're the safety net.

**Set by the curation tool** automatically based on computed capacity. If `capacity.line1 >= 60 && capacity.line2 >= 100`, the tool flags the photo as `high-capacity` candidate. The curator confirms (sometimes a photo's capacity is technically high but the visual feels off for fallback duty).

**A `high-capacity` photo is also a `standard` photo for selection purposes** — it's eligible for any text. The tier just marks it as available for fallback.

### `credit` — string

Photographer attribution. Free-form string at v1.

```
"Jane Doe / Unsplash+"
"Marcus Lee / Pexels"
"Anonymous / CC0"
```

If the license requires no attribution, set `credit: ""` and the photo is excluded from the footer credits dialog. Never invent attribution.

## Metadata Update Rules

Once a photo ships in `photos.json`:

| Change | Allowed? |
|--------|----------|
| Update `textZone` | ✓ Re-curate at any time; the change is non-breaking |
| Update `capacity` | ✓ Same |
| Update `textColor` | ✓ Same |
| Update `watermarkPosition` | ✓ Same |
| Update `tier` | ✓ Same |
| Update `credit` | ✓ Same |
| Change `id` | ✗ Never — caches and references break |
| Change `width`/`height` | ✗ Implies a different photo file; treat as a new entry |

Re-curation is a healthy operation. If a photo's text-fitting outcomes look off in production analytics (high fallback-rung rate involving a specific photo), re-curate it.

## CI Lint Rules (enforced at build, see `13_Photo_Curation_Tool.md`)

The build fails if:

- Any entry is missing a required field
- Any `id` is duplicated
- Any `id` doesn't match `^[a-z]+(-[a-z]+)*-\d{2,}$`
- Any `textZone` has values outside `[0, 1]` or `width`/`height` ≤ 0
- Any `textZone` extends past the photo (`x + width > 1` or `y + height > 1`)
- Any `capacity.line1 > 60` or `capacity.line2 > 100` (would silently break the schema cap)
- Any `tier === 'high-capacity'` but `capacity.line1 < 60 || capacity.line2 < 100`
- Any `textColor` not in `{ 'white', 'dark' }`
- Any `watermarkPosition` not in the four allowed values
- The total count of `tier: 'high-capacity'` is fewer than 8

The last rule is the safety net — without enough high-capacity photos, the fitting pipeline's fallback rung degrades.

## Gaps & Assumptions

- **`textZone` defining a non-rectangular region** (L-shape, diagonal): not supported at v1. The compositor draws text inside an axis-aligned rectangle. If a photo's only good region is non-rectangular, exclude the photo or pick the largest inscribed rectangle.
- **Multiple text zones per photo**: not supported at v1. One zone per photo. If two zones would work (sky and foreground), the curator picks the better one.
- **Variable typography per photo**: not supported at v1. All photos use the canonical typography from `04_UI_Design_System.md`. Per-photo typography overrides are a P3 future work.
- **Reading-order considerations**: not relevant at v1 — the language is English and text reads top-to-bottom, left-to-right within the zone.
- **`credit` field structure for v2**: when a credits page is built, switch to `{ name, url, license }`. Migration is a one-time pass.
