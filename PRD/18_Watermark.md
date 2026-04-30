# Watermark

## Overview

A small `Bless Your Heart` watermark in Cormorant Garamond serif, drawn into one corner of every exported poster. It is the only marketing the product gets — every shared image is a tiny self-attributing referrer.

The watermark calibration is a delicate balance: too subtle and recipients can't trace the image back to the site (the discovery loop breaks); too loud and it ruins the wellness-poster aesthetic (senders feel sheepish sharing it). This file specifies the typography, position logic, color, opacity, and rendering rules that hit the balance.

Per the source-of-truth resolution in `00_README.md`, the watermark is **required** at v1. The feature-list Q&A's "no watermark" line is superseded by the user-journey Q&A's request — the discovery loop depends on it.

## Dependencies
- `04_UI_Design_System.md` — Poster typography spec for the watermark
- `12_Photo_Metadata.md` — `watermarkPosition` per photo
- `15_Compositing_Engine.md` — Where the watermark is drawn (last pass in the draw order)

## Specification

| Property | Value |
|----------|-------|
| Text | `Bless Your Heart` (exact case, including the capitals) |
| Typeface | Cormorant Garamond, regular weight (400) |
| Style | Roman (not italic) — distinguishes the watermark from line-2's italic |
| Size | 18px at 1080×1080 logical resolution |
| Letter-spacing | +0.04em (tighter contrast against the body type's loose tracking is the visual signature) |
| Color | Matches the photo's `textColor` field (`white` → `#FFFFFF`; `dark` → `#1A1612`) |
| Opacity | 0.85 |
| Position | Corner specified by photo's `watermarkPosition` metadata field |
| Padding from corner | 32px on the closest two edges |

The watermark uses the *same typeface* as the body text (Cormorant Garamond) but in *roman weight* (the body text is regular and italic). This roman weight is the watermark's quiet visual signature — it reads as part of the design system, not as an overlay decal.

## Position

Drawn in one of four corners, chosen per-photo at curation time (per `12_Photo_Metadata.md`):

| Position | Anchor coords (1080 logical) | Text alignment |
|----------|------------------------------|----------------|
| `lower-left` | x = 32, y = 1080 - 32 | left-aligned, baseline-aligned |
| `lower-right` | x = 1080 - 32, y = 1080 - 32 | right-aligned, baseline-aligned |
| `upper-left` | x = 32, y = 32 + 18 | left-aligned, top-aligned (offset by font height) |
| `upper-right` | x = 1080 - 32, y = 32 + 18 | right-aligned, top-aligned |

```ts
function drawWatermark(ctx, photo) {
  const text = 'Bless Your Heart';
  const padding = 32;
  const size = 1080;

  ctx.font = '400 18px "Cormorant Garamond"';
  ctx.letterSpacing = '0.04em';
  ctx.fillStyle = photo.textColor === 'white' ? '#FFFFFF' : '#1A1612';
  ctx.globalAlpha = 0.85;

  switch (photo.watermarkPosition) {
    case 'lower-left':
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, padding, size - padding);
      break;
    case 'lower-right':
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, size - padding, size - padding);
      break;
    case 'upper-left':
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(text, padding, padding);
      break;
    case 'upper-right':
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(text, size - padding, padding);
      break;
  }

  ctx.globalAlpha = 1.0;  // reset
}
```

Reset `globalAlpha` to 1.0 after drawing — leaving it at 0.85 affects subsequent draws (though there are none after watermark in the pipeline, defensive reset is cheap).

## Color Matching

The watermark uses the same `textColor` as the body text. This is intentional — a photo curated for white body text has been chosen for low-light text-zone contrast, and the same conditions usually hold in the chosen corner.

If a watermark in the chosen corner happens to be hard to read (e.g., the corner overlaps a bright cloud on a dark-sky photo), that's a curation issue. The fix is to re-curate the photo with a different `watermarkPosition`, not to introduce per-watermark color overrides.

## Opacity

0.85 is the sweet spot. Tested across the library:

- 1.0: too prominent. Reads as a logo overlay, breaks the wellness aesthetic.
- 0.85: visible to anyone looking for it, but recedes as part of the design.
- 0.7: too subtle. Recipients miss it on quick mobile glances.
- 0.5 and below: invisible against textured photo regions; the discovery loop breaks.

Don't tune below 0.85.

## What the Watermark is NOT

- **Not the product's logo.** It's a typographic credit that happens to be the brand name.
- **Not clickable in the PNG.** The image format doesn't support links; the watermark prompts users to find the URL by typing the brand name into a search engine or address bar.
- **Not in line with the body text** — it's anchored to the corner, not flowed with the poster's content.
- **Not animated.** Static text drawn once per composite.

## What the Watermark Replaces

The watermark is the **only attribution** in the exported PNG. Don't add:

- A QR code (overkill, ugly)
- A small URL string (`blessyourheart.app`) — redundant with the brand name and adds noise
- A sponsor or partnership credit — there are none
- Multiple watermarks (e.g., one per corner) — would dominate the image

One watermark, one corner, one job.

## Rendering Order

Per `15_Compositing_Engine.md`'s draw order, the watermark is the **last** thing drawn — after the photo background and after both lines of body text. This is intentional in the rare case where a `textZone` and a `watermarkPosition` happen to be near the same corner: the watermark renders on top.

In practice, the curation tool warns the curator if `watermarkPosition` falls inside `textZone` (per `12_Photo_Metadata.md`'s curation flow), and the curator picks a different corner. Overlap shouldn't occur in production. The "watermark on top" rule is the safety net, not the typical case.

## Localization

The watermark text is `Bless Your Heart` in any language version of the site (deferred to P3). The brand name doesn't translate — translating would break the ability for a recipient who sees the watermark to find the site via search.

## Curation Tool Preview

Per `13_Photo_Curation_Tool.md`, the curation tool previews the watermark at all four corners on each photo so the curator can choose the best fit. The preview uses the same drawing code as the production compositor — single source of truth, no risk of drift.

## In the Hero Examples

The hero example posters on the landing page (`06_Landing_Page.md`) **also include the watermark** — even though they're displayed on the source site itself. Reasons:

1. The hero examples are used in screenshots and OG cards that travel off the site; consistency matters.
2. Consistency with what the user will download: the user's first generation should look identical to the example posters they were promised.
3. No reason to special-case the hero rendering path.

## Gaps & Assumptions

- **Watermark size doesn't scale with viewport**: the displayed canvas is rendered from the same 1080-logical buffer, so the watermark scales proportionally. On a 360px-wide mobile display, the watermark is ~6 effective pixels — small but legible. On the exported 1080×1080 PNG (the artifact that travels), it's 18px and clearly readable.
- **Anti-aliasing on the small watermark**: Cormorant Garamond at 18px on a high-DPI canvas looks crisp; on lower-DPI displays it's slightly soft. Acceptable. Don't introduce stroke-rendering hacks at v1.
- **Rendering on `'dark'` text photos**: dark watermarks (`#1A1612` at 0.85 opacity) on bright photos work; the curation tool preview confirms during intake. If post-launch we see dark-watermark photos with poor watermark legibility, the photo's metadata should be re-curated (different corner) rather than adding a per-watermark workaround.
- **Watermark text edits**: the literal string `Bless Your Heart` is hard-coded (no env var or runtime config). Changing the brand requires a code change — appropriate friction for a load-bearing piece of identity.
- **Why no fallback when `ctx.letterSpacing` is unsupported**: per `15_Compositing_Engine.md`, older browsers see slightly tighter watermark tracking. Graceful degradation; not worth a per-character render path.
