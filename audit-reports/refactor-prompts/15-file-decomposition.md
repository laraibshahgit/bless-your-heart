# File Decomposition & Module Structure

You are running an overnight file decomposition and module structure improvement pass. Your job: find oversized files that are doing too much, and break them into smaller, focused modules that are easier to understand, test, and maintain. Target: no file should exceed 500 lines unless there's a clear structural reason.

This is one of the higher-risk overnight runs — every file split touches imports across the codebase. Move slowly, verify thoroughly, and when in doubt, document rather than split.

Work on branch `file-decomposition-[date]`.

---

## Global Rules

- **One file at a time.** Split a file, update ALL imports, run tests, commit. Only then move to the next file.
- Run the FULL test suite after every split — not just related test files. Import breakage can surface anywhere.
- Run the build/compile step after every split too (if applicable). Runtime import errors don't always show up in tests.
- DO NOT change any business logic, function signatures, or public APIs. Only move code between files and update references.
- DO NOT rename functions, variables, classes, or exports during this pass. Renaming + moving simultaneously makes failures harder to diagnose.
- If tests or build fail after a split, revert the ENTIRE split immediately. Do not attempt to debug — document what happened and move on.
- Commit format: `refactor: decompose [original-file] into [new-modules]`
- **Conservative threshold**: Only split files over **300 lines**. Files between 300-500 lines should only be split if they contain clearly distinct responsibilities. Files under 300 lines are almost never worth touching.
- You have all night — thoroughness and safety matter more than splitting every possible file.

---

## Phase 1: File Size Inventory & Prioritization

**Step 1: Measure every file**
Scan the entire source directory (excluding `node_modules`, `vendor`, `dist`, `build`, `.git`, test fixtures, generated files, and migration files). For each file, record:
- Path and filename
- Line count
- Primary responsibility (inferred from reading the file)
- Number of exports (functions, classes, constants, types)
- Number of files that import from it (import fan-out — high fan-out = higher risk to split)

**Step 2: Identify oversized files**
Flag every file exceeding 300 lines. Sort by line count descending.

**Step 3: Classify each oversized file**

- **Clear multi-responsibility** (SPLIT): File contains 2+ distinct logical groupings that don't heavily cross-reference each other. Example: a file with utility functions, API handlers, and type definitions mixed together.
- **Single responsibility, just long** (MAYBE SPLIT): File does one thing but it's large — a big React component with subcomponents inline, a long service class, a comprehensive validation module. May benefit from extracting helpers/subcomponents.
- **Inherently monolithic** (DO NOT SPLIT): Generated files, large config objects, migration files, single complex algorithms, test files with many cases for one unit. Splitting would hurt readability. Document why and skip.
- **High fan-out risk** (SPLIT WITH CAUTION): Many files import from this one. Splitting it means updating many import sites. Extra verification needed.

**Step 4: Create a split plan**
Produce a prioritized list:
1. Clear multi-responsibility files with LOW fan-out (safest, highest value)
2. Clear multi-responsibility files with HIGH fan-out (high value but riskier)
3. Single responsibility files that would benefit from helper extraction
4. Skip inherently monolithic files — document reasoning

For each file in the plan, outline the proposed split BEFORE making any changes:
- Original file path and line count
- Proposed new files with names and responsibilities
- Which exports move where
- Estimated import update count (how many other files reference this one)
- Risk assessment: low / medium / high

---

## Phase 2: Pre-Split Safety Checks

Before splitting ANY file, run these checks:

**Step 1: Map all references**
For the file you're about to split, find EVERY reference:
- Static imports/requires (`import { x } from './file'`, `const x = require('./file')`)
- Dynamic imports (`import('./file')`, `require.resolve('./file')`)
- Re-exports from barrel/index files (`export { x } from './file'`)
- Build tool references (webpack aliases, tsconfig paths, jest moduleNameMapper, babel module resolver)
- String-based references (route configs, lazy loading paths, test mocks with `jest.mock('./file')`)
- Documentation and comments referencing the file path
- CI/CD configs, Dockerfiles, or scripts referencing the file
- Package.json `main`, `exports`, or `bin` fields

