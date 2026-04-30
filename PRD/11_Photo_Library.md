# Photo Library

## Overview

The library is the gorgeous half of the visual joke. ~75 curated landscape photos at launch, served from Firebase Storage, swapped quarterly so returning users feel a quiet freshness. This file specifies sourcing and licensing, processing pipeline, naming and storage, and the rotation cadence. The metadata schema lives in `12_Photo_Metadata.md`; the curation tool lives in `13_Photo_Curation_Tool.md`.

The vision doc treats photo quality as load-bearing: cheap-looking output kills the product. The library is not a generic stock-photo dump. Every entry is curated.

## Dependencies
- `03_Data_Schema.md` — `photos.json` shape this file populates
- `12_Photo_Metadata.md` — Per-photo metadata fields
- `13_Photo_Curation_Tool.md` — How metadata gets attached at intake
- `01_Tech_Stack.md` — Firebase Storage configuration

## Library Size

| Stage | Target |
|-------|--------|
| Launch | 75 photos |
| Year 1 | 100–120 photos (one rotation, 3 net-new each quarter) |

The PRD recommends 50–100 at launch. 75 is the mid-point and gives the dedup logic enough breathing room: a session generating 5–10 times never sees a repeat, and the high-capacity tier (~10–15% of the library, so ~10 photos) has enough variety that the fallback rung doesn't feel monotonous.

## Sourcing

Acceptable sources, ranked by preference:

| Source | License | Notes |
|--------|---------|-------|
| Unsplash+ (paid) | Commercial use granted, indemnification included | Best v1 default — quality is high, license is unambiguous |
| Pexels Pro | Commercial use granted | Comparable to Unsplash+ |
| Direct from photographer (paid) | Per-license terms | Best for distinctive look but slow to acquire |
| Public domain / CC0 (Unsplash free, Pexels free) | Free to use commercially | Acceptable but quality is more variable |
| **Not acceptable**: AI-generated images | — | Breaks the "real wellness poster" visual fiction |
| **Not acceptable**: Unlicensed scraping | — | Liability, ethics |

**The license decision is the developer's**, but the bar is: every photo can be defended in a takedown request with proof of license. Maintain a simple `licenses.csv` outside the public repo (or a private gist) listing each photo ID, source, license type, and acquisition date.

## Aesthetic Guidelines

The wellness-poster visual fiction has a recognizable look. Curate to it.

**Typical subject matter**:

- Misty mountains, foggy fjords, soft sunrises over water
- Rolling fields, lone trees on hills, lavender at dawn
- Empty paths through woods, stone bridges, weathered farmhouses
- Calm coastlines (not action surfing), soft beach sand, tide pools
- Wildflowers, single blooms, blurred meadows
- Snow on pines, dawn light through forest, frost on grass

**Avoid**:

- Photos with people — anyone identifiable is a model-release liability and breaks the impersonal-vista feel
- City scenes, urban architecture (the wellness aesthetic is rural/natural)
- Sharp action photography — climbing, surfing, skiing — wrong register
- Highly saturated tropical beaches — too "vacation Instagram"
- Photos with text already in them (signage, license plates, etc.)
- Photos with strong central subjects that compete with the text overlay (a single dramatic mountain peak in dead center makes text placement impossible)

**Target a cohesive palette** across the library — soft, slightly desaturated, warm-leaning. The color-grading pass below enforces this.

## Image Processing Pipeline

Every source photo runs through the same processing before it joins the library.

### 1. Crop to aspect ratio

Output target is **1080×1080 square** (matches the PNG export at `17_Download_PNG.md`). Crop with the eventual text-zone in mind — leave at least one third of the image as a region where text could land legibly.

### 2. Color grade

Apply a consistent grade pass. The exact recipe is the curator's call but should:

- Lift shadows slightly (so text in dark areas of the photo stays legible)
- Reduce saturation 10–15% (the "yoga studio" vs "vacation snap" cue)
- Warm white balance slightly (~+5–8 mireds toward yellow)
- Add a soft highlight roll-off (avoid blown skies)

Lightroom presets, Capture One styles, or a Photoshop adjustment-layer template all work — pick one workflow and apply it identically to every photo. Consistency is more important than the specific recipe.

### 3. Resize and compress

| Output | Format | Spec |
|--------|--------|------|
| Display | JPG | 1080×1080, quality 82, sRGB color profile |
| (Optional) Retina display | JPG | 2160×2160, quality 78, served only if needed |

Quality 82 hits the sweet spot of file size (~150–250 KB per photo) and visual quality at 1080×1080. Lower than 80 starts to show artifacts in soft gradients (skies). Higher than 85 doesn't visibly improve and bloats bandwidth.

**Total library weight**: ~75 × ~200 KB = ~15 MB. Comfortably inside Firebase Storage's free-tier 1 GB cap with two orders of magnitude of headroom for growth.

### 4. Strip EXIF

Remove EXIF metadata from every JPG before upload. EXIF can leak GPS, camera serial numbers, and personal info from the source photographer. Use `exiftool -all= photo.jpg` or the equivalent. The CI lint (`13_Photo_Curation_Tool.md`) checks for residual EXIF as a safety net.

