# Canvas & Compositing

## Canvas Setup

- **Logical resolution**: 1080x1080 (Instagram-friendly square)
- **Physical resolution**: scales by `devicePixelRatio` (no blur on retina)
- **Export format**: PNG, < 500 KB
- **Performance**: ~10–30ms per composite; imperceptible
- **Accessibility**: `aria-label="Poster reading: {line1}. {line2}"`

## Font Loading (Critical)

```ts
await document.fonts.ready;  // MUST wait before measureText() or fillText()
```

Fallback to system serif is silent and **breaks the joke**. Cormorant Garamond must be loaded.

## Draw Order

1. Clear canvas
2. Draw photo (cover-fit, full-canvas)
3. Draw line 1 (64px, weight 500, tracking +0.02em, top-aligned with 24px padding)
4. Draw line 2 (44px, italic, weight 400, tracking +0.01em)
5. Draw watermark (18px, tracking +0.04em, 0.85 opacity, corner per photo metadata)

## Poster Typography (Canvas-Rendered)

| Element | Size @1080 | Weight | Style | Tracking |
|---------|-----------|--------|-------|----------|
| Line 1 | 64px | 500 | regular | +0.02em |
| Line 2 | 44px | 400 | italic | +0.01em |
| Watermark | 18px | 400 | regular | +0.04em |

Text color: `#FFFFFF` (white) or `#1A1612` (dark) based on photo's `textColor` field.

## Text-Fitting Pipeline (Four Stages)

**Goal**: exactly two visual lines, no wrapping, typography ±5%, all text inside `textZone`.

| Stage | Where | Action |
|-------|-------|--------|
| 1. Prompt budget | System prompt | Target ranges in prompt; ~95% hit on first try |
| 2. Schema validation | Server (Zod) | Hard caps 60/100 chars; retry on fail |
| 3. Photo selection | Server | Filter by `capacity.line1 >= len && capacity.line2 >= len` |
| 4. Width verification | Client (Canvas) | `measureText()` against usable width ±5% tolerance |

## Fallback Ladder

| Rung | Trigger | Action | Expected % |
|------|---------|--------|-----------|
| 1 | All stages pass | Ship poster | ~95%+ |
| 2 | Stage 4 fails | Request high-capacity photo | < 4% |
| 3 | Rung 2 fails | Force-regenerate with stricter prompt | < 1% |
| 4 | All retries exhausted | Ship pre-curated safe fallback | < 1% |

**Monitoring**: Rung 2+ above 5% is a leading indicator of prompt drift.

## Download Flow

- Target: 1080x1080 PNG
- iOS Safari: use `file-saver` package workaround
- UX: brief confirmation ("Saved. Go forth.") for ~2.5s, fade

## Photo Metadata Shape

```ts
interface Photo {
  id: string;                    // kebab-case, e.g. "misty-fjord-01"
  width: number; height: number; // always ≥ 1080
  textZone: { x: number; y: number; width: number; height: number }; // normalized 0–1
  capacity: { line1: number; line2: number };
  textColor: 'white' | 'dark';
  watermarkPosition: 'lower-left' | 'lower-right' | 'upper-left' | 'upper-right';
  tier: 'standard' | 'high-capacity';
  credit: string;
}
```
