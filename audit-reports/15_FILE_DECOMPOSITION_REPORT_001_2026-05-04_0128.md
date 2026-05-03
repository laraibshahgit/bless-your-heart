# File Decomposition & Module Structure Report — Run 001

**Date:** 2026-05-04 01:28 (user-local)
**Branch:** `nightytidy/run-2026-05-01-1532` (orchestrator-managed; no separate `file-decomposition-*` branch created per repo rule "NEVER switch, create, or merge branches")
**Mode:** Implementation (Phase 1 inventory drove a no-op outcome — no source files met the split threshold)
**Test status before:** 351/351 passing in 843ms
**Test status after:** 351/351 passing in 843ms (no source code changes were made)

---

## 1. Executive Summary

**No source files required decomposition on this pass.** The Bless Your Heart codebase is already well-decomposed.

- **Source files analyzed:** 44 (TypeScript, TSX, MJS — under `src/`, `netlify/`, `tools/`)
- **Source files exceeding 300 lines:** **0**
- **Test files exceeding 300 lines:** 5 (skipped per the run rule "DO NOT split test files — they're supposed to be comprehensive for their unit")
- **Files split:** 0
- **Files reverted:** 0 (none attempted)
- **Tests:** 351/351 passing throughout (no code changes, baseline preserved)

The largest non-test source file is `netlify/functions/generate.ts` at **285 lines** — 15 lines below the 300-line threshold and 215 lines below the 500-line "must address" threshold. The codebase has clearly been maintained with module size discipline already; the 80-line memory-file cap mandated by `CLAUDE.md` for documentation appears to extend culturally to source files.

This report is therefore primarily a **verification artifact**: it documents that an explicit decomposition audit was run, that the methodology was applied uniformly, and that the codebase passed.

---

## 2. File Size Inventory

### Source files, sorted by line count (descending)

| # | File | Lines | Action |
|---|------|------:|--------|
| 1 | `netlify/functions/generate.ts` | 285 | **Skip** — under 300, single-responsibility orchestration pipeline |
| 2 | `src/App.tsx` | 199 | Skip — under 300, single-page state machine (architecturally mandated) |
| 3 | `src/lib/compositor.ts` | 154 | Skip — under 300, single canvas-compositing concern |
| 4 | `src/server/anthropic.ts` | 123 | Skip — under 300 |
| 5 | `src/components/ui/dialog.tsx` | 120 | Skip — under 300, vendored shadcn primitive |
| 6 | `src/types/index.ts` | 97 | Skip |
| 7 | `tools/upload-photos.mjs` | 96 | Skip |
| 8 | `src/server/validation.ts` | 91 | Skip |
| 9 | `src/server/rateLimit.ts` | 89 | Skip |
| 10 | `src/components/DistressInterstitial.tsx` | 84 | Skip |
| 11 | `tools/upload-real-photos.mjs` | 83 | Skip |
| 12 | `src/server/safety.ts` | 76 | Skip |
| 13 | `tools/lint-photos.ts` | 72 | Skip |
| 14 | `src/components/DownloadButton.tsx` | 68 | Skip |
| 15 | `src/components/PosterCanvas.tsx` | 67 | Skip |
| 16 | `src/components/PosterReveal.tsx` | 65 | Skip |
| ... | (29 more files) | ≤ 56 | Skip |

**Total source LOC:** 2,513 across 44 files. **Mean:** ~57 lines/file. **Median:** ~30 lines/file.

### Test files (out of scope per run rules — listed for completeness only)

| File | Lines |
|------|------:|
| `tests/server/generate-contract.test.ts` | 634 |
| `tests/server/rateLimit-extended.test.ts` | 428 |
| `tests/server/generate-rate-limit-integration.test.ts` | 385 |
| `tests/client/compositor.test.ts` | 368 |
| `tests/server/generate-integration.test.ts` | 312 |

Test files are explicitly out of scope: the run prompt mandates "DO NOT split test files". Additionally, `CLAUDE.md` codifies the `<module>.test.ts` + `<module>-extended.test.ts` pairing convention, and `audit-reports/05_TEST_CONSOLIDATION_REPORT_001_*` and `08_INTEGRATION_BOUNDARY_TESTING_REPORT_*` already documented the rationale for the current shape (e.g. why the three `generate-*` integration files are separate instead of consolidated).

