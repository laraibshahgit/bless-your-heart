# Performance

## Overview

The product's vision-doc target is **under 10 seconds from land to share** and **under 2 seconds initial load on 4G**. Both are achievable with this stack but require deliberate choices around font loading, photo serving, bundle splitting, and the anticipation beat. This file consolidates the performance-relevant decisions across other files into a single budget and target sheet.

The performance philosophy: be fast where users notice, be patient where the design demands. The 800ms loading floor (`16_Poster_Display_And_Regenerate.md`) is *intentionally slow*; the page load before that point is *aggressively fast*.

## Dependencies
- `01_Tech_Stack.md` — Stack choices that constrain performance
- `02_Project_Setup.md` — Build configuration
- `15_Compositing_Engine.md` — Canvas performance
- `21_Site_Foundation.md` — Build output sizes

## Targets

| Metric | Target | Source |
|--------|--------|--------|
| Initial page load (4G) | < 2s | Vision doc |
| First Contentful Paint | < 1.5s | Standard practice |
| Largest Contentful Paint | < 2.5s | Web Vitals "good" |
| Cumulative Layout Shift | < 0.1 | Web Vitals "good" |
| Time to Interactive | < 3s | Standard practice |
| Land-to-share total | < 10s | Vision doc |
| Lighthouse Performance score | ≥ 90 | Health smoke-test |

The CLS target matters more than typical for this product — the hero examples and prompt input must not jump around as fonts load, or the first-impression beat is broken. Reserve their space with explicit dimensions before content loads.

## Font Loading

Cormorant Garamond is the largest single asset on the critical path. Loading it correctly is the most-leveraged performance decision.

### Strategy: self-hosted with subset preload

