You are running an overnight test coverage expansion. Be thorough and methodical. Your job is to dramatically improve test coverage by writing high-quality tests that catch bugs, not just inflate coverage numbers.

## Mission

Expand coverage across six phases in order: smoke tests → coverage gap analysis → unit tests → E2E tests → mutation testing → quality assessment. Work on branch `test-coverage-[date]`.

### Phase 1: Smoke Tests
Before doing anything else, verify the app is alive and the critical path isn't broken. Smoke tests are the bouncer at the door — if the app can't get past them, nothing else matters.

**Write and run smoke tests that verify:**
1. **The app loads** — hitting the main URL (or running the entry point) doesn't crash or return an error
2. **Auth works** — the login page renders or a test user can authenticate
3. **The main page/view renders** — the primary dashboard or home screen shows up with data
4. **The API responds** — key backend endpoints return 200, not 500
5. **The database connects** — a basic read operation succeeds

**Standards:**
- Target 3–7 tests total. These are intentionally shallow and fast (under 30 seconds for the full smoke suite).
- Smoke tests check "is it on fire?" — not "is every feature correct." Don't test edge cases here.
- If ANY smoke test fails, stop and document the failure in the report as a **CRITICAL** finding before proceeding. Do not write deeper tests against a fundamentally broken app.
- Place smoke tests in a clearly labeled file/suite (e.g., `smoke.test.ts` or `__tests__/smoke/`) so they can be run independently after deploys.
- Match existing test conventions.

**After smoke tests pass**, proceed to deeper analysis.

### Phase 2: Coverage Gap Analysis
Before writing tests, understand what's missing.
- Run the existing suite and generate a coverage report if tooling is available
- If not, manually identify: modules with zero tests, uncovered functions, unexercised code paths
- Categorize uncovered code by risk:
- **Critical**: Public APIs, auth, payment/billing, data mutation, user-facing
- **High**: Business logic, data transforms, validation, error handling
- **Medium**: Internal utilities, helpers, config
- **Low**: Logging, formatting, UI presentation
- Produce a prioritized list. Work top-down from Critical.

### Phase 3: Unit Test Generation
For each uncovered function/module, starting with Critical:

**Before writing tests:** Read the function and its callees. Understand inputs, outputs, side effects, and the implicit contract. Match existing test style/conventions.

**Cover these categories:**
1. **Happy path** — normal usage with valid inputs
2. **Edge cases** — null/undefined/empty, boundary values (0, -1, MAX_INT), single-element collections, unicode/special chars, long strings, concurrency if applicable
3. **Error paths** — invalid types, missing fields, network/DB failures, permission denied
4. **State transitions** — for stateful code, test transitions not just end states

**Quality standards:**
- Descriptive test names: `should return empty array when user has no orders` not `test1`
- One assertion per test where practical; tests must be independent
- Descriptive variable names; mock external dependencies (DB, APIs, filesystem)
- Match existing file structure and conventions

**After writing tests for each module:**
- Run them — they must pass
- If a test reveals an actual bug, DO NOT fix it. Mark as skipped with `// BUG: [description]` and document in the report

### Phase 4: End-to-End Tests

**If browser automation (Playwright MCP, etc.) is available:**
- Test critical user journeys: sign up/login/logout, core product workflow, payment/checkout, settings, any CRUD flow
- For each: happy path, validation errors, navigation, state persistence

**If not available:**
- Write API-level integration tests for critical endpoints
- Include auth in setup; test sequences representing real user workflows

**E2E standards:** Independent tests, self-managed test data with cleanup, deterministic data (not random), proper async waits (no `sleep()`), test user experience not implementation.

### Phase 5: Mutation Testing on Critical Business Logic

Coverage tells you lines were executed, not that tests would catch bugs on those lines. Manual mutation testing answers: "If I introduced a bug, would any test catch it?"

**Step 1: Select targets (10-20 functions)**
Focus on functions where a silent bug causes: financial impact (pricing, billing, tax), data corruption (DB writes, import/export, migrations), security bypass (auth, permissions, input validation), or incorrect business decisions (analytics, threshold checks, eligibility, scoring).

Skip: presentation/UI logic, logging, test utilities, config/bootstrap, code already covered by strong contract/E2E tests.

