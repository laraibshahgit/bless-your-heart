# Compositing Engine

## Overview

The compositor is the function that turns a `(photo, line1, line2)` triple into a rendered poster on an HTML5 Canvas. It is the visible joke. Native Canvas was chosen over `html2canvas` and similar DOM-screenshot libraries for pixel-perfect text placement and high-DPI rendering — see `01_Tech_Stack.md` for the rationale.

This file specifies the canvas setup, the strict draw order, font loading prerequisites, devicePixelRatio handling for crisp output, and the Stage-4 width verification handoff to the fitting pipeline.

## Dependencies
- `04_UI_Design_System.md` — Typography spec for poster type
- `12_Photo_Metadata.md` — Per-photo `textZone`, `textColor`, `watermarkPosition` consumed here
- `14_Text_Fitting_Pipeline.md` — Stage 4 width verification runs in this engine
- `17_Download_PNG.md` — Consumes the rendered canvas via `toBlob`
- `18_Watermark.md` — Watermark drawing details

## Canvas Setup

The compositor lives in `src/lib/compositor.ts` as a pure render function. The component (`PosterCanvas.tsx`) creates the canvas element, hands it to the compositor with the inputs, and renders the result.

### Logical vs physical resolution

Posters render at **1080×1080 logical pixels**. The canvas element is sized to its container in CSS, but the backing buffer scales by `devicePixelRatio` so retina screens render at 2× or 3× resolution without blur.

```ts
const LOGICAL_SIZE = 1080;
const dpr = window.devicePixelRatio || 1;

canvas.width = LOGICAL_SIZE * dpr;
canvas.height = LOGICAL_SIZE * dpr;
canvas.style.width = `${displayedSize}px`;     // CSS sizing
canvas.style.height = `${displayedSize}px`;

const ctx = canvas.getContext('2d');
ctx.scale(dpr, dpr);                            // logical coords → physical pixels
```

After scaling, all draw operations use **logical 1080×1080 coordinates**. The compositor never reasons about the physical buffer size after setup.

### Why 1080×1080 logical

- Matches the PNG export target (`17_Download_PNG.md`)
- Square format works for Instagram feed, group chats, iMessage, Slack — the dominant share surfaces
- High enough that poster looks good on a desktop preview but small enough that the export PNG stays under 500KB

### Display sizing

The `<canvas>` element's CSS dimensions adapt to the viewport:

| Viewport | Displayed size |
|----------|----------------|
| Mobile (< 640px) | 100% width minus 32px padding, capped at 360px |
| Tablet (640–1024px) | 480px |
| Desktop (≥ 1024px) | 540px |

These CSS values are independent of the 1080×1080 logical resolution — the canvas oversamples on retina at any viewport.

## Font Loading — Critical

`measureText()` and `fillText()` both **silently fall back to a system serif** if the requested font isn't loaded yet. This produces two correlated failures: incorrect width measurements (Stage 4 of `14_Text_Fitting_Pipeline.md` over- or under-fits text) and visually wrong rendering (the poster looks generic).

The compositor must await font readiness before any Canvas text operation:

```ts
async function ensureFontsReady() {
  await document.fonts.ready;

  // Belt-and-suspenders: explicitly request loads at the sizes we'll use
  await Promise.all([
    document.fonts.load('500 64px "Cormorant Garamond"'),
    document.fonts.load('italic 400 44px "Cormorant Garamond"'),
    document.fonts.load('400 18px "Cormorant Garamond"'),
  ]);
}
```

Call `ensureFontsReady()` once at app boot (in `main.tsx`) so subsequent renders don't pay the cost. Cache the resolved promise so concurrent compositions share it.

The font is registered via `@fontsource/cormorant-garamond/*.css` imports per `02_Project_Setup.md`. Self-hosted is non-negotiable — Google Fonts CDN latency causes render-time race conditions where `document.fonts.ready` resolves before all weights are usable.