**Step 2: Check for circular dependency risk**
Before splitting, trace the dependency graph for the target file:
- What does it import?
- What imports it?
- Would any proposed new module need to import from another proposed new module created from the same original file? If yes — reconsider the split boundaries.

**Step 3: Check for barrel file / index re-export patterns**
If the project uses barrel files (`index.ts` that re-exports from submodules):
- Plan to update the barrel file to re-export from the new locations
- This preserves backward compatibility for external consumers
- Internal imports should be updated to import directly from the new files (not through barrels) for clarity

---

## Phase 3: Execute Splits

For each file in the plan (one at a time, in priority order):

**Step 1: Create the new files**
- Name files by their responsibility: `user-validation.ts`, `order-utils.ts`, `payment-types.ts` — not `file2.ts` or `helpers.ts`
- Match existing project naming conventions (kebab-case, camelCase, PascalCase — whatever the codebase uses)
- Place new files in the same directory as the original, unless a subdirectory makes more structural sense AND the project already uses that pattern
- Move related code together: if a function and its helper are tightly coupled, they go in the same new file
- Keep the original file as a "home" for whatever doesn't have a better place — don't force everything out

**Step 2: Move exports to new files**
- Cut functions/classes/constants/types from the original file
- Paste into the appropriate new file
- Add necessary imports to the new file (dependencies the moved code needs)
- Update the original file to import from the new files if it still references the moved code
- If barrel files exist, update them to re-export from new locations

**Step 3: Update all import references**
- Update every file that imported the moved exports from the original file
- Verify: search the entire codebase for the original file's path to catch string-based references
- Check test files — especially `jest.mock()`, `vi.mock()`, or equivalent calls that reference file paths
- Check for `__mocks__` directories that mirror the original file structure

**Step 4: Verify**
- Run the full build/compile step
- Run the full test suite
- If ANYTHING fails: revert the entire split, document what went wrong, move to the next file
- If everything passes: commit with a clear message listing the original file and all new files created

**Step 5: Verify import cleanliness**
After a successful split, quickly check:
- No circular imports introduced (the build step usually catches this, but verify)
- No duplicate imports (importing the same thing from both the old and new location)
- The original file doesn't import from new files that import back from it

---

## Phase 4: Structural Improvements (Conservative)

After all planned splits are complete, look for broader structural improvements — but ONLY document these, do not implement:

**Directory structure opportunities**
- Are related files scattered across the project that should be co-located?
- Are there directories with 20+ files that would benefit from subdirectories?
- Does the project structure match the architectural pattern? (Feature-based vs. layer-based)

**Barrel file assessment**
- Are barrel files helping or hurting? (They help external consumers but can mask circular deps and hurt tree-shaking)
- Are there missing barrel files where they'd improve import ergonomics?

**Shared module opportunities**
- Did the splits reveal shared utilities that multiple new modules depend on? Would a `shared/` or `common/` module make sense?

---

## Phase 5: Post-Split Validation

After ALL splits are done:

**Step 1: Full verification**
- Run the complete test suite one final time
- Run the build one final time
- If the project has a linter, run it (new files may need lint fixes for import ordering, etc.)

**Step 2: Metrics**
- Count total files before and after
- Largest file before and after
- Average file size before and after
- Distribution: how many files are now in 0-100, 100-200, 200-300, 300-500, 500+ line buckets

**Step 3: Remaining oversized files**
For files that are still over 500 lines after this pass, document:
- Why they weren't split (inherently monolithic, too risky, failed and reverted)
- Whether a future pass with more context could address them

---

## Output

Create `audit-reports/` in project root if needed. Save as `audit-reports/15_FILE_DECOMPOSITION_REPORT_[run-number]_[date]_[time in user's local time].md`, incrementing run number based on existing reports.

