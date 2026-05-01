# Code Elegance & Abstraction Refinement

You are running an overnight code elegance and abstraction refinement pass. Your job: make the codebase something a senior developer would be proud to open. Untangle spaghetti, put logic in the right layers, simplify the convoluted, and make the code read like well-written prose — all without changing a single behavior.

This is the highest-risk overnight run. Every change must preserve exact behavior. Move slowly. Verify obsessively. When in doubt, don't touch it.

Work on branch `code-elegance-[date]`.

---

## Global Rules

- **Behavior preservation is sacred.** Every refactor must produce identical inputs → identical outputs, identical side effects, identical error behavior. "It works the same but better" is the only acceptable outcome.
- Run the FULL test suite after every refactor. Not just related tests.
- Run the build after every refactor.
- If tests or build fail, revert the ENTIRE change immediately. Do not debug — document what you attempted and move on.
- **One refactor at a time.** Refactor, test, commit. Then next refactor. Never batch multiple refactors into one commit.
- Commit format: `refactor: [what you improved] in [file/module]`
- DO NOT refactor files with less than 60% test coverage unless you write characterization tests first (Phase 1).
- DO NOT refactor code you don't fully understand. If you can't explain what every line does and why, document it as "needs team review" and skip it.
- DO NOT rename public API endpoints, exported function signatures, database columns, or environment variables. Internal names are fair game.
- DO NOT change error messages, log messages, or user-facing strings. Those are behavior.
- You have all night. Quality of each refactor matters infinitely more than quantity.

---

## Phase 1: Characterization Testing (Safety Net First)

Before refactoring anything, you need confidence that existing behavior is captured by tests. This phase builds that safety net for the code you're about to touch.