## Draw Order

The compositor draws in a strict order. Each pass clears or composites onto the prior layers.

```
1. Clear canvas to transparent
2. Draw photo (full-canvas, cover-fit)
3. (optional) Draw subtle gradient overlay for legibility
4. Draw line 1 inside textZone, top-aligned
5. Draw line 2 inside textZone, below line 1
6. Draw watermark in the photo's metadata-specified corner
```

Each step is a separate function in `compositor.ts`. The orchestrator calls them in sequence; each function receives `ctx`, the photo metadata, and any per-step inputs.

### Step 2: Photo background

```ts
ctx.drawImage(loadedImg, 0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
```

The image is pre-loaded (per `11_Photo_Library.md`'s preload pattern) at 1080×1080. Direct `drawImage` is sufficient.

### Step 3: Optional gradient overlay (skipped at v1)

The PRD mentions "subtle text shadow or gradient overlay if needed for legibility against light skies." At v1, do **not** apply a gradient overlay — the per-photo `textColor` choice (`12_Photo_Metadata.md`) handles light-vs-dark by selecting text color, which is more reliable than a one-size-fits-all overlay. If a specific photo's text legibility is borderline, re-curate it with a different `textZone` or `textColor`, not a global overlay.

### Step 4–5: Text rendering

Per the `04_UI_Design_System.md` poster type spec:

```ts
// Line 1
ctx.font = '500 64px "Cormorant Garamond"';
ctx.fillStyle = textColor === 'white' ? '#FFFFFF' : '#1A1612';
ctx.textBaseline = 'top';
ctx.textAlign = 'center';

const zonePx = {
  x: textZone.x * LOGICAL_SIZE,
  y: textZone.y * LOGICAL_SIZE,
  width: textZone.width * LOGICAL_SIZE,
  height: textZone.height * LOGICAL_SIZE,
};

const centerX = zonePx.x + zonePx.width / 2;
const line1Y = zonePx.y + 24;  // top padding
ctx.fillText(line1, centerX, line1Y);

// Line 2 (italic, smaller)
ctx.font = 'italic 400 44px "Cormorant Garamond"';
const line2Y = line1Y + 64 * 1.15 + 16;  // line-1 height + gap
ctx.fillText(line2, centerX, line2Y);
```

**Letter-spacing**: Canvas does not support CSS-style `letter-spacing` natively. Per `04_UI_Design_System.md`, line 1 has +0.02em tracking, line 2 has +0.01em, watermark has +0.04em. Implementation options:

1. **Render character-by-character** with explicit x-offsets — full control but slow
2. **Use `letterSpacing` property on `CanvasRenderingContext2D`** — supported in modern browsers (Chrome 99+, Safari 16.4+, Firefox 112+); set as a CSS-style string before `fillText`

```ts
ctx.letterSpacing = '0.02em';
ctx.fillText(line1, centerX, line1Y);
```

V1: use `ctx.letterSpacing`. Browser support covers >95% of users; older browsers render text with default tracking, which is a graceful degradation (slightly cramped, still readable).

**Vertical centering inside the zone**: not strictly centered. Top-aligned with 24px padding from the zone's top edge. The zone is sized so line 1 + line 2 fit comfortably; precise vertical centering looks worse than predictable top-anchoring because line 2 lengths vary.

### Step 6: Watermark

Drawn last, on top of any text it might (rarely) overlap. Color matches `textColor` (white watermark on white-text photos, dark on dark). Full details in `18_Watermark.md`.

## Stage 4: Width Verification

Per `14_Text_Fitting_Pipeline.md`, the compositor performs final pixel-width verification before drawing. This happens **after font readiness, before drawing text**.

```ts
async function fitOrFallback(line1, line2, photo): Promise<FitResult> {
  await ensureFontsReady();

  ctx.font = '500 64px "Cormorant Garamond"';
  ctx.letterSpacing = '0.02em';
  const line1Width = ctx.measureText(line1).width;

  ctx.font = 'italic 400 44px "Cormorant Garamond"';
  ctx.letterSpacing = '0.01em';
  const line2Width = ctx.measureText(line2).width;

  const usable = (photo.textZone.width * LOGICAL_SIZE) - (2 * 24);

  const line1Scale = line1Width <= usable ? 1 : usable / line1Width;
  const line2Scale = line2Width <= usable ? 1 : usable / line2Width;
  const minScale = Math.min(line1Scale, line2Scale);

  if (minScale >= 0.95) {
    return { ok: true, scale: minScale };
  }

  // Outside the ±5% tolerance — engage Rung 2 fallback
  return { ok: false, reason: 'overflow' };
}
```

If `ok: true`, multiply the canonical font sizes by `scale` (1.0 if no scaling needed; 0.95–1.0 if mild scaling) and proceed with the draw passes.

If `ok: false`, the React component requests a high-capacity photo via a follow-up function call and re-runs the compositor with the new photo. See `14_Text_Fitting_Pipeline.md`'s Rung 2 logic.

## Image Smoothing

```ts
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
```

Default behavior for image scaling is acceptable, but explicitly setting `'high'` quality avoids subtle artifacts when the photo's source dimensions match the canvas (no scaling needed) but a high-DPI display oversamples.

## Accessibility Output

The canvas itself is invisible to screen readers. Set an `aria-label` on the `<canvas>` element after each render:

```tsx
<canvas
  ref={canvasRef}
  aria-label={`Poster reading: ${line1}. ${line2}`}
  role="img"
/>
```

This lets screen-reader users hear the generated text without needing a parallel DOM rendering. Update the label every time `line1` / `line2` change.

## Performance

- A single composite pass takes ~10–30ms in Chrome on a modern device, dominated by `drawImage`. Imperceptible to the user.
- The compositor is purely synchronous after `ensureFontsReady()` resolves. No animation frame scheduling required for v1.
- Re-running the compositor on regenerate is fast; the photo may already be in the browser cache (CDN cache hits typically resolve in < 50ms for repeat photos within a session).

## React Integration

The `PosterCanvas` component owns the canvas ref and re-runs the compositor when its props change.

```tsx
useEffect(() => {
  let cancelled = false;
  (async () => {
    await ensureFontsReady();
    const img = await loadImage(photoUrl);
    if (cancelled) return;

    const fit = await fitOrFallback(line1, line2, photo);
    if (!fit.ok) {
      onFitFailure();  // triggers Rung 2 in the parent
      return;
    }

    composite({ ctx, img, photo, line1, line2, scale: fit.scale });
  })();

  return () => { cancelled = true; };
}, [photoUrl, line1, line2]);
```

The `cancelled` flag prevents stale renders if the user regenerates while a prior composite is in flight.

## Gaps & Assumptions

- **Browser font fallback during the very first render** before `document.fonts.ready` resolves: paged correctly by the boot-time `ensureFontsReady()` call. If a user composites before boot completes (extremely unlikely on this UI), the await resolves before `measureText` runs.
- **`ctx.letterSpacing` browser support gap**: Firefox added support in 112 (Apr 2023), Safari 16.4 (Mar 2023), Chrome 99 (Mar 2022). Combined coverage is >95% of users in 2026. Older browsers see slightly tighter tracking — graceful, not broken.
- **Photo formats other than JPG**: not supported at v1. The library is JPG-only. If WebP or AVIF is added later, `drawImage` handles them transparently — no compositor change needed.
- **Performance budget**: 10–30ms per composite is well under the 800ms anticipation beat (`16_Poster_Display_And_Regenerate.md`). No need to optimize further at v1.
- **Right-to-left text**: not supported at v1. Cormorant Garamond is a Latin-script face; RTL is a P3 future feature scoped with multi-language support.