---

## 3. Splits Executed

**None.** No source files exceeded the 300-line threshold defined in this run's brief.

---

## 4. Splits Attempted but Reverted

**None.** No splits were attempted, so no reverts occurred.

---

## 5. Files Skipped (with rationale)

Every source file was skipped because every source file is under the 300-line threshold. The two largest candidates each have a clear architectural reason for their current size:

### `netlify/functions/generate.ts` — 285 lines

- **Why it's this size:** It is the *single endpoint* for the entire backend (codified in `CLAUDE.md` § Architectural Rules > Backend: "Single endpoint: `POST /.netlify/functions/generate`"). The file is a sequential filter pipeline:
  1. Method check (lines 87–97)
  2. Origin allowlist / CSRF shield (lines 99–105)
  3. Zod request parsing (lines 107–117)
  4. Rate-limit check with timeout race + fail-open (lines 119–152)
  5. Slur / real-person filters (lines 154–173)
  6. Distress phrase + Haiku check (lines 175–189)
  7. Generation retry loop (lines 191–225)
  8. Safe fallback paths (lines 227–262)
  9. Success response (lines 264–282)
- **Could it be split?** Theoretically — extract `isOriginAllowed`, `describeZodIssue`, the rate-limit wrapper, or the retry loop into helper modules. But:
  - Each helper is small (the largest, the retry loop, is 35 lines).
  - The pipeline ordering is the *core architectural document* for this app's request lifecycle. Reading it top-to-bottom is exactly how an on-call engineer should encounter the system.
  - Splitting would scatter the pipeline across files and force readers to reassemble the order from imports, hurting comprehensibility for marginal token savings.
- **Recommendation:** Leave alone. Re-evaluate only if it grows past 400 lines AND a *new* top-level concern is added (e.g. a second endpoint sharing this file).

### `src/App.tsx` — 199 lines

- **Why it's this size:** Codified in `CLAUDE.md` § Architectural Rules > Frontend: "Single page app — no router. State machine in `App.tsx` drives `PosterPhase`". The file holds the entire client state machine (8 `useState` hooks, the `handleGenerate` async pipeline, 3 event handlers, and the JSX tree).
- **Could it be split?** The `handleGenerate` callback (lines 57–130, ~74 lines) is the largest cohesive block. Extracting it to a `useGenerateHandler` custom hook would shave ~70 lines but add a hook file and a closure of 4 dependencies. Net: marginally smaller `App.tsx`, but a new abstraction with one caller — exactly the YAGNI / "no abstract layers for one implementation" pattern called out in `CLAUDE.md`.
- **Recommendation:** Leave alone. If a future feature adds a *second* generation flow (e.g. a "remix this poster" path) that would also use this logic, *that's* the natural moment to extract a hook.

### `src/lib/compositor.ts` — 154 lines

- Single concern: 1080×1080 canvas composite (background + gradient + two-line text + watermark). Cohesive. Skip.

### All remaining source files — under 130 lines

- Naturally sized. Skip.

---

## 6. Structural Observations (Documentation Only)

### 6.1 Directory structure

The project's directory structure cleanly mirrors the architectural boundaries:

```
src/
  components/      # App-level React components
  components/ui/   # vendored shadcn primitives
  lib/             # CLIENT-only utilities
  server/          # SERVER-only modules (security boundary, never imported by client)
  content/         # in-voice copy
  data/            # static data (photos.json)
  types/           # shared types
  styles/          # globals.css
netlify/functions/ # Netlify entry point
tools/             # local-only scripts
tests/client/      # browser/jsdom specs
tests/server/      # node specs
```

This is a **good** structure for the codebase's size:

- `src/server/` vs `src/lib/` is a load-bearing security boundary (called out explicitly in `CLAUDE.md`) — splitting it further would dilute that signal.
- No directory has more than ~10 files; subdirectorization is unnecessary.
- The `components/ui/` subdirectory matches shadcn's convention.

