# Test Consolidation Report — 2026-05-01

## Executive Summary

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Total tests | 320 | 310 | **-10** |
| Test files | 24 | 24 | 0 |
| Test files passing | 24 | 24 | 0 |
| Test files failing | 0 | 0 | 0 |
| Duration (typical) | ~1.9 s | ~1.9 s | unchanged |

All tests passing on three consecutive clean runs after consolidation. Behavioral coverage preserved — every assertion removed had an at-least-as-strict equivalent already in another file.

Two of the six groups were parameterizations rather than deletions, so those did not reduce the test count (vitest counts each `it.each` row as a separate test) but did reduce file size and duplication substantially.

## Consolidation Map (Phase 3 plan + outcomes)

| Group | File | Tests Before | What | Action | Tests After | Status | Risk |
|---|---|---:|---|---|---:|---|---|
| G1 | `tests/server/rateLimit.test.ts` | 3 | hashIp basics | Delete 2 verbatim duplicates of `rateLimit-extended.test.ts` | 1 | **Executed** (commit `2d54f58`) | LOW |
| G2 | `tests/server/validation.test.ts` | 11 | parseGenerationOutput, checkSpecificity | Delete 4 duplicates of `validation-extended.test.ts` | 7 | **Executed** (commit `9125969`) | LOW |
| G3 | `tests/server/safety.test.ts` | 8 | safety filters | Delete 3 duplicates of `safety-extended.test.ts` | 5 | **Executed** (commit `5b813d7`) | LOW |
| G4 | `tests/client/photos.test.ts` | 8 | photo lib helpers | Merge 2 overlapping `getAllCredits` tests into 1 | 7 | **Executed** (commit `f34876d`) | LOW |
| G5 | `tests/client/compositor.test.ts` | 21 | watermark corner positioning | Parameterize 4 corner tests into one `it.each` table | 21\* | **Executed** (commit `b76cf3f`) | LOW |
| G6 | `tests/client/download.test.ts` | 11 | iOS Safari detection | Parameterize 6 user-agent tests into one `it.each` table | 11\* | **Executed** (commit `6de213d`) | LOW |

\* G5 and G6 used `it.each` parameterization. Vitest counts each row as a separate test, so the test count is preserved even though the file is significantly leaner.

## Consolidations Executed

### G1 — `rateLimit.test.ts` (commit `2d54f58`)

Removed:
- `produces a 32-char hex string` — verbatim duplicate of `rateLimit-extended.test.ts` line 49
- `produces consistent output for same input on same day` — duplicate of `rateLimit-extended.test.ts` line 53 (`produces consistent output for same IP within the same day`)

Kept:
- `produces different hashes for different IPs` (unique — not asserted in extended file)

Tests after: **1**.

---

### G2 — `validation.test.ts` (commit `9125969`)

Removed:
- `returns null when line1 exceeds 60 chars` — covered by extended's exact-60 boundary test (`accepts exactly 60-char line1`) and exact-61 rejection (`rejects 61-char line1`)
- `returns null when line2 exceeds 100 chars` — covered by extended's exact-100/101 boundary pair
- `passes when prompt words appear in line2` — extended's `handles prompts with apostrophes ("haven't started")` calls `checkSpecificity("haven't started yet", 'The starting line moved again.')` with **identical** arguments
- `bypasses for question-mark prompts` — covered by extended's `returns true for question prompts even when content does not overlap`

Tests after: **7**.

---

### G3 — `safety.test.ts` (commit `5b813d7`)

Removed:
- `detects possessive + name pattern` (`'my boss Linda is terrible'`) — extended's `detects all relationship words from the list` exhaustively tests all 18 relationship words including `'my boss Linda is loud'`
- `detects crisis phrases` — extended's `detects a distress phrase embedded in a longer sentence` covers the same path
- `is case-insensitive` — extended's `handles mixed case` covers the same behavior

Note: the two files have slightly different `slurList` mocks (`safety.test.ts`: 5 entries; `safety-extended.test.ts`: 3 entries). Verified that none of the removed tests depended on the mock difference — they are real-person and distress-phrase tests, which do not use the slur list.

Tests after: **5**.

---

### G4 — `photos.test.ts` (commit `f34876d`)

