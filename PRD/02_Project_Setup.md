# Project Setup

## Overview

Repo structure, configuration files, and the local-dev / deploy workflow. This file gets a developer from `git clone` to a working dev environment to a deploy-on-push pipeline.

## Dependencies
- `01_Tech_Stack.md` — Package list and env-var inventory
- `03_Data_Schema.md` — Firestore rules referenced in this file

## Repo Structure

```
bless-your-heart/
├── public/                       # Static assets served at root
│   ├── og-hero.png               # OG card image (~1200×630)
│   └── favicon.svg
├── src/
│   ├── main.tsx                  # Vite entry; mounts <App />
│   ├── App.tsx                   # The single page
│   ├── components/
│   │   ├── ui/                   # Shadcn-installed components
│   │   ├── PromptInput.tsx       # 07
│   │   ├── PresetButtons.tsx     # 07
│   │   ├── PosterCanvas.tsx      # 15
│   │   ├── PosterReveal.tsx      # 16
│   │   ├── DownloadButton.tsx    # 17
│   │   ├── DistressInterstitial.tsx # 10
│   │   └── HeroExamples.tsx      # 06
│   ├── lib/
│   │   ├── api.ts                # Wraps fetch to /.netlify/functions/generate
│   │   ├── compositor.ts         # Canvas drawing logic (15)
│   │   ├── textFitting.ts        # Frontend portion of 14 (Stage 4 width verification)
│   │   ├── photos.ts             # Reads /src/data/photos.json, picks one
│   │   ├── analytics.ts          # PostHog wrapper (22)
│   │   └── download.ts           # file-saver wrapper, iOS handling (17)
│   ├── data/
│   │   └── photos.json           # Photo metadata; see 12
│   ├── types/
│   │   └── index.ts              # Shared TS types
│   ├── styles/
│   │   └── globals.css           # Tailwind directives + font @import
│   └── content/
│       ├── presets.ts            # Preset button labels
│       ├── examples.ts           # Hero example posters (06)
│       └── copy.ts               # In-voice strings (errors, fallback, distress)
├── netlify/
│   └── functions/
│       └── generate.ts           # The single generation endpoint (08)
├── tools/
│   └── curation/                 # Photo curation tool (13) — local-only
├── tests/
│   └── ...                       # Lightweight tests; not strict TDD
├── .env.local                    # Gitignored; local Vite env
├── .env.example                  # Committed; documents required vars
├── netlify.toml                  # Netlify build + functions config
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── components.json               # Shadcn config
├── package.json
└── serviceAccountKey.json        # Gitignored; local Firebase Admin credentials
```

## Vite Configuration (`vite.config.ts`)

Standard Vite + React + TypeScript config with two non-default touches:

1. **Path alias `@/*` → `./src/*`** — required by Shadcn's import convention.
2. **Dev proxy** — Forward `/.netlify/functions/*` to the Netlify Dev server (port 8888) so the frontend can hit the function in dev exactly like in prod.

```ts
server: {
  proxy: {
    '/.netlify/functions': 'http://localhost:8888',
  },
},
```

## Netlify Configuration (`netlify.toml`)

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
  external_node_modules = ["firebase-admin"]

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[dev]
  command = "npm run dev"
  targetPort = 5173
  port = 8888
```

The redirect lets the frontend call `/api/generate` rather than the verbose `/.netlify/functions/generate`. `external_node_modules = ["firebase-admin"]` keeps esbuild from trying to bundle Firebase Admin's native deps.

## Tailwind Configuration (`tailwind.config.ts`)

Standard scan paths for `./index.html` and `./src/**/*.{ts,tsx}`. The theme extension imports tokens from `04_UI_Design_System.md` — colors, font families, spacing scale, animation timings. Don't define design tokens inline anywhere else; the design-system file is the source of truth.

## Shadcn Setup (`components.json`)

Initialize with `npx shadcn@latest init`. Configure during init:

- Style: `default`
- Base color: `neutral`
- CSS variables: yes
- Path alias: `@/*`

Install only the components needed for v1: `button`, `input`, `textarea`, `dialog`. Do not bulk-install — every Shadcn component is copied into the repo, and unused ones become dead code that drifts.

## Font Self-Hosting

```ts
// src/main.tsx
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/400-italic.css';
```

Importing the CSS files at the entry point ensures the font is registered before any React render. The Canvas compositor then awaits `document.fonts.ready` before drawing (`15_Compositing_Engine.md`). Do not load via `<link>` to Google Fonts — see `01_Tech_Stack.md` for why.

## Firebase Setup

One-time, manual:

1. Create a Firebase project on the Spark plan.
2. Enable Firestore (Native mode) and Cloud Storage.
3. In Project Settings → Service Accounts, generate a private key. Save as `serviceAccountKey.json` at the repo root for local dev.
4. Copy the same credentials' fields into Netlify env vars (per `01_Tech_Stack.md`).
5. Apply Firestore rules (`firestore.rules`) and Storage rules (`storage.rules`) — see below.
6. Configure Firestore TTL on the `rateLimits` collection's `expiresAt` field (Firestore console → TTL).

**`firestore.rules`** (locked-down; all access goes via Admin SDK):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**`storage.rules`** (public read for photos, no public write):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /photos/{photoId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

## Local Dev Workflow

```
npm install
cp .env.example .env.local        # fill in VITE_* vars
# place serviceAccountKey.json at repo root
netlify dev                       # runs Vite + Functions on :8888
```

`netlify dev` proxies the Vite dev server and runs functions locally with the Netlify env injected from a linked site (`netlify link`). This matches production exactly — including the `/api/*` redirect — so a working `netlify dev` build is a working production build.

## Deploy Workflow

Push to `main` → Netlify builds and deploys automatically. Every PR gets a preview deployment at `deploy-preview-{n}--{site}.netlify.app`. The free tier handles unlimited preview builds.

**Pre-deploy checklist** (run before merging):

1. `npm run lint && npm run typecheck` — both must pass
2. `npm run test` if any tests exist
3. CI lint of `photos.json` (see `13_Photo_Curation_Tool.md`) — every photo entry has complete metadata, or the build fails
4. Manual smoke test: generate a poster locally, including the iOS Safari download path (`17_Download_PNG.md`)

## Branching & Commits

No prescribed flow — solo passion project. The only convention worth keeping: never push directly to `main` if the change touches the system prompt (`05`), the safety guardrails (`10`), or the photo metadata (`12`). Those three areas can break the product silently in ways that don't show up in tests.

## Gaps & Assumptions

- **CI provider**: assumed to be Netlify's built-in build, which runs `npm run build` and the lint/typecheck steps if added to the build command. No external CI (GitHub Actions) needed for v1; add if multi-developer.
- **Test framework**: not specified. Default to Vitest if tests get added — it pairs natively with Vite. Tests are not a v1 blocker.
- **Branch protection**: not configured for solo dev. Configure on GitHub if collaborators are added.
- **Sourcemap policy**: Vite emits sourcemaps in dev; production sourcemaps are off by default in `vite.config.ts`. Don't ship them — the system prompt is in the function bundle and readable.