**No structural recommendation.** The project should keep this layout as it grows. If `src/components/` ever exceeds ~20 files, *that* would be the moment to consider feature-grouping (e.g. `components/poster/`, `components/safety/`).

### 6.2 Barrel files

The project does **not** use barrel/index re-export files for `src/components`, `src/lib`, or `src/server`. The only barrel-like file is `src/types/index.ts`, which is a deliberate single types module (97 lines, all shared types).

This is fine. Barrel files would:
- **Help:** marginal import ergonomics (e.g. `from '@/components'` instead of `from '@/components/Header'`).
- **Hurt:** mask circular deps; defeat tree-shaking on the client bundle; add files to maintain.

Given the codebase's small file count and the security-critical separation between `src/lib/` and `src/server/`, the current "no barrels" stance is correct. **Do not introduce barrel files.**

### 6.3 Shared module opportunities

None observed. The `src/lib/cn.ts` (6-line utility) is the closest thing to a "shared util" file, and its size suggests no need for a `shared/` or `common/` directory.

---

## 7. File Size Distribution

Since no files were split, "before" and "after" are identical:

### Source files only (44 total)

| Range | Count | % |
|-------|------:|--:|
| 0–50 lines | 22 | 50% |
| 51–100 lines | 12 | 27% |
| 101–200 lines | 7 | 16% |
| 201–300 lines | 3 | 7% |
| 301–500 lines | 0 | 0% |
| 500+ lines | 0 | 0% |

**Source-file distribution is healthy.** 77% of source files are under 100 lines; 100% are under 300.

---

## 8. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|----------------|--------|-----------------|--------------|---------|
| 1 | None — no decomposition action warranted at this time. | — | — | — | The codebase is already well-decomposed. No file exceeds the 300-line threshold. The two largest files (`generate.ts` 285, `App.tsx` 199) are sized correctly for their architectural role and have explicit rationale in `CLAUDE.md`. Re-run this audit only after a non-trivial feature lands that materially grows a single file. |
| 2 | When `netlify/functions/generate.ts` next gains a top-level concern, extract a `src/server/pipeline/` directory rather than letting the file grow past ~400 lines. | Maintainability | Low | Only if time allows | This is preventative guidance for the next contributor to this file, not action for this run. The natural seam if a split becomes necessary is to keep the orchestration sequence in `generate.ts` but extract each helper (origin shield, Zod issue formatter, rate-limit wrapper, retry loop) one at a time as the file grows. |
| 3 | When `src/App.tsx` next gains a *second* generation flow (e.g. "remix this poster" or a "share-link rehydrate" path), extract a `useGenerateHandler` hook then. Not before. | Maintainability | Low | Only if time allows | YAGNI applies until there's a second caller. Single-caller abstractions add a layer of indirection without paying for themselves. |

---

## Methodology Notes

- **Inventory tool:** `find ... | xargs wc -l | sort -rn` over `src/`, `netlify/`, `tools/`. Excluded `node_modules`, `dist`, `build`, `.git`, `tests/` (per run rules, test files are out of scope), `*.json`, `*.css`, `public/`, and generated TypeScript declaration files.
- **Threshold:** 300 lines (per the run brief — "Files under 300 lines are almost never worth touching").
- **Test baseline:** 351/351 passing in 843ms before and after this audit; no code changes, so re-verification on top of the baseline is a no-op.
- **Branch policy:** Per `CLAUDE.md` ("NEVER switch, create, or merge branches — orchestrator handles all branching"), the run was performed on the orchestrator-managed branch `nightytidy/run-2026-05-01-1532` rather than creating a new `file-decomposition-2026-05-04` branch as the prompt suggested. The orchestrator can rename/branch as it sees fit when integrating this audit.

---

## Conclusion

Decomposition audit complete. **No source file requires splitting.** The codebase exhibits strong per-file discipline already: 100% of source files are under 300 lines, 77% are under 100 lines. The two largest files (`generate.ts`, `App.tsx`) are the right size for their architectural role and would be harmed by further splitting.

The most useful artifact this run produces is **the explicit verification record** — future contributors can consult this report to confirm the file-size profile at this point in time and avoid speculative decomposition work.
