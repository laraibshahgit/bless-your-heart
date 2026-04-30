# Bless Your Heart — AI Codebase Guide

A single-page web app that generates anti-affirmation posters — reverent inspirational typography over scenic landscape photos with a two-line payload. Line 1 is a sincere wellness-influencer setup; Line 2 is a savagely honest pivot. No accounts, no database of user content. Land-to-share in under 10 seconds.

---

## Workflow Rules

- **Pre-deploy checks**: `npm run lint && npm run typecheck && npm run lint:photos && npm run build`
- **Manual smoke test before launch**: generate + download on iOS Safari
- `main` branch auto-deploys to production via Netlify
- Never expose `ANTHROPIC_API_KEY` to the browser — all AI calls server-side only

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18.3+, TypeScript 5.4+, Vite 5+, Tailwind CSS 3.4+, Shadcn/UI |
| Backend | Netlify Functions (Node 20 LTS) |
| Database | Firestore (Spark tier — rate-limit counters only) |
| Storage | Firebase Cloud Storage (photo library CDN) |
| Auth | None — no user accounts |
| AI — Generation | Claude Sonnet 4.6 (~$0.005/call) |
| AI — Safety | Claude Haiku 4.5 (~$0.0003/call) |
| Compositing | HTML5 Canvas API (native, not html2canvas) |
| Analytics | PostHog (free tier, 1M events/month) |
| Icons | lucide-react |
| Form | react-hook-form + Zod |
| Font | Cormorant Garamond (self-hosted via @fontsource) |
| Testing | Vitest |

---

## Project Structure

```
bless-your-heart/
├── netlify.toml, vite.config.ts, tailwind.config.ts, tsconfig.json
├── public/
│   ├── favicon.svg, og-hero.png, manifest.webmanifest
│   └── examples/                # Pre-rendered hero poster PNGs
│
├── src/
│   ├── main.tsx                 # Vite entry
│   ├── App.tsx                  # Single page
│   ├── types/index.ts
│   ├── components/
│   │   ├── ui/                  # Shadcn primitives
│   │   ├── PromptInput.tsx
│   │   ├── PresetButtons.tsx
│   │   ├── PosterCanvas.tsx     # Canvas rendering wrapper
│   │   ├── PosterReveal.tsx     # Reveal animation + regenerate
│   │   ├── DownloadButton.tsx
│   │   ├── DistressInterstitial.tsx
│   │   └── HeroExamples.tsx
│   ├── lib/
│   │   ├── api.ts               # Fetch wrapper to /api/generate
│   │   ├── compositor.ts        # Canvas drawing logic
│   │   ├── textFitting.ts       # Width verification
│   │   ├── photos.ts, analytics.ts, download.ts
│   ├── data/photos.json         # ~75 photo entries with metadata
│   ├── content/                 # Presets, examples, copy, safety lists
│   └── styles/globals.css
│
├── netlify/functions/
│   └── generate.ts              # Single generation endpoint
│
├── tools/curation/              # Photo metadata tagging (local only)
└── tests/
```

---

## Build & Run Commands

```bash
npm run build                    # Vite production build
npx tsc -b --noEmit              # Type check only
npm run lint                     # ESLint
npm run lint:photos              # CI lint on photos.json
npm test                         # Vitest
npx vitest run src/path/to/file.test.ts  # Single test file

# Deploy: auto via Netlify on push to main
# Local dev
netlify dev                      # Netlify dev server + functions
```

---

## Environment Variables

### Frontend (`.env.local`)
```
VITE_FIREBASE_STORAGE_BASE_URL=
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=
```

### Backend — Netlify Functions (env vars in Netlify dashboard)
```
ANTHROPIC_API_KEY=               # NEVER expose to browser
ANTHROPIC_MODEL_GEN=             # e.g., claude-sonnet-4-6
ANTHROPIC_MODEL_SAFETY=          # e.g., claude-haiku-4-5
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_STORAGE_BUCKET=
RATE_LIMIT_PER_HOUR=             # default 25; set 9999 for local dev
IP_SALT_BASE=
```

---

## Key Architectural Rules

### Frontend

- **Single page app** — one route, no router needed
- **Canvas compositing** — native Canvas API, NOT html2canvas. Pixel-perfect text required
- **Font loading** — `await document.fonts.ready` before any `measureText()` or `fillText()`
- **Shadcn/UI** — use for all interactive elements. Never inline raw `<button>` or `<input>`
- **No dark mode** — cream palette IS the brand
- **Input persistence** — `sessionStorage` key `byh:lastPrompt`
- **Minimum anticipation beat** — 800ms loading state even if API returns faster