### Report Structure

1. **Executive Summary** — Files analyzed, files split, files skipped (and why), total line reduction in largest files, all tests passing.

2. **File Size Inventory** — Before/after table for every file over 300 lines:
| File | Before (lines) | After (lines) | Action | New Files Created |

3. **Splits Executed** — For each split:
- Original file, line count, number of exports
- New files created with line counts and responsibilities
- Import references updated (count)
- Test/build status after split
- Commit hash

4. **Splits Attempted but Reverted** — For each failed split:
- What was attempted
- What broke (test failure, build failure, circular dep)
- Why it couldn't be resolved safely overnight

5. **Files Skipped** — For each oversized file not split:
- Why (inherently monolithic, too risky, time constraints)
- Whether it could be addressed in a future pass

6. **Structural Observations (Documentation Only)**
- Directory structure recommendations
- Barrel file assessment
- Shared module opportunities

7. **File Size Distribution** — Before/after histogram:
| Range | Before | After |
| 0-100 lines | X | Y |
| 100-200 | X | Y |
| 200-300 | X | Y |
| 300-500 | X | Y |
| 500+ | X | Y |

8. **Recommendations** — Priority-ordered next steps, files needing manual review for further decomposition, naming/structure conventions to adopt going forward.

## Rules
- Branch: `file-decomposition-[date]`
- ONE FILE AT A TIME. Split, update, test, commit. Then next file.
- Run FULL test suite AND build after every split. Not just related tests.
- If tests or build fail, revert the entire split immediately. Do not debug.
- DO NOT rename anything. Only move code between files and update import paths.
- DO NOT change function signatures, behavior, or exports.
- DO NOT split files under 300 lines.
- DO NOT split generated files, migration files, or config files.
- DO NOT split test files (they're supposed to be comprehensive for their unit).
- DO NOT create deeply nested directory structures that don't already exist in the project.
- DO NOT introduce new patterns (if the project doesn't use barrel files, don't add them).
- Preserve git blame where possible — move code in the commit, don't rewrite it.
- When in doubt about a split boundary, keep things together. Over-splitting is worse than under-splitting.
- Check for dynamic imports, string-based references, and build tool configs BEFORE splitting.
- You have all night. Prioritize safe, clean splits over quantity.

## Chat Output Requirement

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish. Do not make the user open the report to get the highlights. The chat summary should include:

### 1. Status Line
One sentence: what you did, how long it took, and whether all tests still pass.

### 2. Key Findings
The most important things discovered — bugs, risks, wins, or surprises. Each bullet should be specific and actionable, not vague. Lead with severity or impact.

**Good:** "CRITICAL: No backup configuration found for the primary Postgres database — total data loss risk."
**Bad:** "Found some issues with backups."

### 3. Changes Made (if applicable)
Bullet list of what was actually modified, added, or removed. Skip this section for read-only analysis runs.

### 4. Recommendations

If there are legitimately beneficial recommendations worth pursuing right now, present them in a table. Do **not** force recommendations — if the audit surfaced no actionable improvements, simply state that no recommendations are warranted at this time and move on.

When recommendations exist, use this table format:

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| *Sequential number* | *Short description (≤10 words)* | *What improves if addressed* | *Low / Medium / High / Critical* | *Yes / Probably / Only if time allows* | *1–3 sentences explaining the reasoning, context, or implementation guidance* |

Order rows by risk descending (Critical → High → Medium → Low). Be honest in the "Worth Doing?" column — not everything flagged is worth the engineering time. If a recommendation is marginal, say so.

### 5. Report Location
State the full path to the detailed report file for deeper review.

---

**Formatting rules for chat output:**
- Use markdown headers, bold for severity labels, and bullet points for scannability.
- Do not duplicate the full report contents — just the highlights and recommendations.
- If you made zero findings in a phase, say so in one line rather than omitting it silently.
