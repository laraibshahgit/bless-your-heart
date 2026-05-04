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

**Backend**: `ANTHROPIC_API_KEY` (NEVER exposed), `ANTHROPIC_MODEL_GEN` (default `claude-sonnet-4-6`), `ANTHROPIC_MODEL_SAFETY` (default `claude-haiku-4-5`), `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (newlines escaped as `\\n`), `FIREBASE_STORAGE_BUCKET`, `RATE_LIMIT_PER_HOUR` (default 25, set `9999` to bypass locally; misconfigs — `NaN`, negative, zero, empty — also fall back to 25 via `parseRateLimit()` in [`src/server/rateLimit.ts`](src/server/rateLimit.ts), pinned by the `RATE_LIMIT_PER_HOUR misconfiguration falls back to default 25` block in [`tests/server/rateLimit-extended.test.ts`](tests/server/rateLimit-extended.test.ts) — the previous raw `parseInt` silently disabled the limiter on `'abc'` and silently blocked every first-hit on `'-5'`/`'0'`), `IP_SALT_BASE`, `ENABLE_TONE_CHECK` (set `false` to skip Haiku tone check), `ALLOWED_ORIGINS` (comma-separated browser-Origin allowlist for the CSRF shield in `generate.ts`; **unset = no-op**, so it MUST be set in production deploys e.g. `https://blessyourheart.app`). **New backend env vars MUST go through a defensive parser** (mirror `parseRateLimit`'s `Number.isFinite && > 0` shape for ints; allowlist literals for booleans like `ENABLE_TONE_CHECK === 'false'`) — bound the misconfig blast radius before the value reaches business logic. Audit run 24/001 added the rate-limit parser; extend the pattern to any new numeric env var

See [`.env.example`](.env.example) for the canonical template.

---

## Architectural Rules

### Frontend

