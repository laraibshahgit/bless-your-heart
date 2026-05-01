# Documentation Coverage Audit — Bless Your Heart

**Date**: 2026-05-01 15:32
**Mode**: Refresh (existing 3-tier system found at `CLAUDE.md`, `.claude/memory/`)
**Branch**: `nightytidy/run-2026-05-01-1532`
**Scope**: All documentation in `CLAUDE.md` and `.claude/memory/*.md`

---

## TL;DR

CLAUDE.md was rewritten end-to-end to fix incorrect paths, a non-existent npm script, stale tech-stack version numbers, missing files, and a duplicated Two-Line Contract. The new file (~177 lines) sits below the 250-line target — that's appropriate for this codebase size — and adds a Multi-Agent Safety section for NightyTidy operation. **All `.claude/memory/*.md` edits were rejected by the user's local permission system as "sensitive files".** The corrections those files need are documented below as proposed diffs so they can be applied manually.

---

## 1. Codebase Inventory

| Module | Files | Documented? |
|--------|-------|-------------|
| Single-page React app | `src/App.tsx`, 12 components | Partial — App.tsx not mentioned in old CLAUDE.md; ErrorBoundary, Footer, Header, GenerateButton, CreditsDialog all missing |
| Canvas compositor | `src/lib/compositor.ts`, `src/lib/fonts.ts` | Yes (`canvas-and-compositing.md`), with errors |
| Photo metadata | `src/data/photos.json` (10 entries), `src/lib/photos.ts` | Yes |
| Server pipeline | `netlify/functions/generate.ts` + 11 files in `src/server/` | Partial — `validation.ts`, `photoSelection.ts`, `firebaseAdmin.ts`, `anthropic.ts` not mentioned by name |
| Safety filters | `src/server/safety.ts`, `distress-phrases.ts`, `slur-list.ts`, `synonyms.ts` | Yes (`voice-and-safety.md`), but with stale claims |
| Rate limiting | `src/server/rateLimit.ts` | Yes (`api-and-backend.md`) |
| Tests (6 specs) | `tests/client/*`, `tests/server/*` | **Not documented anywhere** — no `testing.md` |
| Build/CI | `netlify.toml`, `vite.config.ts`, `tailwind.config.ts`, `tools/lint-photos.ts` | Partial — pre-deploy command was wrong |
| Tools (uploads) | `tools/upload-photos.mjs`, `upload-real-photos.mjs` | **Mis-documented** — old CLAUDE.md referenced `tools/curation/` which doesn't exist |

---

## 2. Critical Findings — CLAUDE.md (FIXED)

The original CLAUDE.md contained multiple factual errors that would cause an AI agent to write broken code or fail builds.

| # | Severity | Issue | Old CLAUDE.md | Reality | Fix Status |
|---|----------|-------|---------------|---------|-----------|
| 1 | **Critical** | Pre-deploy command references non-existent script | `npm run lint && npm run typecheck && npm run lint:photos && npm run build` | `npm run lint` does not exist; `npm run build` already runs `lint:photos && tsc -b --noEmit && vite build` | ✅ Replaced with `npm run build` |
| 2 | **Critical** | Safety files mis-located | `src/content/distress-phrases.ts`, `slur-list.ts`, `synonyms.ts`, `hotlines.ts`, `fallbacks.ts` | All live in `src/server/` | ✅ Project structure rewritten |
| 3 | **Critical** | Curation tool dir doesn't exist | `tools/curation/` | Tools are `lint-photos.ts`, `upload-photos.mjs`, `upload-real-photos.mjs` | ✅ Recipe rewritten |
| 4 | High | Stale tech versions | React 18.3, TS 5.4, Vite 5+ | React 19.2, TS 6.0, Vite 8 | ✅ Tech Stack table deleted (derivable from package.json) |
| 5 | High | Photo count wrong | "~75 photos" | 10 photos in `photos.json` | ✅ Corrected |
| 6 | High | Branch name wrong | "`main` branch auto-deploys" | Default branch is `master` | ✅ Corrected |
| 7 | Medium | Two-Line Contract duplicated | Full table in CLAUDE.md AND `voice-and-safety.md` | One source of truth needed | ✅ Kept short rule in CLAUDE.md, pointed to memory file |
| 8 | Medium | Color palette duplicated | Full table in CLAUDE.md AND `design-system.md` | One source of truth | ✅ Removed table, pointed to memory file |
| 9 | Medium | Button variant table duplicated | In CLAUDE.md AND `design-system.md` | One source of truth | ✅ Removed |
| 10 | Medium | Missing components | PromptInput-only list | Footer, Header, GenerateButton, ErrorBoundary, CreditsDialog all exist | ✅ Project structure refreshed |
| 11 | Medium | Missing server file inventory | None | 11 files in `src/server/` | ✅ Added inline listing |
| 12 | Low | Stub workflow rule | "Manual smoke test before launch" — kept | Still valid | ✅ Kept |

