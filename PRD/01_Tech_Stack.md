# Tech Stack

## Overview

Complete dependency list, environment variables, and model choices. Every entry here exists for a reason called out in the source PRD's tech-stack rationale; this file consolidates the operational details a developer needs to provision and configure the project.

## Dependencies
- `00_README.md` — Project overview and source-of-truth resolutions
- `02_Project_Setup.md` — How these dependencies are wired into the repo

## Frontend Dependencies

| Package | Version | Role |
|---------|---------|------|
| `react` · `react-dom` | 18.3+ | UI framework |
| `typescript` | 5.4+ | Type safety throughout |
| `vite` | 5+ | Build tool and dev server |
| `tailwindcss` | 3.4+ | Styling (utility-first) |
| `@fontsource/cormorant-garamond` | latest | Self-hosted typography (critical for Canvas) |
| `react-hook-form` | latest | Prompt input form state |
| `zod` | latest | Runtime validation (input + Claude output) |
| `@hookform/resolvers` | latest | Zod ↔ react-hook-form bridge |
| `lucide-react` | latest | Icons (Shadcn dependency) |
| `clsx` · `tailwind-merge` | latest | Tailwind class composition |
| `class-variance-authority` | latest | Shadcn variant helper |
| `posthog-js` | latest | Analytics SDK |
| `file-saver` | latest | Cross-browser blob download (handles iOS Safari) |
| `@types/file-saver` | latest | Types for file-saver |

**Shadcn/UI components** are not installed as a package; they are copied into `src/components/ui/`. For v1, install only: `button`, `input`, `dialog`, `textarea`. See `02_Project_Setup.md`.

## Backend Dependencies (Netlify Functions)

| Package | Version | Role |
|---------|---------|------|
| `@anthropic-ai/sdk` | latest | Official Claude SDK |
| `firebase-admin` | latest | Firestore writes (rate-limit counters) from the function |
| `zod` | latest | Validate Claude output server-side |
| `@netlify/functions` | latest | Type definitions for handler signature |

## Why Vite, not Next.js

The product is one page. No routing, no SSR-critical content, no per-user content to render server-side. Vite gives a faster dev loop, smaller bundle, and zero App Router cognitive overhead. The only page that *might* benefit from server rendering is a permalink page for shared posters — that's deferred to post-MVP (`24_Future_Features.md` P2).

## Why Netlify Functions, not Firebase Functions

The PRD's JLS default lists both Firebase and Netlify, but using both serverless platforms doubles deployment complexity. Netlify Functions deploy with the same `git push` as the static site, share the same env-var UI, and surface logs in the same dashboard. Firebase still owns Firestore and Storage — those are the right tools for the data layer.

## Why Native Canvas, not html2canvas / domtoimage

Canvas gives pixel-perfect control over text placement, which the text-fitting pipeline (`14_Text_Fitting_Pipeline.md`) demands. `html2canvas` exists to "screenshot" complex DOM, which is the wrong tool here. Native Canvas also handles high-DPI rendering cleanly via `devicePixelRatio` — important for the 1080×1080 download target. See `15_Compositing_Engine.md`.

## Why Cormorant Garamond, Self-Hosted

Cormorant Garamond is a high-contrast, slightly old-fashioned serif that hits the wellness-poster register exactly. **Self-hosting via `@fontsource` is non-negotiable**: the Canvas compositor cannot draw text in a font that hasn't loaded yet. Google Fonts CDN introduces unpredictable latency that lets `fillText` fall back silently to the system serif — and the visual joke dies. The compositor awaits `document.fonts.ready` before drawing.

## AI Model Choices

The PRD splits AI calls across two models per generation:

| Model | Role | Per-call rough cost | Why |
|-------|------|--------------------|-----|
| Claude Sonnet 4.6 | Two-line affirmation generation | ~$0.003 (avg ~$0.005 with retries) | Voice quality on line 2 carries the product. Sonnet is strong enough; Opus is overkill and breaks the budget. |
| Claude Haiku 4.5 | Input distress check | ~$0.0003 | Classification task; Haiku is plenty smart and ~5× cheaper. |
| Claude Haiku 4.5 | Output tone check | ~$0.0003 | Same reasoning. Catches "punching at the user" outputs the input check can't predict. |

**Average cost per generation**: ~$0.006. **$25/mo budget** ≈ ~4,000 generations.

**Model version note (per `00_README.md`)**: PRD specifies Sonnet 4.6 and Haiku 4.5. The Claude family has moved past those versions. Verify current availability before build and substitute equivalents in env vars (no architectural changes needed). Keep the same Sonnet/Haiku split — the cost-vs-quality tradeoff that motivated the split still applies to whatever the current generation is.