- **Single page app** — no router. State machine in [`App.tsx`](src/App.tsx) drives `PosterPhase` (`idle | loading | settled | error`). The `revealing` branch was removed in audit run 22/001 — no producer ever emitted it and no consumer narrowed on it
- **Native Canvas API for compositing** — NEVER use html2canvas. Pixel-perfect serif text is required; raster libraries blur it
- **ALWAYS `await ensureFontsReady()` before `measureText()` or `fillText()`** — falling back to system serif silently breaks the joke. Helper lives in [`src/lib/fonts.ts`](src/lib/fonts.ts) and lazy-caches the promise
- **Shadcn Button is mandatory for all `<button>` interactions** — variants: `primary | secondary | preset | ghost`. Never inline raw `<button>` (the [`PromptInput`](src/components/PromptInput.tsx) raw `<input>` is intentional — Shadcn `Input` doesn't apply the same serif placeholder treatment)
- **No form library** — [`PromptInput`](src/components/PromptInput.tsx) uses bare `useState` + a single `<input maxLength={200}>` with `sessionStorage` debouncing. `react-hook-form` and `@hookform/resolvers` were declared in the original spec ([`PRD/01_Tech_Stack.md`](PRD/01_Tech_Stack.md)) but never wired in and were removed in NightyTidy step 11 (audit-reports/11_DEPENDENCY_HEALTH_REPORT_001). **Do not reintroduce them** — a single textarea doesn't need form-state management. Server-side validation lives in `zod` ([`src/server/validation.ts`](src/server/validation.ts))
- **No dark mode** — cream palette IS the brand. Never introduce `dark:` variants
- **Never use red for errors** — use `feedback-quiet` (`#D9D4C8`)
- **`sessionStorage` key for prompt persistence**: `byh:lastPrompt` (300ms debounce). **Restored values MUST be truncated to `MAX_PROMPT_LENGTH`** before being passed to `onChange` — the browser's `<input maxLength>` only enforces user typing, not programmatic sets, so a tampered or stale key with >200 chars would bypass the cap and the user would silently 400 on submit. [`PromptInput.tsx`](src/components/PromptInput.tsx) does `onChange(saved.slice(0, MAX_PROMPT_LENGTH))` on the restore effect (added in audit run 24/001). Apply the same pattern to any future programmatic prompt-set path
- **800ms minimum anticipation beat** — `LOAD_FLOOR_MS` in [`App.tsx`](src/App.tsx). Even instant API responses must wait
- **rAF-throttle window event listeners** — `resize`, `scroll`, `pointermove` etc. fire 60+/sec. Without throttling, every fire flows into `setState` → re-render → expensive child effects (e.g. `PosterCanvas` re-decodes the photo + redraws the canvas on every fire). Use the `requestAnimationFrame` coalesce pattern in [`PosterCanvas.tsx`](src/components/PosterCanvas.tsx): one outer `frame` handle, early-return if a frame is queued, set `frame=0` inside the rAF callback, `cancelAnimationFrame` in the cleanup. Pair with `{ passive: true }` so the listener doesn't block scroll on touch devices. Audit run 25/001 added this for `resize`; apply the same shape to any future window listener
- **Cleanup `setTimeout` handles on component unmount** — anywhere a component arms a `setTimeout` to update its own state later (auto-reset banners, debounced writes, animation pacing), capture the handle in a `useRef` and clear it in a cleanup `useEffect`. Without cleanup, a component that unmounts mid-timer (the regen flow remounts `DownloadButton`/`PosterCanvas` whenever the user re-rolls from `settled`) fires `setState` on a dropped instance and, under StrictMode, dispatches duplicate side-effects on the dev double-mount. Pinned in [`PromptInput.tsx`](src/components/PromptInput.tsx) (`debounceRef`) and [`DownloadButton.tsx`](src/components/DownloadButton.tsx) (`resetRef`) by audit run 25/001
- **Photo-CDN preconnect lives in [`index.html`](index.html)** — `<link rel="preconnect" href="https://firebasestorage.googleapis.com" crossorigin>` so the DNS + TCP + TLS handshake to the photo CDN runs during HTML parse instead of after the user clicks Generate. The `crossorigin` attribute is **required** — `loadImage()` in [`src/lib/compositor.ts`](src/lib/compositor.ts) sets `img.crossOrigin = 'anonymous'`, and the preconnect must match or the browser opens a second (untrusted) connection. **If the photo host ever changes**, update the `<link rel="preconnect">` host AND `getPhotoUrl()` in [`src/lib/photos.ts`](src/lib/photos.ts) AND the `img-src` allowlist in the Report-Only CSP in [`netlify.toml`](netlify.toml) — all three reference the same origin and silently drift apart if edited individually. Added in audit run 25/001
- **Client fetch timeout** — `callGenerate` in [`src/lib/api.ts`](src/lib/api.ts) sets `signal: AbortSignal.timeout(GENERATE_FETCH_TIMEOUT_MS)` (30s). Netlify lambda kill is 10–26s, so this only fires when the response stream hangs past that (CDN edge weirdness, mid-stream lambda crash). Without the signal a hung body would pin the user's tab indefinitely. Pinned by `attaches an AbortSignal to the fetch call` in [`tests/client/api.test.ts`](tests/client/api.test.ts) — do not drop the `signal` field when refactoring `callGenerate`
- **User-facing copy lives in [`src/content/`](src/content/)** — never hardcode user-facing strings in components OR in the Netlify function. [`copy.ts`](src/content/copy.ts) exports `errorCopy` (in-voice errors), `loadingPhrases`, `downloadConfirmation`, `downloadCopy` (iOS save hint), and `distressCopy` (crisis interstitial); [`presets.ts`](src/content/presets.ts) and [`placeholders.ts`](src/content/placeholders.ts) cover the prompt input. **`distressCopy` is intentionally OUT of the wellness-influencer voice** — when someone may be in crisis the joke ends; do not "fix" its tone to match `errorCopy`. The Netlify function imports `errorCopy` from `@/content/copy` for the `rate_limited`, `blocked` (slur), and `blocked` (real-person) response messages — pinned by the `errorCopy parity` block in [`tests/server/generate-contract.test.ts`](tests/server/generate-contract.test.ts) (audit run 22/001 eliminated the prior literal-duplication pattern; run 23/001 centralized the distress + iOS-hint strings). Full inventory + voice style guide in [`docs/ERROR_MESSAGES.md`](docs/ERROR_MESSAGES.md) — read it before adding a new error path or rewording an existing one

### Backend

- **Single endpoint**: `POST /.netlify/functions/generate`
- **Filter pipeline (cost-ordered, `netlify/functions/generate.ts`)**:
  1. Method check (POST only — others return `405`)
  2. **Origin allowlist** (CSRF shield via `ALLOWED_ORIGINS` — see below)
  3. Zod validation of body
  4. Rate-limit check (Firestore txn, 3s timeout, fails open on error)
  5. Slur word-list (free)
  6. Real-person regex (free; `PUBLIC_FIGURES` array currently empty)
  7. Distress phrase list (free, server-only)
  8. Distress Haiku classifier (only if phrase list misses)
  9. Generation loop: Sonnet → Zod parse → specificity (lexical) → tone (Haiku) — up to 2 retries
  10. Photo selection (3-rung fallback)
  11. Safe fallback if generation/selection both fail
- **CSRF Origin shield** (`isOriginAllowed` in [`generate.ts`](netlify/functions/generate.ts)): when `ALLOWED_ORIGINS` env var is set (comma-separated origins), browser POSTs whose `Origin` header is not in the list get `403 { status: 'error' }`. Unset = no-op (back-compat). Missing Origin = pass-through (server-to-server clients omit it). Origins are compared case-insensitively. **Do not remove this guard or default it to deny** — it's the only protection against cross-origin Anthropic-spend abuse. Behavior pinned by `contract — Origin allowlist (CSRF shield)` block in [`tests/server/generate-contract.test.ts`](tests/server/generate-contract.test.ts)
- **NEVER log prompt or output content** — log only event types: `gen_ok`, `gen_block` (with `reason: 'slur' | 'real-person' | 'origin'`), `gen_distress`, `gen_rate_limited`, `gen_retry`, `gen_safe_fallback`, `gen_anthropic_error`, `gen_parse_failed`, `rate_limit_check_failed`, `tone_check_failed`, `distress_check_failed`. **Fail-open `console.error` log lines MUST include `error: String(err)`** alongside the `event` field — pin the cause, since the on-call has only the JSON line. Pattern: `} catch (err) { console.error(JSON.stringify({ event: 'foo_failed', error: String(err) })); /* fall through */ }`. Pinned in `gen_anthropic_error`/`rate_limit_check_failed`/`tone_check_failed`/`distress_check_failed` (audit run 13/001 closed two gaps where the catch had been written without binding `err`; run 21/001 extended the convention to `gen_parse_failed` in `validation.ts` and matched the shape in client code — `gen_client_error` in `lib/api.ts`, `download_failed` in `lib/download.ts`, `error_boundary` in `components/ErrorBoundary.tsx`, `poster_render_failed` in `components/PosterCanvas.tsx`)
- **Rate limit**: 25/hour per IP, hashed with daily-rotated salt (`IP_SALT_BASE:YYYY-MM-DD`), SHA-256 truncated to 32 chars, stored at `rateLimits/{hashedIp}` with `expiresAt` for TTL. Handler emits `X-RateLimit-Limit/Remaining/Reset` on every response where the limiter ran (intentionally absent on bypass and fail-open paths) plus `Retry-After` on `rate_limited`. `retryAfterSec` is computed from `windowStart + 1hr - now`, NOT a hardcoded value. **Daily salt is UTC-anchored** via `new Date().toISOString().slice(0, 10)` — do NOT swap for `toLocaleDateString()`/`getDate()`/`getMonth()` (would produce different hashes per host TZ across multi-region deployments; pinned by `hashIp — UTC-anchored salt rotation` block in [`tests/server/rateLimit-extended.test.ts`](tests/server/rateLimit-extended.test.ts)). **TTL contract `expiresAt = windowStart + 1 hour`** is pinned by the `TTL contract` tests in the same file — initial-create and window-reset MUST write `expiresAt`, count-increment MUST NOT touch it (otherwise a busy IP slides TTL forward indefinitely and the `rateLimits` collection grows past free-tier). **Operational dependency (NOT enforceable from code):** the Firestore TTL *policy* must be configured in the Firebase console / `gcloud firestore` against the `rateLimits` collection's `expiresAt` field. The code writes the field correctly, but TTL is a project-level Firestore feature, not a write-time guarantee — if the policy is missing in production, docs accumulate forever despite the test suite passing. Verify on every new Firebase environment. One known consequence of the daily-salt design: at UTC 00:00:00 every IP gets a fresh doc, so a user can do ~25 requests at 23:59:59 UTC and another ~25 at 00:00:01 UTC. Documented in [`audit-reports/14_DATETIME_HANDLING_REPORT_001_2026-05-04_0121.md`](audit-reports/14_DATETIME_HANDLING_REPORT_001_2026-05-04_0121.md) and [`audit-reports/24_DATA_INTEGRITY_REPORT_001_2026-05-04_1745.md`](audit-reports/24_DATA_INTEGRITY_REPORT_001_2026-05-04_1745.md)
- **Retry budget = 2** — on exhaustion, ship a `safe_fallback` from [`fallbacks.ts`](src/server/fallbacks.ts). User NEVER sees raw error
- **Per-request timeout on every Anthropic SDK call** — pass `{ timeout: ANTHROPIC_REQUEST_TIMEOUT_MS }` (12s, exported from [`src/server/anthropic.ts`](src/server/anthropic.ts)) as the **second arg** to `anthropic.messages.create({...}, { timeout: ... })`. The SDK default is 10 minutes — far longer than the Netlify lambda budget (10s default, 26s max free-tier), so a hung provider call would burn the whole lambda on attempt 1 instead of letting the retry loop find a working response. Threaded into all three call sites: `generateLines`, `checkTone`, `checkDistressWithHaiku`. **Any new `messages.create` call MUST pass this timeout** — pinned by the timeout-arg contract tests in [`tests/server/anthropic.test.ts`](tests/server/anthropic.test.ts) and [`tests/server/safety-extended.test.ts`](tests/server/safety-extended.test.ts)
- **`excludePhotoIds` is bounded at `MAX_EXCLUDE_PHOTO_IDS = 50` (array length) AND `MAX_EXCLUDE_PHOTO_ID_LENGTH = 64` (per-element string length)** — both exported from [`src/types/index.ts`](src/types/index.ts) so the client and server reference the same constants (mirrors the `MAX_PROMPT_LENGTH` pattern). Photo library is ~10 entries; 50 is generous for any session and bounds attacker-controlled array length below Netlify's 6MB body cap. Per-element bound prevents an attacker from fitting ~50 multi-KB strings under the body cap and forcing expensive Zod work on a multi-MB payload (slug-pattern photo IDs are ≤30 chars in practice; 64 is generous headroom). Pinned by accept-50 / reject-51 array-bound tests + accept-64 / reject-65 / reject-empty-string per-element tests in [`tests/server/generate-contract.test.ts`](tests/server/generate-contract.test.ts). **Client-side mirror**: [`App.tsx`](src/App.tsx) slices the `excludePhotoIds` accumulator with `.slice(-MAX_EXCLUDE_PHOTO_IDS)` after each successful generation — without this, a user who regenerated >50 times would silently 400 because the accumulator outgrew the contract. Audit run 24/001 closed this drift surface; do not drop the slice or hardcode either constant separately on either side
- **Local dev bypass**: set `RATE_LIMIT_PER_HOUR=9999` (skips entire rate-limit block)
- **Tone check bypass**: set `ENABLE_TONE_CHECK=false` (returns true unconditionally)
- **`setTimeout` deadlines inside `Promise.race` MUST be cleared on success in a `finally` block** — `generate.ts:172-198` arms a 3s timer to bound the rate-limit Firestore call, captures the handle, and clears it in `finally`. Why this matters in serverless: AWS Lambda (under Netlify Functions) freezes the event loop between invocations on a warm container, so a timer that hasn't fired by the time the response is returned is **carried into the next invocation** and can fire spurious rejections during an unrelated request. Pre-fix this leaked a pending timer on every successful rate-limit path. Apply the same scoped-handle + `finally`-clear pattern to any future race-with-deadline (Anthropic timeouts already use the SDK's built-in `{ timeout: ... }` arg, which handles this correctly — only hand-rolled `setTimeout`s need this guard). Audit run 25/001
- **Static safety / lookup data MUST be preallocated at module load, not rebuilt per request** — [`safety.ts`](src/server/safety.ts) precompiles `SLUR_PATTERNS` (regex), `PUBLIC_FIGURE_PATTERNS` (regex), and `DISTRESS_PHRASES_LOWER` (lowercased strings) once when the module evaluates. Pre-fix, `checkSlurFilter` ran `new RegExp(...)` for every entry on every request and `checkDistressPhraseList` re-lowercased the phrase list on every call — pure waste, since the source data is frozen. `vi.mock('@/server/slur-list')` etc. still work because vi hoists mocks above module evaluation, so the precompiled arrays in tests come from the mocked source. **When you add a new static lookup list (slurs, phrases, public figures, etc.), preallocate any derived form (regex, lowercased copy, Set) at module scope** — putting that work on the request hot path is the regression to avoid. Audit run 25/001
- **`firebase-admin` transitive-vuln baseline (do not chase)**: `firebase-admin@13.8.0` is the latest release and pins older `uuid`/`gaxios`/`google-gax`/`@google-cloud/{firestore,storage}`/`retry-request`/`teeny-request`/`http-proxy-agent`/`@tootallnate/once`. `npm audit` will continuously report ~10 advisories (8 moderate, 2 low) until upstream bumps `uuid` to ≥14. **None are exploitable here** — server only uses `firebase-admin/firestore` `Timestamp` and one `runTransaction` (no Storage SDK, no proxy, no `uuid.v3/v5/v6` with caller buffers). `npm audit fix`'s suggested resolution to `firebase-admin@10.1.0` is a misleading downgrade — ignore it. Treat the cluster as accepted; only escalate on `high`/`critical`. Full analysis in [`audit-reports/11_DEPENDENCY_HEALTH_REPORT_001_2026-05-03_2351.md`](audit-reports/11_DEPENDENCY_HEALTH_REPORT_001_2026-05-03_2351.md)
- **Response security headers** ([`netlify.toml`](netlify.toml)): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=31536000; includeSubDomains` (no `preload` until ready to submit), `Cross-Origin-Opener-Policy: same-origin`, and a **Report-Only** CSP. The CSP allows `self`, PostHog, Firebase Storage, and `data:`/`blob:` for canvas downloads; `style-src` keeps `'unsafe-inline'` for shadcn/Radix runtime style injection. Promote CSP from `Content-Security-Policy-Report-Only` to enforced after a production observation window. **Do not remove these headers** when restructuring `netlify.toml`

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
- **Timestamps & dates**: UTC always. Use `Timestamp.now()` from `firebase-admin/firestore` for Firestore writes; `new Date().toISOString()` for any "current date" string. **No third-party date libs** — `moment`/`dayjs`/`date-fns`/`luxon` are NOT in `package.json` and the audit at [`audit-reports/14_DATETIME_HANDLING_REPORT_001_2026-05-04_0121.md`](audit-reports/14_DATETIME_HANDLING_REPORT_001_2026-05-04_0121.md) confirms they aren't needed (one `new Date()` call in the entire codebase). Do NOT use `toLocaleDateString`/`toLocaleString`/`Intl.DateTimeFormat`/`getDate`/`getMonth`/`getHours` etc. — they read host TZ and break the multi-region serverless guarantees. The full test suite (351 tests) passes identically under `TZ=UTC`/`America/Los_Angeles`/`Asia/Kolkata`/`Pacific/Auckland`; keep it that way. No date is rendered to users today — adding the first one requires the steps in the audit report's Conventions § Rule 5 (browser-detected IANA TZ, `Intl.DateTimeFormat` not `.toLocale*`, multi-TZ tests)
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
2. The wrapper pattern is **always-200 with body `status` discriminator** for *business outcomes* (rate_limited, blocked, distress, ok, safe_fallback, error). Don't introduce `429` for `rate_limited` or `403` for `blocked`. The SPA only narrows on `body.status`. Two exceptions are **connection-level rejections** that never reach the business pipeline: `405` for non-POST method, `403` for Origin-allowlist failure (CSRF shield). Both pinned by [`tests/server/generate-contract.test.ts`](tests/server/generate-contract.test.ts)
3. Update `GenerateResponse` in [`src/types/index.ts`](src/types/index.ts) AND the mirrored Zod schema in `generate-contract.test.ts` together — they're load-bearing

### Rendering a Server-Provided URL or Phone in the UI
The hotline payload from `/generate` is the only server-controlled URL/phone we render today, and [`src/components/DistressInterstitial.tsx`](src/components/DistressInterstitial.tsx) sanitizes both before they hit the DOM:
- `safeTelHref(rawPhone)` allows only dial-pad characters (`+`, digits, `()`, `-`); anything else returns `null` and the link is suppressed
- `safeHotlineHref(rawUrl)` parses with `URL()` and accepts `https:` only — falls back to `https://findahelpline.com` on parse error or non-HTTPS scheme