Merged two `getAllCredits` tests:
- `returns objects with id and credit fields` (asserted `c.credit.length > 0`)
- `skips photos with empty credit` (asserted `c.credit !== ''`)

The non-empty-string check is fully implied by the `> 0` length check, and both tests iterated the same array. Combined into a single test with a clearer name (`returns objects with non-empty id and credit (skipping any photos with empty credit)`).

Tests after: **7**.

---

### G5 — `compositor.test.ts` (commit `b76cf3f`)

Parameterized four watermark-position tests into one `it.each` table. The original tests differed only in the `watermarkPosition` photo property and the expected `(x, y)` coordinates — perfect parametrize candidate.

The expected geometry table (corner → `(x, y)`) is now visible at a single glance:

```ts
[
  { position: 'lower-right', expectedX: 1048, expectedY: 1048 },
  { position: 'lower-left',  expectedX: 32,   expectedY: 1048 },
  { position: 'upper-left',  expectedX: 32,   expectedY: 32 },
  { position: 'upper-right', expectedX: 1048, expectedY: 32 },
]
```

File reduced by ~40 lines.

---

### G6 — `download.test.ts` (commit `6de213d`)

Parameterized six `isIOSSafari` user-agent tests into one `it.each` table. Each row is a `(label, ua, expected)` tuple. Failures still pinpoint the failing case via the `it.each` `$label` template substitution.

Preserved the comment about CriOS / FxiOS being load-bearing cases (iPhone in-app browsers must not match) so future contributors don't drop them.

File reduced by ~14 lines.

## Consolidations Reverted

None. All six consolidations passed on first run after change.

## Consolidations Identified but Not Executed

### `photoSelection.test.ts` vs `photoSelection-extended.test.ts`

All 4 tests in `photoSelection.test.ts` are roughly subsumed by the 10 tests in the extended file. **Not executed** because:

- The original 4 use a single shared `mockPhotos` fixture defined at the top of the file — it acts as a happy-path smoke check with realistic data, complementing the extended file's edge-case-focused per-test fixtures.
- Removing all 4 would leave the file empty (vitest fails on no-tests files), forcing arbitrary "keep one" decisions that erode the audit's clarity.
- The cost-benefit (4 tests removed) is small relative to the risk of mis-judging which case is the cleanest "smoke" representative.

Worth leaving as smoke coverage.

### `synonyms.test.ts` category-specific tests

Five tests follow the pattern `matches "<key>" to <category> vocabulary` (work, anxiety, money, family, ex). They have varying assertion counts (work: 3, anxiety: 2, money: 2, family: 1, ex: 1). **Not executed** because:

- Parameterizing one row per (key, vocabulary) pair would produce ~9 rows — *more* tests than the original 5, not fewer.
- Each test currently documents its category with a clear name; flattening into a table would obscure the category labels.
- The current structure is intentional happy-path documentation of supported synonym categories.

### `content.test.ts` parallel list invariants

`presets`, `placeholders`, and `loadingPhrases` each have a near-identical "is non-empty / every X is a non-empty trimmed string / all X are unique" trio. **Not executed** because:

- Each list has additional list-specific rules (presets: ≤30 char chip cap; loadingPhrases: ends with period, no exclamation marks).
- Parameterizing the shared invariants would split each list's checks across two locations, harming readability.
- The repetition is shallow and the files are short.

### `generate-integration.test.ts` vs `generate-contract.test.ts`

Some method/validation tests overlap — e.g., integration's `rejects non-POST methods with 405` (GET only) is fully subsumed by contract's parameterized 6-method 405 test, and `returns 400 for invalid JSON body` is duplicated by contract's `rejects malformed JSON body with the documented error shape`. **Not executed** because:

- Both files have explicit header comments declaring intentional separation: integration verifies BEHAVIOR (which path runs), contract verifies SHAPE (the wire format).
- Author-intentional cross-layer redundancy — both tests catch different failure modes (e.g., a regression that breaks the schema but keeps the status code, or vice versa).
- The brief explicitly cautions: "Only flag as redundant when the tests are truly checking the same thing at the same fidelity and neither adds what the other doesn't." The contract tests parse the body against a Zod `GenerateResponseSchema`; the integration tests assert specific values. Different fidelity, different failure surface.