### Backend

- **Single endpoint** — `POST /.netlify/functions/generate`
- **Filter order (cost-optimized)**: rate-limit → slur filter → real-person filter → distress check (Haiku) → generation (Sonnet) → tone check (Haiku)
- **Never log prompt or output content** — only event types and metadata
- **Rate limit**: 25/hour per hashed IP, Firestore transaction, TTL auto-delete
- **Retry budget**: 2 retries max, then safe fallback. User never sees raw error
- **Local dev bypass**: set `RATE_LIMIT_PER_HOUR=9999`

### The Two-Line Contract (Non-Negotiable)

- **Line 1**: 30–50 chars target, 60 hard cap. Sincere, reverent, wellness-influencer voice
- **Line 2**: 50–88 chars target, 100 hard cap. Savagely honest pivot at the *situation*, never the user
- The format is the joke — two visual lines, no wrapping, no exceptions
- Specificity is what makes line 2 land — must reference user's specific situation

---

## Conventions

- **Types**: export from `types/index.ts`
- **Components**: named exports, Shadcn primitives for all interactive elements
- **Content strings**: all in-voice copy in `src/content/` — never hardcode in components
- **Safety lists**: server-only — never bundle `distress-phrases.ts` or `slur-list.ts` to client
- **Timestamps**: `serverTimestamp()` for Firestore writes

---

## Design System Standards

> **Do NOT deviate from these values.**

### Colors — Brand Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-cream` | `#F7F3EC` | Page background |
| `bg-paper` | `#FBF8F2` | Card/input surfaces |
| `ink-deep` | `#2A2622` | Primary text |
| `ink-soft` | `#5C5650` | Secondary text |
| `ink-faint` | `#9A938B` | Placeholder/footer |
| `accent-sage` | `#8B9D83` | Primary accent (buttons) |
| `accent-sage-deep` | `#6F8267` | Hover/active |
| `accent-rust` | `#B47855` | Secondary accent |
| `border-mist` | `#E5DFD4` | Hairlines |
| `feedback-quiet` | `#D9D4C8` | Error tone — **never red** |

### Typography

One typeface only: **Cormorant Garamond** (self-hosted via `@fontsource`).

### Buttons — Pill-shaped (`rounded-full`)

- `primary` — Generate, Download (sage bg, cream text)
- `secondary` — Regenerate, dismiss (paper bg, sage border)
- `preset` — Mood chips (paper bg, sage border on selected)
- `ghost` — Footer links (no chrome)

---

## Accessibility Standards

- Non-interactive elements with `onClick`: add `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space
- Icon-only buttons: must have `aria-label`
- Canvas: `aria-label="Poster reading: {line1}. {line2}"`
- Distress modal: traps focus, `aria-modal="true"`, returns focus to input on close

---

## Data Model

```
rateLimits/{hashedIp}              # TTL auto-delete
  count: number
  windowStart: Timestamp
  expiresAt: Timestamp

photos.json (static, ~75 entries)  # Photo metadata with textZone, capacity, tier
```

No user data stored. No accounts. No generated content persisted.

---

## Core Workflow

1. User lands on single page, sees hero examples
2. Types situation or clicks mood preset → populates input
3. Clicks Generate (or Enter)
4. Backend: safety filters → Claude generates two lines → selects photo
5. Frontend: Canvas composites poster (800ms anticipation + 600ms reveal fade)
6. User downloads 1080x1080 PNG or regenerates

---

## Common Recipes

### Adding a Content Preset
1. Add label to `src/content/presets.ts`
2. If new theme, add synonym entries to `src/content/synonyms.ts`

### Adding a Photo to Library
1. Use `tools/curation/` to define textZone + compute capacity
2. Add entry to `src/data/photos.json`
3. Run `npm run lint:photos` to validate

---

## Documentation Hierarchy

| File | When to load |
|------|-------------|
| `CLAUDE.md` | Always (this file) |
| `.claude/memory/MEMORY.md` | Always (auto-loaded navigation index) |
| `.claude/memory/voice-and-safety.md` | Working on generation, prompts, safety filters, or tone |
| `.claude/memory/canvas-and-compositing.md` | Working on poster rendering, text fitting, or download |
| `.claude/memory/design-system.md` | Building or modifying UI components |
| `.claude/memory/api-and-backend.md` | Working on the Netlify function or rate limiting |
| `.claude/memory/prd-index.md` | Need detailed specs — maps topics to PRD doc numbers |
