# Type Safety & Error Handling Hardening

## Prompt

```
You are running an overnight robustness hardening pass. You have several hours. Your job is to make the codebase more resilient by strengthening type safety and error handling. You will be modifying code — every change must keep tests passing.

Work on a branch called `robustness-hardening-[date]`.

## Your Mission

### Phase 1: Type Safety Audit & Improvement

**If the project uses TypeScript:**

**Step 1: Find type weakness hotspots**
- Search for every instance of `any` type (explicit `any`, implicit `any` from missing annotations)
- Search for type assertions (`as`, `!` non-null assertions) — each one is a place where you're telling the compiler "trust me" instead of proving correctness
- Search for `@ts-ignore` and `@ts-expect-error` comments
- Check `tsconfig.json` — note which strict mode options are disabled and what they'd catch if enabled
- Look for functions with no return type annotation
- Look for function parameters with no type annotation
- Find places where `Object`, `Function`, `{}`, or `unknown` are used as types

**Step 2: Fix type weaknesses, starting with highest risk**

Priority order:
1. **Public API boundaries** (function signatures exposed to other modules or external consumers) — these MUST have explicit, accurate types
2. **Data layer** (database queries, API responses, data transformations) — where runtime data enters the typed world
3. **Business logic** (core domain functions) — where incorrect types cause incorrect behavior
4. **Internal utilities** — lower risk but still worth typing correctly
5. **Test files** — lowest priority, but remove `any` where it's easy

For each fix:
- Replace `any` with the actual type. If you're not sure what the type should be, read the code that produces and consumes the value to infer it.
- Replace type assertions with proper type narrowing (type guards, conditional checks, discriminated unions)
- Remove `@ts-ignore` by fixing the underlying type error
- Add return type annotations to functions that are missing them
- Add parameter type annotations where missing
- Run tests after each batch of related changes
- Commit: `chore: strengthen types in [module]`

**Step 3: Identify structural type improvements**
Some type weaknesses require larger refactoring. Don't implement these — document them:
- Places where a discriminated union would prevent impossible states
- Places where branded types would prevent mixing up similar primitives (userId vs. orderId)
- Places where generics would replace duplicated type definitions
- Places where `unknown` should replace `any` as a safer intermediate step

**If the project uses JavaScript (no TypeScript):**
- Add JSDoc type annotations to all public functions
- Identify functions where input types are ambiguous and document what they actually accept
- Look for implicit type coercion bugs (== vs ===, string + number, truthy/falsy checks on 0 or "")
- Look for functions that sometimes return different types (string | undefined | null) without the callers handling all cases
- Document which files/modules would benefit most from TypeScript migration

**If the project uses Python:**
- Add type hints to all public functions missing them
- Run mypy or pyright if configured and fix reported issues
- Look for functions with ambiguous return types (sometimes returns None, sometimes a value)
- Check for unsafe dict access without `.get()` or key checks
- Look for broad `except` clauses that swallow type errors

### Phase 2: Error Handling Audit & Improvement

**Step 1: Find error handling problems**

Scan the entire codebase for:
- **Empty catch blocks**: `catch (e) {}` or `catch (e) { // TODO }` — errors being silently swallowed
- **Catch-and-log-only**: `catch (e) { console.log(e) }` with no recovery, re-throw, or user notification
- **Overly broad catches**: Catching all exceptions when only specific ones are expected
- **Missing catches entirely**: Async operations with no error handling (unhandled promise rejections, uncaught async errors)
- **Inconsistent error response formats**: API endpoints returning errors in different shapes (`{ error: msg }` vs `{ message: msg }` vs `{ errors: [...] }`)
- **Error information leakage**: Stack traces, internal paths, database details, or system information exposed in error responses
- **Missing error boundaries**: React error boundaries (if React), global error handlers, unhandled rejection handlers
- **String errors**: `throw "something went wrong"` instead of proper Error objects
- **Error swallowing in chains**: `.catch(() => null)` or `.catch(() => {})` in promise chains
- **Missing finally blocks**: Resources (connections, file handles, streams) that aren't cleaned up on error

**Step 2: Fix error handling issues**

Priority order:
1. **Silent error swallowing** — these are the most dangerous because they hide bugs
2. **Unhandled async errors** — these crash processes in production
3. **Information leakage** — security concern
4. **Inconsistent error formats** — user/developer experience
5. **Missing cleanup** — resource leaks

For each fix:
- Empty catch blocks: Either handle the error properly, re-throw it, or at minimum log it with context about WHERE and WHY
- Overly broad catches: Narrow to specific error types, re-throw unexpected errors
- Missing error handling: Add appropriate try/catch or .catch() handlers
- Inconsistent formats: Identify the dominant pattern in the codebase and align deviations to it
- String errors: Convert to proper Error objects (or custom error classes if the project has them)
- Run tests after each batch of changes
- Commit: `fix: improve error handling in [module]`

**Step 3: Error handling infrastructure**
Evaluate and document (don't necessarily implement):
- Does the project have custom error classes? Should it?
- Is there a global error handler? Is it comprehensive?
- Is there an error reporting/monitoring integration? Are errors actually reaching it?
- Are errors being logged with sufficient context to debug them?
- Is there a consistent pattern for operational errors (expected, like "user not found") vs programmer errors (unexpected, like null reference)?

## Output Requirements

Create the `audit-reports/` directory in the project root if it doesn't already exist. Save the report as `audit-reports/21_TYPE_SAFETY_REPORT_[run-number]_[date]_[time in user's local time].md` (e.g., `21_TYPE_SAFETY_REPORT_01_2026-02-16_2129.md`). Increment the run number based on any existing reports with the same name prefix in that folder.

### Report Structure

1. **Summary**
- `any` types removed: X
- Type assertions replaced with proper narrowing: X
- `@ts-ignore` comments removed: X
- Return type annotations added: X
- Empty catch blocks fixed: X
- Unhandled async errors fixed: X
- Error format inconsistencies fixed: X
- Tests still passing: yes/no

2. **Type Safety Improvements Made**
- Table: | File | Change | Risk Level | Before → After |

3. **Type Safety Improvements Recommended (Not Implemented)**
- Structural improvements that need team discussion
- Files/modules that need larger refactoring

4. **Error Handling Fixes Made**
- Table: | File | Issue | Fix Applied |

5. **Error Handling Infrastructure Assessment**
- Current state of error handling patterns
- What's good, what's missing, what needs work

6. **Bugs Discovered**
- Type errors or error handling gaps that revealed actual bugs
- These are high-value findings — highlight them

7. **Recommendations**
- Suggested tsconfig.json strict mode changes (with impact assessment)
- Error handling patterns the team should adopt
- Custom error classes to create

## Rules
- Branch: `robustness-hardening-[date]`
- Run tests after EVERY batch of changes. No exceptions.
- If tests fail, revert and document why
- DO NOT change business logic. Your job is to make existing logic more type-safe and more resilient to errors, not to change what it does.
- When replacing `any`, use the ACTUAL correct type — don't just replace `any` with `unknown` everywhere as a cop-out (though `unknown` is appropriate in some cases)
- When fixing error handling, preserve the existing error recovery intent — if a catch block returns a default value, keep that behavior but add logging
- Match existing code style and conventions
- You have all night. Be thorough. Start with the highest-risk code.
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
