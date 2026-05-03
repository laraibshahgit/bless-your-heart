# Codebase Cleanup Report — Run 001

**Generated:** 2026-05-04 00:36 (user local)
**Branch:** `nightytidy/run-2026-05-01-1532` (NightyTidy orchestrator manages branching; the prompt's `codebase-cleanup-[date]` directive was overridden by the `MULTI-AGENT SAFETY` rule in `CLAUDE.md`).
**Baseline commit:** `be68192` (post Step 11 Run 002).

---

## 1. Summary

| Metric | Value |
|---|---|
| Total files modified | 3 |
| Lines added (net) | +16 |
| Lines removed (net) | -19 |
| Net delta | **-3 LOC** (mostly defensive-cast reduction in compositor) |
| Unused dependencies removed | 0 (Step 11 Run 002 already swept; re-verified) |
| Commits made | 3 |
| Tests affected | 0 — 27 files / 345 tests / passing throughout |
| Build status | `npm run build` clean (lint:photos + tsc + vite all green) |

**Commits this run:**
- `c1c990d` — narrow unused type exports to module-private
- `d65a685` — document `ENABLE_TONE_CHECK` flag in `.env.example`
- `546dd86` — extract `setLetterSpacing` helper in compositor

The codebase entered this pass in unusually clean shape — three prior NightyTidy steps (Test Consolidation, Security Sweep, Dependency Health Run 002) and an emergency `react-hook-form` / `@testing-library/*` removal had already swept the obvious slop. So this run focused on small, surgical wins rather than wholesale removal.

---

## 2. Dead Code Removed

| File | What | Why confident it was dead |
|---|---|---|
| `src/content/presets.ts` | `export type Preset = (typeof presets)[number];` (declaration removed entirely) | Repo-wide grep for `\bPreset\b` outside the defining file matched only docs, audit reports, and `CLAUDE.md` — never imported, never annotated against. Type was emitted in the original build plan but never wired in. |
| `src/lib/compositor.ts` | `export` keyword on `interface CompositeOptions` | Only consumed by `composite()` in the same file. Symbol surfaced via the function's parameter type; no external imports anywhere in `src/`, `tests/`, `netlify/`, `tools/`. |
| `src/lib/compositor.ts` | `export` keyword on `type FitCheckResult` | Only consumed by `checkFit()`'s return type in the same file. Same grep result — zero external references. |

These three were the only HIGH-confidence unused exports found. Every other top-level export in `src/lib/`, `src/server/`, `src/content/`, `src/components/`, and `src/types/` has at least one live consumer.

**Not removed:**
- No orphaned files (NightyTidy safety rule prohibits file deletion; nothing surfaced that warranted a "want to delete" flag).
- No commented-out code blocks (an exhaustive sweep of `src/`, `tests/`, `netlify/`, `tools/` for ≥3 contiguous commented-out lines returned zero hits).
- No `TODO`, `FIXME`, `HACK`, `XXX`, `TEMP`, or `BUG:` comments anywhere in the repo. Project-defined convention `// BUG:` for genuine bugs that get test-skipped (per `CLAUDE.md`) is currently unused — no skipped tests carry that marker.
- No unused `import` statements within files (every import surveyed has a body reference).

---

## 3. Duplication Reduced

| Files | What was consolidated | Result |
|---|---|---|
| `src/lib/compositor.ts` | The `letterSpacing` defensive guard appeared 5 times — once each at lines 61, 69, 85, 138, 144 — each a 3-line block: `if ('letterSpacing' in ctx) { (ctx as any).letterSpacing = '0.0Xem'; }`. | Extracted to a private `setLetterSpacing(ctx, value)` helper at the top of the module. Five 3-line blocks → five 1-line calls + a 5-line helper. The defensive runtime guard is preserved (the canvas API isn't universal); the typecast tightened from `as any` to `as unknown as { letterSpacing: string }` in one place. |

### Higher-risk duplications documented but not touched

| Files | What's duplicated | Why I didn't touch it |
|---|---|---|
| `src/server/safety.ts` | `checkSlurFilter()` and `checkRealPersonFilter()` share a normalize-then-array-some-with-word-boundary-regex shape (~5 lines each). | Same shape, different semantic intent (slurs = blocklist; real-person = identity protection). `checkRealPersonFilter` also has a possessive-name branch that the slur filter lacks. Extracting `matchesNormalizedListWithBoundary(prompt, list)` would obscure the security review surface — both are safety filters and should read as deliberately separate. **Recommendation: leave alone.** |
| `tests/server/generate-{contract,integration,rate-limit-integration}.test.ts` | All three set up identical `vi.mock` calls for Anthropic SDK, Firestore, slur-list, and `firebaseAdmin`. Helpers `mockSonnetReply()`/`mockHaikuReply()` are repeated. | `CLAUDE.md` explicitly pins these three files as having **intentionally divergent** rate-limit env regimes and module-scope env writes that are load-bearing. Centralizing the mocks into a shared `tests/server/mocks/` helper would risk a future developer accidentally conflating regimes. The duplication is documented design. **Recommendation: leave alone unless a 4th sibling file appears.** |
| `netlify/functions/generate.ts` | The `slur` and `real-person` blocked branches construct nearly identical responses (`jsonResponse({ status: 'blocked', message: '...' }, 200, successRateHeaders)`). | Each block has a different user-facing message and a different log-event reason. Parameterizing would save ~3 LOC at the cost of an indirection in the safety-block path — unfavorable trade for security-critical code. **Recommendation: leave alone.** |
| `src/lib/compositor.ts` line 49 + 88 | `photo.textColor === 'white' ? '#FFFFFF' : '#1A1612'` ternary repeats once. | Two occurrences in two different functions; extracting a 1-line helper or constant for a 2-occurrence ternary is overkill. **Recommendation: leave alone.** |

---

## 4. Consistency Changes

The codebase was already remarkably consistent. No changes needed in this phase. Findings:

| Pattern | Result | Action |
|---|---|---|
| String quotes | 100% single-quote in custom code; 100% double-quote in `src/components/ui/` (shadcn templates) | None — established convention. |
| `var`/`let`/`const` | Zero `var` declarations across `src/`, `tests/`, `netlify/`, `tools/` | None — already at target. |
| File naming | `src/components/` PascalCase ✓, `src/components/ui/` lowercase ✓, `src/lib/` camelCase ✓, `src/content/` camelCase ✓. **Outliers:** `src/server/distress-phrases.ts` and `src/server/slur-list.ts` are hyphen-cased while the other 9 server files are camelCase. | Documented but not changed. Renaming is destructive (breaks imports + git blame) and forbidden by NightyTidy safety. The two hyphenated names read as "these are *data files*, not behavior modules" which is arguably a useful affordance. **Recommendation: leave alone unless team decides to standardize.** |
| Import ordering | Sampled 5 `src/` and 5 `tests/` files. Order is consistently: vitest utilities → external deps → `@/`-aliased internals → relative imports → `import type {…}` last. | None — already consistent. |
| Type-only imports | 100% of type-only imports use `import type {…}`. | None — already at target. |
| Async patterns | All async code uses `async/await`. One `Promise.race` in `generate.ts` for the rate-limit-fail-open timeout — appropriate for that case. No callbacks, no raw promise chains. | None — already at target. |
| Error handling | Mixed by design — SDK calls throw, defensive checks return defaults (`checkTone` returns `true` on error, `safety` checks return `false`). Pattern is documented and load-bearing per `CLAUDE.md`'s safe-fallback design. | None — pattern is intentional. |

---

## 5. Configuration & Feature Flags

### Flags inventory

| Flag | Type | Age | Value | Action |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | Required secret | ≥ build-1 | dynamic | None — required env. |
| `ANTHROPIC_MODEL_GEN` | Operational toggle | ≥ build-1 | default `claude-sonnet-4-6` | None — already in `.env.example`. |
| `ANTHROPIC_MODEL_SAFETY` | Operational toggle | ≥ build-1 | default `claude-haiku-4-5` | None — already in `.env.example`. |
| `RATE_LIMIT_PER_HOUR` | Operational + dev-bypass | ≥ build-1 | default `25`; `9999` bypasses entirely | None — documented in `.env.example` and `CLAUDE.md`. |
| `IP_SALT_BASE` | Operational secret | ≥ build-1 | unset OK | None — already in `.env.example`. |
| `ALLOWED_ORIGINS` | Security (CSRF Origin shield) | Step 10 (Security Sweep) | unset = no-op (back-compat); set in prod | None — documented inline + in `CLAUDE.md`. |
| `ENABLE_TONE_CHECK` | Operational + dev-bypass | ≥ build-1 | default enabled; `'false'` skips the Haiku tone check | **Added to `.env.example`** with explanatory comment matching `CLAUDE.md`. The flag was documented in `CLAUDE.md` and `src/server/anthropic.ts:100` but missing from the canonical template. |
| `FIREBASE_*` (4 vars) | Operational secrets | ≥ build-1 | required for Firestore/Storage | None — already in `.env.example`. |

### Flag coupling map

The codebase has no nested flag conditionals (no `if (FLAG_A && FLAG_B)`). Each flag controls one pipeline branch independently:

- `RATE_LIMIT_PER_HOUR === '9999'` → skips the entire rate-limit block in `generate.ts:55-72`.
- `ENABLE_TONE_CHECK === 'false'` → returns `true` unconditionally from `checkTone()` in `anthropic.ts`.
- `ALLOWED_ORIGINS` set → `isOriginAllowed(req.origin)` enforces; unset → pass-through.

Combinatorial paths created: 2³ = 8, with all 8 combinations valid (no flag *conflicts*). The bypass-regime tests in `generate-integration.test.ts` cover the rate-limit-bypass + tone-on path; `generate-rate-limit-integration.test.ts` covers the rate-limit-on path; `safety.test.ts` covers tone-on/off. **Untested combination:** `ALLOWED_ORIGINS` set + `RATE_LIMIT_PER_HOUR='9999'` (the production-with-dev-bypass mix). Low-risk because the Origin shield runs *before* the rate-limit block and the two are functionally orthogonal, but worth flagging.

### Configuration sprawl findings

| Constant | Location | Issue | Action |
|---|---|---|---|
| `COLLECTION = 'rateLimits'` | `src/server/rateLimit.ts:6` | Undocumented but self-explanatory. | None — name is the doc. |
| `oneHourMs = 60 * 60 * 1000` | `src/server/rateLimit.ts:33` | Magic-number-style but mathematically clear. | None — extracting to a top-level constant doesn't improve readability. |
| `MAX_RETRIES = 2` | `netlify/functions/generate.ts:191` | Documented in `CLAUDE.md` ("retry budget = 2"). | None — load-bearing rule already pinned in CLAUDE.md and the `gen_retry` log event. |
| `max_tokens` / `temperature` (Anthropic call params) | `anthropic.ts:65-66` (gen) and `anthropic.ts:105-106` (tone) | Tuning constants, undocumented inline. | None — these are model-tuning values and the right place for tuning rationale is `voice-and-safety.md`, which already covers it. Adding inline comments would duplicate that. |
| `baseHeaders` | `netlify/functions/generate.ts:21-24` | Self-explanatory `Content-Type` + `Cache-Control`. | None. |

No genuinely **unused** config values were found. No **duplicated** config (the same setting in two files with different values). No **set-but-never-varied** config that obviously wants demotion to a constant.

### Default value concerns

| Config | Default | Concern | Recommendation |
|---|---|---|---|
| `ALLOWED_ORIGINS` | unset = no-op (allow all) | Default is permissive. CLAUDE.md and `.env.example` both warn that production must set it. | **Acceptable as-is.** The CSRF-shield contract (`tests/server/generate-contract.test.ts`) pins this back-compat. Flipping the default to deny would break server-to-server clients that omit `Origin` and break local dev. The mitigation is documentation + CI-side env var verification, not a code default change. |
| `IP_SALT_BASE` | unset OK | Rate-limit hash uses `''` salt if unset, which is technically a weaker hash space. | **Acceptable for current threat model.** The hash is already daily-rotated and SHA-256 truncated to 32 chars. A missing `IP_SALT_BASE` doesn't enable practical rainbow-table attacks against a 32-char SHA-256 prefix. Worth setting in prod for defense in depth, but no change needed in code. |
| `RATE_LIMIT_PER_HOUR` | `25` | Conservative but reasonable for a free-tier Anthropic-spend-bound product. | None. |
| `ENABLE_TONE_CHECK` | enabled (any value other than `'false'`) | Safe-by-default. | None. |

### TODO / FIXME / HACK / XXX inventory

**Empty.** A repo-wide search for `TODO`, `FIXME`, `HACK`, `XXX`, `TEMP`, `BUG:` across `src/`, `tests/`, `netlify/`, `tools/`, `tsconfig.json`, `vite.config.ts`, and `netlify.toml` returned zero hits. Project policy in `CLAUDE.md` reserves `// BUG:` for test-skip annotations, and no tests are currently skipped.

---

## 6. Couldn't Touch

- **Hyphenated server filenames** (`distress-phrases.ts`, `slur-list.ts`): renaming would change git blame on the moderation lists and require coordinated edits across imports. NightyTidy safety prohibits destructive ops; this falls in that bucket. Documented in §4.
- **`docs/superpowers/plans/2026-05-01-bless-your-heart-full-build.md`**: still contains references to long-removed deps (`react-hook-form`, `@hookform/resolvers`, `@testing-library/*`). It's a historical build plan; per the prior `react-hook-form` cleanup commit message, plan docs are **frozen artifacts** and not updated. Confirmed in audit-reports `11_DEPENDENCY_HEALTH_REPORT_002`. Left untouched.
- **`as unknown as { letterSpacing: string }` cast** in the new `setLetterSpacing` helper: TS lib `lib.dom.d.ts` may now declare `letterSpacing` natively on `CanvasRenderingContext2D` in TypeScript 6.x, in which case the cast could become a plain assignment. **Did not investigate.** The current cast works and the runtime `'letterSpacing' in ctx` guard documents the API-availability concern at the call site; an audit run shouldn't get into TS lib version archaeology.
- **`(ctx as unknown as { letterSpacing: string })` vs `(ctx as any)`**: the new cast is tighter (only declares the one property) but still loose. Replacing with a proper `interface` augmentation in a `.d.ts` file would be the textbook TS solution; that's beyond cleanup scope.

---

## 7. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Add `knip` or `depcheck` step to CI to catch the *next* "declared-but-unused dep" pattern before it lands. | Catches `react-hook-form`-style and `@testing-library/*`-style regressions automatically; the pattern has now occurred twice (Step 11 Runs 001 and 002). | Medium — this is a recurring pattern, and `CLAUDE.md` explicitly calls it out as the motivation for adding such tooling. | **Yes** | The Step 11 Run 002 audit already recommended this. About 30 min of CI config; meaningful long-term win. |
| 2 | Add a coverage entry for the `ALLOWED_ORIGINS` set + `RATE_LIMIT_PER_HOUR='9999'` combination (production-with-bypass). | Closes the only un-tested flag-combination identified in §5. | Low — the two flags are functionally orthogonal and gate orthogonal pipeline stages. | Probably | One additional test fixture in `generate-rate-limit-integration.test.ts`. ~5 min. Defensive against a future refactor that accidentally couples Origin and rate-limit. |
| 3 | Consider running an automated formatter (e.g., `prettier --check`) in CI to lock in the existing single-quote / import-order / 2-space conventions. | Currently the conventions are upheld by convention only — there's no `npm run lint` (per CLAUDE.md). | Low — current conformance is 100% by hand. | Only if time allows | Borderline over-engineering for a 7-component, single-page app; would only matter if more contributors join. |
| 4 | TS lib version audit: investigate whether `letterSpacing` on `CanvasRenderingContext2D` is now in `lib.dom.d.ts` for TS 6.x and remove the runtime guard if the type is universally present. | Removes one defensive code path. | Very low — guard works; cost is 5 LOC + a cast. | No — over-engineering | Skip unless someone is already in the file for unrelated work. |

---

## Appendix A — Files Modified

```
.env.example          | +3 lines (added ENABLE_TONE_CHECK with comment)
src/content/presets.ts| -2 lines (removed unused Preset type alias)
src/lib/compositor.ts | +11 / -15 lines (extracted setLetterSpacing, narrowed two type exports)
```

## Appendix B — Verification Trail

- `npm run typecheck` — clean after each commit
- `npm test` — 27 files / 345 tests / passing after each commit
- `npm run build` — clean (lint:photos + tsc + vite all green) at end
- Smoke test (`npx vitest run tests/smoke.test.ts`) — would run as part of full suite; full suite is fast enough that no separate smoke run was needed

## Appendix C — What This Run Did Not Cover

The prompt's 5-phase scope intentionally trims to fit this codebase's small size:

- **Phase 1** (Dead code): Done — three findings, all addressed.
- **Phase 2** (Duplication): Done — one extraction (`setLetterSpacing`); other findings documented as not-worth-touching.
- **Phase 3** (Consistency): Already at target; nothing to enforce.
- **Phase 4** (Config & flags): Done — one `.env.example` gap closed; flag-coupling analysis recorded.
- **Phase 5** (Quick wins): No applicable wins surfaced (no deprecated APIs, no unnecessary type assertions in changed code, no empty constructors, no obvious typos in current code).