### `textFitting.test.ts` x+width / y+height bounds

Two parallel tests (`textZone x + width does not exceed 1.01`, `textZone y + height does not exceed 1.01`). **Not executed** because the per-axis specificity in the test names provides clear, useful failure messages — combining them into one test would lose that.

## Remaining Redundancy

- **`anthropic.test.ts checkTone` and `safety-extended.test.ts checkDistressWithHaiku`** share structural test patterns (case-insensitive verdict, whitespace-trim, SDK error fail-open, env-var model selection, temperature 0). These are NOT duplicates — they test different functions with different fail-open directions (checkTone fails open to `true`/safe, checkDistressWithHaiku fails open to `false`/not-distress). The structural similarity is a sign of a missing **shared verdict-parser helper** in `src/server/anthropic.ts`, not a test problem.
- **Smoke tests** (`tests/smoke.test.ts`) intentionally duplicate happy-path checks already covered by deeper tests. This is by design — fast post-deploy sanity checks. Not consolidated.

## Pre-existing Flakiness Observed

On one of approximately ten test runs during this audit, `tests/server/rateLimit-extended.test.ts > 'writes count: 1 when resetting an expired window'` failed with what appeared to be an assertion mismatch around `count: 1`. The same assertion passed on every retry (including three consecutive clean runs at the end).

This is **not** caused by any change in this consolidation pass — the rateLimit-extended file was untouched, and the failing test predates this audit. Likely cause: shared `process.env.RATE_LIMIT_PER_HOUR` state between worker processes when tests run in parallel. Worth opening a separate ticket to investigate; see Recommendations below.

## Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Investigate intermittent flakiness in `rateLimit-extended.test.ts` `writes count: 1 when resetting an expired window` | Stable CI signal | **Medium** | **Yes** | Observed once across 10 runs during this audit. The other rateLimit-extended tests use `try/finally` to scope env mutations (per CLAUDE.md), but this specific test relies on `beforeEach`-set `delete process.env.RATE_LIMIT_PER_HOUR` which can race with other worker processes setting it. Wrap each `process.env.RATE_LIMIT_PER_HOUR =` mutation in a `try/finally` like the other tests in the file already do. |
| 2 | Establish convention: when adding test cases that differ only in input/output, default to `it.each` from the start | Prevents duplicate accumulation | Low | **Probably** | Two of the six consolidations in this pass (G5 corner positions, G6 user agents) were latent parameterization debt. A short note in CLAUDE.md or a code-review checklist item ("if 3+ tests differ only in data, prefer `it.each`") would have caught both at write-time. |
| 3 | Extract a shared `parseHaikuVerdict(content, expectedPrefix, defaultOnMissing)` helper from `anthropic.ts` and `safety.ts` | Removes structural duplication that the test files mirror | Low | Only if time allows | Both `checkTone` and `checkDistressWithHaiku` parse a verdict the same way (lowercase, trim, startsWith). The structural similarity in their tests would shrink to one shared "verdict parsing" test plus thin per-function tests. Defer until you touch one of those modules for unrelated reasons. |
| 4 | Document the intentional `*.test.ts` ↔ `*-extended.test.ts` split convention in CLAUDE.md | Prevents future "where do I put this test?" ambiguity | Low | Only if time allows | The split is real and useful (smoke-shaped basics in `*.test.ts`, exhaustive boundary/edge cases in `*-extended.test.ts`), but it's not currently documented. A two-line note in the `Testing Patterns (Non-Obvious)` section of CLAUDE.md would lock it in. |

## Conventions to Adopt

- **Default to `it.each` for 3+ structurally-parallel tests.** The G5 and G6 collapses are tiny once you commit to a table; the original copy-paste was harder to write *and* harder to read.
- **One assertion ≥ another? Merge.** G4 (`getAllCredits` photos test) merged two tests where one's assertion was a strict superset of the other's. Worth pattern-matching for during code review.
- **Boundary tests beat range tests.** The validation-extended file has paired `accepts exactly 60-char line1` + `rejects 61-char line1` boundary tests, which are stricter than `validation.test.ts`'s old `returns null when line1 exceeds 60 chars` (`'a'.repeat(61)`). Pin the cap with both sides of the boundary, not one side of the range.
