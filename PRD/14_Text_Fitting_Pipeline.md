# Text Fitting Pipeline

## Overview

A poster is a contract: exactly two visual lines, typography never scaled beyond ±5%, all text inside the chosen photo's safe zone with at least 24px padding, and legibility matching the photo's `textColor`. If any of those can't be satisfied for a given (text, photo) pair, the pipeline rotates or regenerates — never delivers a degraded poster.

Without this pipeline, the failure mode is silent and visible: text falling off the edge, line 2 wrapping into three visual lines and breaking the format-as-joke, or text rendering smaller than the design demands. This file specifies how the pipeline meets the contract across four stages and what the fallback ladder does when standard selection can't place the text.

## Dependencies
- `05_Voice_And_System_Prompt.md` — Stage 1 (the prompt's character budget)
- `09_Output_Validation_And_Retries.md` — Stage 2 (Zod schema with hard caps)
- `08_Generation_API.md` — Stage 3 (photo selection in the function)
- `12_Photo_Metadata.md` — Capacity field this pipeline consumes
- `15_Compositing_Engine.md` — Stage 4 (client-side width verification at render)

## The Contract

Every delivered poster meets all four guarantees:

1. **Exactly two visual lines.** Line 1 wraps to one rendered line; line 2 wraps to one rendered line. The format-as-joke depends on this — if line 2 visually breaks into two rendered rows, the cadence collapses.
2. **Typography scale tolerance ±5%.** Line-1 may render between 60.8px and 67.2px (canonical 64px ± 5%); line-2 between 41.8px and 46.2px (canonical 44px ± 5%). Beyond ±5%, the visual register slips out of "design quality" and into "auto-fit cheap."
3. **All text inside the photo's `textZone` with 24px padding on all sides.** No text touches the photo's edge. No text crashes the safe-zone boundary.
4. **Legibility matches the photo's `textColor` recommendation.** White serif on a photo curated for white text; dark serif on a photo curated for dark text.

If any guarantee can't be met for the current (text, photo) pair, the pipeline moves down the fallback ladder. It does not deliver a degraded poster.

---

## Stage 1: Prompt-Level Character Budget

**Where it runs**: Inside the system prompt sent to Sonnet, server-side.

**What it does**: Tells the model directly that line 1 should land 30–50 characters and line 2 should land 50–88 characters. The prompt explicitly states these ranges and includes worked examples that hit them.

**Why it exists**: Models reliably hit ranges when given them. This is the cheapest defense in the pipeline — no validation cost, no API call, no fallback overhead. Empirically, character-budget guidance in a tightly-written system prompt resolves >95% of length issues on its own.

**See**: `05_Voice_And_System_Prompt.md` for the prompt itself.

**Outcome on success**: Generated text lands in the target range. Stages 2–4 pass without engaging fallback. Logged as `fittingRung: 1`.

**Outcome on failure**: Text lands above the range (rare; ~3–5% of generations). Stage 2 catches it.

---

## Stage 2: Schema Validation with Hard Caps

**Where it runs**: Inside the generation function, server-side, after Sonnet returns.

**What it does**: Parses the JSON output against a Zod schema that enforces hard maximums *above* the prompt's target range:

```ts
const GenerationSchema = z.object({
  line1: z.string().trim().min(1).max(60),
  line2: z.string().trim().min(1).max(100),
}).strict();
```

The 60 / 100 caps are higher than the prompt's 30–50 / 50–88 targets. The cap is a safety net, not a target.

**Why it exists**: The prompt's range is suggestive; the schema is enforcing. Without an enforced cap, a 95-character line 1 — generated occasionally despite the prompt — would silently break Stage 4's width verification on most photos.

**Why caps above the target range**: Using the target range as the cap would force regeneration on legitimate, well-formed outputs that happen to be a few characters long. The 10–12 character buffer absorbs natural variance without pulling the trigger unnecessarily.

**See**: `09_Output_Validation_And_Retries.md` for the schema and retry logic.

**Outcome on success**: Output passes the schema; Stage 3 runs.

**Outcome on failure**: Function silently regenerates (capped at 2 retries). All retries failed → safe fallback (Rung 4), with Stage 1's `gen_safe_fallback` event logged.

---

## Stage 3: Photo Selection from Eligible Subset

**Where it runs**: Inside the generation function, server-side, after Stages 2 and the tone check pass.

**What it does**: Picks a photo whose per-photo `capacity` accommodates the validated text length, respecting the in-session dedup list.

```ts
const eligible = photos.filter(p =>
  p.capacity.line1 >= line1.length &&
  p.capacity.line2 >= line2.length &&
  !excludePhotoIds.includes(p.id)
);
```

If `eligible` is non-empty: random pick. Logged as `fittingRung: 1`.

**Why "eligible subset," not "first match"**: random within the eligible set keeps the visual experience varied. A user regenerating doesn't want to see photos picked by "first index that fits" — that produces a deterministic-feeling sequence.

**Why character count and not pixel measurement at this stage**: pixel measurement requires the rendered text and the loaded font, neither available in the function context. Character count via per-photo `capacity` (computed at curation time per `12_Photo_Metadata.md`) is the cheap proxy. Stage 4 does the real measurement.

**See**: `08_Generation_API.md` for the function-level photo selection code.

**Outcome on success**: A photo is picked; the response goes back to the client; Stage 4 runs at render.

**Outcome on no eligible photo**: The fallback ladder engages — first within Stage 3 (high-capacity tier), then beyond.

---

## Stage 4: Client-Side Width Verification at Render

**Where it runs**: In the browser, inside the compositor (`15_Compositing_Engine.md`), after the photo loads and just before drawing text.

**What it does**: Uses `ctx.measureText()` (or an equivalent offscreen canvas) to measure the actual pixel width of the rendered text at the canonical typography. Compares against the photo's `textZone` width minus padding.

```ts
await document.fonts.ready;  // critical — see below

ctx.font = '500 64px "Cormorant Garamond"';
const line1Width = ctx.measureText(line1).width;
const usableWidth = textZone.width * 1080 - 2 * 24;

if (line1Width > usableWidth) {
  // Try ±5% scaling first
  const scale = usableWidth / line1Width;
  if (scale >= 0.95) {
    // Within tolerance — render at scaled size
    finalLine1Size = 64 * scale;
  } else {
    // Outside tolerance — engage fallback
    return fallbackToHighCapacity();
  }
}
// repeat for line2
```

**Why client-side**: Text width depends on the *actual* rendered font, which only exists in the browser at render time. Server-side estimation via per-glyph advance is necessarily approximate; the curation tool's capacity values use a 10% safety margin precisely because of this. Stage 4 is the final, definitive arbiter.

**Why `await document.fonts.ready`**: `measureText()` returns the wrong width if the requested font hasn't loaded — the canvas falls back to a system serif with different metrics, the measurement looks fine, then the rendered text overflows when the real font loads later. `document.fonts.ready` resolves once all declared fonts are usable for both rendering and measurement.

**Within tolerance (scale ≥ 0.95 ≤ 1.05)**: Render at the adjusted size. The contract's ±5% guarantee permits this. Logged as `fittingRung: 1` (the standard path absorbed it).

**Outside tolerance**: Engage the fallback ladder.

---

## The Fallback Ladder

When standard selection plus ±5% scaling can't place the text, the pipeline rotates through fallback rungs. Each rung escalates; every rung lands on a contract-compliant poster.

### Rung 1 — Standard selection succeeded

The default outcome. Stages 1–4 all pass. Most generations.

### Rung 2 — High-capacity photo rotation

Triggered when Stage 4 fails for the chosen photo. Client requests a new photo from the high-capacity tier:

```ts
// On Stage 4 failure, the client posts back to /api/select-photo
// with the current line1/line2 lengths and excludePhotoIds,
// asking for a tier='high-capacity' photo.
```

Alternatively, the function can return a *list* of viable photo IDs in order of capacity, so the client falls through them without a second round-trip. V1 implementation: keep it simple — single round-trip, trust the function's pick, fall back via a second call only if needed.

By definition, every high-capacity photo's capacity meets `line1 >= 60 && line2 >= 100`, which exceeds the schema cap. So a high-capacity photo always fits any schema-valid text. Stage 4 will pass on this photo.

Logged as `fittingRung: 2`.

### Rung 3 — Force-regenerate with stricter prompt

If for any reason Rung 2 fails (extremely unlikely — would require the high-capacity tier to not exist or all be excluded), or if the original generation was never schema-valid in the first place (Stage 2 failure exhausted retries), the function regenerates with a stricter prompt:

```
SYSTEM PROMPT ADDENDUM: This is a retry. The previous output was too
long. Aim for line 1 ≤ 35 characters and line 2 ≤ 70 characters.
```

This is an exceptional regeneration — it modifies the prompt to bias hard toward brevity. The retry budget is 1; failure leads to Rung 4.

Logged as `fittingRung: 3`.

**Note**: Per `09_Output_Validation_And_Retries.md`, the standard validation retries do *not* modify the prompt. Rung 3 is the only place in the system that does. Keep it isolated.

### Rung 4 — Safe canned fallback

Last resort. A pre-written line 1 + line 2 paired with a known-good high-capacity photo (per `09_Output_Validation_And_Retries.md`'s safe fallback pool). The user gets a poster — the contract holds — even though it's deliberately generic.

Logged as `fittingRung: 4` and `gen_safe_fallback`.

---

## Logging and Observability

Each generation logs its `fittingRung` value (1–4) so production analytics can spot drift.

| Metric | Healthy | Investigation trigger |
|--------|---------|----------------------|
| `fittingRung: 1` rate | ≥ 95% | < 95% — Stage 1 prompt is drifting; review |
| `fittingRung: 2` rate | < 4% | > 5% — character budget needs tightening in the prompt |
| `fittingRung: 3` rate | < 1% | Any sustained rate — schema validation or retry logic is broken |
| `fittingRung: 4` rate | < 1% | Any sustained rate — system prompt has fundamentally regressed |

Rate of Rung 2 *or higher* above 5% is the leading indicator of prompt drift, per the source PRD's tech-stack rationale. Don't ignore it; revisit `05_Voice_And_System_Prompt.md`.

The PostHog event for each generation includes `fittingRung` (`22_Analytics.md`).

## Why Four Stages, Not One

Each stage exists because the prior stage isn't sufficient on its own:

| Stage | Sufficient alone? | Why not |
|-------|-------------------|---------|
| 1 (prompt) | No | Models drift; ranges are suggestive |
| 2 (schema) | No | Character count ≠ pixel width |
| 3 (photo selection) | No | Capacity is computed with a safety margin; final pixel width still varies |
| 4 (render verification) | No | Cannot recover if the photo is wrong; needs Stages 1–3 to have produced viable inputs |

The redundancy is intentional. Each stage handles a different failure mode at the cheapest possible cost.

## What This Pipeline Does NOT Do

- **Wrapping line 1 or line 2 to multiple rendered lines.** The format is two visual lines. Wrapping breaks the joke. Always engage a fallback rung instead.
- **Rendering text outside the `textZone`**. The zone is the constraint; if text doesn't fit, switch photos.
- **Auto-shrinking beyond ±5%**. The ±5% tolerance is the design budget. Beyond it, the visual register slips and the joke degrades. Always engage a fallback rung instead.
- **Auto-cropping the photo to fit text**. The photo is fixed once selected; the text adapts to it (via stages 1–3) or selects a different photo (via the ladder).

## Gaps & Assumptions

- **±5% tolerance is a design choice, not a measured threshold**. The justification in the source PRD is "design quality is non-negotiable." If post-launch user research suggests ±10% is acceptable, the threshold lives in one place (the compositor) and is straightforward to relax.
- **Round-trip cost of Rung 2**: a second function call per failed generation adds ~300–800ms. At a 4% Rung-2 rate, the average user-perceived latency is unaffected. If Rung 2 rate ever exceeds 10%, optimize to single-round-trip by returning a ranked photo list from the function.
- **Per-glyph advance constants** (per `13_Photo_Curation_Tool.md`): re-measure if the typography spec changes. The compositor's measurements are authoritative; the curation tool's constants are an estimate.
- **What if `document.fonts.ready` itself fails or times out**: extremely rare with self-hosted fonts. If it ever fails, render anyway — the user gets a slightly mis-measured poster, which is better than no poster. Log the event for diagnostics.
- **Localization considerations**: per-glyph advances would change for non-Latin scripts. V1 is English-only; if multi-language ever ships (P3 future feature), the calibration constants per language would be a precondition.