When adding any new server-provided URL to the UI, mirror this pattern (parse + scheme-allowlist) rather than passing strings into `href` raw — even if the server is the only writer. Defense-in-depth here costs ~10 lines per consumer and is the last line before tabnabbing / `javascript:` injection.

---

## Testing Patterns (Non-Obvious)

- **Default Vitest env is `node`** (set in `vite.config.ts`). For tests that touch DOM/`navigator`/`Image`, add `// @vitest-environment jsdom` as the **first line** of the file. `globals: true` means `describe`/`it`/`expect`/`vi` are auto-imported.
- **No `@testing-library/react` / `@testing-library/jest-dom`** — the suite is canvas-mock + pure-logic-unit-test based; no React component-render tests exist. Both packages were declared in the original spec ([`docs/superpowers/plans/2026-05-01-bless-your-heart-full-build.md:149`](docs/superpowers/plans/2026-05-01-bless-your-heart-full-build.md)) but never wired in (no `setupFiles` entry, no `render(`/`screen.` calls anywhere) and were removed in NightyTidy step 11 Run 002 (audit-reports/11_DEPENDENCY_HEALTH_REPORT_002). **Don't reach for testing-library on autopilot** — first check whether a unit test against pure logic suffices (the existing test suite shows the pattern). If you genuinely need a component-render test, install testing-library deliberately and add a `setupFiles` entry to `vite.config.ts`. The recurring "declared-but-unused dep" pattern (this is the second instance after `react-hook-form`) is what motivates the recommended `knip`/`depcheck` CI step in the audit report.
- **Mocking the Anthropic SDK requires `vi.hoisted`** — the client is instantiated at module-load time in [`src/server/anthropic.ts`](src/server/anthropic.ts), so plain top-level `vi.fn()` vars aren't initialized in time. See [`tests/server/generate-integration.test.ts`](tests/server/generate-integration.test.ts) for the pattern.
- **Override the slur list in safety tests** with `vi.mock('@/server/slur-list', () => ({ slurList: ['testblockedslur'] }))` to avoid leaking the real moderation list into test fixtures or CI logs.
- **Canvas mocking**: jsdom's `getContext('2d')` is incomplete (`measureText`/`fillText`/etc. are stubs). Build a recording mock context and inject via `vi.spyOn(document, 'createElement').mockReturnValue(...)`. See [`tests/client/compositor.test.ts`](tests/client/compositor.test.ts).
- **Firestore mocking for rate-limit**: stub both `getDb` and `firebase-admin/firestore`'s `Timestamp` to drive transactions without credentials. See [`tests/server/rateLimit-extended.test.ts`](tests/server/rateLimit-extended.test.ts). **The `Timestamp.now()` mock MUST capture `Date.now()` once at construction** — use `now: () => { const ms = Date.now(); return { toMillis: () => ms }; }`. The volatile shape `now: () => ({ toMillis: () => Date.now() })` re-reads the wall clock on every `.toMillis()` call and produces a 1ms drift across paired reads in the same assertion (e.g. `expiresAt - windowStart === 3599999` when a millisecond ticks between them — caused a 1-in-5 TTL-test flake before audit run 20/002). Same shape required in `generate-integration.test.ts` and `generate-rate-limit-integration.test.ts`.
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
