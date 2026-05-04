# Function Centralization Audit — Run 001

**Date:** 2026-05-04 12:19 (local)
**Branch:** `nightytidy/run-2026-05-01-1532`
**Mode:** Read-only analysis (no code changes)
**Scope:** All `src/**/*.{ts,tsx}` + `netlify/functions/*.ts` + `tests/**/*.ts`

---

## Executive Summary

Inventoried **~85 callable units** across **41 source files** and **27 test files**. Found **12 consolidation opportunities** total: **6 high-confidence** (structural near-duplicates that would unify under a clean signature with little judgment cost), **4 medium-confidence** (semantic duplication where the merged shape is debatable), and **2 explicitly-not-recommended** (cases where the duplication is either intentional or where the abstraction cost exceeds the savings).

The codebase is small, recently audited (16 prior NightyTidy runs), and well-factored — there are no large copy-paste clones. The opportunities here are tighter: structural-log helpers, two near-identical Anthropic Haiku classifiers, a 5-call `randomPick` pattern, and shared test fixtures that diverged across three integration files.

The single most valuable win is **CG-02 (structured logging helper)**: 14 inline `console.{log,error}(JSON.stringify({event, ...}))` calls live across `generate.ts`, `anthropic.ts`, and `safety.ts`. This shape has *already* drifted once — audit run 13/001 closed two gaps where `error: String(err)` was missing from the catch payload — and CLAUDE.md now pins the format as a convention. A 4-line helper would eliminate the failure mode permanently.

---

## Phase 1 — Inventory by Purpose Category

### Anthropic API call wrappers
- `generateLines` ([src/server/anthropic.ts:59](../src/server/anthropic.ts)) — Sonnet generation
- `checkTone` ([src/server/anthropic.ts:95](../src/server/anthropic.ts)) — Haiku tone classifier
- `checkDistressWithHaiku` ([src/server/safety.ts:50](../src/server/safety.ts)) — Haiku crisis classifier

### Word/phrase list matchers
- `checkSlurFilter` ([src/server/safety.ts:5](../src/server/safety.ts)) — regex word-boundary, full list
- `checkRealPersonFilter` ([src/server/safety.ts:25](../src/server/safety.ts)) — possessive-name regex + PUBLIC_FIGURES word-boundary
- `checkDistressPhraseList` ([src/server/safety.ts:35](../src/server/safety.ts)) — substring match
- `checkSynonymMap` ([src/server/synonyms.ts:35](../src/server/synonyms.ts)) — synonym lookup

### Lazy singleton initialization
- `getAnthropicClient` ([src/server/anthropic.ts:5](../src/server/anthropic.ts))
- `getDb` ([src/server/firebaseAdmin.ts:21](../src/server/firebaseAdmin.ts))
- `ensureFontsReady` ([src/lib/fonts.ts:3](../src/lib/fonts.ts))
- `initAnalytics` ([src/lib/analytics.ts:5](../src/lib/analytics.ts))

### Random selection from array
- `randomPick<T>` ([src/server/photoSelection.ts:8](../src/server/photoSelection.ts)) — generic
- `pickLoadingPhrase` ([src/App.tsx:24](../src/App.tsx))
- `respondWithSafeFallback` random pick ([netlify/functions/generate.ts:52](../netlify/functions/generate.ts))
- `placeholders[Math.floor(...)]` ([src/components/PromptInput.tsx:13](../src/components/PromptInput.tsx))
- `Math.floor(Math.random() * EXAMPLES.length)` ([src/components/HeroExamples.tsx:10](../src/components/HeroExamples.tsx))

### Structured logging emitters
- 14 inline `console.{log,error}(JSON.stringify({event, ...}))` calls (see CG-02)

### URL/href safety wrappers
- `safeTelHref` ([src/components/DistressInterstitial.tsx:16](../src/components/DistressInterstitial.tsx))
- `safeHotlineHref` ([src/components/DistressInterstitial.tsx:25](../src/components/DistressInterstitial.tsx))
- Static `tel:988` and `https://findahelpline.com` ([src/components/Footer.tsx:9-11](../src/components/Footer.tsx)) — not sanitized (literal, safe by construction)