### CLAUDE.md additions in the rewrite

- **Multi-Agent Safety** section — required because NightyTidy runs concurrent agents
- **`src/server/` security boundary** — explicit warning that mixing client/server imports leaks moderation lists
- **`PromptInput` raw-`<input>` exception** — documents that the rule "Shadcn for all interactive elements" has a deliberate carve-out, so future agents don't "fix" it
- **Filter pipeline expanded** — 9 numbered steps with the actual order (which differs from the old 6-step description)
- **Recipe for adding error copy** — completes the trio of common change patterns

### Line count

| Before | After | Target |
|--------|-------|--------|
| 248 | 177 | 250–400 |

Below target but appropriate — the project is small (~2200 LOC across all source files) and the rules are dense. Adding filler to hit 250 would be waste.

---

## 3. Critical Findings — Tier 2 Memory Files (BLOCKED)

All five memory files contain factual errors. Edits were attempted but rejected by the user's permission system on every file. The user should apply the diffs below manually or grant permissions and re-run.

### `voice-and-safety.md`

**Errors**:

- Line 16: `"Real-person target filter — ~100 named public figures + possessive+name regex"` — **`PUBLIC_FIGURES` is currently `[]` (empty)**. Only the possessive regex fires today. See [`src/server/safety.ts:23`](../src/server/safety.ts).
- Line 32 mis-orders the pipeline: lists "Rate-limit check" first, but the actual order in [`netlify/functions/generate.ts`](../netlify/functions/generate.ts) is: Zod → rate limit → slur → real-person → distress-phrase → distress-Haiku → generation loop (Sonnet → Zod → specificity → tone) → photo selection → safe fallback. The `voice-and-safety.md` ordering is close but skips Zod and conflates retries with the linear pipeline.
- Line 60 table — references `src/content/examples.ts` which doesn't exist; references `distress-phrases.ts`, `hotlines.ts`, `slur-list.ts`, `synonyms.ts`, `fallbacks.ts` as `src/content/` when all live in `src/server/`.
- Missing: `ENABLE_TONE_CHECK=false` opt-out, `placeholders.ts`, asymmetric "fail open" behavior of the Haiku check (returns `false` on error) and tone check (returns `true` on error)

**Proposed full rewrite**: See "Proposed memory file content" section below.

### `canvas-and-compositing.md`

**Errors**:

- Line 38 references `src/lib/textFitting.ts` — **file does not exist**. The actual fit-checking function is `checkFit()` in [`src/lib/compositor.ts`](../src/lib/compositor.ts).
- Line 46 says "Stage 4 — measureText() against usable width ±5% tolerance" — actual implementation uses `minScale >= 0.6` threshold (i.e., text shrinks up to 40% before falling back to a high-capacity photo). See `compositor.ts:153`.
- Line 50 — fallback ladder lists 4 rungs. Actual `selectPhoto()` returns rungs 1, 2, or 3, with rung 4 = client-side `fallback` from `safeFallbacks` (`fallbacks.ts`). Currently `fittingRung` is set client-side to `4` only when status is `safe_fallback`. The doc's framing is roughly right but doesn't match the code paths.
- Line 60 says "iOS Safari: use `file-saver` package workaround" — actually `file-saver` is used for ALL platforms in [`src/lib/download.ts`](../src/lib/download.ts); the iOS-specific behavior is the `isIOSSafari()` UI hint shown by `DownloadButton.tsx`, not a different download path.

**Proposed corrections** (full rewrite recommended):

```
| 4. Width verification | Client (Canvas) | `checkFit()` in `src/lib/compositor.ts` measures text against usable width; if `minScale >= 0.6`, returns `{ok:true, scale}`. Otherwise `{ok:false, reason:'overflow'}` triggers `onFitFailure` |
```

### `api-and-backend.md`

**Errors**:

- Line 22 — `error` response shape `{ status: 'error'; retryable: boolean; message: string }` is correct. ✓
- Line 27–37 — Function flow lists 9 steps but is missing the Zod request-validation step (which is step 1 in code) and conflates "Generation loop" into one bullet. The current numbering is also off by one from the actual code.
- Line 60 (`Error Handling` table) — describes 429/5xx/4xx retry semantics but **the actual `netlify/functions/generate.ts` has NO retry logic on 429s/5xx**. Retries happen INSIDE the generation loop only (format/specificity/tone failures), capped at 2. Network errors from the client side are handled in `src/lib/api.ts` which returns `{ status:'error', retryable: true }` on any 5xx or fetch failure.
- Missing: `ENABLE_TONE_CHECK` env var, `RATE_LIMIT_PER_HOUR=9999` bypass mechanism (skips entire rate-limit block, not just the cap), 3-second rate-limit timeout, `event.headers['x-country']` header for hotline routing

### `design-system.md`

**Largely accurate** with minor gaps:

- Component Library section says "Shadcn/UI for: Button, Input, Dialog, Textarea." — accurate, but should note `PromptInput` uses a raw `<input>` for the larger serif placeholder treatment. Without this note, a future agent will "fix" it by switching to Shadcn `Input` and lose the design.
- Spacing table — `space-poster-pad` listed but not actually a Tailwind token in `tailwind.config.ts`. The 24px padding is hardcoded as `PADDING` in `compositor.ts`.

### `prd-index.md`

**Accurate.** All 25 PRD docs (`PRD/00_README.md` through `PRD/24_Future_Features.md`) exist. No edits needed.

### `MEMORY.md`

**Largely fine** but missing:

- "Quick Rules" section listing 2–4 most-violated rules
- Cross-cutting pattern about the `src/server/` import boundary (currently only mentioned implicitly)
- Pointer for "Tests, mocks, vitest config" — would point to a new `testing.md` once that's created

---

## 4. Proposed Memory File Content (BLOCKED — user must apply manually)

The user's permission system blocked Write/Edit on all `.claude/memory/*.md` files. The full proposed content for each is below. To apply, the user can copy each section into the corresponding file (or grant permissions and re-run).

### Proposed `voice-and-safety.md`

```markdown
# Voice & Safety

Generation prompts, output validation, and safety filter pipeline.

## The Two-Line Contract

| Element | Target | Hard Cap | Voice |
|---------|--------|----------|-------|
| Line 1 | 30–50 chars | 60 | Sincere, reverent, wellness-influencer. Could appear unironically on Pinterest |
| Line 2 | 50–88 chars | 100 | Savagely honest pivot. Dry, deadpan, true. References user's specific situation |

**The format IS the joke.** Without contrast, both lines fail. Line 1 stays sincere — no winking. The trap only snaps shut on line 2.

## Voice Rules (Non-Negotiable)

System prompt and tone-check prompt both live in [`src/server/anthropic.ts`](../../src/server/anthropic.ts).

1. Line 2 punches at **the situation**, universal patterns, or absurdity — never at the user's worth, intelligence, body, or appearance
2. Voice = "a friend who has given up pretending to be encouraging." Not mean. Not therapeutic
3. **Specificity is the whole game.** If user mentions "third coffee," line 2 must reference caffeine/mornings/escalation
4. No exclamation points, emojis, "lol," moralizing, real-person names, politics
5. Line 1 stays sincere — no winking

## Off-Topic Input Handling

The format never breaks. Factual questions, gibberish, or explainers get absorbed:
- Line 1 stays reverent on whatever theme the input suggests
- Line 2 pivots to the meta-absurdity of having typed that into this app

## Filter Pipeline (Cost-Optimized Order)

Implemented in [`netlify/functions/generate.ts`](../../netlify/functions/generate.ts). Each step short-circuits on hit.

1. **Zod request schema** — `prompt` ≤ 200 chars, trimmed; `excludePhotoIds: string[]`. Reject → 400 `{status:'error', retryable:false}`
2. **Rate-limit check** — Firestore txn (3s timeout, fails open on error). Skipped if `RATE_LIMIT_PER_HOUR=9999`
3. **Slur filter** — whole-word regex against [`slur-list.ts`](../../src/server/slur-list.ts). **Currently empty** — must be populated before launch
4. **Real-person filter** — `POSSESSIVE_NAME_PATTERN` (`my <relationship> <CapitalizedName>`) + `PUBLIC_FIGURES` array. **`PUBLIC_FIGURES` is currently empty `[]`**; only the possessive pattern fires today
5. **Distress phrase list** — substring match against ~30 phrases in [`distress-phrases.ts`](../../src/server/distress-phrases.ts) (server-only)
6. **Distress Haiku classifier** — only if phrase list MISSES. Returns `crisis` | `ok`. **On error returns `false` (fails open intentionally)**
7. **Generation loop** — Sonnet → Zod parse → specificity (lexical) → tone (Haiku). **Up to 2 retries** (3 attempts total). On exhaustion → `safe_fallback`
8. **Photo selection** — see [canvas-and-compositing.md](canvas-and-compositing.md)

## Output Validation Sequence

```
Sonnet → strip ```json fences → JSON.parse → Zod (.strict, max 60/100)
    ↓ pass
checkSpecificity(prompt, line2)  ← lexical: tokenize, stem, synonym map
    ↓ pass
checkTone(anthropic, prompt, line2) ← Haiku classifies "user" vs "safe"
    ↓ pass → ship
```