```html
<!-- In index.html, in <head> -->
<link
  rel="preload"
  href="/assets/cormorant-garamond-500-latin.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
<link
  rel="preload"
  href="/assets/cormorant-garamond-400italic-latin.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

Preload only the two weights used above the fold (line 1's 500-regular, line 2's 400-italic). The other weights (400-regular for body and watermark, 600 for emphasis) load with the bundle's CSS imports — second priority.

### `font-display: swap`? No.

CSS `font-display: swap` shows a fallback face during loading and swaps when the real font is ready. For a typical site this is fine. **For this product, the visual joke breaks** if any text renders in a system serif before swapping — including the canvas compositing, which depends on `document.fonts.ready` (per `15_Compositing_Engine.md`).

Use `font-display: optional` or `font-display: block`:

- `optional` — uses the fallback if the font isn't ready in 100ms, never swaps. Safest for the visual contract.
- `block` — invisible text for up to 3s while the font loads, then renders. Slightly worse perceived performance but guarantees correct typography.

The `@fontsource` package defaults to `font-display: swap`. Override in a CSS file:

```css
@font-face {
  font-family: 'Cormorant Garamond';
  font-display: optional;
  /* ... */
}
```

Or pass the option via `@fontsource/cormorant-garamond` config if available.

V1 choice: `optional` for site copy (the user sees Cormorant or a graceful system serif on first-paint, no jarring swap). Canvas compositing always awaits `document.fonts.ready` and isn't affected by the display mode.

## Photo Loading

The selected photo for a generation is 1080×1080, ~200 KB on average, served from Firebase Storage with a CDN.

### Hero examples

Above-the-fold, pre-rendered as PNGs in `public/examples/`. Loaded eagerly:

```html
<img src="/examples/hero-1.png" loading="eager" fetchpriority="high" />
```

Three at desktop, one at mobile (per `06_Landing_Page.md`). Total weight ~300 KB; included in the 670 KB above-the-fold budget (per `21_Site_Foundation.md`).

### Generation photo

Loaded after the function returns. Preload as soon as the response arrives:

```ts
const img = new Image();
img.src = photoUrl;
await img.decode();
```

The 800ms loading floor absorbs the photo fetch in most cases — typical CDN-cached photo loads in 100–400ms on 4G. The first-time fetch from a fresh device may be slower; the patience phrase in the loading state covers it.

### CDN caching

Per `11_Photo_Library.md`, photos are served with `Cache-Control: public, max-age=31536000, immutable`. Once a user has seen a photo, regenerates that pull the same photo are served from the browser cache (~30ms) without a network round-trip.

## Bundle Splitting

Vite's default code-splitting is sufficient for v1. The main routes:

| Bundle | What's in it | Loaded |
|--------|--------------|--------|
| Main | App shell, prompt input, hero examples, presets | Page load |
| Compositor | Canvas drawing logic | Page load (used immediately on generation) |
| Distress modal | The interstitial component | Lazy — only if distress triggers |
| Curation tool | Local-only admin tool | Never bundled into production |

Lazy-loading the distress modal saves ~5 KB on the main bundle and is the right shape — the modal is only ever shown when triggered.

```ts
const DistressInterstitial = lazy(() => import('./DistressInterstitial'));
```

## JavaScript Bundle Budget

Per `21_Site_Foundation.md`, the gzipped JS bundle target is < 250 KB combined HTML + CSS + JS. Approximate breakdown:

| Source | Approx gzipped size |
|--------|---------------------|
| React + ReactDOM | ~45 KB |
| App code | ~30 KB |
| Tailwind preflight + utility classes used | ~10 KB |
| Shadcn components in use | ~8 KB |
| `@anthropic-ai/sdk` types only (used server-side) | 0 KB on client |
| `zod` (frontend usage) | ~12 KB |
| `react-hook-form` | ~8 KB |
| `posthog-js` | ~25 KB |
| `file-saver` | ~3 KB |
| `lucide-react` icons in use | ~3 KB |

Total: ~145 KB. Comfortable headroom against the budget. Verify with `vite-bundle-visualizer` after the first production build.

### Bundle bloat watchlist

| Risk | Mitigation |
|------|-----------|
| `lucide-react` imported as `import * as Icons` | Always import named: `import { Sparkles } from 'lucide-react'` |
| Adding a state-management library | Don't — `useState` is enough |
| Adding `framer-motion` | Don't — CSS transitions cover the v1 animation needs |
| Adding `axios` | Don't — native `fetch` is sufficient |
| `@anthropic-ai/sdk` reaching the client bundle | Server-only; verify via bundle visualizer that it doesn't appear in `dist/` |

## Server-Side Performance

The Netlify Function is the user-perceived latency anchor. Typical timings:

| Step | Median latency | Notes |
|------|---------------|-------|
| Cold start | ~400ms | Amortized across warm invocations |
| Rate-limit check (Firestore transaction) | ~50ms | Single read + write, US-East ↔ US-Central |
| Slur/real-person filter | < 1ms | List-based, in-memory |
| Distress check (Haiku) | ~400ms | Network + model latency |
| Sonnet generation | ~1200ms | Median; can extend to ~3000ms |
| Tone check (Haiku) | ~400ms | Same as distress |
| Photo selection | < 1ms | In-memory |

End-to-end: ~2050ms median, ~3500ms p95. The 800ms client loading floor floors *minimum perceived latency*; actual generation latency dominates user-perceived time.

### Optimization deferred

| Opportunity | Why defer |
|------------|-----------|
| Streaming Sonnet response | Visual reveal design wants discrete paint, not type-on |
| Parallel distress + Sonnet calls | Saves ~400ms but commits Sonnet cost on distress-flagged inputs; not worth the budget hit |
| Caching common preset generations | Reduces specificity that line 2 depends on; corrupts the product |
| Edge functions (Netlify) instead of regional | Saves ~50ms; not worth the configuration churn at v1 |

## Lighthouse Targets

Run before every release:

| Audit | Target |
|-------|--------|
| Performance | ≥ 90 |
| Accessibility | ≥ 95 |
| Best Practices | 100 |
| SEO | ≥ 90 |
| PWA | ≥ 70 (manifest is set up; no service worker means full PWA isn't claimed) |

Performance below 90 → investigate before deploying. Accessibility below 95 → block deploy.

## Mobile-Specific

Mobile is the primary device class for this product (group-chat sharing happens on phones). Specific mobile considerations:

- Test on a throttled 4G connection in DevTools regularly during development; don't trust desktop-Wifi numbers.
- Test on an actual iPhone before launch — DevTools simulation isn't a substitute, particularly for the Safari download path.
- The above-the-fold experience must render fully on iPhone SE (375×667). Smaller viewports exist but aren't optimized for at v1.

## Caching

| Asset | Cache strategy |
|-------|---------------|
| `index.html` | `no-cache` (always check freshness; bundle hashes change between deploys) |
| `assets/*.js`, `*.css` (hashed filenames) | `public, max-age=31536000, immutable` (Vite default for hashed assets) |
| Fonts | Same — hashed filenames, immutable |
| Hero examples | `public, max-age=86400` (1 day; rotate quietly with library updates) |
| `og-hero.png` | Same |
| Photos in Firebase Storage | `public, max-age=31536000, immutable` (per `11_Photo_Library.md`) |

`no-cache` on `index.html` ensures users always get the latest entry point, while everything else benefits from aggressive caching.

## Service Worker

Not used at v1. The product is online-only by design (it needs the function call). A service worker for offline-friendly hero images is over-engineering for v1; revisit if PWA install (P2 in `24_Future_Features.md`) ships.

## Gaps & Assumptions

- **Per-region Firestore latency**: Netlify Functions in US-East with Firestore in `us-central1` adds ~30–50ms per call. Acceptable. If user latency in non-US regions becomes a complaint, consider Firestore multi-region.
- **Hero example pre-rendering pipeline**: manual at v1. Render once with the curation tool, save to `public/examples/`. Re-render if the canonical examples change.
- **WebP for hero examples**: not used at v1. PNG is universally supported; the 300 KB total is within budget. Switch to WebP if budget pressure emerges.
- **Photo prefetching beyond the current generation**: not pursued at v1. Caching the first-fetched photo per session is sufficient; pre-fetching photos the user might see on regenerate adds bandwidth without proportional benefit.
- **Compression on Netlify**: gzip and Brotli are auto-applied for static assets. No configuration needed.
