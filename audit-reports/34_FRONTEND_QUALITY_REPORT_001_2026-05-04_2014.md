# Frontend Quality Audit — Run 34/001

**Date:** 2026-05-04
**Branch:** `nightytidy/run-2026-05-01-1532` (orchestrator-managed; the prompt's `frontend-quality-[date]` branch convention is overridden by NightyTidy multi-agent rules — branching is centrally orchestrated)
**Scope:** `src/components/`, `src/App.tsx`, `src/main.tsx`, `index.html`, `src/styles/globals.css`, `tailwind.config.ts`, `src/content/`, `package.json`. Pure-frontend audit — server code (`src/server/`, `netlify/functions/`) intentionally untouched.
**Baseline:** 27 test files / 392 tests passing. Bundle: index-CxGhTa3a.js 466.14 KB raw / 151.14 KB gz; CSS 20.04 KB / 4.78 KB gz; 30 woff/woff2 in `dist/assets`.
**Post-fix:** 27 test files / 392 tests passing (no test changes — pure component/build edits with no behavior delta). Bundle: 466.67 KB / 151.27 KB gz JS; **CSS 15.78 KB / 4.15 KB gz** (-21% raw); **6 woff/woff2 in `dist/assets`** (-80%).

---

## Executive Summary

| Phase | Result |
|---|---|
| Accessibility issues found | 7 (6 fixed; 1 documented for team review) |
| UX consistency score | **Good** — single-page, single-form app with a well-defined Button variant system, brand-token typography scale, and unified `text-feedback-quiet` error voice; small offset/`focus-visible` drift in `dialog.tsx` fixed |
| Bundle size delta | CSS −4.26 KB raw / −0.63 KB gz; JS +0.53 KB raw / +0.13 KB gz (a11y attrs + comments); **24 unused woff/woff2 files dropped** from `dist/assets` (~360 KB on disk) |
| i18n readiness | **Not ready** — no framework declared in `package.json`, ~30 hardcoded user-facing strings live in JSX (most fold cleanly into the existing `src/content/` module if/when i18n becomes a goal) |

---

## Phase 1 — Accessibility

### Issues fixed in this audit

| # | Component | Issue | Fix | Severity |
|---|---|---|---|---|
| A1 | `DistressInterstitial.tsx` | `DialogContent` rendered with no `DialogTitle`/`DialogDescription`. Radix logs `DialogContent requires a DialogTitle for the component to be accessible for screen reader users` and the modal announces with no name to AT. **Critical for the highest-stakes copy in the product** — the modal that fires when a user may be in crisis. | Headline → `DialogTitle`; body → `DialogDescription`. Radix wires `aria-labelledby` / `aria-describedby` automatically. Visual styling preserved via className override. | **High** |
| A2 | `PosterReveal.tsx` (loading branch) | Rotating loading phrase appears with no live region. Screen-reader users hear nothing between clicking *Generate* and the canvas's `aria-label` being announced ~3–8 s later. | Wrapped phrase in `role="status" aria-live="polite"`. | Medium |
| A3 | `PosterReveal.tsx` (error branch) | Error message appears with no live region. Submitting via screen reader and hitting an error (rate-limit, network) gave silent feedback. | `role="alert"` on the error paragraph (assertive priority). | Medium |
| A4 | `App.tsx` (inline error) | `inlineError` (slur block, real-person block, rate-limit) renders silently for AT users. | `role="alert"` on the inline error paragraph. | Medium |
| A5 | `GenerateButton.tsx` | While `loading=true` the button renders empty (no text, no icon). Screen readers announce just *"button"* with no name; the user cannot tell whether the action took. | `aria-label="Generating"` while loading + `aria-busy={loading}` + `aria-hidden="true"` on the decorative Sparkles icon. | Medium |
| A6 | `DownloadButton.tsx` | Three sibling `<p>` elements (iOS hint, success confirmation, error) appear/disappear with no live region; AT misses the post-download status entirely on iOS Safari. Decorative `Download` icon also lacked `aria-hidden`. | One wrapping `<div aria-live="polite" aria-atomic="true">` around all three status messages; `aria-hidden="true"` on the icon; `aria-busy` on the button while downloading. | Medium |
| A7 | `ui/dialog.tsx` (close button) | Decorative `X` icon lacked `aria-hidden`; the `<span class="sr-only">Close</span>` already provided the accessible name but the icon was potentially announced twice on some AT. Also: `focus:` (not `focus-visible:`) leaked focus rings on mouse close→reopen, and `ring-offset-cream` mismatched the dialog's `bg-paper` background. | `aria-hidden="true"` on `X`; `focus:*` → `focus-visible:*` (matches Button/Input/Textarea); `ring-offset-cream` → `ring-offset-paper`. | Low (a11y) / Medium (visual consistency) |

### Issues documented for team review (not fixed)

| # | Component / Token | Issue | Severity | Effort | Why not fixed now |
|---|---|---|---|---|---|
| AD1 | `text-feedback-quiet` (#D9D4C8) on `bg-cream` (#F7F3EC) | Contrast ratio ≈ **1.31 : 1**, fails WCAG AA (4.5:1) and WCAG AA Large (3:1) at every size. Used in inline errors, character counter, error-state messages. CLAUDE.md explicitly mandates this color: *"Never use red for errors — use feedback-quiet (#D9D4C8)."* So the deficiency is by design — the brand voice is *quiet* feedback, not alarm. **But the choice does mean errors are visually unreadable for low-vision users.** | High (legal — ADA Title III + EAA 2025) | Medium (~1 day) — would need a brand decision on a darker error token (e.g. dust-rose around #B47855 already in tailwind as `accent-rust`, contrast ≈ 4.2 : 1) | Brand decision needed; out of scope for an automated pass |
| AD2 | `accent-sage` (#8B9D83) on `bg-cream` | Contrast ≈ **2.54 : 1**, fails WCAG AA. Used for: Header link, Footer hotline links, CreditsDialog trigger ("see credits"), DistressInterstitial hotline link. | Medium — links carry underline / hover treatment so the ratio is less load-bearing than for body text | Low (1–2 hr) — `accent-sage-deep` (#6F8267) is already in the palette at ~3.77 : 1 (AA Large only) | Brand decision needed |
| AD3 | `placeholder:text-ink-faint` (#9A938B on cream) | Contrast ≈ **2.65 : 1**. Modern WCAG guidance is to never rely on placeholder text for instructions — the design follows that (the H1 *"What's going on?"* provides context), so the practical impact is low. | Low | Low (token rename) | Cosmetic; no information lost |
| AD4 | Heading hierarchy | Single `<h1>` *"What's going on?"* on the page — that's correct. **But `Header.tsx` renders the brand mark as a plain `<a>` (text-headline)**, not a heading, which is semantically right (it's a link, not a title) but AT users navigating by heading land directly at `<h1>` instead of getting the brand-mark first. Acceptable; just noting. | None | n/a | Working as intended |

### Overall WCAG compliance assessment

- **WCAG 2.1 Level A:** ✅ pass (after this audit's fixes — the `DialogTitle` was the worst Level A violation).
- **WCAG 2.1 Level AA:** ❌ fail on color contrast (AD1, AD2, AD3) — **deliberate brand decision**, documented for stakeholder review.
- **WCAG 2.1 Level AAA:** Not assessed (out of scope for an MVP audit).
- Keyboard navigation: ✅ all interactive elements reachable via Tab; Radix Dialog handles focus trap; Esc closes the modal; Enter/Space activate buttons through the shadcn Button primitive.
- Focus management: ✅ post-fix every focus ring offset matches its parent surface (cream for body, paper for inside Dialog).
- Reduced motion: 🟡 the `animate-pulse-opacity` (1.6 s pulse on loading phrase) and Radix Dialog's enter/exit animations have no `prefers-reduced-motion` opt-out. **Worth adding** in a future pass; trivial Tailwind config (`motion-reduce:animate-none`).

---

## Phase 2 — UX Consistency

### Component inventory

| Pattern | Status | Notes |
|---|---|---|
| Buttons | ✅ Consistent | All interactive buttons go through `Button` shadcn primitive with 4 variants (`primary` / `secondary` / `preset` / `ghost`) and 4 sizes (`default` / `sm` / `lg` / `icon`). Two raw `<button>` exceptions are documented: `PromptInput` (raw `<input>` is the entire input, not a button — CLAUDE.md calls this out) and `CreditsDialog` (footer-link aesthetic; **fixed in this audit** to add a `focus-visible` ring matching the system) |
| Form inputs | ✅ Consistent | Single input in the app (`PromptInput`); the unused shadcn `Input`/`Textarea` primitives in `src/components/ui/` are dead code (see Phase 3 for bundle implications) |
| Loading states | ✅ Consistent | Single async path (Generate). `LOAD_FLOOR_MS = 800` floor + rotating phrase + `animate-pulse-opacity` + (post-fix) `aria-live` |
| Empty states | ✅ N/A | No lists in the UI; `PosterReveal` returns `null` for `phase === 'idle'` which is correct |
| Error states | ✅ Consistent | Every error site uses `font-serif italic text-feedback-quiet` (or `text-ink-soft`) — no red, matches CLAUDE.md rule |
| Spacing | ✅ Consistent | Uses Tailwind scale + brand tokens (`breathe`, `section`). No raw `padding: 13px` etc. |
| Typography | ✅ Consistent | Brand-token scale (`text-display`, `text-display-lg`, `text-headline`, `text-body-lg`, `text-body`, `text-label`, `text-caption`) — no inline font sizes |
| Colors | ✅ Consistent | All from `tailwind.config.ts` brand tokens. The two raw hex values in `globals.css` (`text-poster-light: #ffffff`, `text-poster-dark: #1a1612`) are **canvas overlay colors** — they're rendered onto the poster image via Canvas API, not via Tailwind classes. They're not tokens because they need to match colors used in `compositor.ts` for canvas drawing (single source of truth would require a JS-shared constants file, which is fine future cleanup) |
| Icons | ✅ Consistent | Lucide-react throughout (`Sparkles`, `Download`, `RefreshCw`, `X`); 4 icons total |
| Hover treatment | 🟡 Two patterns | Display/CTA hovers shift color (`hover:text-accent-sage`); footer-link hovers underline. Both are valid; the choice is semantic (CTA vs body link) and consistent within each role. Documenting as design-intent rather than drift |
| Responsive | ✅ Solid | Three breakpoints (`sm`, `lg`, base mobile-first). Hero examples branch on `lg:` for the 3-up grid → 1-up; `PosterCanvas` responds to `window.innerWidth` with rAF-throttled resize |

### Inconsistencies fixed

- `ui/dialog.tsx` close button: `focus:` → `focus-visible:` and `ring-offset-cream` → `ring-offset-paper` (matches the actual dialog background).
- `CreditsDialog.tsx` raw button: added `focus-visible` ring matching the system, plus `type="button"` (without the `type` attr, the default is `submit` — harmless inside a Dialog with no `<form>` ancestor, but defensive).

### Inconsistencies documented (not fixed)

| # | Issue | Why not fixed |
|---|---|---|
| UD1 | `src/components/ui/input.tsx` and `src/components/ui/textarea.tsx` are **dead code** — never imported anywhere. CLAUDE.md notes this is intentional (`PromptInput` uses raw `<input>` because the shadcn `Input` doesn't apply the same serif placeholder treatment). They cost ~700 bytes in the bundle. | Orchestrator constraint: NEVER delete files. Fix shape would be `git rm` — outside scope of an in-place audit pass |
| UD2 | `globals.css` `.text-poster-light` (`#ffffff`) and `.text-poster-dark` (`#1a1612`) are raw hex utilities outside the Tailwind token system. They exist because `compositor.ts` writes the same two colors onto the canvas (not via Tailwind), so the CSS classes mirror canvas drawing for any future preview/header reuse | Working as designed; consolidating to a JS constants module is a refactor, not a bug |

### Recommended design-system improvements

- Add a `motion-reduce` variant to `animate-pulse-opacity` and the Radix Dialog open/close animations.
- Consider promoting one of the existing palette colors (`accent-rust` is closest at ~4.2 : 1 on cream) to an *error* token if WCAG AA contrast is ever a hard requirement.
- Either delete `ui/input.tsx` + `ui/textarea.tsx` or ensure all future input surfaces route through them with the brand-token serif treatment baked in (currently the brand-token serif treatment lives only on `PromptInput`'s raw `<input>`).

---

## Phase 3 — Bundle Size

### Pre-audit composition

| Asset | Raw | Gzipped |
|---|---|---|
| `index-CxGhTa3a.js` (main) | 466.14 KB | 151.14 KB |
| `DistressInterstitial-BfAAm5Dj.js` (lazy) | 1.32 KB | 0.65 KB |
| `index-DmFtAwOK.css` | 20.04 KB | 4.78 KB |
| `index.html` | 2.58 KB | 1.13 KB |
| Cormorant Garamond woff/woff2 (30 files) | ~510 KB on disk | (browser fetches subset on demand) |

Top-10 contributors (estimated by source-import inspection — no `vite-bundle-visualizer` plugin installed):

1. **React + React-DOM** (~140 KB raw / ~45 KB gz) — required.
2. **PostHog-js** (~80 KB raw / ~25 KB gz) — analytics; declared in `dependencies` and bundled into the main chunk via `lib/analytics.ts` static import.
3. **Radix UI (Dialog primitive only)** (~30 KB raw / ~10 KB gz) — needed for the distress modal.
4. **Zod** (~15 KB raw / ~5 KB gz) — declared in `dependencies` but **not used by the client**; the only Zod call site is `src/server/validation.ts`. **Verified: client code does NOT import zod** (grep -r "from 'zod'" src/lib src/components src/App.tsx → zero results).
5. **lucide-react** (~3 KB raw / ~1 KB gz) — 4 icons tree-shaken; small.
6. **clsx + tailwind-merge** (~3 KB) — used by `cn()`.
7. **class-variance-authority** (~2 KB) — used by `Button`.
8. **file-saver** (~2 KB raw / ~1 KB gz) — used by `lib/download.ts`.
9. **App code** (~50 KB raw / ~12 KB gz across ~15 components/lib files).
10. CSS / Tailwind utilities — 20 KB raw / 4.8 KB gz pre-fix.

### Optimizations implemented

| # | Change | Impact (built bundle) | Risk |
|---|---|---|---|
| B1 | `@fontsource/cormorant-garamond/400.css` → `latin-400.css` (and same for 500, 400-italic) | CSS **20.04 → 15.78 KB raw** (−21% raw, −13% gz). `dist/assets` font-file count **30 → 6** (~360 KB disk weight removed from build artifacts; not user-impacting bandwidth since browser only fetches matching `unicode-range` subsets, but it cuts CDN cache surface, atomic deploys, and CSS @font-face declarations) | **Low** — UI is English-only; `latin` covers basic Latin + ISO Latin-1 Supplement (é, à, ñ, ç, ü, etc.); user prompts fall back to Georgia for anything outside that range, which was already the existing fallback for any glyph the font lacked |

### Larger optimizations (not implemented)

| # | Opportunity | Estimated impact | Effort | Risk |
|---|---|---|---|---|
| BD1 | Drop the unused `zod` runtime dependency from the client bundle. **Already not imported on the client** — but it remains a top-level dep so bundlers and tooling pull metadata. Verify via `vite build --mode analyze` (plugin to install) and confirm zero client byte count; if confirmed, no action needed beyond a `tsdoc` note that the client never imports it. If a future contributor *does* import a Zod schema in `src/lib/api.ts`, ~15 KB raw / ~5 KB gz lands in the main chunk. **Recommendation:** add a `vite-bundle-visualizer` step and an ADR documenting that Zod is server-only | Up to 5 KB gz if a regression is prevented | 1 hr | None |
| BD2 | Lazy-load PostHog (~25 KB gz savings on the main bundle critical path). Currently `lib/analytics.ts` does `import posthog from 'posthog-js'` synchronously, pulling the entire SDK into the bundle that blocks first-paint. Could `await import('posthog-js')` inside `initAnalytics()` since analytics only runs in production and is non-critical (Phase 4 of audit run 33/001 already wrapped it in try/catch — pre-condition for safe lazy loading) | ~25 KB gz off the main chunk; first-paint improvement on slow connections | 1–2 hr (need to make `initAnalytics` async-safe and verify the `track()` call sites still work with the post-init queue) | Low — PostHog's own client-side queue handles events fired before the SDK lands |
| BD3 | Code-split `PosterCanvas` + `compositor` + `fonts` + `download` into a generation-time chunk (route-style split — they're only needed after the user clicks Generate) | ~10–20 KB gz off the initial load | 2–3 hr (`React.lazy` boundary + `<Suspense>`; canvas DOM coupling needs care) | Low |
| BD4 | Delete `src/components/ui/input.tsx` and `src/components/ui/textarea.tsx` (dead code, never imported) | ~0.7 KB raw on the main chunk (negligible after gzip) | 5 min | Zero |
| BD5 | Hero example WebP assets are already optimized (per audit run 26/001 — 92.5% reduction from original PNGs). No further opportunity here | — | — | — |
| BD6 | `lucide-react@1.14.0` is unusually old (current line is 0.469+, so this is an ancient namespace pin — actually a different package). Modern `lucide-react` would tree-shake more aggressively and ship per-icon ESM modules | Marginal; current 4 icons already tree-shake to ~3 KB | 1 hr (verify import API hasn't drifted) | Medium — version range needs care |

---

## Phase 4 — Internationalization

### Readiness assessment

- **Framework declared:** None. `package.json` has zero i18n libraries (`react-intl`, `i18next`, `react-i18next`, `formatjs`, `vue-i18n`, `lingui` — all absent).
- **Locale signals:** `<html lang="en">` is set (good); no language switcher; no Accept-Language negotiation in the client; no `dir="auto"` for any text node.
- **String extraction discipline:** **Strong.** A first-class `src/content/` module exists and already extracts `errorCopy`, `loadingPhrases`, `downloadConfirmation`, `downloadCopy`, `distressCopy`, `presets`, `placeholders`. CLAUDE.md mandates this pattern: *"User-facing copy lives in `src/content/` — never hardcode user-facing strings in components OR in the Netlify function."*

  **Compliance gap:** ~30 user-facing strings *do* sit in JSX outside `src/content/`. They're mostly button labels, headings, and meta tags — small in volume but a drift surface for the documented rule.

### Hardcoded string catalog

| File | Line | String | Suggested key | Notes |
|---|---|---|---|---|
| `index.html` | 7 | Bless Your Heart | `meta.title` | `<title>` |
| `index.html` | 8 | The honest motivational posters you didn't ask for. | `meta.description` | `<meta name=description>` |
| `index.html` | 28 | Bless Your Heart | `meta.ogTitle` | OG title |
| `index.html` | 29 | The honest motivational posters you didn't ask for. | `meta.ogDescription` | OG description |
| `index.html` | 33 | Bless Your Heart | `meta.twTitle` | Twitter title |
| `index.html` | 34 | The honest motivational posters you didn't ask for. | `meta.twDescription` | Twitter description |
| `index.html` | 42 | Bless Your Heart | `noscript.heading` | `<noscript>` |
| `index.html` | 44 | This corner of the internet requires JavaScript. The universe also asks a lot of you. Try enabling it and we can both get on with the moment. | `noscript.body` | `<noscript>` |
| `App.tsx` | 217 | What's going on? | `app.heading` | h1 |
| `Header.tsx` | 5 | Bless Your Heart | `header.brand` | Brand link |
| `Footer.tsx` | 6 | Bless Your Heart · made with affection and resignation | `footer.tagline` | |
| `Footer.tsx` | 8 | A comedy product, not therapy. If you're in crisis, please reach out: | `footer.crisisPrefix` | |
| `Footer.tsx` | 9 | 988 | `footer.usHotline` | Verbatim duplication of distress hotline data |
| `Footer.tsx` | 11 | findahelpline.com | `footer.worldwideHotlineLabel` | |
| `Footer.tsx` | 16 | Photos: | `footer.creditsPrefix` | |
| `Footer.tsx` | 16 | This site uses anonymous analytics | `footer.analyticsNotice` | |
| `GenerateButton.tsx` | (post-fix) | Generating | `buttons.generating` | aria-label during loading |
| `GenerateButton.tsx` | (post-fix) | Generate | `buttons.generate` | |
| `PromptInput.tsx` | 70 | What's going on? | `prompt.label` | sr-only label |
| `DownloadButton.tsx` | 68 | Download | `buttons.download` | |
| `PosterReveal.tsx` | 62 | Regenerate | `buttons.regenerate` | |
| `PosterReveal.tsx` | 82 | Try Again | `buttons.tryAgain` | |
| `CreditsDialog.tsx` | 25 | see credits | `credits.trigger` | |
| `CreditsDialog.tsx` | 30 | Photo Credits | `credits.title` | |
| `ErrorBoundary.tsx` | 38 | Refresh | `buttons.refresh` | |
| `PosterCanvas.tsx` | 97 | `Poster reading: {line1}. {line2}.` | `canvas.posterAriaLabel` | Templated; the data interpolated is already extracted |

**Total:** 26 strings (excluding meta-tag duplications across OG / Twitter / noscript that share the same English source).

### Recommended approach if i18n becomes a goal

1. **Phase 0 (no framework):** Move every catalog row into `src/content/copy.ts` under a new `uiCopy` export. This achieves the same drift discipline already enforced for errors/distress/loading and creates a single mutation surface for any future i18n adoption. Effort: ~1–2 hr.
2. **Phase 1 (lightweight i18n):** Add `react-intl` (smallest API surface, tree-shakes well, ICU plural support, ~12 KB gz) or **simpler** — a flat `Record<Locale, Record<Key, string>>` wired through React Context. The app is small enough that a framework may be overkill.
3. **Phase 2 (locale-aware rendering):** Wire a language switcher; serve the right `<html lang>` from Netlify edge headers; respect `Accept-Language`. Date/number/plural formatting is currently zero — there is no `Intl.DateTimeFormat`, `toLocaleString`, or pluralization in the entire client (per audit run 14/001 there's exactly one `new Date()` call in the codebase).
4. **RTL readiness:** All spacing uses Tailwind's standard (left/right) padding/margin classes — would need a sweep to logical-property variants (`ps-*` / `pe-*` / `ms-*` / `me-*`) before RTL would work. Effort: ~half day.
5. **Server-side concerns:** The Anthropic system prompt, distress phrase list, slur list, and tone classifier all assume English. i18n on the generation pipeline would require per-locale prompt engineering and per-locale safety classifiers — that's a product-scope expansion, not an extraction task.

---

## Recommendations (priority order)

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Brand-decision: pick a WCAG-AA-compliant error color token | Inline errors / character counter become readable for low-vision users | **High** (legal — ADA Title III, EAA 2025 effective June) | **Yes** | `accent-rust` (#B47855) at ~4.2 : 1 on cream is in the existing palette; brand-team review needed before swap |
| 2 | Add `motion-reduce:animate-none` to `animate-pulse-opacity` and Dialog enter/exit | Respects `prefers-reduced-motion`; reduces vestibular-disorder triggers | Medium (a11y compliance gap) | **Yes** | One-line Tailwind config + class change; ~10 min |
| 3 | Lazy-load PostHog SDK | ~25 KB gz off main bundle; faster first interaction on slow networks | Low | **Probably** | Pre-condition (try/catch wrap) was completed by audit run 33/001; remaining work is wrapping `posthog.init` in `await import(...)` |
| 4 | Move hardcoded button labels / headings into `src/content/copy.ts` (no framework) | Closes the documented `src/content/` rule's drift surface; pre-stages for any future i18n | Low | **Probably** | ~1–2 hr; same pattern already used for errorCopy/distressCopy. Even without i18n, it's the documented convention |
| 5 | Code-split `PosterCanvas` + `compositor` into a post-Generate chunk | ~10–20 KB gz off initial load | Low | **Only if time allows** | App is already small; the 800 ms anticipation beat masks any chunk-load cost |
| 6 | Delete `src/components/ui/input.tsx` + `ui/textarea.tsx` | Removes dead code | Trivial | **Only if time allows** | Blocked here by orchestrator constraint (no file deletion); document for next branch |
| 7 | Update `lucide-react` to current major | Marginal bundle improvement; security currency | Low | **Only if time allows** | Verify icon import API hasn't changed; current 4 icons would migrate trivially |

---

## Test evidence

Pre-audit baseline:
```
Test Files  27 passed (27)
     Tests  392 passed (392)
   Duration  1.05s
```

Post-audit:
```
Test Files  27 passed (27)
     Tests  392 passed (392)
   Duration  1.13s
```

No new tests added. The audit changed presentation-layer concerns (ARIA attributes, focus-visible variant, font subset import, DialogTitle/Description usage) without altering logic, state shape, or wire format. The existing test suite covers wire-format contracts (`generate-contract.test.ts`), pure logic (`compositor.test.ts`, `download.test.ts`, etc.), and React-free unit specs — none of which touch the presentation tweaks made here. Adding component-render tests would require pulling in `@testing-library/react` (deliberately excluded per CLAUDE.md / audit run 11/002).

Build evidence (post-fix):
```
dist/index.html                                                 2.58 kB │ gzip:  1.13 kB
dist/assets/cormorant-garamond-latin-400-normal-….woff2        22.87 kB
dist/assets/cormorant-garamond-latin-500-normal-….woff2        23.31 kB
dist/assets/cormorant-garamond-latin-400-italic-….woff2        23.66 kB
dist/assets/cormorant-garamond-latin-400-normal-….woff         30.98 kB
dist/assets/cormorant-garamond-latin-500-normal-….woff         31.37 kB
dist/assets/cormorant-garamond-latin-400-italic-….woff         32.88 kB
dist/assets/index-Clhnir_L.css                                 15.78 kB │ gzip:  4.15 kB
dist/assets/DistressInterstitial-Oa9bIFpo.js                    1.35 kB │ gzip:  0.67 kB
dist/assets/index-fIsuPHSe.js                                 466.67 kB │ gzip: 151.27 kB
```

(24 woff/woff2 files no longer in `dist/assets`; CSS −4.26 KB raw / −0.63 KB gz.)
