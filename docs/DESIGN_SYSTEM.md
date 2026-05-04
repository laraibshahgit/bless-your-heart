# Design System — Bless Your Heart

This document is the **as-is** snapshot of the design system in the codebase. It does not prescribe what *should* exist — it describes what currently *does*. Generated as part of audit run 35/001 (`audit-reports/35_UI_DESIGN_QUALITY_REPORT_001_*.md`).

The system is small and tightly scoped because the product is a single-page app: a hero, a prompt input, preset chips, a generate button, a poster canvas, and two dialogs (distress + credits). Token sources of truth:

- Brand tokens: [`tailwind.config.ts`](../tailwind.config.ts) (colors, font families, font sizes, spacing extras, radii, transitions, animations).
- Base layer: [`src/styles/globals.css`](../src/styles/globals.css) (body defaults + two utilities).
- Component variants: [`src/components/ui/button.tsx`](../src/components/ui/button.tsx) (CVA recipe).

Tailwind's default utilities cover everything else (margins, gaps, typography modifiers, etc.) — there is no separate scale file.

---

## Color Palette

Exactly **9 named tokens** are defined; everything in the rendered DOM resolves to one of them, plus `#ffffff` and `#1a1612` for the two poster-text overlay utilities.

### Surfaces

| Token | Hex | Used for |
|---|---|---|
| `cream` | `#F7F3EC` | App background ([`App.tsx`](../src/App.tsx) `bg-cream`, `ErrorBoundary`) |
| `paper` | `#FBF8F2` | Footer, prompt input, dialog content, button-secondary, preset chip |
| `border-mist` | `#E5DFD4` | All borders (preset chip, input, dialog) |

### Ink (typography)

| Token | Hex | Role | Used for |
|---|---|---|---|
| `ink-deep` | `#2A2622` | Primary body / headlines | Page title, dialog title, header link |
| `ink-soft` | `#5C5650` | Secondary copy | Loading phrase, footer body, preset selected text |
| `ink-faint` | `#9A938B` | Tertiary copy / placeholders | Footer tagline, input placeholder, iOS hint |

### Accents (interactive only)

| Token | Hex | Used for |
|---|---|---|
| `accent-sage` | `#8B9D83` | Primary button bg, focus ring, hover border, link color |
| `accent-sage-deep` | `#6F8267` | Primary button hover bg |
| `accent-rust` | `#B47855` | **Currently unused** in the rendered DOM (declared in tailwind.config.ts but not referenced in `src/`) |

### Feedback

| Token | Hex | Used for |
|---|---|---|
| `feedback-quiet` | `#D9D4C8` | Inline error text, character counter |