**Cost-saving levers (deferred — only pull if budget pressure hits)**:
1. Drop the output tone-check Haiku call if Sonnet's voice stays clean across a sample of N generations (saves ~10% per generation).
2. Cache pre-generated outputs for the top preset buttons during traffic spikes.
3. Switch generation to Haiku as a degraded-mode fallback during budget overruns.

Do not implement these for v1.

## Environment Variables

| Var | Where it lives | Purpose |
|-----|----------------|---------|
| `ANTHROPIC_API_KEY` | Netlify env (function-only) | Authorize Claude calls |
| `ANTHROPIC_MODEL_GEN` | Netlify env | Sonnet model string (configurable so versions can be bumped without a code change) |
| `ANTHROPIC_MODEL_SAFETY` | Netlify env | Haiku model string |
| `FIREBASE_PROJECT_ID` | Netlify env | For Firebase Admin init |
| `FIREBASE_CLIENT_EMAIL` | Netlify env | Service-account email |
| `FIREBASE_PRIVATE_KEY` | Netlify env (newlines escaped) | Service-account private key |
| `FIREBASE_STORAGE_BUCKET` | Netlify env | Photo CDN bucket name |
| `RATE_LIMIT_PER_HOUR` | Netlify env | Default 25; tune without redeploy |
| `VITE_FIREBASE_STORAGE_BASE_URL` | Vite env (`VITE_` prefix) | Frontend reads photo URLs from here |
| `VITE_POSTHOG_KEY` | Vite env | PostHog project API key |
| `VITE_POSTHOG_HOST` | Vite env | PostHog ingestion host |

**Critical**: `ANTHROPIC_API_KEY` must never be exposed to the browser. It is read only inside the Netlify Function. Frontend env vars use the `VITE_` prefix; everything else stays server-only.

## Firebase Project Setup

| Service | Plan | Use |
|---------|------|-----|
| Firestore | Spark (free) | Rate-limit counter docs |
| Firebase Storage | Spark (free) | Photo library hosting + CDN |
| Authentication | **Not used** | The product has no accounts |
| Cloud Functions | **Not used** | Backend lives on Netlify |

**Firestore security rules**: Public read denied, public write denied. All Firestore access goes through the Netlify Function via Firebase Admin SDK (admin context bypasses rules). See `19_Rate_Limiting.md` for the rules file.

**Storage security rules**: Public read on the `/photos/*` path (these are static assets meant to be served as a CDN). No public write. Admin uploads via the curation tool only.

## Hosting & Domain

- **Netlify**: Free tier covers 100 GB bandwidth/month + 125 k function invocations/month. At MVP scale, this is ~10 % utilization.
- **Cloudflare Registrar**: Domain at-cost (~$10/year), no markup, free WHOIS privacy. Configure DNS to point at Netlify per Netlify's standard custom-domain instructions.
- **No CDN configuration needed beyond defaults.** Netlify edge caches static assets automatically; Firebase Storage serves photos with a built-in CDN.

## Analytics

PostHog free tier (1 M events/month — far more than this product will use). Configured in `22_Analytics.md`. Events fire from the frontend only; the Netlify Function does not call PostHog.

**Privacy posture**: No user accounts means no user identification. PostHog events are anonymous; the only "identity" is a generated session ID stored in `sessionStorage`. No PII is captured. The cookie banner is therefore not legally required for most jurisdictions, but a one-line content notice in the footer covers EU expectations (`21_Site_Foundation.md`).

## What's Deliberately Excluded

| Excluded | Why |
|----------|-----|
| `next` / Next.js | Single page, no SSR needs |
| `firebase` (client SDK) | No client-side Firebase reads — frontend only fetches photos via plain HTTPS URLs and posts to the Netlify Function |
| `framer-motion` | The handful of subtle animations are tiny CSS transitions; a motion library is overhead |
| `axios` | Native `fetch` in both frontend and function is sufficient |
| State managers (Redux / Zustand / Jotai) | The app has trivial state — `useState` is enough |
| `react-router` | One page, no routes |
| ORM or query builder | No relational DB; Firestore is touched directly via the Admin SDK |
| `dotenv` | Netlify and Vite handle env vars natively |

If a developer reaches for one of the above mid-build, that's a signal the implementation is drifting from spec. Push back on the temptation.

## Gaps & Assumptions

- **Exact model strings** — Use whatever the current Sonnet and Haiku model strings are at build time (verify against Anthropic's docs). The architecture does not depend on the version.
- **Firebase Admin credentials path** — Production uses env-var-injected service-account credentials. Local dev uses a `serviceAccountKey.json` file gitignored at the repo root; see `02_Project_Setup.md`.
- **Region for Netlify Functions** — Default (US-East). No latency-driven reason to override.
- **Region for Firestore** — Pick `us-central1` or the multi-region default. Photo library is the bandwidth-heavy asset and Firebase Storage CDNs that globally regardless.
