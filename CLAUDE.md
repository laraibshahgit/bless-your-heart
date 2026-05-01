# Bless Your Heart — AI Codebase Guide

A single-page web app that generates anti-affirmation posters — reverent inspirational typography over scenic landscape photos with a two-line payload. Line 1 is a sincere wellness-influencer setup; Line 2 is a savagely honest pivot. No accounts, no database of user content. Land-to-share in under 10 seconds.

---

## Multi-Agent Safety

This repo is operated by NightyTidy and may have multiple agents working on branches concurrently.

- **NEVER delete files** — only create or modify
- **NEVER switch, create, or merge branches** — orchestrator handles all branching
- **NEVER run destructive git commands** — no `reset`, `clean`, `checkout --`, `rm`, force-push
- All memory files live under [`.claude/memory/`](.claude/memory/) and are git-tracked — do not move them to user-level memory
- When committing, write descriptive messages and commit only the files you intentionally changed

---

## Workflow Rules

- **Pre-deploy check**: `npm run build` (already runs `lint:photos && tsc -b --noEmit && vite build`)
- **Single-file test**: `npx vitest run tests/path/to/file.test.ts`
- **Watch mode**: `npm run test:watch`
- **Manual smoke test before launch**: generate + download on iOS Safari
- **Branch convention**: `master` is the default branch (project predates `main` rename); production deploys auto-trigger from `master` push to Netlify
- **NEVER expose `ANTHROPIC_API_KEY` to the browser** — Claude calls live in [`src/server/anthropic.ts`](src/server/anthropic.ts), invoked only by [`netlify/functions/generate.ts`](netlify/functions/generate.ts)
- **There is no `npm run lint`** — type-check via `npm run typecheck`. ESLint is not configured

---

## Project Structure

```
bless-your-heart/
├── netlify.toml, vite.config.ts, tailwind.config.ts, tsconfig.json
├── firebase.json, firestore.rules, storage.rules, .firebaserc
├── public/                       # Static assets (favicon, og-hero, examples/)
├── PRD/                          # 25 product spec docs (00–24)
│
├── src/
│   ├── main.tsx                  # Vite entry — wraps App in ErrorBoundary
│   ├── App.tsx                   # Single page — orchestrates state machine
│   ├── types/index.ts            # All shared types
│   ├── components/               # Feature components (App-level)
│   │   └── ui/                   # Shadcn primitives — Button, Dialog, Input, Textarea
│   ├── lib/                      # CLIENT-only utilities (api, compositor, fonts, photos, download, analytics, cn)
│   ├── server/                   # SERVER-only modules — bundled into Netlify function
│   │   ├── anthropic.ts          # Claude calls + voice system prompt
│   │   ├── safety.ts             # Slur/real-person/distress checks
│   │   ├── distress-phrases.ts, slur-list.ts, hotlines.ts, fallbacks.ts, synonyms.ts
│   │   ├── photoSelection.ts     # 3-rung capacity-based picker
│   │   ├── rateLimit.ts          # Daily-salted SHA-256 IP hash + Firestore txn
│   │   ├── validation.ts         # Zod parse + lexical specificity check
│   │   └── firebaseAdmin.ts      # Lazy-init Firestore client
│   ├── data/photos.json          # Photo library (10 entries currently)
│   ├── content/                  # CLIENT in-voice copy — copy.ts, presets.ts, placeholders.ts
│   └── styles/globals.css
│
├── netlify/functions/
│   └── generate.ts               # Single endpoint — orchestrates filter → generate → select pipeline
│
├── tools/                        # Local-only scripts
│   ├── lint-photos.ts            # CI-run validator for photos.json
│   ├── upload-photos.mjs         # Generate gradient placeholders + upload to Firebase Storage
│   └── upload-real-photos.mjs    # Pull from picsum.photos + upload
└── tests/{client,server}/        # Vitest specs
```

**`src/server/` is critical**: anything imported into a `src/server/*` file must NEVER be imported by client code. Mixing breaks the security boundary (e.g., bundling `slur-list.ts` to the browser leaks the moderation list).

---

## Environment Variables

Frontend uses `VITE_` prefix (Vite-exposed). Backend vars live in Netlify dashboard.

**Frontend** (`.env.local`): `VITE_FIREBASE_STORAGE_BASE_URL`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`

**Backend**: `ANTHROPIC_API_KEY` (NEVER exposed), `ANTHROPIC_MODEL_GEN` (default `claude-sonnet-4-6`), `ANTHROPIC_MODEL_SAFETY` (default `claude-haiku-4-5`), `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (newlines escaped as `\\n`), `FIREBASE_STORAGE_BUCKET`, `RATE_LIMIT_PER_HOUR` (default 25, set `9999` to bypass locally), `IP_SALT_BASE`, `ENABLE_TONE_CHECK` (set `false` to skip Haiku tone check)

See [`.env.example`](.env.example) for the canonical template.

---

## Architectural Rules

### Frontend