> **Intentional contrast deviation**: `feedback-quiet` (#D9D4C8) on `cream` and `accent-sage` (#8B9D83) on `paper` both fail WCAG-AA 4.5:1 for body text. This is documented in `CLAUDE.md` (audit run 34/001) as a deliberate brand decision — the cream-on-cream "quiet" treatment is the visual identity. This is a known, accepted gap.

### Poster overlay (canvas-only)

Two raw values escape the token system because they're *inside* the rendered poster, not the chrome:

| Class | Hex | Used for |
|---|---|---|
| `.text-poster-light` | `#ffffff` | Poster line color when overlaid on a dark photo zone |
| `.text-poster-dark` | `#1a1612` | Poster line color when overlaid on a light photo zone |

These live in [`globals.css`](../src/styles/globals.css) `@layer utilities`. They're not used in any current Tailwind class on a DOM element — they exist for the canvas compositor's text rendering.

---

## Typography

### Font family

A single serif stack — **Cormorant Garamond** with **Georgia** fallback — is applied globally via [`tailwind.config.ts`](../tailwind.config.ts) `fontFamily.serif` and the body element. There is no sans-serif anywhere; the brand voice is consistent.

Font subsets shipped: `latin-400`, `latin-500`, `latin-400-italic` (audit run 34/001 — see `CLAUDE.md`).

### Type scale

8 sizes are defined in `tailwind.config.ts`. The 5 in active rendered use:

| Token | Px | Line-height | Weight | Used for |
|---|---|---|---|---|
| `display-lg` | 60px (3.75rem) | 1.1 | 500 | "What's going on?" h1 (lg+) |
| `display` | 48px (3rem) | 1.1 | 500 | h1 below lg breakpoint |
| `headline-lg` | 40px (2.5rem) | 1.15 | 500 | (declared, currently unused) |
| `headline` | 32px (2rem) | 1.15 | 500 | "Bless Your Heart" header link, dialog titles |
| `body-lg` | 18px (1.125rem) | 1.5 | 400 | Prompt input, distress phone, loading phrase |
| `body` | 16px (1rem) | 1.55 | 400 | Distress body, error states |
| `label` | 14px (0.875rem) | 1.4 | 500 | All buttons (`Button` CVA) |
| `caption` | 13px (0.8125rem) | 1.4 | 400 | Footer, character counter, iOS hint, error caption |

5 distinct sizes appear in the live DOM (13/16/18/32/60 px). 8 declared, 3 unused.

### Italic conventions

Italics are deliberate brand voice, not emphasis:
- The h1, header link, footer tagline, footer body, dialog titles in some dialogs, loading phrases, error captions, and download confirmation are all italic.
- The Cormorant 400-italic subset is shipped specifically for this.

---

## Spacing

### Base scale

Tailwind's default 4px scale (`p-1` = 4px, `p-2` = 8px, `p-4` = 16px, etc.) is used throughout. **No custom override.**

### Custom spacing extras

| Token | Value | Used for |
|---|---|---|
| `breathe` | `1.75rem` (28px) | `space-y-breathe` for the main vertical rhythm; `mt-breathe` on PosterReveal container |
| `section` | `4rem` (64px) | `pb-section` on main, `mt-section` on footer |

### Distinct padding values observed

7 unique padding signatures across the rendered DOM: `0px 16px`, `0px 16px 64px`, `0px 32px`, `16px 20px`, `24px 0px`, `32px 0px`, `8px 4px`. All multiples of 4px, all explicable from Tailwind utilities. **No drift.**

### Distinct gaps observed

`8px` (`gap-2`) and `16px` (`gap-4`). Two values, used consistently.

---

## Border Radius

Four distinct radii in the rendered DOM:

| Token | Value | Used for |
|---|---|---|
| `pill` | `9999px` | All buttons (default) |
| `rounded-xl` | `12px` | Prompt input, hero example imgs, poster canvas |
| `rounded-lg` | `8px` | Dialog content (`sm:rounded-lg`) |
| `rounded-sm` | `2px` | Dialog close X, credits trigger, header link focus target, footer link focus target |

The `rounded-sm` on text-link focus targets exists purely so the focus ring has a visible corner radius — it's not visible at rest because text links have no background.

Buttons are exclusively pill-shaped (`rounded-pill`). Containers use `rounded-xl` (12px). Dialogs sit slightly smaller (`rounded-lg`/8px) to read as overlays. The system is internally consistent.

---

## Shadows

| Class | Value | Used for |
|---|---|---|
| `shadow-sm` | `0 1px 2px 0 rgba(0,0,0,0.05)` | Primary button only |
| `shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)` | Poster canvas, dialog content |

The system is restrained — only the poster and the primary CTA carry elevation. Everything else is flat.

---

## Transitions

### Tokens

| Token | Value | Intended use |
|---|---|---|
| `duration-reveal` | 600ms | Poster fade-in (`PosterReveal` settled branch) |
| `duration-anticipation` | 800ms | (declared, unused at render time — `LOAD_FLOOR_MS` is the JS-side floor) |

### Easings

| Token | Curve |
|---|---|
| `ease-soft` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `ease-touch` | `cubic-bezier(0.2, 0, 0.4, 1)` (used by `Button`) |

### Animations

| Animation | Definition | Used for |
|---|---|---|
| `animate-pulse-opacity` | 1600ms ease-in-out infinite | Loading phrase pulse |
| `animate-in fade-in duration-reveal` | Tailwind animate plugin | Poster reveal, download confirmation |

### Default transitions on interactive elements

All Tailwind component-style transitions resolve to **150ms** (`duration-150`) in the rendered DOM. The Button's `transition-all duration-150 ease-touch` is the dominant pattern.

---

## Component Patterns

### Buttons ([`src/components/ui/button.tsx`](../src/components/ui/button.tsx))

CVA recipe with 4 variants × 4 sizes.

**Variants**:

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| `primary` | `accent-sage` | `cream` | none | bg → `accent-sage-deep` |
| `secondary` | `paper` | `ink-deep` | `border-mist` | border → `accent-sage` |
| `preset` | `paper` | `ink-soft` | `border-mist` | border → `accent-sage`, `data-[selected=true]` deepens text + border |
| `ghost` | none | `ink-soft` | none | text → `accent-sage` |

**Sizes**:

| Size | Height | Padding | Radius |
|---|---|---|---|
| `default` | 44px (h-11) | px-6 py-2 | pill |
| `sm` | 36px (h-9) | px-4 | pill |
| `lg` | 48px (h-12) | px-8 | pill |
| `icon` | 40×40 | — | rounded-full |

All variants share `active:scale-[0.98]` (except `ghost`), `disabled:opacity-50`, and the same focus ring (`accent-sage/50`, ring-2, ring-offset-2, ring-offset-cream). Transition: `transition-all duration-150 ease-touch`.

> **Note**: The `sm` size is 36px tall, below the 44×44px iOS/Android tap-target minimum. Used for preset chips. See the audit report for context — the row is horizontally scrollable, so the targets get full chip width, but vertical hit area is still 36px on touch.

### Inputs

The visible input on the homepage is the prompt input ([`PromptInput.tsx`](../src/components/PromptInput.tsx)) — a raw `<input>` with bespoke styling, not the shadcn `Input`. It is intentionally distinct: `bg-paper`, no border, `rounded-xl` (12px), `px-5 py-4`, `text-body-lg` (18px). The 18px font size meets the iOS auto-zoom threshold (≥16px).

The shadcn `Input` and `Textarea` exist in `src/components/ui/` but **neither has a usage in the rendered app today**. They share the standard h-10 / border-mist / rounded-md (6px) shadcn defaults. Either remove them (audit task — out of scope this run) or document them as available primitives.

### Dialogs ([`src/components/ui/dialog.tsx`](../src/components/ui/dialog.tsx))

Built on Radix `Dialog`. `DialogContent` defaults: `max-w-lg`, `bg-paper`, `border-border-mist`, `p-6`, `gap-4`, `sm:rounded-lg`, `shadow-lg`. Animation: in/out fade + zoom-95 + slide-from-top-48%, ~200ms.

Close button: absolute top-right, `text-ink-soft`, opacity-70 → 100 on hover, focus-visible ring matches buttons, `ring-offset-paper` (matches dialog bg).

Two consumers:
- `DistressInterstitial` — the high-stakes "this isn't for jokes" modal, with a `DialogTitle` + `DialogDescription` pair.
- `CreditsDialog` — the photo credits list, opened from the footer.

---

## Breakpoints

Tailwind defaults, no override:

| Token | Min-width |
|---|---|
| `sm` | 640px |
| `md` | 768px (declared, unused — no `md:` classes anywhere) |
| `lg` | 1024px |
| `xl` | 1280px (declared, unused) |
| `2xl` | 1536px (declared, unused) |

In practice the app branches on `lg`: HeroExamples switches from a single mobile image (`lg:hidden`) to a 3-up grid (`hidden lg:grid`). PosterCanvas computes display size from `window.innerWidth` directly (`<640 → min(w-32, 360)`, `<1024 → 480`, `else → 540`) — JS-side, not Tailwind classes.

---

## Layout containers

Single-page app. Two max-width containers:
- `max-w-2xl` (672px) — main content column wrapping h1 + form + presets + generate.
- `max-w-lg` (512px) — prompt input width and preset row container.
- `max-w-xl` (576px) — poster reveal container.

Horizontal page padding: `px-4` on `<main>` (16px). No body-level padding; the body is the cream background.

The footer is a separate `<footer>` with no max-width — content centers on a `text-center` flex column inside the full-width `bg-paper`.

---

## Iconography

[`lucide-react`](https://lucide.dev/) is the only icon source. Four call sites:
- `Sparkles` — Generate button leading icon
- `Download` — Download button leading icon
- `RefreshCw` — Regenerate button leading icon
- `X` — Dialog close

All decorative icons are paired with visible text and carry `aria-hidden="true"` — the visible text is the accessible name (CLAUDE.md a11y convention).

Standard icon size in buttons: `w-4 h-4` (16px), enforced by the Button CVA's `[&_svg]:size-4` selector.

---

## Identified Drifts (None Material)

The only mechanical drifts found in audit run 35/001 were silently-failing CSS, not visual inconsistencies:

1. ✅ **Fixed**: `scrollbar-none` was used on the preset row but Tailwind has no such utility — the scrollbar rendered. Added the cross-browser hide rule to `globals.css`.
2. ✅ **Fixed**: Header brand link and footer tel:/findahelpline links had no focus-visible styles — keyboard users couldn't see focus.
3. ✅ **Fixed**: Preset buttons inside the form defaulted to `type="submit"` (HTML default), which would double-fire the form's onSubmit on click.

Outstanding **non-drift** observations are catalogued in the audit report — they're either intentional (low contrast on `feedback-quiet` and `accent-sage`-on-paper, per CLAUDE.md run 34/001) or design judgment calls that don't have an obvious correct answer.

---

## How To Add a Token

1. **Color**: add the hex to `tailwind.config.ts` `theme.extend.colors`. Reference via `bg-{name}`, `text-{name}`, `border-{name}`. Don't put raw hex in components.
2. **Font size**: add to `theme.extend.fontSize` with line-height + weight. Use the `text-{name}` class — never `text-[14px]`.
3. **Spacing extra**: add to `theme.extend.spacing` (e.g., `breathe`, `section`). Reuse default Tailwind 4px scale for everything else.
4. **Component variant**: extend the CVA in `button.tsx` or `dialog.tsx`. Don't recreate one-off variants in feature components.

If you find yourself reaching for an arbitrary value (`text-[#abc123]`, `p-[13px]`, `text-[15px]`), pause: either there's already a token, or you're introducing drift. The codebase is small enough to keep clean.