**Step 2: Apply mutations one at a time**
For each target, apply mutations from these categories (prioritize comparison/boundary first, then arithmetic, logical, null/empty):

- **Arithmetic**: `+↔-`, `*↔/`, `%→*`, `+1→-1`, remove operation (`a+b→a`)
- **Comparison**: `>↔>=`, `<↔<=`, `==↔!=`, `>↔<`
- **Boundary**: constants ±1, array index bounds ±1, string slice ±1
- **Logical**: `&&↔||`, remove negation, remove conditional branch, `true↔false`, remove early return
- **Null/empty**: return `null`, `[]`, `{}`, `0`, or `""` instead of computed value

**For each mutation:**
1. Make the single change
2. Run relevant test file(s) only (not full suite)
3. Record: **KILLED** (test failed ✓), **SURVIVED** (tests pass — gap found), **TIMED OUT** (inconclusive), or **COMPILE ERROR** (type safety win)
4. REVERT immediately. Verify original tests pass before next mutation.

**Step 3: Write tests for surviving mutants**
For every surviving mutation, write a test that fails with the mutation and passes without it. Verify the kill by re-applying the mutation. Revert and commit: `test: add mutation-killing test for [function] — [mutation type]`

**Step 4: Assess type system kills**
Note which mutation categories types catch automatically vs. which need tests. Document functions where stronger types would improve coverage (feeds into Type Safety prompt).

**Step 5: Calculate mutation scores**
Per function: mutation score = (killed by tests + killed by types) / total × 100%. Below 80% on critical logic is a red flag.

### Phase 6: Test Quality Assessment
For all tests (existing and new):
- Are assertions meaningful? (Calling functions without asserting results is useless)
- Are tests testing the unit or just testing mocks?
- Cross-reference Phase 5: functions with low mutation scores despite high line coverage are top priority
- For critical logic not covered by Phase 5: try flipping a comparison or removing a conditional — would any test catch it?

## Report

Create `audit-reports/` in project root if needed. Save as `audit-reports/02_TEST_COVERAGE_REPORT_[run-number]_[date]_[time in user's local time].md`, incrementing run number based on existing reports.

### Sections:
1. **Summary** — Starting/ending coverage %, test files created, test cases written, pass/fail/skip counts, mutation score on critical logic, smoke test results (pass/fail)
2. **Smoke Test Results** — Pass/fail status for each smoke test. If any failed, document what was broken and whether it was resolved before deeper testing proceeded.
3. **Coverage Gap Analysis** — Uncovered modules by priority; covered vs. remaining
4. **Bugs Discovered** — File, line, description, severity, and the skipped test that reveals it
5. **Mutation Testing Results**
- Per-function table: Function | File | Risk | Mutations | Killed (tests) | Killed (types) | Survived | Score
- Overall mutation score for critical logic
- Surviving mutants addressed (new tests): Function | Mutation | New Test | Confirms Kill?
- Surviving mutants NOT addressed: Function | Mutation | Why Survived | Risk
- Type system effectiveness analysis; functions needing stronger types
6. **Tests Written** — Organized by module with brief descriptions
7. **Remaining Gaps** — What needs coverage and why (time, complexity, infra); functions with low mutation scores
8. **Testing Infrastructure Recommendations** — Missing utilities, suggested patterns, infra improvements, whether a mutation framework (Stryker, mutmut, etc.) is worth adopting

## Rules
- Branch: `test-coverage-[date]`
- Every test must pass (or be explicitly skipped with a bug comment)
- Match existing conventions — don't introduce new frameworks
- Don't modify source code — test what exists
- Document genuinely untestable functions in the report
- Prioritize CRITICAL/HIGH. Don't spend time on LOW if CRITICAL gaps remain.
- Quality over quantity. 50 meaningful tests > 200 trivial ones.
- NEVER commit a mutation. Always revert and verify before proceeding.
- Focus mutation testing on 10-20 critical functions, not the entire codebase.
- If mutation testing a single function exceeds 20 minutes, move on and note it.
- When a mutation survives, write a killing test before moving to the next function.
- Skip mutations a linter/formatter would catch — focus on plausible real-world bugs.
- If any smoke test fails, document the failure as CRITICAL before proceeding to deeper phases.
- You have all night. Be thorough.

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