### Canvas operations
- `setupCanvas`, `composite`, `drawWatermark`, `checkFit`, `loadImage`, `setLetterSpacing` — all in [src/lib/compositor.ts](../src/lib/compositor.ts)

### React event handlers
- 3 near-identical `if (result.status === X) { setLoading + revert + track + return }` blocks ([src/App.tsx:73-95](../src/App.tsx))
- `setPosterState((prev) => prev.phase === 'loading' ? { phase: 'idle' } : prev)` literally repeated 3× verbatim

### HTTP response builders
- `jsonResponse`, `rateLimitHeaders`, `respondWithSafeFallback` ([netlify/functions/generate.ts:29-63](../netlify/functions/generate.ts))

### Test helpers (duplicated across files)
- `callHandler` × 3 files
- `mockSonnetReply` × 3 files (verbatim)
- `mockHaikuReply` × 3 files (verbatim)
- `makePhoto` × 3 files (different signatures)
- Anthropic mock factory pattern × 3 files

---

## Phase 2 — Structural Near-Duplicates (HIGH confidence)

### CG-01 — Anthropic Haiku classifier wrappers

| Field | Detail |
|---|---|
| Functions | `checkTone` ([src/server/anthropic.ts:95](../src/server/anthropic.ts)), `checkDistressWithHaiku` ([src/server/safety.ts:50](../src/server/safety.ts)) |
| Callers | `checkTone`: 1 caller (generate.ts:230). `checkDistressWithHaiku`: 1 caller (generate.ts:195) |
| What's identical | Same model env (`ANTHROPIC_MODEL_SAFETY ?? 'claude-haiku-4-5'`), same `max_tokens: 10`, same `temperature: 0`, same response-text extraction (`response.content[0].type === 'text' ? trim().toLowerCase() : <fallback>`), same `verdict.startsWith(<keyword>)` return, same `try/catch` shape with `console.error(JSON.stringify({event, error: String(err)}))` and a fallback boolean |
| What differs | (1) System prompt text, (2) verdict keyword (`'safe'` vs `'crisis'`), (3) error-fallback boolean (`true` vs `false`), (4) extra inputs to user message (tone gets prompt+line2; distress gets only prompt), (5) tone has an env bypass (`ENABLE_TONE_CHECK === 'false'`) |
| Unified signature | `classifyWithHaiku(anthropic, { systemPrompt, userMessage, verdictKeyword, fallbackOnError, eventName, bypassEnv? }): Promise<boolean>` |
| Confidence | High |

**Lines saved:** ~44 → ~25 (**~19 lines**, plus ~5 lines if the helper consumer encodes the bypass flag inline).

**Caveat:** `checkTone`'s `ENABLE_TONE_CHECK=false` bypass would become a parameter, slightly muddying the helper's purity. Acceptable.

---

### CG-02 — Structured-log helper

| Field | Detail |
|---|---|
| Pattern | `console.{log\|error}(JSON.stringify({ event: '...', error?: String(err), ...payload }))` |
| Occurrences | **14 total** |
| Files | [generate.ts](../netlify/functions/generate.ts) (lines 51, 118, 149, 166, 173, 182, 198, 219, 225, 232, 240, 261), [anthropic.ts:120](../src/server/anthropic.ts), [safety.ts:69](../src/server/safety.ts) |
| What's identical | All 14 emit a JSON object with an `event` field. 4 of 14 are error logs that include `error: String(err)` |
| What differs | event name, optional payload fields (e.g. `reason`, `hashedIp`, `fittingRung`, `retries`, `model`) |
| Unified signature | `logEvent(event: string, payload?: Record<string, unknown>): void` (uses `console.log`) and `logError(event: string, err: unknown, payload?: Record<string, unknown>): void` (uses `console.error` and merges `error: String(err)` automatically) |
| Drift risk | **HIGH** — CLAUDE.md mandates this exact shape with `error: String(err)`. Audit run 13/001 already closed two gaps where the `err` binding was missing (so the logged shape was just `{event}` with the cause lost). A helper makes the contract automatic and removes the entire failure mode |
| Confidence | High |

