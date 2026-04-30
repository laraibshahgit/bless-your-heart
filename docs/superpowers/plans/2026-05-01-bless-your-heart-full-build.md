# Bless Your Heart — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Bless Your Heart single-page web app — a poster generator that composites two-line anti-affirmations over landscape photos, with safety guardrails, rate limiting, and a polished deadpan UI.

**Architecture:** React/Vite SPA on Netlify with a single serverless function (`POST /api/generate`) that orchestrates safety filters, Claude Sonnet generation, output validation, and photo selection. Frontend receives text + photo ID, composites the poster client-side on HTML5 Canvas, and exports as PNG. Firestore stores only rate-limit counters (no user data). All AI calls are server-side; the Anthropic API key never reaches the browser.

**Tech Stack:** React 18.3+ · TypeScript 5.4+ · Vite 5+ · Tailwind CSS 3.4+ · Shadcn/UI · Netlify Functions (Node 20) · @anthropic-ai/sdk · firebase-admin · Zod · PostHog · Canvas API · Cormorant Garamond (@fontsource) · Vitest

---

## Complete File Map

```
bless-your-heart/
├── .env.example
├── .gitignore                          (exists)
├── CLAUDE.md                           (exists)
├── components.json                     # Shadcn config
├── firestore.rules
├── index.html                          # Vite entry HTML
├── netlify.toml
├── package.json
├── postcss.config.js
├── storage.rules
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
│
├── public/
│   ├── favicon.svg
│   ├── favicon-32.png
│   ├── apple-touch-icon.png
│   ├── android-chrome-192.png
│   ├── android-chrome-512.png
│   ├── manifest.webmanifest
│   ├── robots.txt
│   ├── sitemap.xml
│   └── examples/                       # Pre-rendered hero poster PNGs (manual)
│
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── vite-env.d.ts
│   │
│   ├── types/
│   │   └── index.ts                    # All shared TypeScript interfaces
│   │
│   ├── styles/
│   │   └── globals.css                 # Tailwind directives + font + animations
│   │
│   ├── lib/
│   │   ├── cn.ts                       # clsx + tailwind-merge utility
│   │   ├── api.ts                      # Fetch wrapper for /api/generate
│   │   ├── fonts.ts                    # Font loading + readiness
│   │   ├── compositor.ts               # Canvas drawing logic
│   │   ├── textFitting.ts              # Stage 4 width verification
│   │   ├── photos.ts                   # Photo URL construction
│   │   ├── download.ts                 # file-saver wrapper
│   │   └── analytics.ts               # PostHog wrapper
│   │
│   ├── content/
│   │   ├── presets.ts                  # Preset mood chip labels
│   │   ├── copy.ts                     # In-voice strings: loading, errors, etc.
│   │   └── placeholders.ts            # Input placeholder rotation pool
│   │
│   ├── data/
│   │   └── photos.json                # Photo metadata (~75 entries)
│   │
│   ├── components/
│   │   ├── ui/                         # Shadcn: button, input, textarea, dialog
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── CreditsDialog.tsx
│   │   ├── HeroExamples.tsx
│   │   ├── PromptInput.tsx
│   │   ├── PresetButtons.tsx
│   │   ├── GenerateButton.tsx
│   │   ├── PosterCanvas.tsx
│   │   ├── PosterReveal.tsx
│   │   ├── DownloadButton.tsx
│   │   ├── DistressInterstitial.tsx
│   │   └── ErrorBoundary.tsx
│   │
│   └── server/                         # Server-only modules (imported by function)
│       ├── firebaseAdmin.ts
│       ├── rateLimit.ts
│       ├── safety.ts
│       ├── anthropic.ts
│       ├── validation.ts
│       ├── photoSelection.ts
│       ├── distress-phrases.ts         # NEVER import from client code
│       ├── slur-list.ts                # NEVER import from client code
│       ├── synonyms.ts
│       ├── hotlines.ts
│       └── fallbacks.ts
│
├── netlify/
│   └── functions/
│       └── generate.ts                 # Single generation endpoint
│
├── tools/
│   └── lint-photos.ts                  # CI lint for photos.json
│
└── tests/
    ├── server/
    │   ├── rateLimit.test.ts
    │   ├── safety.test.ts
    │   ├── validation.test.ts
    │   └── photoSelection.test.ts
    └── client/
        ├── textFitting.test.ts
        └── api.test.ts
```

---

## Phase 1: Project Foundation

### Task 1: Initialize Project & Install Dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `.env.example`

- [ ] **Step 1: Initialize npm project and install all dependencies**

```bash
cd "C:/Users/larai/Documents/Software Projects/Bless Your Heart"
npm init -y
```

Update `package.json` name to `bless-your-heart`.

- [ ] **Step 2: Install production dependencies**

```bash
npm install react react-dom @fontsource/cormorant-garamond react-hook-form zod @hookform/resolvers lucide-react clsx tailwind-merge class-variance-authority posthog-js file-saver
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D typescript @types/react @types/react-dom @types/file-saver vite @vitejs/plugin-react tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom jsdom @netlify/functions @anthropic-ai/sdk firebase-admin tsx
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "netlify", "tools"]
}
```

- [ ] **Step 5: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create vite.config.ts**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/.netlify/functions': 'http://localhost:8888',
    },
  },
  build: {
    sourcemap: false,
  },
});
```

- [ ] **Step 7: Create .env.example**

```
# Frontend (Vite — VITE_ prefix required)
VITE_FIREBASE_STORAGE_BASE_URL=
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=

# Backend (Netlify Functions — server-only)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL_GEN=claude-sonnet-4-6
ANTHROPIC_MODEL_SAFETY=claude-haiku-4-5
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_STORAGE_BUCKET=
RATE_LIMIT_PER_HOUR=25
IP_SALT_BASE=
```

- [ ] **Step 8: Add scripts to package.json**

Update the `scripts` section:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "npm run lint:photos && tsc -b --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit",
    "lint:photos": "tsx tools/lint-photos.ts"
  }
}
```

- [ ] **Step 9: Create src/vite-env.d.ts**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 10: Commit**

```bash
git init
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts .env.example .gitignore CLAUDE.md src/vite-env.d.ts
git commit -m "chore: initialize project with Vite, React, TypeScript"
```

---

### Task 2: Configure Tailwind CSS & Global Styles

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `src/styles/globals.css`
- Create: `src/lib/cn.ts`

- [ ] **Step 1: Initialize Tailwind**

```bash
npx tailwindcss init -p --ts
```

- [ ] **Step 2: Write tailwind.config.ts with all brand tokens**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F7F3EC',
        paper: '#FBF8F2',
        'ink-deep': '#2A2622',
        'ink-soft': '#5C5650',
        'ink-faint': '#9A938B',
        'accent-sage': '#8B9D83',
        'accent-sage-deep': '#6F8267',
        'accent-rust': '#B47855',
        'border-mist': '#E5DFD4',
        'feedback-quiet': '#D9D4C8',
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      fontSize: {
        display: ['3rem', { lineHeight: '1.1', fontWeight: '500' }],
        'display-lg': ['3.75rem', { lineHeight: '1.1', fontWeight: '500' }],
        headline: ['2rem', { lineHeight: '1.15', fontWeight: '500' }],
        'headline-lg': ['2.5rem', { lineHeight: '1.15', fontWeight: '500' }],
        'body-lg': ['1.125rem', { lineHeight: '1.5', fontWeight: '400' }],
        body: ['1rem', { lineHeight: '1.55', fontWeight: '400' }],
        label: ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        caption: ['0.8125rem', { lineHeight: '1.4', fontWeight: '400' }],
      },
      spacing: {
        breathe: '1.75rem',
        section: '4rem',
      },
      borderRadius: {
        pill: '9999px',
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.4, 0, 0.2, 1)',
        touch: 'cubic-bezier(0.2, 0, 0.4, 1)',
      },
      transitionDuration: {
        reveal: '600ms',
        anticipation: '800ms',
      },
      keyframes: {
        'pulse-opacity': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-opacity': 'pulse-opacity 1600ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Create src/styles/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-cream text-ink-deep font-serif antialiased;
  }
}

@layer utilities {
  .text-poster-light {
    color: #ffffff;
  }
  .text-poster-dark {
    color: #1a1612;
  }
}
```

- [ ] **Step 4: Create src/lib/cn.ts**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts postcss.config.js src/styles/globals.css src/lib/cn.ts
git commit -m "feat: configure Tailwind CSS with brand design tokens"
```

---

### Task 3: Install Shadcn/UI Components