**Step 1: Identify refactoring candidates (quick scan)**
Do a fast pass through the codebase to identify the ~10-20 files/modules most in need of elegance work (you'll refine this list in Phase 2). Look for:
- Functions over 50 lines
- Deeply nested conditionals (3+ levels)
- Functions with 5+ parameters
- God classes/modules that do everything
- Logic that's clearly in the wrong layer (DB queries in route handlers, business rules in UI components, formatting in data models)
- Copy-paste code with slight variations
- Overly clever code that requires mental gymnastics to follow
- Long chains of if/else or switch statements that could be data-driven
- Callback hell or deeply nested promise chains
- Functions that mix multiple levels of abstraction (high-level orchestration interleaved with low-level details)

**Step 2: Assess test coverage for each candidate**
For each candidate file/module:
- What tests exist? What do they cover?
- Run coverage if tooling exists — what percentage of the code you want to refactor is exercised?
- Are the tests testing behavior (inputs → outputs, side effects) or implementation details?

**Step 3: Write characterization tests where needed**
For any refactoring candidate with less than 60% coverage on the code you plan to change:

- **Characterization tests capture current behavior, not intended behavior.** If the code has a bug, the characterization test should assert the buggy behavior. You're creating a snapshot of "what it does right now" so you'll know if your refactor changes anything.
- For pure functions: test with a variety of inputs including edge cases. Assert exact outputs.
- For functions with side effects: mock dependencies, assert the exact sequence of calls with exact arguments.
- For stateful code: test state transitions with exact before/after snapshots.
- For error paths: trigger every error condition and assert the exact error type, message, and any side effects.
- Name these tests clearly: `describe('[function] — characterization tests (pre-refactor)')`
- Commit: `test: add characterization tests for [module] before refactoring`

**DO NOT proceed to Phase 2 for any module until you're confident its behavior is captured by tests.**

---

## Phase 2: Code Audit & Refactoring Plan

Now do a thorough analysis. For each file/module in the codebase, evaluate against these code quality dimensions:

### Dimension 1: Single Responsibility
- Does this function/class/module do ONE thing?
- Can you describe what it does in one sentence without using "and"?
- If a function is named `processOrder`, does it ONLY process the order, or does it also send emails, update analytics, and log audit trails?

### Dimension 2: Right Level of Abstraction
- Is high-level orchestration mixed with low-level details? A function that coordinates a workflow should call well-named subfunctions — not contain raw SQL, string parsing, and HTTP calls inline.
- Is the code at a consistent level of abstraction within each function? (Not mixing "createUser" with "buffer.toString('base64')" in the same block)
- Are things in the right architectural layer?
- Route handlers should: validate input, call service layer, format response. Nothing else.
- Service layer should: orchestrate business logic, coordinate between data sources. No HTTP concepts, no response formatting.
- Data layer should: query and persist data. No business rules, no formatting.
- UI components should: render and handle user interaction. No direct API calls, no business logic.

### Dimension 3: Readability & Clarity
- Can a new developer understand this code without tribal knowledge?
- Are variable/function names descriptive and accurate? (`data` → `unprocessedOrders`, `temp` → `formattedAddress`, `flag` → `isEligibleForDiscount`)
- Are there magic numbers or strings that should be named constants?
- Is control flow straightforward, or does it require a flowchart to follow?
- Are there unnecessary intermediate variables, or conversely, overly long expressions that should be broken up?
- Are comments explaining "what" (the code should speak for itself) instead of "why" (which is valuable)?

### Dimension 4: Simplicity
- Is there a simpler way to achieve the same result?
- Are there unnecessary abstractions? (A factory that only creates one type, an interface with one implementation, a wrapper that adds nothing)
- Are there over-engineered patterns? (Strategy pattern for two cases, observer pattern for one subscriber, dependency injection for something with no tests and no alternate implementations)
- Conversely, are there missing abstractions? (The same 5-line pattern repeated 12 times that should be a function)

### Dimension 5: Function Design
- Do functions have reasonable parameter counts? (>3 is a smell; >5 is almost always wrong)
- Could long parameter lists be replaced with an options/config object?
- Are there boolean "flag" parameters that make the function do two different things? (Split into two functions)
- Do functions have a single return type, or do they sometimes return a string, sometimes null, sometimes undefined, sometimes an object?
- Are functions a reasonable length? (>30 lines = usually doing too much)

### Create the refactoring plan

For each issue found, document:
- **File and location**
- **What's wrong** (which dimension, specific description)
- **Proposed refactor** (exactly what you plan to do)
- **Risk level**: Low (rename, extract function, simplify conditional) / Medium (restructure module, change abstraction layer) / High (redesign data flow, split god class)
- **Test coverage**: Adequate / Needs characterization tests first

**Priority order for execution:**
1. Low-risk, high-readability-impact (quick wins that make the code dramatically clearer)
2. Medium-risk, high-impact (abstraction fixes, layer corrections)
3. Low-risk, medium-impact (naming, simplification, constant extraction)
4. High-risk items — document only, do not implement overnight

---

## Phase 3: Execute Refactors

Work through your plan in priority order. For each refactor:

### Before touching code:
- Re-read the function/module completely
- Verify you understand every code path, including error paths
- Verify test coverage is adequate (if not, go back to Phase 1)
- State to yourself: "This refactor changes the structure but not the behavior because: [reason]"

### Refactoring Techniques (use as appropriate):

**Extract Function** — The workhorse refactor. When a block of code inside a function does a distinct sub-task:
- Give it a descriptive name that says what it does, not how
- Pass only what it needs as parameters
- Return only what the caller needs
- The calling function should now read like a high-level summary

**Extract Constant / Config** — Replace magic numbers and strings:
- `if (retries > 3)` → `if (retries > MAX_RETRY_ATTEMPTS)`
- `role === 'admin'` → `role === ROLES.ADMIN` (if roles are used in multiple places)
- Group related constants in a well-named object or enum

**Simplify Conditionals:**
- Replace nested if/else with early returns (guard clauses)
- Replace long if/else chains with lookup objects/maps when mapping input → output
- Replace boolean flag parameters with separate, well-named functions
- Replace complex boolean expressions with descriptively named variables: `const isEligible = age >= 18 && hasVerifiedEmail && !isBanned;`
- Invert negative conditions for readability: `if (!isNotReady)` → `if (isReady)`

**Flatten Nesting:**
- Replace `if (condition) { ...lots of code... }` with `if (!condition) return;` followed by the code at the top level
- Replace nested callbacks with async/await
- Replace nested loops with helper functions or appropriate array methods

**Improve Naming:**
- Variables should describe what they hold, not their type: `userList` → `activeUsers`, `str` → `serializedPayload`
- Functions should describe what they do as a verb phrase: `process()` → `calculateShippingCost()`, `handle()` → `routeIncomingWebhook()`
- Booleans should read as questions: `valid` → `isValid`, `enabled` → `isFeatureEnabled`, `check` → `hasPermission`
- Match the domain language. If the team says "workspace" not "organization," use "workspace" in code.

**Fix Abstraction Layers:**
- Move database queries out of route handlers into a data/repository layer
- Move business rules out of UI components into a service/logic layer
- Move HTTP/response formatting out of business logic into the controller/handler layer
- Move validation to the input boundary (where data enters the system)
- Each layer should only know about the layer directly below it

**Simplify Over-Engineering:**
- If a class has one method, it should probably be a function
- If a factory creates one type, it should probably be a constructor call
- If an abstraction has one implementation and no tests use an alternate, it may not need to be an abstraction
- If a config option has never been changed from its default, it might just be a constant
- Remove dead abstractions — interfaces nobody implements, base classes with one child, strategies with one strategy

**Replace Imperative with Declarative (where clearer):**
- `for` loops building arrays → `map`, `filter`, `reduce` (but only when it's actually clearer — don't force it)
- Manual object construction from another object → spread/destructuring
- Repeated conditional checks → lookup tables/maps
- **Don't over-do this.** A simple `for` loop is sometimes more readable than a clever reduce chain. Readability wins over cleverness every time.

### After each refactor:
1. Run the full test suite
2. Run the build
3. Manually verify: does this code do the exact same thing as before? Trace through mentally.
4. If everything passes: commit with a clear message explaining what was improved and why
5. If anything fails: revert immediately, document what went wrong, move to next item

---

## Phase 4: Structural Improvements (Conservative)

After individual refactors are complete, look for broader structural improvements. **Only implement low-risk structural changes. Document the rest.**

### Safe to implement:
- Moving a helper function from a file where it doesn't belong to one where it does (update all imports, test, commit)
- Grouping related functions that are scattered across a file into a logical order
- Adding section comments to long files that organize code into logical groups
- Creating a shared utility function from duplicated logic (only if the duplication is exact or near-exact)

### Document only — do not implement:
- Splitting god modules into focused sub-modules (use the File Decomposition prompt for this)
- Introducing new architectural patterns (repository pattern, service layer, etc.)
- Changing the project's directory structure
- Creating new abstraction layers that don't currently exist

---

## Phase 5: Code Quality Assessment

After all refactors are complete, do a final assessment:

**Step 1: Before/after comparison**
For each file you touched, compare:
- Line count before and after
- Deepest nesting level before and after
- Longest function before and after
- Number of parameters on the most complex function before and after
- Subjective readability score (1-5) before and after

**Step 2: Remaining issues**
What couldn't you fix, and why?
- Too risky for overnight
- Insufficient test coverage
- Requires team input on intended design
- Requires broader architectural changes

**Step 3: Patterns observed**
What recurring anti-patterns did you see? These inform team conventions:
- "Business logic is frequently found in route handlers — the team should adopt a service layer pattern"
- "Functions regularly mix abstraction levels — consider a team convention of extract-function for anything below the main function's abstraction level"
- "Magic numbers are pervasive — consider a project-wide constants file or enum convention"

---

## Output

Create `audit-reports/` in project root if needed. Save as `audit-reports/16_CODE_ELEGANCE_REPORT_[run-number]_[date]_[time in user's local time].md`, incrementing run number based on existing reports.

### Report Structure

1. **Executive Summary** — Files analyzed, refactors executed, refactors reverted, tests still passing, overall assessment of code quality improvement.

2. **Characterization Tests Written** — Table: | File/Module | Tests Added | Coverage Before | Coverage After | Purpose |. These tests have value beyond this refactoring pass — they document current behavior.

3. **Refactors Executed** — For each refactor:
| File | What Changed | Technique Used | Risk Level | Before (metrics) | After (metrics) |

Plus a brief description of what was improved and why for non-obvious changes.

4. **Refactors Attempted but Reverted** — What you tried, what broke, and your assessment of why.

5. **Refactors Identified but Not Attempted** — The backlog. For each:
| File | Issue | Proposed Refactor | Risk Level | Why Not Attempted | Priority for Next Run |

6. **Code Quality Metrics** — Before/after summary:
- Longest function (lines): before → after
- Deepest nesting level: before → after
- Largest parameter count: before → after
- Functions over 50 lines: before → after
- Files with mixed abstraction layers: before → after

7. **Anti-Pattern Inventory** — Recurring patterns the team should address as conventions:
| Pattern | Frequency | Where It Appears | Recommended Convention |

8. **Abstraction Layer Assessment** — Current state of architectural layering:
- Which layers exist and are respected?
- Which layers are violated and where?
- Recommended layer boundaries for this project

9. **Recommendations** — Priority-ordered next steps:
- Refactors to attempt in the next run (from the backlog)
- Conventions to adopt to prevent new code from regressing
- Architectural improvements that would benefit the codebase
- Areas needing team discussion before refactoring

## Rules
- Branch: `code-elegance-[date]`
- ONE REFACTOR AT A TIME. Refactor, test, commit. Then next.
- Run FULL test suite AND build after every refactor.
- If tests or build fail, revert the entire change immediately. Do not debug.
- DO NOT refactor code with insufficient test coverage — write characterization tests first.
- DO NOT change behavior. Not even "slightly better" behavior. Behavior changes are a separate task.
- DO NOT change public APIs, exported interfaces, database schemas, or environment variables.
- DO NOT introduce new libraries or dependencies.
- DO NOT refactor test files (they serve a different purpose).
- DO NOT over-abstract. Removing unnecessary abstraction is just as valid as adding necessary abstraction. The goal is the RIGHT level of abstraction, not MORE abstraction.
- Readability beats cleverness. Always. If the "elegant" version is harder to understand, keep the simple version.
- Prefer small, obvious improvements over ambitious restructuring. Ten small refactors that each clearly improve one thing are worth more than one large refactor that tries to fix everything.
- If you're unsure whether a refactor preserves behavior, it's too risky. Document it and move on.
- You have all night. Take your time. Every refactor should make a developer smile when they read the diff.

## Chat Output Requirement

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish. Do not make the user open the report to get the highlights. The chat summary should include:

### 1. Status Line
One sentence: what you did, how long it took, and whether all tests still pass.

### 2. Key Findings
The most important things discovered — anti-patterns, structural issues, code quality wins, or surprises. Each bullet should be specific and actionable, not vague. Lead with impact.

**Good:** "The `OrderService` class (847 lines) handles order creation, payment processing, email sending, inventory management, and analytics — splitting this into focused services would dramatically improve maintainability."
**Bad:** "Found some long files."

### 3. Changes Made
Bullet list of what was refactored, with before/after metrics where meaningful.

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