### 5. Upload

Upload to Firebase Storage at `/photos/{id}.jpg`. The `id` field of the metadata entry IS the filename stem.

## File Naming

Stable, kebab-case identifiers describing the photo:

```
misty-fjord-01.jpg
sunrise-meadow-02.jpg
quiet-woods-03.jpg
foggy-coastline-04.jpg
```

A two-word description plus a numeric suffix. The description is for the curator's sanity (the file list is human-scannable); the suffix disambiguates similar shots. Once an `id` ships, it never changes — the metadata file references it and renaming breaks the live product.

## Storage Configuration

Per `01_Tech_Stack.md` and `02_Project_Setup.md`:

- Bucket: the project's default Firebase Storage bucket
- Path: `/photos/{id}.jpg`
- Public read: yes (`storage.rules` permits)
- Public write: no
- Cache-Control: set on each upload to `public, max-age=31536000, immutable` (1 year, immutable). Photos never change once uploaded; we leverage the CDN.

If a photo needs replacing (rare), upload it under a new `id` and update `photos.json`. Don't re-use an `id` — caches will serve stale content.

## Rotation Cadence

Quarterly, per `bless-your-heart-journey-qa.md`. Subtle, not announced.

| Quarter | Rotation rule |
|---------|---------------|
| Each quarter | Add ~3–5 new photos, retire ~3–5 of the least-used (per analytics) or weakest (per gut-check review) |

The library should grow modestly over time, not stay flat. Returning users notice "oh, new photos" as a small private pleasure that doesn't require a feature announcement.

**Implementation**: Update `photos.json` and Firebase Storage in the same PR. Removed photos can be deleted from Storage to keep the bucket tidy, but they don't have to be — orphaned files cost nothing.

## Pre-Launch Checklist

Before the library ships:

| Check | Owner |
|-------|-------|
| Every photo licensed for commercial use, with paperwork | Builder |
| Every photo at 1080×1080, color-graded, EXIF stripped | Curator |
| Every photo has a metadata entry with all required fields (`12_Photo_Metadata.md`) | Curator |
| At least 8 photos tagged `tier: 'high-capacity'` | Curator |
| `photos.json` passes the CI lint | Build |
| Manual smoke test: render 10 random photo + text combinations and review legibility | Curator |
| Manual review: every photo in the library passes a "yoga studio test" — does this look like it could hang in one? | Curator |

The yoga-studio test is subjective but quickly resolves the "is this on-brand?" question.

## Photographer Credits

Per `06_Landing_Page.md`'s footer credit dialog. Each photo's `credit` field carries the attribution string. Format:

```
"Photographer Name / Source"
```

If the license requires no attribution, set `credit: ""` and exclude from the credits list — but never set the field to a fictional name. Leave it empty.

## Why Not User-Submitted Photos

Flagged as a stretch feature in the source PRD; the answer is no for v1 and likely beyond. Reasons:

- Moderation overhead — a single photo containing identifiable people, copyrighted artwork, or content that breaks the wellness register would damage the brand
- License chain — proving the submitter holds rights to license commercially is hard
- Aesthetic drift — the library's coherence is part of the design, and crowdsourcing dilutes it

A small per-photo "submitted by" credit might be safer than a public submission flow if the desire to involve users surfaces later. Not for v1.

## Performance Considerations

- **Lazy load on hero examples**: not lazy, since they're above the fold (per `06_Landing_Page.md`).
- **Lazy load on poster reveal**: also not lazy — when a generation completes, the photo must be ready to draw immediately or the reveal stutters. Preload the photo as soon as the function returns:

```ts
const img = new Image();
img.src = photoUrl;
await img.decode();
// Now safe to draw to canvas
```

The 800ms minimum loading state (`04_UI_Design_System.md`) absorbs most photo-fetch latency. From the CDN, a ~200 KB photo is typically <300ms even on 4G.

- **No service worker / offline cache** at v1. The product is online-only by design (it needs the function call).

## Gaps & Assumptions

- **Color-grade recipe is curator-defined**: No spec is prescriptive enough to enforce; consistency check at curation review is the safety net.
- **High-capacity photo selection criteria**: A photo qualifies as `high-capacity` if its text-zone capacity at canonical typography accommodates 60-character line-1 + 100-character line-2 with at least 24px padding. Curation tool flags candidates automatically; curator confirms manually.
- **Photo replacement workflow** (when a license is revoked or a photo is identified as problematic): same-PR swap — remove from `photos.json`, optionally remove from Storage, deploy. The frontend cache TTL (1 year) means clients with the URL cached will continue to render it briefly; this is acceptable.
- **Copyright complaint workflow**: Footer should include a contact email (per `21_Site_Foundation.md`). On a substantiated takedown, swap the photo within 24 hours.
- **Quarterly re-verification of hotlines** (`10_Safety_Guardrails.md`) shares this rotation cadence — pair the work to keep ops simple.