- **Single page app** — no router. State machine in [`App.tsx`](src/App.tsx) drives `PosterPhase` (`idle | loading | revealing | settled | error`)
- **Native Canvas API for compositing** — NEVER use html2canvas. Pixel-perfect serif text is required; raster libraries blur it
- **ALWAYS `await ensureFontsReady()` before `measureText()` or `fillText()`** — falling back to system serif silently breaks the joke. Helper lives in [`src/lib/fonts.ts`](src/lib/fonts.ts) and lazy-caches the promise
- **Shadcn Button is mandatory for all `<button>` interactions** — variants: `primary | secondary | preset | ghost`. Never inline raw `<button>` (the [`PromptInput`](src/components/PromptInput.tsx) raw `<input>` is intentional — Shadcn `Input` doesn't apply the same serif placeholder treatment)
- **No dark mode** — cream palette IS the brand. Never introduce `dark:` variants
- **Never use red for errors** — use `feedback-quiet` (`#D9D4C8`)
- **`sessionStorage` key for prompt persistence**: `byh:lastPrompt` (300ms debounce)
- **800ms minimum anticipation beat** — `LOAD_FLOOR_MS` in [`App.tsx`](src/App.tsx). Even instant API responses must wait
- **In-voice copy lives in [`src/content/`](src/content/)** — never hardcode user-facing strings in components. `copy.ts` (errors, loading, confirmation), `presets.ts` (mood chips), `placeholders.ts` (input)

### Backend

- **Single endpoint**: `POST /.netlify/functions/generate`
- **Filter pipeline (cost-ordered, `netlify/functions/generate.ts`)**:
  1. Method/Zod validation
  2. Rate-limit check (Firestore txn, 3s timeout, fails open on error)
  3. Slur word-list (free)
  4. Real-person regex (free; `PUBLIC_FIGURES` array currently empty)
  5. Distress phrase list (free, server-only)
  6. Distress Haiku classifier (only if phrase list misses)
  7. Generation loop: Sonnet → Zod parse → specificity (lexical) → tone (Haiku) — up to 2 retries
  8. Photo selection (3-rung fallback)
  9. Safe fallback if generation/selection both fail
- **NEVER log prompt or output content** — log only event types: `gen_ok`, `gen_block`, `gen_distress`, `gen_rate_limited`, `gen_retry`, `gen_safe_fallback`, `gen_anthropic_error`, `rate_limit_check_failed`, `tone_check_failed`, `distress_check_failed`
- **Rate limit**: 25/hour per IP, hashed with daily-rotated salt (`IP_SALT_BASE:YYYY-MM-DD`), SHA-256 truncated to 32 chars, stored at `rateLimits/{hashedIp}` with `expiresAt` for TTL
- **Retry budget = 2** — on exhaustion, ship a `safe_fallback` from [`fallbacks.ts`](src/server/fallbacks.ts). User NEVER sees raw error
- **Local dev bypass**: set `RATE_LIMIT_PER_HOUR=9999` (skips entire rate-limit block)
- **Tone check bypass**: set `ENABLE_TONE_CHECK=false` (returns true unconditionally)

### The Two-Line Contract (Non-Negotiable)

- **Line 1**: target 30–50 chars, hard cap **60**. Sincere, reverent, wellness-influencer voice
- **Line 2**: target 50–88 chars, hard cap **100**. Savagely honest pivot at the *situation*, never the user
- The format IS the joke — exactly two visual lines, no wrapping. Specificity makes line 2 land

Voice rules and validation pipeline: [voice-and-safety.md](.claude/memory/voice-and-safety.md).

---

## Conventions

- **Path alias**: `@/*` → `src/*` (configured in `tsconfig.json` + `vite.config.ts`)
- **Types**: all shared types exported from [`src/types/index.ts`](src/types/index.ts)
- **Components**: named exports (App.tsx is the lone default export)
- **Server-only files**: anything in [`src/server/`](src/server/) — never import from client. Server tests live in [`tests/server/`](tests/server/)
- **Timestamps**: `Timestamp.now()` from `firebase-admin/firestore` for Firestore writes
- **Tailwind tokens**: brand color tokens (`bg-cream`, `accent-sage`, etc.) only — never raw Tailwind colors

Brand tokens (colors, typography scale, animation tokens): [design-system.md](.claude/memory/design-system.md).

---

## Accessibility

- Non-interactive elements with `onClick`: add `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space
- Icon-only buttons: must have `aria-label`
- Canvas: `aria-label="Poster reading: {line1}. {line2}"` (already in [`PosterCanvas.tsx`](src/components/PosterCanvas.tsx))
- Distress modal: `aria-modal="true"`, traps focus via Radix Dialog primitive

---

## Common Recipes

### Adding a Mood Preset
1. Append label to `presets` in [`src/content/presets.ts`](src/content/presets.ts)
2. If new theme keyword, add an entry to `synonymMap` in [`src/server/synonyms.ts`](src/server/synonyms.ts) — otherwise specificity check may reject Sonnet output

### Adding a Photo to the Library
1. Compute `textZone` (normalized 0–1) and `capacity` for line1/line2
2. Append entry to [`src/data/photos.json`](src/data/photos.json) — id must match `^[a-z]+(-[a-z]+)*-\d{2,}$`
3. Upload the 1080×1080 JPG to Firebase Storage at `photos/{id}.jpg` (use [`tools/upload-real-photos.mjs`](tools/upload-real-photos.mjs) as reference)
4. `npm run build` — fails if `lint-photos.ts` rejects the entry

### Adding an Error Copy String
1. Add the key to `errorCopy` in [`src/content/copy.ts`](src/content/copy.ts)
2. Reference it from the component — never hardcode

---

## Documentation

Tiered system: CLAUDE.md → [MEMORY.md](.claude/memory/MEMORY.md) → topic files (`.claude/memory/*.md`). Max 2 hops from cold start.

**Placement rule**: Prevents mistakes on ANY task → CLAUDE.md. Spans features → MEMORY.md. One feature → topic file.

**Updating docs**: When code changes affect a rule in CLAUDE.md, update CLAUDE.md. When code changes affect a feature covered by a memory file, update that file. Topic files target 40–150 lines — split into hub + sub-topic files when content clusters into distinct concerns.

For PRD specs (deep reference, never auto-loaded): [prd-index.md](.claude/memory/prd-index.md) maps topics to `PRD/##_*.md` doc numbers.