**Files:**
- Create: `components.json`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/textarea.tsx`
- Create: `src/components/ui/dialog.tsx`

- [ ] **Step 1: Initialize Shadcn**

```bash
npx shadcn@latest init
```

When prompted:
- Style: `default`
- Base color: `neutral`
- CSS variables: `yes`
- Path alias: `@`

This creates `components.json`.

- [ ] **Step 2: Install required Shadcn components**

```bash
npx shadcn@latest add button input textarea dialog
```

- [ ] **Step 3: Customize button variants for brand**

Edit `src/components/ui/button.tsx` to add brand variants. Replace the existing variants object inside `buttonVariants` with:

```ts
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-serif text-label font-medium transition-all duration-150 ease-touch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-sage/50 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent-sage text-cream shadow-sm hover:bg-accent-sage-deep active:scale-[0.98]',
        secondary: 'bg-paper text-ink-deep border border-border-mist hover:border-accent-sage active:scale-[0.98]',
        preset: 'bg-paper text-ink-soft border border-border-mist hover:border-accent-sage data-[selected=true]:border-accent-sage data-[selected=true]:text-ink-deep',
        ghost: 'text-ink-soft hover:text-accent-sage',
      },
      size: {
        default: 'h-11 px-6 py-2 rounded-pill',
        sm: 'h-9 px-4 rounded-pill',
        lg: 'h-12 px-8 rounded-pill',
        icon: 'h-10 w-10 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);
```

- [ ] **Step 4: Commit**

```bash
git add components.json src/components/ui/
git commit -m "feat: install and configure Shadcn/UI components with brand variants"
```

---

### Task 4: Define Type System

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Write all shared TypeScript interfaces**

```ts
// ── Photo Metadata ──

export interface TextZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Capacity {
  line1: number;
  line2: number;
}

export type WatermarkPosition = 'lower-left' | 'lower-right' | 'upper-left' | 'upper-right';
export type TextColor = 'white' | 'dark';
export type PhotoTier = 'standard' | 'high-capacity';

export interface Photo {
  id: string;
  width: number;
  height: number;
  textZone: TextZone;
  capacity: Capacity;
  textColor: TextColor;
  watermarkPosition: WatermarkPosition;
  tier: PhotoTier;
  credit: string;
}

// ── API Request/Response ──

export interface GenerateRequest {
  prompt: string;
  excludePhotoIds: string[];
}

export interface Hotline {
  countryCode: string;
  name: string;
  phone: string;
  url?: string;
}

export type GenerateResponse =
  | { status: 'ok'; line1: string; line2: string; photoId: string; fittingRung: 1 | 2 | 3 | 4 }
  | { status: 'distress'; hotline: Hotline }
  | { status: 'blocked'; message: string }
  | { status: 'rate_limited'; message: string }
  | { status: 'safe_fallback'; line1: string; line2: string; photoId: string }
  | { status: 'error'; message: string; retryable: boolean };

// ── Rate Limiting ──

export interface RateLimitDoc {
  count: number;
  windowStart: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
  retryAfterSec?: number;
}

// ── Generation Internal ──

export interface GenerationOutput {
  line1: string;
  line2: string;
}

export interface FitResult {
  ok: true;
  scale: number;
} | {
  ok: false;
  reason: 'overflow';
}

// ── UI State ──

export type PosterPhase =
  | { phase: 'idle' }
  | { phase: 'loading'; phrase: string }
  | { phase: 'revealing' }
  | { phase: 'settled'; line1: string; line2: string; photoId: string; fittingRung: 1 | 2 | 3 | 4 }
  | { phase: 'error'; message: string; retryable: boolean };

// ── Fallback ──

export interface SafeFallback {
  line1: string;
  line2: string;
  photoId: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: define complete type system for API, photos, and UI state"
```

---

## Phase 2: Content & Data Layer

### Task 5: Create All Content Files

**Files:**
- Create: `src/content/presets.ts`
- Create: `src/content/placeholders.ts`
- Create: `src/content/copy.ts`

- [ ] **Step 1: Create presets.ts**

```ts
export const presets = [
  'Monday again',
  "Can't sleep",
  'Work',
  'Family',
  'Dating',
  'Money',
  'Just one of those days',
  'Adulting',
] as const;

export type Preset = (typeof presets)[number];
```

- [ ] **Step 2: Create placeholders.ts**

```ts
export const placeholders = [
  "haven't started yet",
  'third coffee of the morning',
  'Monday again',
  'the group chat is silent',
  'everything is fine',
  "an email i don't want to send",
  "she didn't text back",
  'another sunday afternoon',
] as const;
```

- [ ] **Step 3: Create copy.ts**

```ts
export const loadingPhrases = [
  'The universe is composing itself.',
  'Aligning the chakras of your specific situation.',
  'Distilling what you said into something honest.',
  'Consulting the ancient wellness texts.',
  'Some moments take longer than others.',
] as const;

export const errorCopy = {
  rateLimit: 'Even the universe has a daily limit. Try again in a bit.',
  slurBlock: "Let's try a different one.",
  realPersonBlock: "The voice doesn't punch at people. Try a situation instead.",
  generation: {
    anthropicError: 'Even the universe is buffering. Try again.',
    timeout: "The cosmos is having one of those days. Give it a moment.",
    networkOffline: 'Your connection drifted off into the wilderness. Try again when it\'s back.',
    unknown: "Something didn't quite land. One more try?",
  },
  frontend: {
    canvasWriteFailed: "The image didn't quite render. One more try?",
    downloadFailed: 'Even the download is having a moment. Try once more.',
    fontLoadTimeout: 'The typography is taking its time. Refreshing might help.',
  },
  errorBoundary: 'The page lost the thread. Refreshing usually helps.',
} as const;

export const downloadConfirmation = 'Saved. Go forth.';
```

- [ ] **Step 4: Commit**

```bash
git add src/content/
git commit -m "feat: add content files — presets, placeholders, copy"
```

---

### Task 6: Create Server-Side Content Files

**Files:**
- Create: `src/server/hotlines.ts`
- Create: `src/server/fallbacks.ts`
- Create: `src/server/synonyms.ts`
- Create: `src/server/distress-phrases.ts`
- Create: `src/server/slur-list.ts`

- [ ] **Step 1: Create hotlines.ts**

```ts
import type { Hotline } from '@/types';

const hotlineMap: Record<string, Hotline> = {
  US: { countryCode: 'US', name: '988 Suicide & Crisis Lifeline', phone: '988', url: 'https://988lifeline.org' },
  GB: { countryCode: 'GB', name: 'Samaritans', phone: '116 123', url: 'https://www.samaritans.org' },
  CA: { countryCode: 'CA', name: 'Talk Suicide Canada', phone: '988', url: 'https://talksuicide.ca' },
  AU: { countryCode: 'AU', name: 'Lifeline Australia', phone: '13 11 14', url: 'https://www.lifeline.org.au' },
  IE: { countryCode: 'IE', name: 'Samaritans Ireland', phone: '116 123', url: 'https://www.samaritans.org' },
  NZ: { countryCode: 'NZ', name: 'Need to Talk?', phone: '1737' },
  IN: { countryCode: 'IN', name: 'iCall', phone: '9152987821' },
  DE: { countryCode: 'DE', name: 'Telefonseelsorge', phone: '0800 111 0 111' },
  FR: { countryCode: 'FR', name: 'SOS Amitié', phone: '09 72 39 40 50' },
};

const fallbackHotline: Hotline = {
  countryCode: 'INTL',
  name: 'Find a Helpline',
  phone: '',
  url: 'https://findahelpline.com',
};

export function getHotlineForCountry(countryCode: string): Hotline {
  return hotlineMap[countryCode.toUpperCase()] ?? fallbackHotline;
}
```

- [ ] **Step 2: Create fallbacks.ts**

```ts
import type { SafeFallback } from '@/types';

export const safeFallbacks: SafeFallback[] = [
  {
    line1: 'The path forward is not always clear.',
    line2: 'Yours, in particular, is currently buffering.',
    photoId: 'misty-fjord-01',
  },
  {
    line1: 'You are exactly where you need to be.',
    line2: 'Statistically, this is bad news.',
    photoId: 'sunrise-meadow-02',
  },
  {
    line1: 'Every journey begins with a single step.',
    line2: 'Most of them lead to the fridge.',
    photoId: 'quiet-woods-03',
  },
  {
    line1: 'The universe unfolds in its own time.',
    line2: 'It is also running late.',
    photoId: 'foggy-coastline-04',
  },
  {
    line1: 'Stillness is a gift.',
    line2: 'So is pretending you chose it.',
    photoId: 'golden-field-05',
  },
];
```

- [ ] **Step 3: Create synonyms.ts**

```ts
const synonymMap: Record<string, string[]> = {
  monday: ['day', 'week', 'morning', 'weekend', 'tomorrow', 'weekday'],
  coffee: ['morning', 'cup', 'mug', 'brew', 'awake', 'tired', 'caffeine'],
  sleep: ['rest', 'awake', 'bed', 'eyes', 'dark', 'dawn', 'insomnia', 'tired', 'night'],
  tired: ['rest', 'awake', 'bed', 'eyes', 'energy', 'exhausted', 'sleep'],
  work: ['office', 'meeting', 'email', 'deadline', 'career', 'job', 'boss', 'desk'],
  job: ['office', 'meeting', 'email', 'deadline', 'career', 'work', 'boss'],
  boss: ['office', 'meeting', 'email', 'work', 'job', 'management'],
  family: ['relatives', 'parents', 'dinner', 'holidays', 'home', 'gathering'],
  mom: ['mother', 'parents', 'family', 'home', 'dinner'],
  dad: ['father', 'parents', 'family', 'home'],
  dating: ['romance', 'love', 'text', 'swipe', 'single', 'app', 'match'],
  breakup: ['romance', 'love', 'text', 'heart', 'single', 'ex'],
  ex: ['romance', 'love', 'text', 'past', 'single', 'back'],
  money: ['wallet', 'account', 'paycheck', 'debt', 'broke', 'bills', 'rent', 'budget'],
  bills: ['wallet', 'account', 'paycheck', 'debt', 'money', 'rent', 'due'],
  rent: ['wallet', 'landlord', 'apartment', 'money', 'bills', 'due'],
  adulting: ['bills', 'responsibility', 'grown', 'taxes', 'laundry', 'groceries'],
  wedding: ['family', 'ceremony', 'dress', 'toast', 'invitation', 'reception'],
  sister: ['sibling', 'family', 'relatives'],
  brother: ['sibling', 'family', 'relatives'],
};

export function checkSynonymMap(contentWords: string[], line2Tokens: string[]): boolean {
  for (const word of contentWords) {
    const synonyms = synonymMap[word];
    if (!synonyms) continue;
    if (synonyms.some((s) => line2Tokens.includes(s))) return true;
  }
  return false;
}
```

- [ ] **Step 4: Create distress-phrases.ts**

This list must be authored with care. These are high-precision phrases that indicate genuine crisis — NOT hyperbole like "I'm dying" or "kill me now." Consult published clinical guidance when refining.

```ts
export const distressPhrases: string[] = [
  'want to end it',
  'want to end my life',
  'want to die',
  'going to kill myself',
  'plan to kill myself',
  'planning to end',
  'no reason to live',
  'better off dead',
  'can\'t go on',
  'don\'t want to be here anymore',
  'don\'t want to exist',
  'no point in living',
  'ending it all',
  'ending it tonight',
  'ending things tonight',
  'ready to go',
  'goodbye letter',
  'suicide note',
  'final goodbye',
  'not going to be around',
  'won\'t be here tomorrow',
  'won\'t be around much longer',
  'take my own life',
  'taking my own life',
  'harm myself',
  'hurt myself',
  'cutting myself',
  'overdose',
  'jump off',
  'hang myself',
];
```

- [ ] **Step 5: Create slur-list.ts**

A focused hate-speech word list. NOT a profanity filter — common profanity (fuck, shit) is allowed. Target slurs and unambiguous hate terms only. Use word-boundary matching.

```ts
// Focused hate-speech terms only. Common profanity is allowed.
// Match with word boundaries (\b...\b) to avoid false positives.
export const slurList: string[] = [
  // Populate with a maintained open-source hate-speech list
  // (e.g., LDNOOBW or a focused subset).
  // This placeholder must be replaced before launch.
  // Each entry is a single word/phrase to match with word boundaries.
];
```

> **IMPORTANT:** Before launch, populate this with a real maintained list. The placeholder is intentional — the developer must make a deliberate choice about which terms to include.

- [ ] **Step 6: Commit**

```bash
git add src/server/hotlines.ts src/server/fallbacks.ts src/server/synonyms.ts src/server/distress-phrases.ts src/server/slur-list.ts
git commit -m "feat: add server-side content — hotlines, fallbacks, synonyms, safety lists"
```

---

### Task 7: Create Photo Data & Lint Script

**Files:**
- Create: `src/data/photos.json`
- Create: `tools/lint-photos.ts`

- [ ] **Step 1: Create photos.json with starter entries**

These are placeholder entries demonstrating the schema. Replace with real curated photos before launch.

```json
[
  {
    "id": "misty-fjord-01",
    "width": 1080,
    "height": 1080,
    "textZone": { "x": 0.10, "y": 0.55, "width": 0.80, "height": 0.30 },
    "capacity": { "line1": 52, "line2": 95 },
    "textColor": "white",
    "watermarkPosition": "lower-right",
    "tier": "high-capacity",
    "credit": "Placeholder / Unsplash"
  },
  {
    "id": "sunrise-meadow-02",
    "width": 1080,
    "height": 1080,
    "textZone": { "x": 0.10, "y": 0.10, "width": 0.80, "height": 0.30 },
    "capacity": { "line1": 52, "line2": 95 },
    "textColor": "white",
    "watermarkPosition": "lower-left",
    "tier": "high-capacity",
    "credit": "Placeholder / Unsplash"
  },
  {
    "id": "quiet-woods-03",
    "width": 1080,
    "height": 1080,
    "textZone": { "x": 0.10, "y": 0.55, "width": 0.80, "height": 0.30 },
    "capacity": { "line1": 48, "line2": 88 },
    "textColor": "white",
    "watermarkPosition": "lower-right",
    "tier": "standard",
    "credit": "Placeholder / Unsplash"
  },
  {
    "id": "foggy-coastline-04",
    "width": 1080,
    "height": 1080,
    "textZone": { "x": 0.10, "y": 0.35, "width": 0.80, "height": 0.30 },
    "capacity": { "line1": 52, "line2": 95 },
    "textColor": "white",
    "watermarkPosition": "upper-right",
    "tier": "high-capacity",
    "credit": "Placeholder / Unsplash"
  },
  {
    "id": "golden-field-05",
    "width": 1080,
    "height": 1080,
    "textZone": { "x": 0.10, "y": 0.55, "width": 0.80, "height": 0.30 },
    "capacity": { "line1": 52, "line2": 95 },
    "textColor": "dark",
    "watermarkPosition": "lower-left",
    "tier": "high-capacity",
    "credit": "Placeholder / Unsplash"
  },
  {
    "id": "mountain-lake-06",
    "width": 1080,
    "height": 1080,
    "textZone": { "x": 0.10, "y": 0.10, "width": 0.80, "height": 0.30 },
    "capacity": { "line1": 52, "line2": 95 },
    "textColor": "white",
    "watermarkPosition": "lower-right",
    "tier": "high-capacity",
    "credit": "Placeholder / Unsplash"
  },
  {
    "id": "lavender-dawn-07",
    "width": 1080,
    "height": 1080,
    "textZone": { "x": 0.10, "y": 0.55, "width": 0.80, "height": 0.30 },
    "capacity": { "line1": 52, "line2": 95 },
    "textColor": "white",
    "watermarkPosition": "lower-right",
    "tier": "high-capacity",
    "credit": "Placeholder / Unsplash"
  },
  {
    "id": "winter-pines-08",
    "width": 1080,
    "height": 1080,
    "textZone": { "x": 0.10, "y": 0.55, "width": 0.80, "height": 0.30 },
    "capacity": { "line1": 52, "line2": 95 },
    "textColor": "white",
    "watermarkPosition": "lower-left",
    "tier": "high-capacity",
    "credit": "Placeholder / Unsplash"
  },
  {
    "id": "rolling-hills-09",
    "width": 1080,
    "height": 1080,
    "textZone": { "x": 0.10, "y": 0.10, "width": 0.80, "height": 0.30 },
    "capacity": { "line1": 45, "line2": 82 },
    "textColor": "white",
    "watermarkPosition": "lower-right",
    "tier": "standard",
    "credit": "Placeholder / Unsplash"
  },
  {
    "id": "calm-shore-10",
    "width": 1080,
    "height": 1080,
    "textZone": { "x": 0.10, "y": 0.55, "width": 0.80, "height": 0.30 },
    "capacity": { "line1": 42, "line2": 78 },
    "textColor": "white",
    "watermarkPosition": "lower-right",
    "tier": "standard",
    "credit": "Placeholder / Unsplash"
  }
]
```

- [ ] **Step 2: Create tools/lint-photos.ts**

```ts
import photos from '../src/data/photos.json';

const errors: string[] = [];
const ids = new Set<string>();

const ID_PATTERN = /^[a-z]+(-[a-z]+)*-\d{2,}$/;
const VALID_TEXT_COLORS = ['white', 'dark'];
const VALID_WATERMARK_POSITIONS = ['lower-left', 'lower-right', 'upper-left', 'upper-right'];
const VALID_TIERS = ['standard', 'high-capacity'];

for (const p of photos) {
  const prefix = `[${p.id}]`;

  if (!ID_PATTERN.test(p.id)) {
    errors.push(`${prefix} invalid id format — must match ${ID_PATTERN}`);
  }

  if (ids.has(p.id)) {
    errors.push(`${prefix} duplicate id`);
  }
  ids.add(p.id);

  if (typeof p.width !== 'number' || typeof p.height !== 'number') {
    errors.push(`${prefix} width/height must be numbers`);
  }

  const tz = p.textZone;
  if (!tz || tz.x < 0 || tz.y < 0 || tz.width <= 0 || tz.height <= 0) {
    errors.push(`${prefix} textZone values must be positive`);
  }
  if (tz && (tz.x + tz.width > 1.001 || tz.y + tz.height > 1.001)) {
    errors.push(`${prefix} textZone extends past photo boundary`);
  }

  const cap = p.capacity;
  if (!cap || cap.line1 <= 0 || cap.line2 <= 0) {
    errors.push(`${prefix} capacity values must be positive`);
  }

  if (!VALID_TEXT_COLORS.includes(p.textColor)) {
    errors.push(`${prefix} textColor must be 'white' or 'dark'`);
  }

  if (!VALID_WATERMARK_POSITIONS.includes(p.watermarkPosition)) {
    errors.push(`${prefix} invalid watermarkPosition`);
  }

  if (!VALID_TIERS.includes(p.tier)) {
    errors.push(`${prefix} tier must be 'standard' or 'high-capacity'`);
  }

  if (p.tier === 'high-capacity' && (cap.line1 < 60 || cap.line2 < 100)) {
    errors.push(`${prefix} high-capacity photo must have capacity >= 60/100`);
  }

  if (typeof p.credit !== 'string') {
    errors.push(`${prefix} credit must be a string`);
  }
}

const highCapacityCount = photos.filter((p) => p.tier === 'high-capacity').length;
if (highCapacityCount < 8) {
  errors.push(`Library has only ${highCapacityCount} high-capacity photos; need >= 8`);
}

if (errors.length > 0) {
  console.error('photos.json lint errors:');
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}

console.log(`✓ ${photos.length} photos validated (${highCapacityCount} high-capacity)`);
```

- [ ] **Step 3: Run lint to verify**

```bash
npx tsx tools/lint-photos.ts
```

Expected: `✓ 10 photos validated (8 high-capacity)`

- [ ] **Step 4: Commit**

```bash
git add src/data/photos.json tools/lint-photos.ts
git commit -m "feat: add photo metadata with CI lint script"
```

---

## Phase 3: Server Infrastructure

### Task 8: Firebase Admin Setup

**Files:**
- Create: `src/server/firebaseAdmin.ts`

- [ ] **Step 1: Write Firebase Admin initialization**

```ts
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initFirebase() {
  if (getApps().length > 0) return;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

initFirebase();

export const db = getFirestore();
```

- [ ] **Step 2: Commit**

```bash
git add src/server/firebaseAdmin.ts
git commit -m "feat: add Firebase Admin initialization"
```

---

### Task 9: Rate Limiting

**Files:**
- Create: `src/server/rateLimit.ts`
- Create: `tests/server/rateLimit.test.ts`

- [ ] **Step 1: Write rate limit test**

```ts
import { describe, it, expect } from 'vitest';
import { hashIp } from '../src/server/rateLimit';

describe('hashIp', () => {
  it('produces a 32-char hex string', () => {
    const result = hashIp('127.0.0.1');
    expect(result).toMatch(/^[a-f0-9]{32}$/);
  });

  it('produces different hashes for different IPs', () => {
    const a = hashIp('127.0.0.1');
    const b = hashIp('192.168.1.1');
    expect(a).not.toBe(b);
  });

  it('produces consistent output for same input on same day', () => {
    const a = hashIp('127.0.0.1');
    const b = hashIp('127.0.0.1');
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/server/rateLimit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write rate limit implementation**

```ts
import { createHash } from 'crypto';
import { db } from './firebaseAdmin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { RateLimitResult } from '@/types';

const COLLECTION = 'rateLimits';

export function hashIp(rawIp: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const salt = `${process.env.IP_SALT_BASE ?? 'byh-default-salt'}:${date}`;
  return createHash('sha256')
    .update(`${rawIp}:${salt}`)
    .digest('hex')
    .slice(0, 32);
}

export function getClientIp(headers: Record<string, string | undefined>): string {
  return (
    headers['x-nf-client-connection-ip'] ??
    headers['x-forwarded-for']?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export async function checkAndIncrementRateLimit(hashedIp: string): Promise<RateLimitResult> {
  const limit = parseInt(process.env.RATE_LIMIT_PER_HOUR ?? '25', 10);
  const docRef = db.collection(COLLECTION).doc(hashedIp);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const now = Timestamp.now();
    const oneHourMs = 60 * 60 * 1000;

    if (!snap.exists) {
      tx.set(docRef, {
        count: 1,
        windowStart: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + oneHourMs),
      });
      return { allowed: true, remaining: limit - 1 };
    }

    const data = snap.data()!;
    const windowAge = now.toMillis() - data.windowStart.toMillis();

    if (windowAge > oneHourMs) {
      tx.update(docRef, {
        count: 1,
        windowStart: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + oneHourMs),
      });
      return { allowed: true, remaining: limit - 1 };
    }

    if (data.count >= limit) {
      return { allowed: false, retryAfterSec: 60 };
    }

    tx.update(docRef, { count: data.count + 1 });
    return { allowed: true, remaining: limit - data.count - 1 };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/server/rateLimit.test.ts
```

Expected: PASS (hashIp tests pass; transaction tests would need Firebase emulator — unit test the pure functions only).

- [ ] **Step 5: Commit**

```bash
git add src/server/rateLimit.ts tests/server/rateLimit.test.ts
git commit -m "feat: add rate limiting with daily-salted IP hashing"
```

---

### Task 10: Safety Filters

**Files:**
- Create: `src/server/safety.ts`
- Create: `tests/server/safety.test.ts`

- [ ] **Step 1: Write safety filter tests**

```ts
import { describe, it, expect } from 'vitest';
import { checkSlurFilter, checkRealPersonFilter, checkDistressPhraseList } from '../src/server/safety';

describe('checkSlurFilter', () => {
  it('returns false for clean input', () => {
    expect(checkSlurFilter('Monday again')).toBe(false);
  });

  it('allows common profanity', () => {
    expect(checkSlurFilter('this fucking Monday')).toBe(false);
  });
});

describe('checkRealPersonFilter', () => {
  it('returns false for generic input', () => {
    expect(checkRealPersonFilter('my boss is terrible')).toBe(false);
  });

  it('detects possessive + name pattern', () => {
    expect(checkRealPersonFilter('my boss Linda is terrible')).toBe(true);
  });

  it('allows relationship words without names', () => {
    expect(checkRealPersonFilter('my sister drives me crazy')).toBe(false);
  });
});

describe('checkDistressPhraseList', () => {
  it('returns false for casual input', () => {
    expect(checkDistressPhraseList('everything is fine')).toBe(false);
  });

  it('detects crisis phrases', () => {
    expect(checkDistressPhraseList('I want to end it all')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(checkDistressPhraseList('I WANT TO END IT ALL')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/server/safety.test.ts
```

- [ ] **Step 3: Write safety filters implementation**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { distressPhrases } from './distress-phrases';
import { slurList } from './slur-list';

export function checkSlurFilter(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return slurList.some((slur) => {
    const pattern = new RegExp(`\\b${escapeRegex(slur)}\\b`, 'i');
    return pattern.test(normalized);
  });
}

const RELATIONSHIP_WORDS = [
  'boss', 'sister', 'brother', 'mom', 'dad', 'wife', 'husband',
  'partner', 'ex', 'girlfriend', 'boyfriend', 'coworker', 'teacher',
  'friend', 'neighbor', 'landlord', 'therapist', 'roommate',
];

const POSSESSIVE_NAME_PATTERN = new RegExp(
  `my\\s+(${RELATIONSHIP_WORDS.join('|')})\\s+([A-Z][a-z]+)`,
  'i'
);

const PUBLIC_FIGURES: string[] = [
  // Populate with ~100 high-profile names before launch.
  // Word-boundary matching applied.
];

export function checkRealPersonFilter(prompt: string): boolean {
  if (POSSESSIVE_NAME_PATTERN.test(prompt)) return true;

  const normalized = prompt.toLowerCase();
  return PUBLIC_FIGURES.some((name) => {
    const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
    return pattern.test(normalized);
  });
}

export function checkDistressPhraseList(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return distressPhrases.some((phrase) => normalized.includes(phrase.toLowerCase()));
}

const DISTRESS_CHECK_PROMPT = `You are evaluating a single short text input from a user of a comedy poster generator. The product helps people laugh at bad days. We need to know if the input shows signs that the person is in genuine crisis or expressing intent to harm themselves — in which case the product should NOT generate a poster and should instead show them a support resource.

Return EXACTLY one of:

- "crisis" — the input expresses a clear intent to harm oneself, active suicidal ideation, or an immediate, severe crisis. Err on the side of "crisis" if there is genuine ambiguity around safety.

- "ok" — the input is a normal bad-day situation, even if it uses dramatic, emphatic, or hyperbolic language ("I want to die from embarrassment", "this is killing me", "I'm dying", etc.). Hyperbole about everyday frustrations is not crisis.

Return only the single word. No explanation, no other text.`;

export async function checkDistressWithHaiku(
  anthropic: Anthropic,
  prompt: string
): Promise<boolean> {
  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL_SAFETY ?? 'claude-haiku-4-5',
      max_tokens: 10,
      temperature: 0,
      system: DISTRESS_CHECK_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const verdict = response.content[0].type === 'text'
      ? response.content[0].text.trim().toLowerCase()
      : 'ok';

    return verdict.startsWith('crisis');
  } catch {
    // Fail open — generate poster anyway, log event
    console.error(JSON.stringify({ event: 'distress_check_failed' }));
    return false;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/server/safety.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/safety.ts tests/server/safety.test.ts
git commit -m "feat: add safety filters — distress, slur, real-person"
```

---

### Task 11: Anthropic Client & Generation

**Files:**
- Create: `src/server/anthropic.ts`

- [ ] **Step 1: Write Anthropic client with system prompt**

```ts
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const VOICE_SYSTEM_PROMPT = `You are the voice behind Bless Your Heart, a poster generator that produces two-line anti-affirmations. Your output runs on a scenic landscape photo styled like a Pinterest wellness poster.

OUTPUT CONTRACT
You produce exactly two lines:

LINE 1: Sincere, reverent, wellness-influencer voice. The kind of line that could appear unironically on a real motivational poster. Sets up the visual fiction. 30–50 characters. Hard maximum 60.

LINE 2: A savagely honest pivot that lands the joke by referencing the specific situation the user described. Dry, deadpan, true. 50–88 characters. Hard maximum 100.

VOICE RULES (non-negotiable)

1. Line 2 points at the SITUATION, the universal human pattern, or the ABSURDITY of the moment. Never at the user as a person — not their worth, intelligence, appearance, choices, body, or anything they cannot change.

2. The voice is "a friend who has given up pretending to be encouraging." Not mean. Not therapeutic. Not coaching. Loving in a resigned way.

3. Specificity is the whole game. If the user mentions "third coffee," line 2 must reference caffeine or mornings or escalation. If they mention "my sister's wedding," line 2 must touch weddings, family events, or that dynamic. Generic disappointment ("life is hard") fails the brief.

4. No exclamation points. No emojis. No "lol" or "haha." No moralizing ("you should," "try to," "remember"). No naming real people or brands. No politics.

5. Line 1 stays sincere. It does not wink. The trap only snaps shut on line 2.

OFF-TOPIC INPUTS

If the user types something that isn't a feeling or bad-day situation — a factual question ("capital of France"), an explainer request ("explain quantum physics"), gibberish ("asdf"), a single greeting ("hello") — DO NOT refuse. The format never breaks. Line 1 stays reverent on whatever theme the input suggests; line 2 pivots onto the meta-absurdity of having typed that into this app.

Examples:
- "capital of France"
  Line 1: The world contains many beautiful cities.
  Line 2: Paris isn't taking your call right now either.
- "asdf"
  Line 1: Some moments arrive without language.
  Line 2: Even the keyboard has given up.
- "explain quantum physics"
  Line 1: The universe holds mysteries beyond our grasp.
  Line 2: Superposition will not help with the laundry.

OUTPUT FORMAT

Return ONLY a JSON object. No prose, no preamble, no code fences.

{
  "line1": "...",
  "line2": "..."
}

Do not include any other fields. Do not explain your reasoning. Do not apologize. Do not warn about content. Just the object.`;

export async function generateLines(
  anthropic: Anthropic,
  prompt: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL_GEN ?? 'claude-sonnet-4-6',
    max_tokens: 200,
    temperature: 0.9,
    system: VOICE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

const TONE_CHECK_PROMPT = `You evaluate whether a line of text punches at the person who asked, or punches at the situation/universal pattern/absurdity.

The line is part of a comedy product where the joke is supposed to land on the SITUATION the user described, not on the user themselves.

PUNCHES AT THE USER (return "user"):
- Targets the user's worth, intelligence, body, appearance, life choices
- Implies the user is a failure as a person
- Implies the user deserves their bad situation
- Insults the user directly

PUNCHES AT SITUATION (return "safe"):
- Comments on the universal experience the user described
- Notes the absurdity or futility of the moment
- Resigned commentary on life, time, work, etc.
- Could be said by a friend who has given up pretending to be encouraging

Return EXACTLY one word: "safe" or "user". Nothing else.`;

export async function checkTone(
  anthropic: Anthropic,
  prompt: string,
  line2: string
): Promise<boolean> {
  if (process.env.ENABLE_TONE_CHECK === 'false') return true;

  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL_SAFETY ?? 'claude-haiku-4-5',
      max_tokens: 10,
      temperature: 0,
      system: TONE_CHECK_PROMPT,
      messages: [{
        role: 'user',
        content: `User input: "${prompt}"\nGenerated line 2: "${line2}"`,
      }],
    });

    const verdict = response.content[0].type === 'text'
      ? response.content[0].text.trim().toLowerCase()
      : 'safe';

    return verdict.startsWith('safe');
  } catch {
    console.error(JSON.stringify({ event: 'tone_check_failed' }));
    return true;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/anthropic.ts
git commit -m "feat: add Anthropic client with voice system prompt and tone check"
```

---

### Task 12: Output Validation

**Files:**
- Create: `src/server/validation.ts`
- Create: `tests/server/validation.test.ts`

- [ ] **Step 1: Write validation tests**

```ts
import { describe, it, expect } from 'vitest';
import { parseGenerationOutput, checkSpecificity } from '../src/server/validation';

describe('parseGenerationOutput', () => {
  it('parses valid JSON output', () => {
    const result = parseGenerationOutput('{"line1":"Hello world","line2":"Goodbye cruel world and everything in it"}');
    expect(result).toEqual({ line1: 'Hello world', line2: 'Goodbye cruel world and everything in it' });
  });

  it('strips markdown code fences', () => {
    const result = parseGenerationOutput('```json\n{"line1":"A","line2":"B is longer than you think it would be"}\n```');
    expect(result).toEqual({ line1: 'A', line2: 'B is longer than you think it would be' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseGenerationOutput('not json')).toBeNull();
  });

  it('returns null when line1 exceeds 60 chars', () => {
    const long = 'a'.repeat(61);
    expect(parseGenerationOutput(`{"line1":"${long}","line2":"short enough for line two easily"}`)).toBeNull();
  });

  it('returns null when line2 exceeds 100 chars', () => {
    const long = 'a'.repeat(101);
    expect(parseGenerationOutput(`{"line1":"short","line2":"${long}"}`)).toBeNull();
  });

  it('returns null for extra fields', () => {
    expect(parseGenerationOutput('{"line1":"a","line2":"b is long enough now","extra":"field"}')).toBeNull();
  });
});

describe('checkSpecificity', () => {
  it('passes when prompt words appear in line2', () => {
    expect(checkSpecificity("haven't started yet", 'The starting line moved again.')).toBe(true);
  });

  it('fails when line2 is completely generic', () => {
    expect(checkSpecificity("haven't started yet", 'Life is hard and then you die.')).toBe(false);
  });

  it('gives free pass to single-word prompts', () => {
    expect(checkSpecificity('work', 'Life is hard and then you die.')).toBe(true);
  });

  it('passes via synonym map', () => {
    expect(checkSpecificity('Monday again', 'The week loops without consent.')).toBe(true);
  });

  it('bypasses for question-mark prompts', () => {
    expect(checkSpecificity('what is love?', 'Totally unrelated output here.')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npx vitest run tests/server/validation.test.ts
```

- [ ] **Step 3: Write validation implementation**

```ts
import { z } from 'zod';
import type { GenerationOutput } from '@/types';
import { checkSynonymMap } from './synonyms';

const GenerationSchema = z.object({
  line1: z.string().trim().min(1).max(60),
  line2: z.string().trim().min(1).max(100),
}).strict();

export function parseGenerationOutput(raw: string): GenerationOutput | null {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const result = GenerationSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}

const STOPWORDS = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
  'the', 'a', 'an', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither',
  'that', 'which', 'who', 'whom', 'this', 'these', 'those', 'what', 'when',
  'where', 'how', 'all', 'each', 'every', 'no', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'than', 'too', 'very', 'just', 'about', 'again',
  'also', 'back', 'even', 'still', 'then', 'there', 'here', 'now', 'up',
  'going', 'really', 'much', 'one', 'two', 'get', 'got', 'like', 'know',
  'think', 'make', 'go', 'see', 'come', 'take', 'want', 'look', 'give',
  'been', "don't", "can't", "won't", "didn't", "isn't", "it's", "i'm",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s'-]/g, '').split(/\s+/).filter(Boolean);
}

function stem(word: string): string {
  return word
    .replace(/ing$/, '')
    .replace(/ed$/, '')
    .replace(/ly$/, '')
    .replace(/s$/, '');
}

function isOffTopic(prompt: string): boolean {
  if (prompt.includes('?')) return true;
  const tokens = tokenize(prompt).filter((t) => !STOPWORDS.has(t) && t.length > 2);
  if (tokens.length === 0) return true;
  const letterRatio = (prompt.replace(/[^a-zA-Z]/g, '').length) / Math.max(prompt.length, 1);
  if (letterRatio < 0.3) return true;
  return false;
}

export function checkSpecificity(prompt: string, line2: string): boolean {
  if (isOffTopic(prompt)) return true;

  const promptTokens = tokenize(prompt);
  const line2Tokens = tokenize(line2);
  const contentWords = promptTokens.filter((t) => !STOPWORDS.has(t) && t.length > 2);

  if (contentWords.length === 0) return true;

  const directOverlap = contentWords.some(
    (w) => line2Tokens.includes(w) || line2Tokens.includes(stem(w)) ||
           line2Tokens.some((lt) => stem(lt) === stem(w))
  );

  if (directOverlap) return true;

  return checkSynonymMap(contentWords, line2Tokens);
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/server/validation.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/validation.ts tests/server/validation.test.ts
git commit -m "feat: add output validation — Zod schema, specificity check"
```

---

### Task 13: Photo Selection

**Files:**
- Create: `src/server/photoSelection.ts`
- Create: `tests/server/photoSelection.test.ts`

- [ ] **Step 1: Write photo selection tests**

```ts
import { describe, it, expect } from 'vitest';
import { selectPhoto } from '../src/server/photoSelection';
import type { Photo } from '../src/types';

const mockPhotos: Photo[] = [
  { id: 'a-01', width: 1080, height: 1080, textZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 }, capacity: { line1: 40, line2: 80 }, textColor: 'white', watermarkPosition: 'lower-right', tier: 'standard', credit: '' },
  { id: 'b-02', width: 1080, height: 1080, textZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 }, capacity: { line1: 60, line2: 100 }, textColor: 'white', watermarkPosition: 'lower-right', tier: 'high-capacity', credit: '' },
  { id: 'c-03', width: 1080, height: 1080, textZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 }, capacity: { line1: 55, line2: 95 }, textColor: 'white', watermarkPosition: 'lower-right', tier: 'high-capacity', credit: '' },
];

describe('selectPhoto', () => {
  it('selects from eligible standard photos', () => {
    const result = selectPhoto(mockPhotos, 30, 70, []);
    expect(result).not.toBeNull();
  });

  it('excludes photos in excludeIds', () => {
    const result = selectPhoto(mockPhotos, 30, 70, ['a-01', 'b-02', 'c-03']);
    expect(result).not.toBeNull();
    expect(result!.rung).toBe(3);
  });

  it('falls back to high-capacity when standard cannot fit', () => {
    const result = selectPhoto(mockPhotos, 50, 90, []);
    expect(result).not.toBeNull();
    expect(['b-02', 'c-03']).toContain(result!.photoId);
  });

  it('returns null only when impossible', () => {
    const tiny: Photo[] = [
      { id: 'x-01', width: 1080, height: 1080, textZone: { x: 0.1, y: 0.5, width: 0.8, height: 0.3 }, capacity: { line1: 10, line2: 10 }, textColor: 'white', watermarkPosition: 'lower-right', tier: 'standard', credit: '' },
    ];
    const result = selectPhoto(tiny, 50, 90, []);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npx vitest run tests/server/photoSelection.test.ts
```

- [ ] **Step 3: Write photo selection implementation**

```ts
import type { Photo } from '@/types';

interface PhotoSelectionResult {
  photoId: string;
  rung: 1 | 2 | 3;
}

export function selectPhoto(
  photos: Photo[],
  line1Length: number,
  line2Length: number,
  excludeIds: string[]
): PhotoSelectionResult | null {
  // Rung 1: standard selection from eligible photos
  const eligible = photos.filter(
    (p) =>
      p.capacity.line1 >= line1Length &&
      p.capacity.line2 >= line2Length &&
      !excludeIds.includes(p.id)
  );

  if (eligible.length > 0) {
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    return { photoId: pick.id, rung: 1 };
  }

  // Rung 2: high-capacity fallback, respecting excludes
  const highCap = photos.filter(
    (p) => p.tier === 'high-capacity' && !excludeIds.includes(p.id)
  );

  if (highCap.length > 0) {
    const pick = highCap[Math.floor(Math.random() * highCap.length)];
    return { photoId: pick.id, rung: 2 };
  }

  // Rung 3: high-capacity ignoring excludes (session cycled through all)
  const allHighCap = photos.filter((p) => p.tier === 'high-capacity');

  if (allHighCap.length > 0) {
    const pick = allHighCap[Math.floor(Math.random() * allHighCap.length)];
    return { photoId: pick.id, rung: 3 };
  }

  return null;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/server/photoSelection.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/photoSelection.ts tests/server/photoSelection.test.ts
git commit -m "feat: add photo selection with fallback ladder"
```

---

### Task 14: Generate Function (Orchestration)

**Files:**
- Create: `netlify/functions/generate.ts`
- Create: `firestore.rules`
- Create: `storage.rules`

- [ ] **Step 1: Write the generate function**

```ts
import type { Handler, HandlerEvent } from '@netlify/functions';
import { z } from 'zod';
import { getAnthropicClient, generateLines, checkTone } from '../../src/server/anthropic';
import { db } from '../../src/server/firebaseAdmin';
import { hashIp, getClientIp, checkAndIncrementRateLimit } from '../../src/server/rateLimit';
import { checkSlurFilter, checkRealPersonFilter, checkDistressPhraseList, checkDistressWithHaiku } from '../../src/server/safety';
import { parseGenerationOutput, checkSpecificity } from '../../src/server/validation';
import { selectPhoto } from '../../src/server/photoSelection';
import { getHotlineForCountry } from '../../src/server/hotlines';
import { safeFallbacks } from '../../src/server/fallbacks';
import photos from '../../src/data/photos.json';
import type { Photo, GenerateResponse } from '../../src/types';

const RequestSchema = z.object({
  prompt: z.string().trim().min(1).max(200),
  excludePhotoIds: z.array(z.string()).default([]),
});

const typedPhotos = photos as Photo[];
const anthropic = getAnthropicClient();

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function jsonResponse(body: GenerateResponse, statusCode = 200) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function normalizePrompt(raw: string): string {
  return raw.trim().replace(/\n/g, ' ').replace(/\s{2,}/g, ' ');
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // 1. Parse + validate
  let parsed;
  try {
    parsed = RequestSchema.parse(JSON.parse(event.body ?? '{}'));
  } catch {
    return jsonResponse(
      { status: 'error', message: 'Invalid request.', retryable: false },
      400
    );
  }

  const prompt = normalizePrompt(parsed.prompt);
  const { excludePhotoIds } = parsed;

  // 2. Resolve client IP
  const rawIp = getClientIp(event.headers);
  const hashedIp = hashIp(rawIp);

  // 3. Rate-limit check (skip in dev)
  if (process.env.NODE_ENV === 'production' || process.env.RATE_LIMIT_PER_HOUR !== '9999') {
    try {
      const rateResult = await checkAndIncrementRateLimit(hashedIp);
      if (!rateResult.allowed) {
        console.log(JSON.stringify({ event: 'gen_rate_limited', hashedIp }));
        return jsonResponse({
          status: 'rate_limited',
          message: 'Even the universe has a daily limit. Try again in a bit.',
        });
      }
    } catch (err) {
      console.error(JSON.stringify({ event: 'rate_limit_check_failed', error: String(err) }));
      // Fail open
    }
  }

  // 4. Slur filter
  if (checkSlurFilter(prompt)) {
    console.log(JSON.stringify({ event: 'gen_block', reason: 'slur' }));
    return jsonResponse({ status: 'blocked', message: "Let's try a different one." });
  }

  // 5. Real-person filter
  if (checkRealPersonFilter(prompt)) {
    console.log(JSON.stringify({ event: 'gen_block', reason: 'real-person' }));
    return jsonResponse({
      status: 'blocked',
      message: "The voice doesn't punch at people. Try a situation instead.",
    });
  }

  // 6. Distress check
  const distressPhrase = checkDistressPhraseList(prompt);
  const distressHaiku = distressPhrase ? true : await checkDistressWithHaiku(anthropic, prompt);

  if (distressPhrase || distressHaiku) {
    console.log(JSON.stringify({ event: 'gen_distress' }));
    const country = (event.headers['x-country'] ?? '').toUpperCase();
    return jsonResponse({
      status: 'distress',
      hotline: getHotlineForCountry(country),
    });
  }

  // 7. Generation loop with retries
  const MAX_RETRIES = 2;
  let lastOutput = null;
  let retries = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await generateLines(anthropic, prompt);
      const output = parseGenerationOutput(raw);

      if (!output) {
        console.log(JSON.stringify({ event: 'gen_retry', reason: 'format' }));
        retries++;
        continue;
      }

      if (!checkSpecificity(prompt, output.line2)) {
        console.log(JSON.stringify({ event: 'gen_retry', reason: 'specificity' }));
        retries++;
        continue;
      }

      const tonePassed = await checkTone(anthropic, prompt, output.line2);
      if (!tonePassed) {
        console.log(JSON.stringify({ event: 'gen_retry', reason: 'tone' }));
        retries++;
        continue;
      }

      lastOutput = output;
      break;
    } catch (err) {
      console.error(JSON.stringify({ event: 'gen_anthropic_error', error: String(err) }));
      retries++;
    }
  }

  // 8. If all retries failed, use safe fallback
  if (!lastOutput) {
    console.log(JSON.stringify({ event: 'gen_safe_fallback' }));
    const fallback = safeFallbacks[Math.floor(Math.random() * safeFallbacks.length)];
    return jsonResponse({
      status: 'safe_fallback',
      line1: fallback.line1,
      line2: fallback.line2,
      photoId: fallback.photoId,
    });
  }

  // 9. Photo selection
  const photoResult = selectPhoto(
    typedPhotos,
    lastOutput.line1.length,
    lastOutput.line2.length,
    excludePhotoIds
  );

  if (!photoResult) {
    console.log(JSON.stringify({ event: 'gen_safe_fallback' }));
    const fallback = safeFallbacks[Math.floor(Math.random() * safeFallbacks.length)];
    return jsonResponse({
      status: 'safe_fallback',
      line1: fallback.line1,
      line2: fallback.line2,
      photoId: fallback.photoId,
    });
  }

  // 10. Success
  const fittingRung = photoResult.rung === 3 ? 3 : photoResult.rung;
  console.log(JSON.stringify({
    event: 'gen_ok',
    fittingRung,
    retries,
    model: process.env.ANTHROPIC_MODEL_GEN,
  }));

  return jsonResponse({
    status: 'ok',
    line1: lastOutput.line1,
    line2: lastOutput.line2,
    photoId: photoResult.photoId,
    fittingRung: fittingRung as 1 | 2 | 3 | 4,
  });
};

export { handler };
```

- [ ] **Step 2: Create firestore.rules**

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

- [ ] **Step 3: Create storage.rules**

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

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/generate.ts firestore.rules storage.rules
git commit -m "feat: implement generate function — full orchestration pipeline"
```

---

## Phase 4: Client Libraries

### Task 15: Font Loading

**Files:**
- Create: `src/lib/fonts.ts`

- [ ] **Step 1: Write font loading utility**

```ts
let fontsReadyPromise: Promise<void> | null = null;

export function ensureFontsReady(): Promise<void> {
  if (fontsReadyPromise) return fontsReadyPromise;

  fontsReadyPromise = (async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('500 64px "Cormorant Garamond"'),
      document.fonts.load('italic 400 44px "Cormorant Garamond"'),
      document.fonts.load('400 18px "Cormorant Garamond"'),
    ]);
  })();

  return fontsReadyPromise;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/fonts.ts
git commit -m "feat: add font loading utility"
```

---

### Task 16: API Client

**Files:**
- Create: `src/lib/api.ts`

- [ ] **Step 1: Write API client**

```ts
import type { GenerateRequest, GenerateResponse } from '@/types';
import { errorCopy } from '@/content/copy';

export async function callGenerate(
  prompt: string,
  excludePhotoIds: string[]
): Promise<GenerateResponse> {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, excludePhotoIds } satisfies GenerateRequest),
    });

    if (!response.ok) {
      if (response.status >= 500) {
        return { status: 'error', message: errorCopy.generation.anthropicError, retryable: true };
      }
      return { status: 'error', message: errorCopy.generation.unknown, retryable: true };
    }

    return (await response.json()) as GenerateResponse;
  } catch {
    if (!navigator.onLine) {
      return { status: 'error', message: errorCopy.generation.networkOffline, retryable: true };
    }
    return { status: 'error', message: errorCopy.generation.unknown, retryable: true };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add API client with error mapping"
```

---

### Task 17: Compositor Engine

**Files:**
- Create: `src/lib/compositor.ts`
- Create: `src/lib/photos.ts`

- [ ] **Step 1: Write photo URL helper**

```ts
import photosData from '@/data/photos.json';
import type { Photo } from '@/types';

const photos = photosData as Photo[];

export function getPhotoUrl(photoId: string): string {
  const base = import.meta.env.VITE_FIREBASE_STORAGE_BASE_URL ?? '';
  return `${base}/photos/${photoId}.jpg`;
}

export function getPhotoById(photoId: string): Photo | undefined {
  return photos.find((p) => p.id === photoId);
}

export function getAllCredits(): { id: string; credit: string }[] {
  return photos
    .filter((p) => p.credit.length > 0)
    .map((p) => ({ id: p.id, credit: p.credit }));
}
```

- [ ] **Step 2: Write compositor**

```ts
import type { Photo } from '@/types';
import { ensureFontsReady } from './fonts';

const LOGICAL_SIZE = 1080;
const PADDING = 24;

export async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  return img;
}

export interface CompositeOptions {
  canvas: HTMLCanvasElement;
  img: HTMLImageElement;
  photo: Photo;
  line1: string;
  line2: string;
  scale?: number;
}

export function setupCanvas(canvas: HTMLCanvasElement, displaySize: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = LOGICAL_SIZE * dpr;
  canvas.height = LOGICAL_SIZE * dpr;
  canvas.style.width = `${displaySize}px`;
  canvas.style.height = `${displaySize}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

export function composite({ canvas, img, photo, line1, line2, scale = 1 }: CompositeOptions): void {
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 1. Clear
  ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

  // 2. Draw photo
  ctx.drawImage(img, 0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

  // 3. Text color
  const fillColor = photo.textColor === 'white' ? '#FFFFFF' : '#1A1612';
  ctx.fillStyle = fillColor;

  // Zone in pixels
  const zoneX = photo.textZone.x * LOGICAL_SIZE;
  const zoneY = photo.textZone.y * LOGICAL_SIZE;
  const zoneW = photo.textZone.width * LOGICAL_SIZE;
  const centerX = zoneX + zoneW / 2;

  // 4. Line 1
  const line1Size = Math.round(64 * scale);
  ctx.font = `500 ${line1Size}px "Cormorant Garamond"`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.02em';
  }
  const line1Y = zoneY + PADDING;
  ctx.fillText(line1, centerX, line1Y);

  // 5. Line 2
  const line2Size = Math.round(44 * scale);
  ctx.font = `italic 400 ${line2Size}px "Cormorant Garamond"`;
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.01em';
  }
  const line2Y = line1Y + line1Size * 1.15 + 16;
  ctx.fillText(line2, centerX, line2Y);

  // 6. Watermark
  drawWatermark(ctx, photo);

  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, photo: Photo): void {
  const text = 'Bless Your Heart';
  const padding = 32;

  ctx.font = '400 18px "Cormorant Garamond"';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.04em';
  }
  ctx.fillStyle = photo.textColor === 'white' ? '#FFFFFF' : '#1A1612';
  ctx.globalAlpha = 0.85;

  switch (photo.watermarkPosition) {
    case 'lower-left':
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, padding, LOGICAL_SIZE - padding);
      break;
    case 'lower-right':
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, LOGICAL_SIZE - padding, LOGICAL_SIZE - padding);
      break;
    case 'upper-left':
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(text, padding, padding);
      break;
    case 'upper-right':
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(text, LOGICAL_SIZE - padding, padding);
      break;
  }

  ctx.globalAlpha = 1.0;
}

export interface FitCheckResult {
  ok: true;
  scale: number;
} | {
  ok: false;
  reason: 'overflow';
}

export async function checkFit(
  line1: string,
  line2: string,
  photo: Photo
): Promise<FitCheckResult> {
  await ensureFontsReady();

  const offscreen = document.createElement('canvas');
  const ctx = offscreen.getContext('2d')!;

  const usable = photo.textZone.width * LOGICAL_SIZE - 2 * PADDING;

  // Measure line 1
  ctx.font = '500 64px "Cormorant Garamond"';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.02em';
  }
  const line1Width = ctx.measureText(line1).width;

  // Measure line 2
  ctx.font = 'italic 400 44px "Cormorant Garamond"';
  if ('letterSpacing' in ctx) {
    (ctx as any).letterSpacing = '0.01em';
  }
  const line2Width = ctx.measureText(line2).width;

  const line1Scale = line1Width <= usable ? 1 : usable / line1Width;
  const line2Scale = line2Width <= usable ? 1 : usable / line2Width;
  const minScale = Math.min(line1Scale, line2Scale);

  if (minScale >= 0.95) {
    return { ok: true, scale: minScale };
  }

  return { ok: false, reason: 'overflow' };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/compositor.ts src/lib/photos.ts
git commit -m "feat: add Canvas compositor with watermark and fit checking"
```

---

### Task 18: Download Utility

**Files:**
- Create: `src/lib/download.ts`

- [ ] **Step 1: Write download utility**

```ts
import { saveAs } from 'file-saver';

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(ad|hone|od)/.test(navigator.userAgent) &&
    /Safari/.test(navigator.userAgent) &&
    !/CriOS|FxiOS/.test(navigator.userAgent)
  );
}

export async function downloadPoster(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );

    if (!blob) return false;

    const filename = `bless-your-heart-${shortId()}.png`;
    saveAs(blob, filename);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/download.ts
git commit -m "feat: add PNG download utility with iOS Safari handling"
```

---

## Phase 5: UI Components

### Task 19: Header & Footer

**Files:**
- Create: `src/components/Header.tsx`
- Create: `src/components/Footer.tsx`
- Create: `src/components/CreditsDialog.tsx`

- [ ] **Step 1: Create Header**

```tsx
export function Header() {
  return (
    <header className="py-6 text-center">
      <a href="/" className="font-serif text-headline italic text-ink-deep hover:text-accent-sage transition-colors">
        Bless Your Heart
      </a>
    </header>
  );
}
```

- [ ] **Step 2: Create CreditsDialog**

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { getAllCredits } from '@/lib/photos';

export function CreditsDialog() {
  const credits = getAllCredits();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-accent-sage hover:underline">see credits</button>
      </DialogTrigger>
      <DialogContent className="bg-paper border-border-mist max-h-[60vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-headline text-ink-deep">Photo Credits</DialogTitle>
        </DialogHeader>
        <ul className="space-y-1 text-caption text-ink-soft">
          {credits.map(({ id, credit }) => (
            <li key={id}>{credit}</li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create Footer**

```tsx
import { CreditsDialog } from './CreditsDialog';

export function Footer() {
  return (
    <footer className="bg-paper py-8 mt-section text-center text-caption text-ink-faint space-y-2">
      <p className="italic">Bless Your Heart · made with affection and resignation</p>
      <p>
        A comedy product, not therapy. If you're in crisis, please reach out:{' '}
        <a href="tel:988" className="text-accent-sage hover:underline">988</a> (US) ·{' '}
        <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer" className="text-accent-sage hover:underline">
          findahelpline.com
        </a>{' '}
        (worldwide)
      </p>
      <p>
        Photos: <CreditsDialog /> · This site uses anonymous analytics
      </p>
    </footer>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.tsx src/components/Footer.tsx src/components/CreditsDialog.tsx
git commit -m "feat: add Header, Footer, and CreditsDialog components"
```

---

### Task 20: Hero Examples

**Files:**
- Create: `src/components/HeroExamples.tsx`

- [ ] **Step 1: Create HeroExamples component**

Hero examples are pre-rendered PNGs in `public/examples/`. Until real ones are created, this component handles the layout and will render once images exist.

```tsx
import { useState, useEffect } from 'react';

const EXAMPLES = [
  '/examples/hero-1.png',
  '/examples/hero-2.png',
  '/examples/hero-3.png',
];

export function HeroExamples() {
  const [mobileIndex] = useState(() => Math.floor(Math.random() * EXAMPLES.length));

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Desktop: 3 examples */}
      <div className="hidden lg:grid grid-cols-3 gap-4">
        {EXAMPLES.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            loading="eager"
            fetchPriority="high"
            className="w-full aspect-square rounded-xl object-cover"
          />
        ))}
      </div>
      {/* Mobile: 1 example */}
      <div className="lg:hidden flex justify-center">
        <img
          src={EXAMPLES[mobileIndex]}
          alt=""
          loading="eager"
          fetchPriority="high"
          className="w-[280px] aspect-square rounded-xl object-cover"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/HeroExamples.tsx
git commit -m "feat: add HeroExamples component"
```

---

### Task 21: Prompt Input & Presets

**Files:**
- Create: `src/components/PromptInput.tsx`
- Create: `src/components/PresetButtons.tsx`
- Create: `src/components/GenerateButton.tsx`

- [ ] **Step 1: Create PromptInput**

```tsx
import { useEffect, useRef, useState } from 'react';
import { placeholders } from '@/content/placeholders';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const SESSION_KEY = 'byh:lastPrompt';

export function PromptInput({ value, onChange, disabled }: PromptInputProps) {
  const [placeholder] = useState(() => placeholders[Math.floor(Math.random() * placeholders.length)]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved && !value) onChange(saved);
  }, []);

  function handleChange(newValue: string) {
    const cleaned = newValue.replace(/\n/g, '');
    onChange(cleaned);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, cleaned);
    }, 300);
  }

  const showCounter = value.length >= 180;

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <label htmlFor="prompt-input" className="sr-only">What's going on?</label>
      <input
        ref={inputRef}
        id="prompt-input"
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        maxLength={200}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        className="w-full bg-paper text-ink-deep placeholder:text-ink-faint placeholder:italic font-serif text-body-lg px-5 py-4 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-accent-sage/50 transition-shadow"
      />
      {showCounter && (
        <span className="absolute right-4 bottom-2 text-caption text-feedback-quiet">
          {value.length} / 200
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create PresetButtons**

```tsx
import { Button } from '@/components/ui/button';
import { presets } from '@/content/presets';

interface PresetButtonsProps {
  selected: string | null;
  onSelect: (preset: string) => void;
  disabled?: boolean;
}

export function PresetButtons({ selected, onSelect, disabled }: PresetButtonsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory py-2 px-1 scrollbar-none max-w-lg mx-auto">
      {presets.map((preset) => (
        <Button
          key={preset}
          variant="preset"
          size="sm"
          disabled={disabled}
          data-selected={selected === preset}
          onClick={() => onSelect(preset)}
          aria-pressed={selected === preset}
          className="snap-start shrink-0"
        >
          {preset}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create GenerateButton**

```tsx
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

interface GenerateButtonProps {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}

export function GenerateButton({ loading, disabled, onClick }: GenerateButtonProps) {
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      disabled={disabled || loading}
      onClick={onClick}
      className="min-w-[160px]"
    >
      {loading ? null : <Sparkles className="w-4 h-4" />}
      {loading ? '' : 'Generate'}
    </Button>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/PromptInput.tsx src/components/PresetButtons.tsx src/components/GenerateButton.tsx
git commit -m "feat: add PromptInput, PresetButtons, and GenerateButton"
```

---

### Task 22: Poster Canvas & Reveal

**Files:**
- Create: `src/components/PosterCanvas.tsx`
- Create: `src/components/PosterReveal.tsx`

- [ ] **Step 1: Create PosterCanvas**

```tsx
import { useRef, useEffect, useState } from 'react';
import { composite, loadImage, setupCanvas, checkFit } from '@/lib/compositor';
import { getPhotoUrl, getPhotoById } from '@/lib/photos';
import { ensureFontsReady } from '@/lib/fonts';

interface PosterCanvasProps {
  line1: string;
  line2: string;
  photoId: string;
  onFitFailure?: () => void;
  onReady?: () => void;
}

export function PosterCanvas({ line1, line2, photoId, onFitFailure, onReady }: PosterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displaySize, setDisplaySize] = useState(360);

  useEffect(() => {
    function updateSize() {
      const w = window.innerWidth;
      if (w < 640) setDisplaySize(Math.min(w - 32, 360));
      else if (w < 1024) setDisplaySize(480);
      else setDisplaySize(540);
    }
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const photo = getPhotoById(photoId);
      if (!photo) return;

      await ensureFontsReady();
      const img = await loadImage(getPhotoUrl(photoId));
      if (cancelled) return;

      const fit = await checkFit(line1, line2, photo);
      if (!fit.ok) {
        onFitFailure?.();
        return;
      }

      setupCanvas(canvas, displaySize);
      composite({ canvas, img, photo, line1, line2, scale: fit.scale });
      onReady?.();
    })();

    return () => { cancelled = true; };
  }, [line1, line2, photoId, displaySize]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Poster reading: ${line1}. ${line2}`}
      className="rounded-xl shadow-lg mx-auto block"
      style={{ width: displaySize, height: displaySize }}
    />
  );
}
```

- [ ] **Step 2: Create PosterReveal**

```tsx
import { useState, useRef, useEffect } from 'react';
import { PosterCanvas } from './PosterCanvas';
import { DownloadButton } from './DownloadButton';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { loadingPhrases } from '@/content/copy';
import type { PosterPhase } from '@/types';

interface PosterRevealProps {
  state: PosterPhase;
  onRegenerate: () => void;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export function PosterReveal({ state, onRegenerate, canvasRef }: PosterRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    if (state.phase === 'settled' && canvasReady) {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [state.phase, canvasReady]);

  if (state.phase === 'idle') return null;

  return (
    <div ref={containerRef} className="w-full max-w-xl mx-auto mt-breathe space-y-4">
      {state.phase === 'loading' && (
        <div className="text-center py-12">
          <p className="font-serif italic text-body-lg text-ink-soft animate-pulse-opacity">
            {state.phrase}
          </p>
        </div>
      )}

      {state.phase === 'settled' && (
        <div className="space-y-4 animate-in fade-in duration-reveal">
          <PosterCanvas
            line1={state.line1}
            line2={state.line2}
            photoId={state.photoId}
            onReady={() => setCanvasReady(true)}
          />
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={onRegenerate}>
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </Button>
            <DownloadButton />
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="text-center py-12 space-y-4">
          <p className="font-serif italic text-body text-feedback-quiet">{state.message}</p>
          {state.retryable && (
            <Button variant="secondary" onClick={onRegenerate}>
              Try Again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/PosterCanvas.tsx src/components/PosterReveal.tsx
git commit -m "feat: add PosterCanvas and PosterReveal with loading/reveal states"
```

---

### Task 23: Download Button & Distress Interstitial

**Files:**
- Create: `src/components/DownloadButton.tsx`
- Create: `src/components/DistressInterstitial.tsx`

- [ ] **Step 1: Create DownloadButton**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { downloadPoster, isIOSSafari } from '@/lib/download';
import { downloadConfirmation, errorCopy } from '@/content/copy';
import { track } from '@/lib/analytics';

export function DownloadButton() {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'confirmed' | 'error'>('idle');
  const [showIOSHint, setShowIOSHint] = useState(false);

  async function handleDownload() {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    setStatus('downloading');

    if (isIOSSafari()) {
      setShowIOSHint(true);
    }

    const success = await downloadPoster(canvas);

    if (success) {
      track('poster_downloaded');
      if (!isIOSSafari()) {
        setStatus('confirmed');
        setTimeout(() => setStatus('idle'), 2500);
      } else {
        setStatus('idle');
      }
    } else {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }

  return (
    <div className="text-center">
      <Button
        variant="primary"
        onClick={handleDownload}
        disabled={status === 'downloading'}
      >
        <Download className="w-4 h-4" />
        Download
      </Button>

      {showIOSHint && (
        <p className="mt-2 text-caption text-ink-faint italic">
          On iPhone? Long-press the image after the new tab opens to save.
        </p>
      )}

      {status === 'confirmed' && (
        <p className="mt-2 text-caption text-ink-soft italic animate-in fade-in duration-200">
          {downloadConfirmation}
        </p>
      )}

      {status === 'error' && (
        <p className="mt-2 text-caption text-feedback-quiet italic">
          {errorCopy.frontend.downloadFailed}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create DistressInterstitial**

```tsx
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Hotline } from '@/types';
import { track } from '@/lib/analytics';

interface DistressInterstitialProps {
  open: boolean;
  hotline: Hotline;
  onClose: () => void;
}

export function DistressInterstitial({ open, hotline, onClose }: DistressInterstitialProps) {
  function handleClose() {
    track('distress_dismissed');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className="bg-paper border-border-mist max-w-md text-center space-y-4"
        aria-modal="true"
      >
        <p className="font-serif text-headline italic text-ink-deep">
          This one isn't for jokes.
        </p>
        <p className="font-serif text-body text-ink-soft italic">
          If you're going through something serious, please talk to someone who can actually help. You're not alone in it.
        </p>
        {hotline.phone && (
          <p className="font-serif text-body-lg font-medium text-ink-deep">
            <a href={`tel:${hotline.phone.replace(/\s/g, '')}`} className="hover:text-accent-sage">
              {hotline.name}: {hotline.phone}
            </a>
          </p>
        )}
        <p className="font-serif text-body text-ink-soft italic">
          Or visit{' '}
          <a
            href={hotline.url ?? 'https://findahelpline.com'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-sage underline"
          >
            findahelpline.com
          </a>{' '}
          for support anywhere in the world.
        </p>
        <Button variant="secondary" onClick={handleClose}>
          Take me back
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/DownloadButton.tsx src/components/DistressInterstitial.tsx
git commit -m "feat: add DownloadButton and DistressInterstitial components"
```

---

### Task 24: Error Boundary

**Files:**
- Create: `src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Create ErrorBoundary**

```tsx
import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { errorCopy } from '@/content/copy';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-cream flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <p className="font-serif italic text-body text-ink-soft">
              {errorCopy.errorBoundary}
            </p>
            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
            >
              Refresh
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ErrorBoundary.tsx
git commit -m "feat: add ErrorBoundary with in-voice error messaging"
```

---

## Phase 6: App Shell & Integration

### Task 25: App.tsx — Main Page

**Files:**
- Create: `src/App.tsx`

- [ ] **Step 1: Write the main App component**

This is the single-page orchestrator — manages all state and wires components together.

```tsx
import { useState, useCallback, lazy, Suspense } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { HeroExamples } from '@/components/HeroExamples';
import { PromptInput } from '@/components/PromptInput';
import { PresetButtons } from '@/components/PresetButtons';
import { GenerateButton } from '@/components/GenerateButton';
import { PosterReveal } from '@/components/PosterReveal';
import { callGenerate } from '@/lib/api';
import { track } from '@/lib/analytics';
import { loadingPhrases, errorCopy } from '@/content/copy';
import type { PosterPhase, Hotline, GenerateResponse } from '@/types';

const DistressInterstitial = lazy(() =>
  import('@/components/DistressInterstitial').then((m) => ({ default: m.DistressInterstitial }))
);

const LOAD_FLOOR_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickLoadingPhrase(): string {
  return loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)];
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [posterState, setPosterState] = useState<PosterPhase>({ phase: 'idle' });
  const [excludePhotoIds, setExcludePhotoIds] = useState<string[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [distressData, setDistressData] = useState<{ open: boolean; hotline: Hotline | null }>({
    open: false,
    hotline: null,
  });
  const [loading, setLoading] = useState(false);

  const isGenerating = loading;
  const canGenerate = prompt.trim().length > 0 && !isGenerating;

  function handlePresetSelect(preset: string) {
    setSelectedPreset(preset);
    setPrompt(preset);
    setInlineError(null);
  }

  function handlePromptChange(value: string) {
    setPrompt(value);
    if (selectedPreset && value !== selectedPreset) {
      setSelectedPreset(null);
    }
    setInlineError(null);
  }

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setLoading(true);
    setInlineError(null);
    const phrase = pickLoadingPhrase();
    setPosterState({ phase: 'loading', phrase });

    const source = selectedPreset
      ? (prompt === selectedPreset ? 'preset' : 'edited_preset')
      : 'freeform';
    track('prompt_submitted', { source, length: prompt.length });

    const startedAt = performance.now();

    const result = await callGenerate(prompt.trim(), excludePhotoIds);

    // Handle non-poster responses (no anticipation beat)
    if (result.status === 'distress') {
      setLoading(false);
      setPosterState((prev) => prev.phase === 'loading' ? { phase: 'idle' } : prev);
      track('generation_distress');
      setDistressData({ open: true, hotline: result.hotline });
      return;
    }

    if (result.status === 'blocked') {
      setLoading(false);
      setPosterState((prev) => prev.phase === 'loading' ? { phase: 'idle' } : prev);
      track('generation_blocked', { reason: result.message.includes('people') ? 'real_person' : 'slur' });
      setInlineError(result.message);
      return;
    }

    if (result.status === 'rate_limited') {
      setLoading(false);
      setPosterState((prev) => prev.phase === 'loading' ? { phase: 'idle' } : prev);
      track('generation_rate_limited');
      setInlineError(result.message);
      return;
    }

    // Anticipation beat for poster results
    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, LOAD_FLOOR_MS - elapsed);
    if (remaining > 0) await sleep(remaining);

    if (result.status === 'ok') {
      track('generation_completed', { fittingRung: result.fittingRung });
      setExcludePhotoIds((prev) => [...prev, result.photoId]);
      setPosterState({
        phase: 'settled',
        line1: result.line1,
        line2: result.line2,
        photoId: result.photoId,
        fittingRung: result.fittingRung,
      });
    } else if (result.status === 'safe_fallback') {
      track('generation_safe_fallback');
      setPosterState({
        phase: 'settled',
        line1: result.line1,
        line2: result.line2,
        photoId: result.photoId,
        fittingRung: 4,
      });
    } else if (result.status === 'error') {
      track('generation_error', { kind: 'unknown' });
      setPosterState({
        phase: 'error',
        message: result.message,
        retryable: result.retryable,
      });
    }

    setLoading(false);
  }, [prompt, excludePhotoIds, canGenerate, selectedPreset]);

  function handleRegenerate() {
    handleGenerate();
    track('regenerate_clicked', { regenDepth: excludePhotoIds.length });
  }

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Header />

      <main className="flex-1 px-4 pb-section">
        {/* Hero */}
        <div className="text-center space-y-breathe max-w-2xl mx-auto">
          <h1 className="font-serif text-display lg:text-display-lg italic text-ink-deep">
            What's going on?
          </h1>

          <HeroExamples />

          {/* Input form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleGenerate();
            }}
            className="space-y-4"
          >
            <PromptInput
              value={prompt}
              onChange={handlePromptChange}
              disabled={isGenerating}
            />

            <PresetButtons
              selected={selectedPreset}
              onSelect={handlePresetSelect}
              disabled={isGenerating}
            />

            <GenerateButton
              loading={isGenerating}
              disabled={!canGenerate}
              onClick={handleGenerate}
            />
          </form>

          {/* Inline error (rate limit, blocked) */}
          {inlineError && (
            <p className="text-caption text-feedback-quiet italic">{inlineError}</p>
          )}
        </div>

        {/* Poster reveal area */}
        <PosterReveal
          state={posterState}
          onRegenerate={handleRegenerate}
        />
      </main>

      <Footer />

      {/* Distress modal (lazy loaded) */}
      <Suspense fallback={null}>
        {distressData.hotline && (
          <DistressInterstitial
            open={distressData.open}
            hotline={distressData.hotline}
            onClose={() => setDistressData({ open: false, hotline: null })}
          />
        )}
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: implement App.tsx — full single-page orchestration"
```

---

### Task 26: Entry Point & HTML

**Files:**
- Create: `src/main.tsx`
- Create: `index.html`

- [ ] **Step 1: Create main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/400-italic.css';

import '@/styles/globals.css';

import App from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initAnalytics } from '@/lib/analytics';
import { ensureFontsReady } from '@/lib/fonts';

initAnalytics();
ensureFontsReady();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
```

- [ ] **Step 2: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <title>Bless Your Heart</title>
    <meta name="description" content="The honest motivational posters you didn't ask for." />
    <meta name="theme-color" content="#F7F3EC" />

    <!-- Favicons -->
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />

    <!-- OG -->
    <meta property="og:title" content="Bless Your Heart" />
    <meta property="og:description" content="The honest motivational posters you didn't ask for." />
    <meta property="og:image" content="/og-hero.png" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Bless Your Heart" />
    <meta name="twitter:description" content="The honest motivational posters you didn't ask for." />
    <meta name="twitter:image" content="/og-hero.png" />

    <!-- Font preloads -->
    <link rel="preload" href="/assets/cormorant-garamond-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/assets/cormorant-garamond-latin-400-italic.woff2" as="font" type="font/woff2" crossorigin />
  </head>
  <body>
    <div id="root"></div>

    <noscript>
      <div style="font-family: Georgia, serif; text-align: center; padding: 4rem 2rem; max-width: 480px; margin: 0 auto;">
        <h1 style="font-size: 2rem; font-style: italic;">Bless Your Heart</h1>
        <p style="font-size: 1rem; color: #5C5650; margin-top: 1rem;">
          This corner of the internet requires JavaScript. The universe also asks a lot of you. Try enabling it and we can both get on with the moment.
        </p>
      </div>
    </noscript>

    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

> **Note:** Font preload `href` paths will be determined by Vite's build output. Verify after first `npm run build` and update if needed.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx index.html
git commit -m "feat: add entry point and HTML with OG metadata, fonts, noscript"
```

---

## Phase 7: Analytics & Polish

### Task 27: Analytics Setup

**Files:**
- Create: `src/lib/analytics.ts`

- [ ] **Step 1: Write PostHog analytics wrapper**

```ts
import posthog from 'posthog-js';

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  if (!import.meta.env.PROD) return;
  if (!import.meta.env.VITE_POSTHOG_KEY) return;

  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: false,
    persistence: 'sessionStorage',
    disable_session_recording: true,
    disable_surveys: true,
    loaded: () => {
      initialized = true;
    },
  });
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, props);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/analytics.ts
git commit -m "feat: add PostHog analytics with privacy-first configuration"
```

---

### Task 28: Netlify Configuration & Site Foundation

**Files:**
- Create: `netlify.toml`
- Create: `public/manifest.webmanifest`
- Create: `public/robots.txt`
- Create: `public/sitemap.xml`

- [ ] **Step 1: Create netlify.toml**

```toml
[build]
  command = "npm run lint:photos && npx tsc -b --noEmit && npm run build"
  publish = "dist"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"
  external_node_modules = ["firebase-admin"]

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
```

- [ ] **Step 2: Create public/manifest.webmanifest**

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

- [ ] **Step 3: Create public/robots.txt**

```
User-agent: *
Allow: /

Sitemap: https://blessyourheart.app/sitemap.xml
```

- [ ] **Step 4: Create public/sitemap.xml**

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

- [ ] **Step 5: Commit**

```bash
git add netlify.toml public/manifest.webmanifest public/robots.txt public/sitemap.xml
git commit -m "feat: add Netlify config, manifest, robots, sitemap"
```

---

## Phase 8: Testing & Verification

### Task 29: Vitest Configuration

**Files:**
- Create: `vitest.config.ts` (or add to vite.config.ts)

- [ ] **Step 1: Add Vitest configuration to vite.config.ts**

Update `vite.config.ts` to include test configuration:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/.netlify/functions': 'http://localhost:8888',
    },
  },
  build: {
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: ALL PASS (rateLimit, safety, validation, photoSelection tests)

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "chore: configure Vitest test runner"
```

---

### Task 30: Build Verification

- [ ] **Step 1: Run type check**

```bash
npx tsc -b --noEmit
```

Expected: No errors. Fix any type errors found.

- [ ] **Step 2: Run photo lint**

```bash
npx tsx tools/lint-photos.ts
```

Expected: `✓ 10 photos validated`

- [ ] **Step 3: Run production build**

```bash
npx vite build
```

Expected: Build succeeds, output in `dist/`. Check that bundle sizes are within budget:
- JS: < 250 KB gzipped
- CSS: < 20 KB gzipped

- [ ] **Step 4: Verify build output**

```bash
ls -la dist/assets/
```

Check no unexpected files, no source maps, no server-only modules leaked into client bundle.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: verify build passes — all checks green"
```

---

## Pre-Launch Checklist

These items require manual action before the app is deployment-ready:

### External Dependencies (Must Complete Before Deploy)

- [ ] **Firebase project**: Create Firebase project on Spark plan, enable Firestore (Native mode) and Cloud Storage
- [ ] **Firebase credentials**: Generate service account key, configure as Netlify env vars
- [ ] **Firestore TTL**: Configure TTL on `rateLimits` collection's `expiresAt` field via Firebase console
- [ ] **Anthropic API key**: Obtain and set as `ANTHROPIC_API_KEY` in Netlify env vars
- [ ] **Photo library**: Source, process (crop to 1080×1080, color-grade, strip EXIF), and upload ~75 photos to Firebase Storage. Update `photos.json` with real metadata
- [ ] **Slur list**: Populate `src/server/slur-list.ts` with a maintained hate-speech word list
- [ ] **Public figure list**: Populate `PUBLIC_FIGURES` array in `src/server/safety.ts`
- [ ] **Distress phrase refinement**: Review and refine distress phrases with clinical guidance
- [ ] **Hotline verification**: Confirm every listed hotline number is current and operational
- [ ] **Hero examples**: Render 3 canonical poster PNGs, save to `public/examples/`
- [ ] **OG hero image**: Create 1200×630 OG card image, save to `public/og-hero.png`
- [ ] **Favicon assets**: Create `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `android-chrome-192.png`, `android-chrome-512.png` in `public/`
- [ ] **PostHog**: Create project, set `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST`
- [ ] **Domain**: Register domain on Cloudflare, configure in Netlify
- [ ] **Netlify**: Link repo, set all env vars, verify preview deploy works
- [ ] **Manual smoke test**: Generate a poster locally including iOS Safari download path
- [ ] **Voice eval**: Test system prompt against ~30 representative inputs

### Post-Deploy Monitoring

- [ ] **PostHog dashboards**: Build Health, Quality, and Discovery dashboards
- [ ] **Fitting rung monitoring**: Rung 2+ rate should be < 5%
- [ ] **Safe fallback monitoring**: Rate should be < 1%
- [ ] **Lighthouse audit**: Score ≥ 90 Performance, ≥ 95 Accessibility

---

## Architecture Notes for Implementing Engineers

### What's NOT in this plan (deliberately)

1. **Photo curation tool** (`tools/curation/`): Separate standalone app per PRD 13. Build as follow-up project. For v1, curate photos manually and hand-edit `photos.json`.

2. **E2E tests**: Per PRD and global CLAUDE.md, E2E tests are user-requested only.

3. **Dark mode**: Deliberately omitted. Cream palette IS the brand.

4. **User accounts / persistent storage**: Deliberately omitted per anti-features.

5. **CSP headers**: Deferred to v1.1 hardening pass per PRD 21.

### Key Invariants to Preserve

1. **The two-line contract is inviolable.** Every output must be exactly two visual lines.
2. **Safety lists (distress-phrases, slur-list) must never be bundled to the client.** They live in `src/server/` and are only imported by the Netlify function.
3. **Anthropic API key never reaches the browser.** All AI calls are server-side.
4. **Rate-limit check runs BEFORE safety filters** so distress users don't burn quota.
5. **800ms loading floor is load-bearing UX**, not dead time. Don't remove it.
6. **`await document.fonts.ready`** must run before any Canvas `measureText()` or `fillText()`.
