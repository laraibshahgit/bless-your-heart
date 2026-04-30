# UI Design System

## Overview

The visual treatment carries half the joke. This file defines the design tokens — colors, typography, spacing, animation timings, component styles — that every other UI file references. Treat this as the single source of truth; do not redefine tokens inline elsewhere.

The aesthetic register: **wellness-studio reverence**. Calm, slightly upmarket, faintly aspirational. The site itself looks like it could sell you a $40 candle. The savagery lives only in the generated text — the surrounding chrome stays earnest.

## Dependencies
- `02_Project_Setup.md` — Tailwind theme extension and Shadcn install live here
- `15_Compositing_Engine.md` — Canvas typography spec must match this file's tokens

## Color Palette

The site palette is intentionally muted and warm — a "deep breath" kind of palette, not a "tech product" one.

| Token | Hex | Use |
|-------|-----|-----|
| `bg-cream` | `#F7F3EC` | Page background. Warm off-white, never pure white. |
| `bg-paper` | `#FBF8F2` | Card / input surfaces. Slightly lighter than the page. |
| `ink-deep` | `#2A2622` | Primary text. Warm near-black, never pure black. |
| `ink-soft` | `#5C5650` | Secondary text and labels. |
| `ink-faint` | `#9A938B` | Placeholder text, footer copy. |
| `accent-sage` | `#8B9D83` | Primary accent — buttons, focus rings. Wellness-store green. |
| `accent-sage-deep` | `#6F8267` | Hover/active state for sage accents. |
| `accent-rust` | `#B47855` | Secondary accent — used sparingly for the "send to a friend" warmth. |
| `border-mist` | `#E5DFD4` | Hairline borders. Visible on cream, not heavy. |
| `feedback-quiet` | `#D9D4C8` | The error/soft-fail tone. Never red — red breaks the register. |

**Poster typography colors** (drawn onto Canvas, separate from site palette):

| Token | Hex | Use |
|-------|-----|-----|
| `poster-text-light` | `#FFFFFF` | Default text color over photos with `textColor: 'white'` |
| `poster-text-dark` | `#1A1612` | Used over photos with `textColor: 'dark'` (rare; ~10% of library) |

**No dark mode at v1.** The cream palette is the brand. Adding dark mode would either require a second photo library or sacrifice the joke; not worth it.

## Typography

### Site Type

Cormorant Garamond throughout. Self-hosted via `@fontsource` (see `01_Tech_Stack.md`). One typeface keeps the brand cohesive and saves bundle weight.

| Class | Size | Line height | Weight | Use |
|-------|------|-------------|--------|-----|
| `text-display` | 48px / 60px mobile/desktop | 1.1 | 500 | The "What's going on?" prompt headline |
| `text-headline` | 32px / 40px | 1.15 | 500 | Section headers (rare) |
| `text-body-lg` | 18px / 20px | 1.5 | 400 | Hero subhead, footer about copy |
| `text-body` | 16px | 1.55 | 400 | Default body |
| `text-label` | 14px | 1.4 | 500 | Preset button text, form labels |
| `text-caption` | 13px | 1.4 | 400 | Footer credits, disclaimer text |

**Italics are part of the brand.** Use sparingly — only for the mood-setting taglines on the hero and for the loading-state copy. Italic Cormorant Garamond is the most "yoga-studio" thing in the typeface; lean into it for the in-voice moments.

### Poster Type (drawn onto Canvas)

This typography is rendered directly onto the Canvas at compositing time. The fitting pipeline (`14_Text_Fitting_Pipeline.md`) measures against these exact specs.

| Element | Font | Size | Weight | Style | Notes |
|---------|------|------|--------|-------|-------|
| **Line 1** (reverent setup) | Cormorant Garamond | 64px @ 1080×1080 | 500 | regular | Tracking +0.02em |
| **Line 2** (savage pivot) | Cormorant Garamond | 44px @ 1080×1080 | 400 | italic | Tracking +0.01em |
| **Watermark** | Cormorant Garamond | 18px @ 1080×1080 | 400 | regular | Tracking +0.04em, opacity 0.85 |

The size differential between line 1 and line 2 is deliberate — it visually mimics how real wellness posters often have a smaller "subhead" that here gets weaponized. Line 1 is bigger because it's the "real" inspirational quote in the visual fiction.

**Letter-spacing values are not arbitrary** — Cormorant Garamond at these sizes reads slightly cramped without small positive tracking. Don't omit.

## Spacing Scale

Use Tailwind's defaults plus these brand-specific extensions:

| Token | Value | Use |
|-------|-------|-----|
| `space-breathe` | `1.75rem` (28px) | Default rhythm between hero elements |
| `space-section` | `4rem` (64px) | Between major sections on the page |
| `space-poster-pad` | `24px` | Minimum padding inside `textZone` (Canvas measurement) |

## Layout

### Breakpoints

Tailwind defaults are fine. Reference points:

- Mobile: < 640px (sm)
- Tablet: 640–1024px (md/lg)
- Desktop: ≥ 1024px (lg+)

### Page structure

```
[ Header — minimal: just the wordmark ]
[ Hero — headline + 1–3 example posters + prompt input + presets ]
[ (after generation) Poster reveal area ]
[ Footer — about line, credit, content notice, copyright ]
```

Single page, no scroll-to-section navigation. The prompt input and presets must fit above the fold on both mobile (small phones — iPhone SE width 375px) and desktop. Hero examples live above the prompt and serve as the visual proof of concept (`06_Landing_Page.md`).

### Touch targets

All interactive elements are at least 44×44 px (mobile spec). Preset buttons in particular need this — they live in a horizontal scrollable row on mobile.

## Components

Most UI is plain HTML elements styled with Tailwind. Shadcn provides the accessible primitives for `Button`, `Input`, `Textarea`, and `Dialog`. Customize the Shadcn variants with the brand tokens; don't introduce a separate component layer.

### Button variants

| Variant | Use | Style |
|---------|-----|-------|
| `primary` | Generate, Download | Sage background, cream text, no border |
| `secondary` | Regenerate, dialog dismiss | Cream background, ink-deep text, mist border |
| `preset` | Mood preset chips | Paper background, ink-soft text, mist border; sage border + ink-deep text on selected |
| `ghost` | Footer links | Inline, sage text on hover, no chrome |

All buttons use `rounded-full` — pill shape. This single shape carries through prompt input, presets, and CTAs. **Do not introduce square or sharp-cornered controls** — they break the soft register.

### Input

Single multiline-capable text input ("What's going on?"). Cream-paper background, ink-deep text, ink-faint placeholder. No visible border in the resting state; sage focus ring on focus. Generous internal padding (~20px). Max length 200 chars; show a faint counter only when within 20 characters of the cap.

### Dialog (distress interstitial only)

Used exclusively for the distress soft-refuse. See `10_Safety_Guardrails.md` for the content; see this file for the styling: same paper background, soft-shadow lift, no jarring close X — instead a "Take me back" button in the secondary variant. Modal backdrop is `bg-cream` with 70% opacity (not the typical black scrim — black would feel heavy and clinical).

## Animation Tokens

The product has very few animations. Each one earns its place; none is decorative.

| Token | Value | Use |
|-------|-------|-----|
| `duration-reveal` | 600ms | Poster fade-in after generation |
| `duration-anticipation-min` | 800ms | Minimum visible duration of loading state, even if the API returns faster |
| `duration-touch` | 150ms | Hover/active state transitions on buttons |
| `easing-soft` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default for poster reveal — slow-in, slow-out |
| `easing-touch` | `cubic-bezier(0.2, 0, 0.4, 1)` | Buttons; faster front-end for responsiveness |

**The 800ms anticipation beat is load-bearing.** If the function returns in 200ms, the frontend still waits until 800ms have elapsed before swapping the loading state for the reveal. Implementation lives in `16_Poster_Display_And_Regenerate.md`.

**No spinner with rotation icon.** The loading state is text-only and reverent — see `04`'s loading copy and `16`'s implementation. A spinning gear or robot icon would break the register.

## Loading State Treatment

The loading copy itself is part of the brand. Rotate among in-voice phrases such as:

- *"The universe is composing itself."*
- *"Aligning the chakras of your specific situation."*
- *"Distilling what you said into something honest."*

Italic, soft ink, slowly pulsing opacity (0.6 → 1.0 → 0.6 over 1600ms). Pick one phrase per generation; do not animate through a sequence.

## Iconography

Use `lucide-react` exclusively, and use icons sparingly. Strong candidates for v1:

- `Sparkles` (Generate button — slightly ironic given the savage output, which is the joke)
- `RefreshCw` (Regenerate)
- `Download` (Download)

That's the full iconography for v1. Resist adding more.

## Accessibility

- Minimum contrast ratio 4.5:1 for body text. The cream/ink-deep pairing meets this comfortably.
- All interactive elements have visible focus states (sage ring, 2px, 2px offset).
- The poster Canvas has an `aria-label` describing the generated text for screen readers (compositor sets this from line1/line2).
- The distress interstitial traps focus and returns it to the prompt input on close.
- Animations respect `prefers-reduced-motion` — the 600ms reveal becomes a 0ms swap; the loading-state opacity pulse stops.

## Gaps & Assumptions

- **Wordmark design**: The header wordmark is the brand name in Cormorant Garamond italic at `text-headline` size. No logo mark; the typography itself is the identity.
- **Specific loading copy strings**: Three to five rotating phrases is enough. Author them in `src/content/copy.ts`.
- **Hero examples color palette**: The example posters in the landing area use real photos from the library (per `06_Landing_Page.md`); they don't need bespoke styling — they use the same compositor as live generations.
- **Confirmation feedback after download**: A single line of caption text below the poster ("Saved. Go forth.") for ~2.5s, then fades. Implementation in `17_Download_PNG.md`.
