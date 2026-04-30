# Site Foundation

## Overview

The cross-cutting site polish that doesn't belong inside any single feature: favicons, web manifest, robots and sitemap, HTTP security headers, browser support matrix, 404 handling, and build-output expectations. This is the layer between "the product works" and "the product is ready to ship."

OG card metadata, the JS-required fallback, the footer, and responsive layout are all covered in `06_Landing_Page.md` — this file complements that one with the lower-level concerns.

## Dependencies
- `02_Project_Setup.md` — Repo structure, `netlify.toml`, build pipeline
- `06_Landing_Page.md` — OG metadata, footer, JS-required fallback (no duplication here)
- `04_UI_Design_System.md` — Theme color, brand identity tokens

## Favicon and Touch Icons

Single SVG favicon as the primary asset, with PNG fallbacks for legacy browsers and platform-specific touch icons.

```
public/
├── favicon.svg                  # Primary; modern browsers prefer this
├── favicon-32.png               # Fallback for browsers without SVG favicon support
├── apple-touch-icon.png         # 180×180, shows when iOS users add to home screen
└── android-chrome-192.png       # 192×192, used by Android home-screen install
```

Linked in `index.html`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

### Favicon design

A single Cormorant Garamond italic letter — `B` — in `accent-sage` (`#8B9D83`) on a `bg-cream` (`#F7F3EC`) background. The same wordmark register as the header. Avoid using the full "Bless Your Heart" wordmark at favicon size — illegible at 32×32.

## Web Manifest

```
public/manifest.webmanifest
```

```json
{
  "name": "Bless Your Heart",
  "short_name": "Bless",
  "description": "The honest motivational posters you didn't ask for.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F7F3EC",
  "theme_color": "#F7F3EC",
  "icons": [
    {
      "src": "/android-chrome-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/android-chrome-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Linked in `index.html`:

```html
<link rel="manifest" href="/manifest.webmanifest" />
```

### Why a manifest if PWA install isn't a v1 feature?

The manifest costs nothing to ship and adds two real benefits even without explicit "install" prompts:

1. iOS users who tap "Add to Home Screen" get the proper icon and splash colors instead of a generic screenshot.
2. Lighthouse PWA score reflects baseline correctness — useful as a smoke-test metric.

Full PWA install affordance is deferred to P2 (`24_Future_Features.md`).

## Robots and Sitemap

```
public/robots.txt
public/sitemap.xml
```

`robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://blessyourheart.app/sitemap.xml
```

`sitemap.xml`: a single URL entry for the root. Single-page app means there's nothing else to advertise.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://blessyourheart.app/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

V1 is fine being indexed. There's no concern about user content being scraped — there is no user content. The site is a thin shell over a function call, and Google indexing the landing page only helps discovery.

## HTTP Security Headers

Set in `netlify.toml`:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
```

| Header | Why |
|--------|-----|
| `X-Frame-Options: DENY` | Prevents clickjacking via iframe embedding |
| `X-Content-Type-Options: nosniff` | Prevents MIME-type sniffing exploits |
| `Referrer-Policy: strict-origin-when-cross-origin` | Limits referrer leakage when users click out (e.g., to hotline links) |
| `Permissions-Policy` | Explicitly denies APIs the product never uses; defensive |

### Content Security Policy

Skipped at v1. Crafting a working CSP that allows Anthropic's API endpoint, Firebase Storage, PostHog, and the self-hosted fonts without breaking development is fiddly. The other headers cover most threats; CSP is a hardening pass for v1.1.

If/when adding CSP, the policy must allow:

- `script-src 'self'` plus PostHog's host
- `connect-src 'self'` plus PostHog's host plus the function endpoint
- `img-src 'self'` plus the Firebase Storage CDN host
- `font-src 'self'` (self-hosted fonts; no third-party font CDN)
- `frame-ancestors 'none'`

## 404 Handling

Vite builds a single `index.html`. Netlify's default behavior is to return the index for any unmatched path (true SPA behavior), which serves the landing page on `/wrong-url` etc. This is correct for v1 — there are no other routes to differentiate.

Configure in `netlify.toml`:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

This catches all paths and serves the SPA, including refreshes on a future permalink route (deferred in `24_Future_Features.md`).

## Browser Support Matrix

The product targets modern evergreen browsers. v1 supports:

| Browser | Min version | Notes |
|---------|-------------|-------|
| Chrome | 99+ | Released March 2022 — `ctx.letterSpacing` floor |
| Safari | 16.4+ | Released March 2023 — `ctx.letterSpacing` floor |
| Firefox | 112+ | Released April 2023 — `ctx.letterSpacing` floor |
| Edge | 99+ | Chromium engine; Chrome floor applies |
| iOS Safari | 16.4+ | Same as desktop Safari |
| Android Chrome | 99+ | Same as desktop Chrome |

The `ctx.letterSpacing` floor (per `15_Compositing_Engine.md`) is the binding constraint. Older browsers degrade gracefully — the watermark and body text render with default Cormorant tracking, which is slightly cramped but readable. Don't write polyfills for older browsers; the audience is internet-fluent and on current-ish devices.

Don't test against IE 11 or any non-evergreen browsers. They're outside the audience.

## Build Output

Vite production build emits to `dist/`. Expected approximate weights at v1:

| Asset | Approximate size |
|-------|------------------|
| `index.html` | < 5 KB |
| Main JS bundle (gzipped) | ~120 KB |
| Main CSS bundle (gzipped) | ~15 KB |
| Cormorant Garamond fonts (combined) | ~150 KB |
| Hero example PNGs (3 × ~100 KB) | ~300 KB |
| `og-hero.png` | ~80 KB |
| Total above-the-fold | ~670 KB |

Target: < 250 KB gzipped for HTML + CSS + JS bundle (excluding fonts and images, which load in parallel). Verify with `npm run build` and check `dist/` sizes; revisit if a future feature pushes past.

## Source Maps

Vite emits source maps in dev. Production sourcemaps default to off in `vite.config.ts`:

```ts
build: {
  sourcemap: false,
}
```

Don't ship source maps to production. The system prompt is bundled into the function (already non-public; functions aren't source-mapped to clients), and frontend source maps would expose internal naming and structure unnecessarily.

## Environment-Specific Behavior

| Environment | Detection | Behavior differences |
|-------------|-----------|---------------------|
| `development` | `import.meta.env.DEV` | Rate limiting bypassed (`19_Rate_Limiting.md`); console logs verbose |
| `production` | `import.meta.env.PROD` | Full safety + rate-limit pipeline |
| Preview deploy | Same as production | Netlify preview deploys hit the live function |

No staging environment at v1; preview deploys serve as the staging-equivalent.

## Build Steps Pre-Deploy

Per `02_Project_Setup.md`'s pre-deploy checklist, every deploy runs:

1. `npm run lint` (ESLint)
2. `npm run typecheck` (TypeScript)
3. `npm run lint:photos` (CI lint per `13_Photo_Curation_Tool.md`)
4. `npm run build` (Vite production build)

All four must pass for the build to succeed. Wire into Netlify's build command:

```toml
[build]
  command = "npm run lint && npm run typecheck && npm run lint:photos && npm run build"
```

Failure at any step fails the deploy and reverts to the previous live version.

## Theme Color Across Surfaces

Per `06_Landing_Page.md`, `theme-color` is `#F7F3EC` (matches `bg-cream`). Reinforced in:

- `<meta name="theme-color">` in `index.html`
- `theme_color` in `manifest.webmanifest`
- iOS status-bar styling (handled implicitly by `theme-color`)

Single source of truth: the design system file (`04_UI_Design_System.md`). If the cream value ever changes, update both meta tags and the manifest.

## Gaps & Assumptions

- **CSP policy specifics**: deferred to v1.1 hardening pass. Document a working policy as a build artifact when it ships.
- **Strict-Transport-Security (HSTS)**: not configured. Netlify auto-applies HSTS for custom domains using their managed SSL; no explicit header needed at v1.
- **Sub-resource integrity**: not used at v1 because there are no third-party scripts (PostHog is loaded via npm, not script tag). If a third-party script ever ships, add SRI hashes.
- **`og-hero.png` regeneration cadence**: manual. Re-render quarterly when the photo library rotates if the canonical example uses a retired photo.
- **i18n routing**: deferred. If multi-language ships, `/en/`, `/de/` etc. paths join the sitemap.
- **Custom 404 page**: not built at v1. The catch-all redirect to `index.html` shows the landing page on bad URLs, which is the friendlier behavior anyway.