**Lines saved:** ~10. **Future-incident risk eliminated:** the 13/001 fix can never regress.

**Proposed location:** `src/server/log.ts` (server-only since all 14 callers are in server modules, and it would otherwise be tempted to leak to the client).

---

### CG-03 — `randomPick<T>(arr: T[]): T`

| Field | Detail |
|---|---|
| Pattern | `arr[Math.floor(Math.random() * arr.length)]` |
| Occurrences | **5** |
| Files | [photoSelection.ts:9](../src/server/photoSelection.ts) (already a generic helper, but private), [App.tsx:25](../src/App.tsx), [generate.ts:52](../netlify/functions/generate.ts), [PromptInput.tsx:13](../src/components/PromptInput.tsx), [HeroExamples.tsx:10](../src/components/HeroExamples.tsx) |
| What's identical | Identical formula |
| What differs | Nothing meaningful; HeroExamples just uses the index, the others use the element |
| Unified signature | `randomPick<T>(arr: readonly T[]): T` and optional `randomIndex(length: number): number` |
| Confidence | High |
| Boundary note | The existing helper lives under `src/server/`, which is forbidden to client imports per CLAUDE.md. New home should be `src/lib/random.ts` so both client and server can consume it. Server's existing `randomPick` can re-export from `src/lib/random.ts` or be deleted. |

**Lines saved:** ~3, but the larger value is removing inline duplication noise and giving future contributors an obvious helper to reach for instead of inlining a 6th time.

---

### CG-04 — Word-boundary list matcher

| Field | Detail |
|---|---|
| Functions | `checkSlurFilter` ([src/server/safety.ts:5](../src/server/safety.ts)), PUBLIC_FIGURES branch of `checkRealPersonFilter` ([src/server/safety.ts:29-32](../src/server/safety.ts)) |
| Callers | 1 each (handler in generate.ts) |
| What's identical | `prompt.toLowerCase()` then `list.some(item => new RegExp('\\b' + escapeRegex(item) + '\\b', 'i').test(normalized))` |
| What differs | Only the list (`slurList` vs `PUBLIC_FIGURES`) |
| Unified signature | `containsAnyWord(text: string, words: readonly string[]): boolean` |
| Confidence | High |

**Lines saved:** ~6 lines; both filters become 1-liners delegating to the shared matcher (`return containsAnyWord(prompt, slurList)` / `return POSSESSIVE_NAME_PATTERN.test(prompt) || containsAnyWord(prompt, PUBLIC_FIGURES)`).

**Caveat:** `PUBLIC_FIGURES` is currently `[]`, so the second-half branch is technically dead today. CG-04 still earns its keep because the caller-of-empty-list path is defined behavior (returns false) and removing the branch would weaken the safety contract.

---

### CG-05 — Test handler invocation helpers (`callHandler`, `mockSonnetReply`, `mockHaikuReply`)

| Field | Detail |
|---|---|
| Functions | `callHandler` × 3, `mockSonnetReply` × 3, `mockHaikuReply` × 3 |
| Files | [tests/server/generate-integration.test.ts:51,63,69](../tests/server/generate-integration.test.ts), [tests/server/generate-contract.test.ts:127,139,145](../tests/server/generate-contract.test.ts), [tests/server/generate-rate-limit-integration.test.ts:79,91,97](../tests/server/generate-rate-limit-integration.test.ts) |
| What's identical | `mockSonnetReply` and `mockHaikuReply` are **byte-for-byte identical** in all 3 files. `callHandler` differs only in whether the `method` parameter is exposed |
| What differs | Contract test exposes `method` to test 405; integration tests are POST-only. Rate-limit version doesn't accept string body |
| Unified signature | `callHandler(body: unknown, headers?: Record<string,string>, method?: string)` plus `mockSonnetReply(line1, line2)` and `mockHaikuReply(verdict)` |
| Confidence | High |