- **Specificity** ([`validation.ts`](../../src/server/validation.ts)): token overlap → stem match → [`synonymMap`](../../src/server/synonyms.ts) (~30 entries). Free pass if `isOffTopic(prompt)` (contains `?`, ≤1 token, low letter ratio, all-stopwords)
- **Tone** ([`anthropic.ts:checkTone`](../../src/server/anthropic.ts)): `verdict.startsWith('safe')` passes. Failure on Haiku error returns `true` (fails open). Set `ENABLE_TONE_CHECK=false` to opt out entirely
- **Asymmetric tuning**: false positives cost a regeneration; false negatives ship hostile content

## Distress Response

- Modal: warm, brief, dismissible — [`DistressInterstitial.tsx`](../../src/components/DistressInterstitial.tsx)
- No clinical language, no scolding. Input NOT cleared on dismiss
- Hotline routing: `event.headers['x-country']` (Netlify-injected) → [`hotlines.ts`](../../src/server/hotlines.ts). Mapped: US, GB, CA, AU, IE, NZ, IN, DE, FR
- Fallback: findahelpline.com for unmapped countries

## Content File Boundary

| File | Purpose | Loaded by |
|------|---------|-----------|
| [`src/content/copy.ts`](../../src/content/copy.ts) | In-voice UI strings | Client |
| [`src/content/presets.ts`](../../src/content/presets.ts) | Mood button labels | Client |
| [`src/content/placeholders.ts`](../../src/content/placeholders.ts) | Input placeholder rotation | Client |
| [`src/server/distress-phrases.ts`](../../src/server/distress-phrases.ts) | Crisis phrase list | **Server only** |
| [`src/server/slur-list.ts`](../../src/server/slur-list.ts) | Hate-speech filter | **Server only** |
| [`src/server/hotlines.ts`](../../src/server/hotlines.ts) | Crisis line routing | Server |
| [`src/server/synonyms.ts`](../../src/server/synonyms.ts) | Specificity check map | Server |
| [`src/server/fallbacks.ts`](../../src/server/fallbacks.ts) | Safe canned posters | Server |

**Anything imported into `src/server/*` MUST NOT be imported by client code.** The bundler does not enforce this — import discipline is the only guard against shipping moderation lists to the browser.

## Common Mistakes

- Adding a preset without a `synonymMap` entry → specificity rejects valid Sonnet output → unnecessary retries
- Logging `output.line2` for debugging → leaks user-tied content (forbidden — only event types and metadata)
- Importing `slur-list.ts` from a client file → ships the moderation list publicly
- Adding a phrase to `distress-phrases.ts` that's also everyday hyperbole ("this is killing me") → false positives. Phrase list must stay high-precision; Haiku handles ambiguity
```

### Proposed `canvas-and-compositing.md`

Critical corrections:
- Replace `src/lib/textFitting.ts` with `src/lib/compositor.ts` (the `checkFit()` function, line 125)
- Stage 4 logic: `minScale >= 0.6` threshold, not "±5% tolerance"
- Fallback rungs: 1 (eligible), 2 (high-capacity excluding session), 3 (high-capacity ignoring session) all server-side; client-side `safe_fallback` is the 4th rung
- Note `ensureFontsReady()` is the canonical font-load gate — not raw `document.fonts.ready` (which it wraps)
- File-saver is used universally; iOS hint is purely UI in `DownloadButton.tsx`

### Proposed `api-and-backend.md`

Critical corrections:
- Step the function flow as 9 numbered items (currently 9 in code, 9 in doc but mis-mapped)
- Remove the Error Handling table about 429/5xx retries — that logic does NOT exist in `generate.ts`. Client-side error mapping is in `src/lib/api.ts` (5xx → `anthropicError`, network failure with `!navigator.onLine` → `networkOffline`, else `unknown`)
- Add `ENABLE_TONE_CHECK=false` documentation
- Add the `x-country` header → hotline routing flow

### Proposed `design-system.md`

Add to Component Library:
> **Note**: [`PromptInput`](../../src/components/PromptInput.tsx) intentionally uses a raw `<input>` (not Shadcn `Input`) for the larger serif placeholder treatment. All other interactive elements MUST go through Shadcn primitives.

Remove `space-poster-pad` from Spacing table OR change to inline-code "(constant in `compositor.ts`, not a Tailwind token)".

### Proposed new file: `testing.md`

```markdown
# Testing

