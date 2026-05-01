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
- **Fast smoke check (after deploy)**: `npx vitest run tests/smoke.test.ts` — 7 critical-path tests, < 400 ms
- **Coverage report**: `npx vitest run --coverage --coverage.include='src/**/*.{ts,tsx}' --coverage.exclude='src/**/*.d.ts' --coverage.exclude='src/main.tsx'` (uses `@vitest/coverage-v8`)
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
└── tests/
    ├── smoke.test.ts             # Bouncer suite — 7 critical-path checks, < 400 ms
    ├── client/                   # Browser/jsdom specs (use `// @vitest-environment jsdom`)
    └── server/                   # Node specs incl. generate-integration.test.ts (full pipeline)
```

**Test naming**: when adding cases to an existing module, create `<module>-extended.test.ts` rather than bloating the original file. Convention: the primary `<module>.test.ts` covers smoke-shaped basics (one or two cases per public function); the `-extended.test.ts` covers exhaustive boundaries, edge cases, and mutation-kill assertions. **Never duplicate the same assertion across the pair** — if extended pins a 60-char boundary with paired `accepts exactly 60` + `rejects 61` tests, do not also add `returns null when line1 exceeds 60` to the primary file. Cross-pair duplicates were removed in `audit-reports/05_TEST_CONSOLIDATION_REPORT_001_*.md`; don't reintroduce them.

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
- **Rate limit**: 25/hour per IP, hashed with daily-rotated salt (`IP_SALT_BASE:YYYY-MM-DD`), SHA-256 truncated to 32 chars, stored at `rateLimits/{hashedIp}` with `expiresAt` for TTL. Handler emits `X-RateLimit-Limit/Remaining/Reset` on every response where the limiter ran (intentionally absent on bypass and fail-open paths) plus `Retry-After` on `rate_limited`. `retryAfterSec` is computed from `windowStart + 1hr - now`, NOT a hardcoded value
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
4. `npm run build` runs `lint:photos` and fails on a rejected entry; `npm test` also catches it via [`tests/server/photos-library-schema.test.ts`](tests/server/photos-library-schema.test.ts)

### Adding an Error Copy String
1. Add the key to `errorCopy` in [`src/content/copy.ts`](src/content/copy.ts)
2. Reference it from the component — never hardcode

### Adding an API Field, Endpoint, or Response Variant
1. Read [`docs/API_DESIGN_GUIDE.md`](docs/API_DESIGN_GUIDE.md) — codifies URL/field naming, status code policy, error shape, validation, rate-limit headers, and includes recipes
2. The wrapper pattern is **always-200 with body `status` discriminator** — don't introduce `429` for `rate_limited` or `403` for `blocked`. The SPA only narrows on `body.status`; pinned by [`tests/server/generate-contract.test.ts`](tests/server/generate-contract.test.ts)
3. Update `GenerateResponse` in [`src/types/index.ts`](src/types/index.ts) AND the mirrored Zod schema in `generate-contract.test.ts` together — they're load-bearing

---

## Testing Patterns (Non-Obvious)

- **Default Vitest env is `node`** (set in `vite.config.ts`). For tests that touch DOM/`navigator`/`Image`, add `// @vitest-environment jsdom` as the **first line** of the file. `globals: true` means `describe`/`it`/`expect`/`vi` are auto-imported.
- **Mocking the Anthropic SDK requires `vi.hoisted`** — the client is instantiated at module-load time in [`src/server/anthropic.ts`](src/server/anthropic.ts), so plain top-level `vi.fn()` vars aren't initialized in time. See [`tests/server/generate-integration.test.ts`](tests/server/generate-integration.test.ts) for the pattern.
- **Override the slur list in safety tests** with `vi.mock('@/server/slur-list', () => ({ slurList: ['testblockedslur'] }))` to avoid leaking the real moderation list into test fixtures or CI logs.
- **Canvas mocking**: jsdom's `getContext('2d')` is incomplete (`measureText`/`fillText`/etc. are stubs). Build a recording mock context and inject via `vi.spyOn(document, 'createElement').mockReturnValue(...)`. See [`tests/client/compositor.test.ts`](tests/client/compositor.test.ts).
- **Firestore mocking for rate-limit**: stub both `getDb` and `firebase-admin/firestore`'s `Timestamp` to drive transactions without credentials. See [`tests/server/rateLimit-extended.test.ts`](tests/server/rateLimit-extended.test.ts).
- **`process.env` mutations must use `try/finally`** — assertion failures between mutate and restore would leak env state into every later test in the file's worker. Pattern: capture original, mutate inside `try`, restore inside `finally`. See [`tests/server/anthropic.test.ts`](tests/server/anthropic.test.ts) for the canonical shape.
- **Top-level env writes in `generate-contract.test.ts:53-56`, `generate-integration.test.ts:37-40`, and `generate-rate-limit-integration.test.ts:70-74` are load-bearing** — they MUST sit at module scope above `import { handler }` because the source module reads env at module-eval time. Don't "clean these up" into `beforeAll` (the import would already have evaluated against unset env) and don't flip vitest's `isolate: false` (these writes would leak across files in the same worker). Per-file isolation is what keeps them safe.
- **Three integration test files cover [`netlify/functions/generate.ts`](netlify/functions/generate.ts), each with a DIFFERENT rate-limit env regime — keep them aligned.** [`generate-integration.test.ts`](tests/server/generate-integration.test.ts) sets `RATE_LIMIT_PER_HOUR='9999'` (BYPASS — exercises the orchestration without the rate-limit branch). [`generate-contract.test.ts`](tests/server/generate-contract.test.ts) also bypasses, then uses one localized `vi.doMock` flip to test the `rate_limited` response shape. [`generate-rate-limit-integration.test.ts`](tests/server/generate-rate-limit-integration.test.ts) sets `RATE_LIMIT_PER_HOUR='25'` (ENABLED — module-mocks `@/server/rateLimit` so the wrapper code in `generate.ts:55-72` is actually exercised: timeout race, fail-open, denied path). When editing the rate-limit branch in `generate.ts`, update the rate-limit-integration file too — a refactor that breaks the `Promise.race` would silently pass the bypass-regime tests.
- **Don't try to speed up the test suite by disabling isolation or switching pools** — `audit-reports/07_TEST_EFFICIENCY_REPORT_001_*.md` measured `--no-isolate` at +31% slower (2.44s) and `--pool=forks` at +6% slower; threads+isolate is optimal. Wall-clock (~1.9s for 310 tests) is dominated by per-worker module import warmup, which is irreducible. If a future change adds heavy I/O or stretches wall-clock past ~5s, re-audit before assuming the same conclusion holds.
- **Wire-format contract for the generate endpoint lives in [`tests/server/generate-contract.test.ts`](tests/server/generate-contract.test.ts)** — Zod schema mirrors `GenerateResponse` and pins HTTP status codes, response headers, request boundaries, and every `status` discriminator. Add new response fields here AND in `src/types/index.ts` together. Keep the `generate-integration.test.ts` orchestration tests separate from these contract tests.
- **Don't test what TypeScript catches** — discriminated union narrowing, return-type shape, nullability. Test runtime values.
- **Default to `it.each` for 3+ structurally-parallel cases** — when several tests differ only in input/output and share setup, write a single `it.each` table rather than copy-pasting test bodies. The `$key` template syntax in the test name keeps failure messages specific. See [`tests/client/compositor.test.ts`](tests/client/compositor.test.ts) (watermark corners) and [`tests/client/download.test.ts`](tests/client/download.test.ts) (`isIOSSafari` user agents) for the canonical shape.
- **Mark genuine bugs with `// BUG:` and skip the test** — never silently fix code in a test-writing session. Document in `audit-reports/`.
- **`tests/server/photos-library-schema.test.ts` mirrors the rules in [`tools/lint-photos.ts`](tools/lint-photos.ts) — when adding a lint rule, mirror it here.** The lint script only runs at `npm run build`; the schema test runs every `npm test`. Keeping them aligned closes the gap where a developer who edits `photos.json` and runs only the test suite would not catch a malformed entry. The schema test also pins the contract that every photoId in `safeFallbacks` resolves to a real photo in the library.

---

## Documentation

Tiered system: CLAUDE.md → [MEMORY.md](.claude/memory/MEMORY.md) → topic files (`.claude/memory/*.md`). Max 2 hops from cold start.

**Placement rule**: Prevents mistakes on ANY task → CLAUDE.md. Spans features → MEMORY.md. One feature → topic file.

**Updating docs**: When code changes affect a rule in CLAUDE.md, update CLAUDE.md. When code changes affect a feature covered by a memory file, update that file. Topic files target 40–150 lines — split into hub + sub-topic files when content clusters into distinct concerns.

For PRD specs (deep reference, never auto-loaded): [prd-index.md](.claude/memory/prd-index.md) maps topics to `PRD/##_*.md` doc numbers.