**Lines saved:** ~30 across the 3 files (each helper is ~10 lines × 3 files − one shared definition).

**Important constraint:** the helpers must be co-located with the test files because `import { handler } from '../../netlify/functions/generate'` is the load-bearing import. The CLAUDE.md note that env writes in these test files are deliberately at module scope (above `import { handler }`) means the helper must accept an externally-bound `handler` — easiest path: helper is parameterized as `makeCallHandler(handler)`, or each test file does `import { callHandler } from './_helpers/handler'` after its own env+mock setup.

**Proposed location:** `tests/helpers/handler.ts` exporting a factory `makeHandlerHelpers(handler, anthropicCreate)`. The 3 test files would call `const { callHandler, mockSonnetReply, mockHaikuReply } = makeHandlerHelpers(handler, anthropicCreate)` immediately after their `import { handler }` line.

---

### CG-06 — Test photo factory (`makePhoto`)

| Field | Detail |
|---|---|
| Functions | `makePhoto` × 2 distinct signatures, plus inline literal photos × 1 file |
| Files | [tests/server/photoSelection-extended.test.ts:5](../tests/server/photoSelection-extended.test.ts) (positional: `(id, line1, line2, tier)`), [tests/client/compositor.test.ts:11](../tests/client/compositor.test.ts) (overrides: `(overrides: Partial<Photo>)`), [tests/server/photoSelection.test.ts:5-9](../tests/server/photoSelection.test.ts) (3 inline literals) |
| What's identical | All produce a `Photo` with the same default `width: 1080`, `height: 1080`, `textZone`, `textColor: 'white'`, `watermarkPosition: 'lower-right'`, `tier: 'standard'`, `credit: ''` |
| What differs | Only how the caller specifies `id`, `capacity`, and occasionally `tier` |
| Unified signature | `makePhoto(overrides?: Partial<Photo>): Photo` (the compositor.test.ts shape is more flexible and should win) |
| Confidence | High |

**Lines saved:** ~25 lines across the 3 files.

**Proposed location:** `tests/helpers/fixtures.ts` exporting `makePhoto`. Optionally co-locate `makeHotline()`, `makeMockEvent()` for future tests.

---

## Phase 3 — Semantic Duplication (MEDIUM confidence)

### CG-07 — App.tsx early-return guard pattern

