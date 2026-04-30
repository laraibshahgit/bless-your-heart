# Design System

## Color Palette (Brand)

| Token | Hex | Use |
|-------|-----|-----|
| `bg-cream` | `#F7F3EC` | Page background |
| `bg-paper` | `#FBF8F2` | Card/input surfaces |
| `ink-deep` | `#2A2622` | Primary text |
| `ink-soft` | `#5C5650` | Secondary text |
| `ink-faint` | `#9A938B` | Placeholder/footer |
| `accent-sage` | `#8B9D83` | Primary accent (buttons) |
| `accent-sage-deep` | `#6F8267` | Hover/active |
| `accent-rust` | `#B47855` | Secondary accent |
| `border-mist` | `#E5DFD4` | Hairlines |
| `feedback-quiet` | `#D9D4C8` | Error tone |

**Never use red for errors.** Never use raw Tailwind color names — use brand tokens only.
**No dark mode at v1.** Cream palette IS the brand.

Poster text: `#FFFFFF` (white on dark zones), `#1A1612` (dark on light zones).

## Typography

One typeface: **Cormorant Garamond** (self-hosted via `@fontsource`).

| Class | Size | Weight | Use |
|-------|------|--------|-----|
| `text-display` | 48/60px | 500 | "What's going on?" headline |
| `text-headline` | 32/40px | 500 | Section headers |
| `text-body-lg` | 18/20px | 400 | Hero subhead |
| `text-body` | 16px | 400 | Default body |
| `text-label` | 14px | 500 | Preset buttons, labels |
| `text-caption` | 13px | 400 | Footer, disclaimer |

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `space-breathe` | 1.75rem (28px) | Default rhythm |
| `space-section` | 4rem (64px) | Major sections |
| `space-poster-pad` | 24px | Minimum inside textZone |

## Animation Tokens

| Token | Value |
|-------|-------|
| `duration-reveal` | 600ms |
| `duration-anticipation-min` | 800ms |
| `easing-soft` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `easing-touch` | `cubic-bezier(0.2, 0, 0.4, 1)` |

Loading state: no spinner. Opacity pulse 0.6 → 1.0 → 0.6 over 1600ms with rotating in-voice copy.

## Button Variants (Pill-shaped, `rounded-full`)

| Variant | Use | Style |
|---------|-----|-------|
| `primary` | Generate, Download | Sage bg, cream text |
| `secondary` | Regenerate, dismiss | Paper bg, sage border |
| `preset` | Mood chips | Paper bg, sage border on selected |
| `ghost` | Footer links | Inline, no chrome |

## Responsive Breakpoints

- Mobile: < 640px (sm)
- Tablet: 640–1024px (md/lg)
- Desktop: ≥ 1024px (lg+)

**Critical**: prompt input + Generate button must fit above fold on iPhone SE (375x667) and 13" laptop (1280x800).

## Component Library

Shadcn/UI for: Button, Input, Dialog, Textarea. No other UI library.
