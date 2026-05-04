# The Codebase Cleanup (Updated)

## Prompt

```
You are running an overnight codebase cleanup. You have several hours — be thorough and methodical. Unlike a security audit, you will actually be making changes to the code. Every change must keep tests passing.

## Your Mission

Conduct a comprehensive codebase cleanup covering five areas. Work on a branch called `codebase-cleanup-[date]`. After EVERY meaningful change, run the test suite. If tests break, revert and document the issue instead of shipping the broken change.

### Phase 1: Dead Code Elimination
Systematically identify and remove:
- **Unused exports**: Functions, classes, constants, and types that are exported but never imported anywhere
- **Unused imports**: Imports that exist but aren't referenced in the file
- **Unreachable code**: Code after return/throw statements, permanently false conditionals, disabled feature flags that will never be re-enabled
- **Orphaned files**: Files that are never imported or referenced by any other file (be careful — check for dynamic imports, config references, and script entries)
- **Unused dependencies**: Packages in package.json (or equivalent) that are never imported in the source code
- **Commented-out code blocks**: Large blocks of commented-out code (not explanatory comments — actual dead code that's been commented out). If it's in version control, it doesn't need to be preserved as comments.

**Process for each removal:**
1. Identify the dead code
2. Verify it's truly unused (search for dynamic references, string-based imports, reflection, etc.)
3. Remove it
4. Run tests
5. If tests pass, commit with a clear message: `chore: remove unused [description]`
6. If tests fail, revert and note it in the report as "appears unused but tests depend on it — investigate"

### Phase 2: Code Duplication Reduction
- Scan for duplicated or near-duplicated logic (functions that do roughly the same thing with minor variations)
- Focus on:
- Copy-pasted utility functions that exist in multiple files
- Similar data transformation logic repeated across modules
- Repeated validation patterns that could be a shared validator
- Similar API call patterns that could be a shared client method
- For each instance of significant duplication:
- If the fix is low-risk (extracting a shared utility, creating a helper function): implement it, run tests, commit
- If the fix is higher-risk (refactoring core patterns): document it in the report with a proposed approach, but don't implement

### Phase 3: Consistency Enforcement
Scan for and fix inconsistencies in:
- **Naming conventions**: Mixed camelCase/snake_case in the same language, inconsistent file naming patterns, inconsistent component naming
- **Import ordering**: Standardize to a consistent pattern (external deps → internal modules → relative imports → types)
- **Error handling patterns**: Some functions throw, some return null, some return Result types — document the dominant pattern and flag deviations
- **Async patterns**: Mixed callbacks/promises/async-await for the same kind of operation — modernize to the dominant (usually best) pattern
- **String quotes**: Mixed single/double quotes (respect existing linter config if present)

**Important**: Only fix inconsistencies where there's a clear "right way" already dominant in the codebase. Don't impose a new convention — reinforce the existing one. If it's genuinely 50/50, document it in the report and let the team decide.

### Phase 4: Configuration & Feature Flag Hygiene

This phase combines stale feature flag cleanup, TODO inventory, and comprehensive configuration hygiene.

**Step 1: Feature flag inventory and cleanup**
- Find every feature flag in the codebase (environment variables, config files, LaunchDarkly/Flagsmith/etc. references, hardcoded boolean switches)
- For each flag, document:
- Name and location
- Current value (always true, always false, dynamic, or unknown)
-  **Owner**: Who likely owns this flag? (Infer from git blame, module ownership, or comments)
-  **Age**: When was it introduced? (Check git history)
-  **Type**: Is this a temporary rollout flag, a permanent operational toggle, or a kill switch?
- For always-true flags: remove the flag and keep the code
- For always-false flags: remove the flag AND the dead code it guards
-  For rollout flags older than 6 months that are always-on: these are almost certainly safe to remove. Remove the flag, keep the code.
- Run tests after each removal. Commit: `chore: remove stale feature flag [name]`

**Step 2: Flag coupling analysis**
- Identify flags that depend on other flags (nested conditionals, compound flag checks)
- Document the combinatorial complexity: how many distinct code paths do the current flags create?
- Flag any combinations that are likely untested (e.g., if Flag A and Flag B are both "sometimes on," is the (A=true, B=false) path ever tested?)
- Document these in the report — don't try to fix flag coupling overnight

**Step 3: Configuration sprawl audit**
- Find every configuration value in the codebase (constants, config files, environment variable reads, settings objects)
- Identify configuration that is:
- **Set but never varied**: Config values that have only ever been set to one value across all environments. These might be candidates for becoming constants.
- **Undocumented**: Config values that have no comment, no README entry, and no `.env.example` entry explaining what they do or what valid values are
- **Duplicated**: The same conceptual setting defined in multiple places (a timeout defined in both a config file and a hardcoded fallback, with different values)
- **Unused**: Config values defined but never read by application code
- For clearly unused config: remove it. Run tests. Commit: `chore: remove unused config [name]`
- For undocumented config: add clear comments explaining what it controls, valid values, and default behavior
- For duplicated config: consolidate to a single source of truth where safe

**Step 4: Default value audit**
- For every configuration value with a default, evaluate whether the default is appropriate:
- Are there defaults appropriate for development that would be dangerous in production? (Debug mode on by default, permissive CORS by default, short token expiry in dev but what about prod?)
- Are there defaults that silently degrade behavior? (A cache TTL defaulting to 0, effectively disabling caching)
- Are there missing defaults that cause crashes if the config isn't explicitly set?
- Document concerns in the report. Fix defaults that are clearly wrong and safe to change.

**Step 5: TODO/FIXME/HACK inventory** (unchanged from original)
- Find every TODO, FIXME, HACK, XXX, and TEMP comment in the codebase. For each one:
- Categorize: bug, tech debt, feature request, optimization, or obsolete
- If it's clearly obsolete (references old code that no longer exists, mentions completed work): remove it
- For the rest: include in the report with file, line, category, and your assessment of priority

### Phase 5: Quick Wins
As you work through the phases above, you'll notice small improvements that don't fit neatly into a category. Fix them as you go:
- Simplifying overly complex conditionals
- Replacing deprecated API usage with modern equivalents
- Removing unnecessary type assertions (TypeScript)
- Converting var to const/let where applicable
- Removing empty files, empty constructors, or no-op overrides
- Fixing obvious typos in variable names or comments

Commit these as `chore: misc cleanup in [module/file]`

## Output Requirements

Create the `audit-reports/` directory in the project root if it doesn't already exist. Save the report as `audit-reports/12_CODEBASE_CLEANUP_REPORT_[run-number]_[date]_[time in user's local time].md` (e.g., `12_CODEBASE_CLEANUP_REPORT_01_2026-02-16_2129.md`). Increment the run number based on any existing reports with the same name prefix in that folder.

### Report Structure

1. **Summary**
- Total files modified
- Lines of code removed (net)
- Unused dependencies removed
- Number of commits made
- Any tests that were affected

2. **Dead Code Removed** — list everything you removed and why you're confident it was dead

3. **Duplication Reduced** — what you consolidated, plus higher-risk duplications you documented but didn't touch

4. **Consistency Changes** — what patterns you enforced and where

5. **Configuration & Feature Flags**  (expanded from original)
- Flags removed: table with | Flag | Type | Age | Value | Action Taken |
-  Flag coupling map (which flags interact and the combinatorial paths created)
-  Configuration sprawl findings: table with | Config | Location | Issue | Action |
-  Default value concerns: table with | Config | Default | Concern | Recommendation |
- Full TODO/FIXME inventory table: | File | Line | Comment | Category | Priority | Recommendation |

6. **Couldn't Touch** — things you wanted to fix but couldn't because:
- Tests broke when you tried
- The change was too risky without team input
- You weren't sure about the intended behavior

7. **Recommendations** — larger refactoring opportunities you noticed that deserve their own effort

## Rules
- Branch: `codebase-cleanup-[date]`
- Run tests after EVERY change. No exceptions.
- If tests fail, revert immediately and document why
- Make small, atomic commits — one logical change per commit
- Commit messages should start with `chore:` and clearly describe what was done
- DO NOT change any business logic. If you're unsure whether something is dead code or intentional, leave it and document it
- DO NOT refactor working code just because you'd write it differently. Only fix actual issues: dead code, duplication, inconsistency.
- When in doubt, document rather than change. Conservative changes that keep tests green are infinitely more valuable than aggressive changes that might break things.
- You have all night. Be thorough. Check every directory.
```

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