| Field | Detail |
|---|---|
| Pattern | 3 nearly-identical 4-line guards in `handleGenerate` (App.tsx:73-95): for `status === 'distress' \| 'blocked' \| 'rate_limited'`, each runs `setLoading(false)` + `setPosterState((prev) => prev.phase === 'loading' ? { phase: 'idle' } : prev)` + `track(...)` + per-branch action (`setDistressData` / `setInlineError` / `setInlineError`) + `return` |
| Callers | 1 file, 3 sites |
| What's identical | First two lines verbatim. The poster-state revert ternary is byte-identical 3 times |
| What differs | track event name, the per-branch action call (1-2 lines) |
| Proposed approach | Extract a `dismissLoadingState()` local helper inside `handleGenerate` that wraps the 2-line revert. The `track` and per-branch action stay inline (they're the meaningful per-status logic). Or extract a per-status switch table |
| Confidence | Medium |

**Lines saved:** ~6.

**Why medium and not high:** the guard *bodies* (3 lines per branch when measured generously) are short enough that the helper saves only the 2-line revert. Worth doing because the verbatim-duplicated `setPosterState((prev) => prev.phase === 'loading' ? { phase: 'idle' } : prev)` ternary is exactly the kind of subtle pattern that drifts silently if one branch is updated and others are forgotten. Note this audit also pairs naturally with adapting App.tsx to use a switch over `result.status` — but that's a CG-16-style elegance refactor, not strict centralization.

---

### CG-08 — Watermark position lookup table

| Field | Detail |
|---|---|
| Pattern | `drawWatermark` ([src/lib/compositor.ts:91-112](../src/lib/compositor.ts)) has a 4-arm switch over `WatermarkPosition`. Each arm sets `textAlign`, `textBaseline`, then calls `fillText(text, x, y)` with x/y being one of `padding` or `LOGICAL_SIZE - padding` |
| Callers | 1 (composite) |
| What's identical | All 4 arms are 3 lines with the same fillText shape |
| What differs | Only the `align` (`'left' \| 'right'`), `baseline` (`'top' \| 'alphabetic'`), and the x/y selection |
| Proposed approach | Replace the switch with a `WATERMARK_LAYOUTS: Record<WatermarkPosition, {align, baseline, x: (size, pad) => number, y: (size, pad) => number}>` table. The function body becomes `const layout = WATERMARK_LAYOUTS[photo.watermarkPosition]; ctx.textAlign = layout.align; ctx.textBaseline = layout.baseline; ctx.fillText(text, layout.x(LOGICAL_SIZE, padding), layout.y(LOGICAL_SIZE, padding));` |
| Confidence | Medium |

**Lines saved:** ~14 (22 lines → ~8).

**Why medium:** the switch is already self-documenting; a lookup table is an aesthetic preference. Worth doing if the watermark gets a 5th position; not urgent today.

---

### CG-09 — Font spec string constants

| Field | Detail |
|---|---|
| Pattern | The strings `'500 64px "Cormorant Garamond"'` (line 1), `'italic 400 44px "Cormorant Garamond"'` (line 2), `'400 18px "Cormorant Garamond"'` (watermark) appear in **2 files** |
| Files | [compositor.ts](../src/lib/compositor.ts) (composite, drawWatermark, checkFit), [fonts.ts](../src/lib/fonts.ts) (ensureFontsReady's preload list) |
| Total occurrences | 6 (3 in compositor `composite`/`drawWatermark`, 2 in compositor `checkFit`, 3 in fonts.ts) — actually 5 distinct strings, but the line-1/line-2 strings appear in both files |
| What's identical | Identical strings |
| Drift risk | **HIGH** — if the design team changes the font weight or size, the developer must update both files. Today's design is `500 64px` for line 1; if it becomes `500 60px` and only `composite` is updated, the font preload at app startup will preload the wrong size and the first render will jank |
| Proposed approach | Export `LINE1_FONT_SPEC = '500 64px "Cormorant Garamond"'` etc. from a new `src/lib/fontSpecs.ts` (or co-locate in compositor.ts since it owns canvas rendering). Both fonts.ts and compositor.ts consume |
| Confidence | Medium |

**Lines saved:** 0 net. **Drift risk eliminated:** legitimate.

---

### CG-10 — `findahelpline.com` URL hardcoded in 3 places

| Field | Detail |
|---|---|
| Files | [src/server/hotlines.ts:19](../src/server/hotlines.ts) (server fallback), [src/components/Footer.tsx:10](../src/components/Footer.tsx) (footer), [src/components/DistressInterstitial.tsx:26,35](../src/components/DistressInterstitial.tsx) (client fallback) |
| Drift risk | Low (the URL is unlikely to change), but if it does change all 3 sites must update together |
| Proposed approach | Export `INTL_HOTLINE_URL = 'https://findahelpline.com'` from `src/lib/external-urls.ts` |
| Confidence | Medium / Low priority |

**Lines saved:** 0. Mostly a forward-looking discipline.

---

## Phase 4 — Cross-Boundary Duplication

### CG-11 — Zod schemas mirroring `GenerateResponse` type union

| Field | Detail |
|---|---|
| Locations | [src/types/index.ts:45-51](../src/types/index.ts) (TypeScript discriminated union), [tests/server/generate-contract.test.ts:68-122](../tests/server/generate-contract.test.ts) (mirrored Zod schemas) |
| Boundary crossed | TypeScript types ↔ Runtime Zod validation (test-only) |
| Drift risk | Real, but **already documented and mitigated**. CLAUDE.md explicitly states: "Update GenerateResponse in src/types/index.ts AND the mirrored Zod schema in generate-contract.test.ts together — they're load-bearing" |
| Proposed approach | Define schemas in Zod and `z.infer<>` the TypeScript types from them — single source of truth |
| Recommendation | **Do not consolidate.** The team has consciously chosen the dual-source approach as a contract-pinning mechanism. The mirrored schema is the *test* of the type, and collapsing them removes the safety net. CLAUDE.md treats this as a feature |
| Confidence | N/A (intentional duplication) |

---

### CG-12 — Zod request schema (server) vs no client-side validation

| Field | Detail |
|---|---|
| Locations | [netlify/functions/generate.ts:13-16](../netlify/functions/generate.ts) (`RequestSchema` validates `prompt` + `excludePhotoIds` server-side); client never validates before posting |
| Boundary crossed | Frontend ↔ Backend |
| Drift risk | Low — the client already enforces `<input maxLength={200}>` and `prompt.trim().length > 0` matches the server's `min(1).max(200)`. But this is **two implementations of the same business rule** that *could* drift |
| Proposed approach | Either (a) accept the duplication as defense-in-depth (server is the source of truth, client adds UX guards), or (b) extract a shared `validatePrompt()` callable from both — but the client check is inside JSX, hard to share cleanly |
| Recommendation | **Do not consolidate.** The 200-char limit is enforced in 2 places already (client `maxLength`, server `z.string().max(200)`); the symmetry is intentional. Merging would add complexity for no behavioral gain |
| Confidence | N/A (intentional duplication) |

---

## Lazy singleton initialization (NOT recommended for consolidation)

The 4 lazy-init patterns (`getAnthropicClient`, `getDb`, `ensureFontsReady`, `initAnalytics`) all use module-level state guards. **Do not consolidate.** Each is 5-15 lines, the abstraction would need to thread differing return types and side effects, and a generic `lazyInit<T>(setupFn)` saves ~3 lines per call site at the cost of a more confusing initialization graph. The current pattern is read-once and clear; leave it alone.

---

## Phase 5 — Ranked Consolidation Groups

| Rank | ID | Title | Files | Total occurrences | Lines saved (est.) | Drift risk reduction | Confidence | Priority |
|---|---|---|---|---|---|---|---|---|
| 1 | CG-02 | Structured log helper | 3 | 14 | ~10 | **High** (closes audit-13/001 regression class permanently) | High | **High** |
| 2 | CG-05 | Test handler/mock helpers | 3 test files | 9 helpers (3×3) | ~30 | Medium (test consistency) | High | **High** |
| 3 | CG-01 | Haiku classifier wrapper | 2 | 2 | ~19 | Medium | High | High |
| 4 | CG-06 | Test `makePhoto` factory | 3 test files | 3 factories | ~25 | Low | High | Medium |
| 5 | CG-09 | Font spec constants | 2 | 6 | 0 | **High** (font/preload drift would break first paint) | Medium | Medium |
| 6 | CG-04 | Word-list matcher | 1 | 2 | ~6 | Low | High | Medium |
| 7 | CG-03 | `randomPick<T>` | 5 | 5 | ~3 | Low | High | Low |
| 8 | CG-07 | App.tsx revert-loading guard | 1 | 3 | ~6 | Low | Medium | Low |
| 9 | CG-08 | Watermark position table | 1 | 4 (branches) | ~14 | Low | Medium | Low |
| 10 | CG-10 | `findahelpline.com` constant | 3 | 3 | 0 | Low | Medium | Low |

**Totals if all 10 actioned:** ~113 lines reduced, 1 documented historical incident class permanently closed (CG-02), 1 latent first-paint drift risk closed (CG-09).

---

## Root-Cause Analysis

Why does this duplication exist?

1. **Organic growth + small surface area.** The codebase is ~3500 lines of source. Two safety classifiers were written months apart for different concerns (tone vs distress); they evolved to the same Haiku-call shape independently. There was no precedent helper to extend.
2. **Strict server/client boundary.** `randomPick` lives in `src/server/photoSelection.ts` and per CLAUDE.md cannot be imported by client code. The client has 4 inline copies because the obvious shared helper is on the wrong side of the boundary. There is no `src/lib/random.ts` — yet.
3. **Test files are deliberately self-contained.** Per CLAUDE.md, env writes in 3 integration test files are load-bearing at module-scope (above `import { handler }`). This makes shared helpers harder than usual; the duplication is a real but accepted cost. CG-05 proposes a factory pattern (`makeHandlerHelpers(handler)`) to navigate the constraint.
4. **Contract-pinning by mirrored schemas (CG-11).** The Zod schema duplication is intentional and documented. Listed for completeness; do not unify.
5. **No structured-log helper exists yet (CG-02).** Audit run 13/001 already established the convention (`error: String(err)` in catch payload) but did so by fixing inline call sites, not by introducing the helper that would prevent regression.

## Structural Recommendations

Based on the evidence:

- **Add `src/lib/random.ts`** containing `randomPick<T>` and `randomIndex(length)`. Removes the boundary-induced duplication of CG-03. Worth doing — currently 5 inline copies and trending toward 6+.
- **Add `src/server/log.ts`** containing `logEvent` and `logError`. Pin the convention from CLAUDE.md as a guarded interface. CG-02 is the single highest-value recommendation in this report.
- **Add `tests/helpers/`** with `handler.ts` (factory for callHandler/mockSonnetReply/mockHaikuReply), `fixtures.ts` (makePhoto, etc.). Documented test setup is otherwise constrained per CLAUDE.md, so use a factory pattern that takes the imported `handler` to satisfy the env-ordering rules.
- **Co-locate font specs** with compositor or extract to `src/lib/fontSpecs.ts`. Closes CG-09 latent drift.
- **Do NOT add a generic lazy-init helper.** Cost > value, and the current pattern is clear at the call site.

These 4 structural moves cover ~75% of the consolidation opportunities. The other 25% (CG-04, CG-07, CG-08, CG-10) are local-scope edits that don't need a structural home.

---

## Appendix — Consolidation Group Cards

### [CG-01] Unify Anthropic Haiku classifier wrappers

**Functions involved:**
- `checkTone` ([src/server/anthropic.ts:95](../src/server/anthropic.ts)) — 1 caller
- `checkDistressWithHaiku` ([src/server/safety.ts:50](../src/server/safety.ts)) — 1 caller

**Total callers affected:** 2
**Total lines that could be replaced:** ~50 → ~30

**What they share:** identical `messages.create` shape (model env, max_tokens=10, temperature=0), identical response parsing, identical try/catch with structured error log + boolean fallback.

**What differs:** system prompt, verdict keyword, fallback boolean, optional bypass env, user-message construction.

**Proposed unified function:**
```typescript
async function classifyWithHaiku(
  anthropic: Anthropic,
  opts: {
    systemPrompt: string;
    userMessage: string;
    verdictKeyword: string;
    fallbackOnError: boolean;
    eventName: string;
  }
): Promise<boolean>
```

The `ENABLE_TONE_CHECK=false` bypass stays at the call site (`checkTone` becomes a 2-line wrapper that returns `true` early, then delegates to `classifyWithHaiku`).

**Ripple effect:** call sites in [generate.ts:195,230](../netlify/functions/generate.ts) keep their existing import; signatures don't change at the boundary. Tests in [tests/server/anthropic.test.ts](../tests/server/anthropic.test.ts) and [tests/server/safety-extended.test.ts](../tests/server/safety-extended.test.ts) need adjustment to mock the new shared helper instead of inline `messages.create` mocks.

**Confidence:** High
**Recommended prompt for execution:** Prompt 16 (Code Elegance) — the unification is mechanical but introduces 1 new abstraction worth eyeballing for naming/API.

---

### [CG-02] Centralize structured event logging

**Functions involved:**
- 14 inline `console.{log,error}(JSON.stringify({event, ...}))` occurrences in [generate.ts](../netlify/functions/generate.ts), [anthropic.ts](../src/server/anthropic.ts), [safety.ts](../src/server/safety.ts)

**Total callers affected:** 14 sites
**Total lines that could be replaced:** ~14 lines saved + ~10 lines added in helper = net ~4 LOC, but the helper *guarantees* the documented contract.

**What they share:** all 14 emit a JSON object with an `event` field; 4 of 14 follow the `error: String(err)` convention from CLAUDE.md.

**What differs:** event name, optional payload fields.

**Proposed unified module (src/server/log.ts):**
```typescript
export function logEvent(event: string, payload: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...payload }));
}

export function logError(event: string, err: unknown, payload: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ event, error: String(err), ...payload }));
}
```

**Ripple effect:** ~14 imports in 3 files. The helper makes the `error: String(err)` rule structurally enforced — a contributor calling `logError('foo_failed', err)` cannot forget the `error: String(err)` payload, which is the exact regression-class that audit-13/001 fixed twice.

**Confidence:** High
**Recommended prompt for execution:** Prompt 12 (Cleanup) — straightforward mechanical refactor.

---

### [CG-05] Centralize integration-test handler helpers

**Functions involved:**
- `callHandler` × 3 ([generate-integration.test.ts:51](../tests/server/generate-integration.test.ts), [generate-contract.test.ts:127](../tests/server/generate-contract.test.ts), [generate-rate-limit-integration.test.ts:79](../tests/server/generate-rate-limit-integration.test.ts))
- `mockSonnetReply` × 3 (byte-identical)
- `mockHaikuReply` × 3 (byte-identical)

**Total callers affected:** 3 test files × 3 helpers = 9 redundant definitions
**Total lines that could be replaced:** ~30

**Proposed location/signature:**
```typescript
// tests/helpers/handler.ts
export function makeHandlerHelpers(
  handler: Handler,
  anthropicCreate: ReturnType<typeof vi.fn>
) {
  return {
    callHandler: (body, headers = {}, method = 'POST') => handler({...}, {} as any, () => undefined),
    mockSonnetReply: (line1, line2) => anthropicCreate.mockResolvedValueOnce({...}),
    mockHaikuReply: (verdict) => anthropicCreate.mockResolvedValueOnce({...}),
  };
}
```

**Ripple effect:** each test file's top-of-file mocks stay (they're load-bearing for module ordering); each adds `const { callHandler, mockSonnetReply, mockHaikuReply } = makeHandlerHelpers(handler, anthropicCreate);` after `import { handler }`. Test bodies don't change.

**Confidence:** High
**Recommended prompt for execution:** Prompt 12 (Cleanup) or team review — the env-write ordering constraint per CLAUDE.md needs human verification.

---

### [CG-09] Centralize font specification strings

**Locations:**
- [src/lib/compositor.ts:64,72,86,137,141](../src/lib/compositor.ts) — composite + drawWatermark + checkFit
- [src/lib/fonts.ts:9,10,11](../src/lib/fonts.ts) — preload list

**Total occurrences:** 6 across 2 files (3 distinct strings)

**Why this matters:** if the design team changes any font weight/size, both files must be updated together. The preload list in fonts.ts must match the strings actually used in compositor.ts; otherwise fonts trigger a layout shift on first render. Today this works because no one's changed the spec — but the next change will be a silent break.

**Proposed approach:**
```typescript
// src/lib/fontSpecs.ts
export const LINE1_FONT = '500 64px "Cormorant Garamond"';
export const LINE2_FONT = 'italic 400 44px "Cormorant Garamond"';
export const WATERMARK_FONT = '400 18px "Cormorant Garamond"';
```

Both compositor.ts and fonts.ts consume these.

**Confidence:** Medium
**Recommended prompt for execution:** Prompt 16 (Elegance).

---

## End of report