Vitest setup, mock patterns, and gotchas for [`tests/client/`](../../tests/client/) and [`tests/server/`](../../tests/server/).

## Setup

- Framework: Vitest 4.x
- Config: in [`vite.config.ts`](../../vite.config.ts) under `test:` — `globals: true`, `environment: 'node'`, `include: ['tests/**/*.test.ts']`
- Globals: `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach` auto-imported
- Path alias: `@/*` → `src/*`

## Commands

- `npm test` — full suite, runs once
- `npm run test:watch` — watch mode
- `npx vitest run tests/server/safety.test.ts` — single file

## Mock Patterns

### Server tests — mock firebaseAdmin

```ts
vi.mock('@/server/firebaseAdmin', () => ({ db: {} }));
```

See [`tests/server/rateLimit.test.ts`](../../tests/server/rateLimit.test.ts).

### Server tests — mock the slur list

```ts
vi.mock('@/server/slur-list', () => ({
  slurList: ['retard', 'fag', /* ... */],
}));
```

The actual `slur-list.ts` is empty in source. See [`tests/server/safety.test.ts`](../../tests/server/safety.test.ts).

### Client tests — mock fetch

```ts
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve(mockBody),
});
```

`vi.restoreAllMocks()` in `beforeEach` and `afterEach` to prevent state leak.

### Client tests — manipulate `navigator.onLine`

```ts
Object.defineProperty(globalThis.navigator, 'onLine', {
  value: false,
  configurable: true,
});
```

Modern Node provides `navigator` even though `environment: 'node'`.

## Coverage

| Area | Spec | Notes |
|------|------|-------|
| Slur / real-person / distress-phrase | `tests/server/safety.test.ts` | `checkDistressWithHaiku` (network) NOT covered |
| Zod parse + specificity | `tests/server/validation.test.ts` | Tone check NOT covered |
| Daily-salted IP hashing | `tests/server/rateLimit.test.ts` | Firestore txn NOT covered |
| 3-rung photo selection | `tests/server/photoSelection.test.ts` | Inline mock photos |
| API client error mapping | `tests/client/api.test.ts` | Mocks `fetch` |
| photos.json integrity | `tests/client/textFitting.test.ts` | **Misnamed** — tests metadata, not fitting |

## Gaps

- No tests for `compositor.ts` (Canvas hard to test in jsdom)
- No tests for `generate.ts` end-to-end (would need Anthropic mock)
- `tests/client/textFitting.test.ts` is misnamed — actually validates `photos.json`

## Common Mistakes

- Forgetting `vi.restoreAllMocks()` → leaked `fetch` mocks cascade
- Importing `'firebase-admin/firestore'` without mocking `@/server/firebaseAdmin` → real Firebase init
- Defaulting to `environment: 'jsdom'` → not used today; if you add component tests, set per-file via `// @vitest-environment jsdom`
```

### Proposed updated `MEMORY.md`

```markdown
# Bless Your Heart — Memory Index

Navigation index for AI agent context. See [CLAUDE.md](../../CLAUDE.md) for project rules.

## Quick Rules (most frequently triggered)

- **NEVER import `src/server/*` from client code** — leaks moderation lists
- **NEVER log prompt or output content** — events and metadata only
- **ALWAYS `await ensureFontsReady()` before Canvas measureText/fillText** — falling back to system serif breaks the joke
- **ALWAYS `npm run build` before claiming work is done** — type-check + photos lint + Vite build all run

## Topic Files

| File | When to load |
|------|--------------|
| [voice-and-safety.md](voice-and-safety.md) | Working on generation prompts, safety filters, distress detection, tone validation, content boundary |
| [canvas-and-compositing.md](canvas-and-compositing.md) | Working on poster rendering, text fitting, font loading, download flow |
| [design-system.md](design-system.md) | Building or modifying UI components, colors, typography, spacing, animations |
| [api-and-backend.md](api-and-backend.md) | Working on the Netlify function, rate limiting, request/response shapes |
| [testing.md](testing.md) | Writing or fixing tests, mock patterns, vitest config (proposed — does not exist yet) |
| [prd-index.md](prd-index.md) | Need detailed product specs — maps topics to PRD doc numbers |

## Cross-Cutting Patterns

- **Server boundary**: `src/server/*` is bundled into the Netlify function only. Importing from client is a security regression
- **In-voice copy**: never hardcode user-facing strings — all live in `src/content/`
- **Cost optimization**: filters ordered cheapest-first — word lists (free) → Haiku (~$0.0003) → Sonnet (~$0.005)
- **Contract always holds**: user always gets a poster, never a raw error; safe fallback is the last rung
- **Single typeface**: Cormorant Garamond everywhere — UI and Canvas
- **Visual quality is half the joke**: cheap-looking output kills the product

## Current State

- Photo library: 10 entries (target: 75+)
- `slur-list.ts` and `PUBLIC_FIGURES` arrays are empty — populate before launch
- ESLint not configured — only TypeScript strict mode + photos lint
- Default branch: `master`
```

---

## 5. Coverage Gaps

| Module | Coverage Status | Recommended File |
|--------|-----------------|------------------|
| Vitest configuration & mock patterns | None | New `testing.md` (proposed above) |
| Build pipeline / Netlify deploy / firebase rules / vite config / tailwind config | Scattered | New `build-infrastructure.md` (low priority — small project, derivable from configs) |
| Component inventory (Footer, Header, ErrorBoundary, CreditsDialog, GenerateButton) | None | Could be a `components.md` or merged into existing `design-system.md` |

The two highest-leverage additions are `testing.md` (since tests are a recurring task) and the corrections to existing memory files (since they contain factually wrong claims that would mislead an agent).

---

## 6. What Was Actually Changed in This Run

### Modified
- [`CLAUDE.md`](../CLAUDE.md): full rewrite. Old: 248 lines with 12+ factual errors and ~40% duplication with memory files. New: 177 lines, no duplication, all references verified, Multi-Agent Safety section added.

### Created
- [`audit-reports/01_DOCUMENTATION_COVERAGE_REPORT_001_2026-05-01_15-32.md`](01_DOCUMENTATION_COVERAGE_REPORT_001_2026-05-01_15-32.md) — this report.

### Blocked
- All edits to `.claude/memory/*.md` (5 files) — denied by the user's permission system. Proposed content is in this report.

---

## 7. Verification

| Check | Result |
|-------|--------|
| All file paths in CLAUDE.md resolve | ✅ 19/19 verified |
| `npm run typecheck` would still work | ✅ Script exists in `package.json` |
| `npm run build` would still work | ✅ Script exists; doc command matches |
| MEMORY.md targets exist (5 referenced files) | ✅ All exist (with stale content) |
| No broken postmortem references introduced | ✅ N/A — no postmortems exist in this project yet |
| No references to deleted modules | ✅ N/A — no deletions performed |

---

## 8. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|----------------|--------|-----------------|--------------|---------|
| 1 | Apply proposed memory file rewrites | High | High — agents currently read claims that contradict the code | **Yes** | The errors in `voice-and-safety.md` ("real-person filter (~100 named public figures)") and `canvas-and-compositing.md` (`src/lib/textFitting.ts` doesn't exist) will cause confused exploration and possibly wrong fixes |
| 2 | Add `testing.md` to memory | Medium | Medium — new agents will re-discover mock patterns | **Yes** | Tests are a recurring task; the firebaseAdmin and slur-list mock patterns are non-obvious |
| 3 | Populate `slur-list.ts` and `PUBLIC_FIGURES` | Critical (product) | Critical — moderation is unenforced | **Yes** | Pre-launch blocker, not a doc issue but surfaced during audit |
| 4 | Investigate why `.claude/memory/*.md` files are flagged sensitive | Low (workflow) | Medium — blocks future doc refresh runs | Probably | If the user wants Claude Code to manage memory automatically, the permission rule needs adjusting; otherwise expect every refresh pass to require manual application |
| 5 | Rename `tests/client/textFitting.test.ts` → `tests/client/photoMetadata.test.ts` | Low | Low — confusing for future agents | Only if time allows | The file tests `photos.json` integrity, not text fitting |

---

**End of report.**
