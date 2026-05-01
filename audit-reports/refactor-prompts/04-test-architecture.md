# Test Architecture & Antipattern Audit

You are running an overnight test architecture audit. Test Coverage checks quantity. Test Hardening fixes flakiness. Your job is different: determine whether the tests are actually *good* — whether they catch real regressions or just produce green checkmarks.

**READ-ONLY analysis.** Do not modify any code or create a branch.

---

## Global Rules

- Evaluate tests as a *regression safety net*, not as documentation or coverage metrics.
- For every antipattern found, include: file, test name, what's wrong, why it matters, and a concrete fix suggestion.
- Be honest. A 95% coverage suite full of antipatterns is worse than 60% coverage of well-written behavioral tests. Say so.
- You have all night. Read every test file.

---

## Phase 1: Test Inventory & Classification

**Catalog every test file.** For each, record: file path, test count, what it tests (unit/integration/E2E), framework, approximate runtime, and the source module it covers.

**Classify the suite:**
- Ratio of unit : integration : E2E tests. Is the testing pyramid inverted (too many E2E, too few unit)?
- Which modules have tests? Which have none? Which have tests that don't match current behavior?
- Are test file locations consistent (co-located vs. separate `__tests__` directory vs. mixed)?

---

## Phase 2: Antipattern Detection

Scan every test file for each category below. Be exhaustive — count every instance.

### Implementation Coupling
- Tests asserting on internal method calls, private state, or execution order rather than inputs → outputs
- Tests that mock the module under test (testing the mock, not the code)
- Tests that break when you refactor internals without changing behavior
- Tests asserting exact function call counts on non-critical mocks (`expect(mock).toHaveBeenCalledTimes(3)` where 3 is an implementation detail)

### Misleading Tests
- Test name says one thing, assertions check another ("should validate email" but only checks the function doesn't throw)
- Tests with zero assertions (run code but verify nothing — `expect` never called)
- Tests where every assertion is on a mock, not on actual output
- Tautological assertions (`expect(true).toBe(true)`, `expect(mock).toHaveBeenCalled()` on a mock called unconditionally in setup)
- `expect` inside callbacks or async blocks that never execute (test passes because the assertion is never reached)

### Fragile Snapshots
- Snapshot tests on large objects, full HTML trees, or API responses (any change = blind update)
- Snapshot files with frequent, large diffs in git history
- Inline snapshots that are clearly auto-updated without review (formatting artifacts, irrelevant fields)

### Mock Overuse
- Mocks more complex than the code they replace (mock setup longer than the function body)
- Mocks that re-implement business logic (now you have two things to maintain)
- Mocks of things that should just be called (pure utility functions, simple data transforms)
- Deep mock chains (`mockService.mockMethod.mockReturnValue(...)` 5+ levels deep)
- Tests that only verify mock interactions with no behavioral assertion

### Wrong Test Level
- "Unit" tests that spin up databases, HTTP servers, or read files (integration tests in disguise)
- "Integration" tests that mock every dependency (unit tests in disguise)
- E2E tests checking implementation details that a unit test should cover
- Unit tests duplicating exact E2E test coverage with no additional edge cases

### Shared & Leaking State
- Global `beforeAll` setup shared across unrelated tests (test order dependence)
- Mutable module-level variables modified by tests without reset
- Database/file state not cleaned up between tests
- Tests that pass individually but fail when run together (or vice versa)

### Duplication & Bloat
- Near-identical tests with one parameter changed (should be parameterized/table-driven)
- The same setup code copy-pasted across 10+ test files
- Test helper functions that duplicate production code instead of calling it
- Tests for trivially simple code (getters, one-line pass-throughs) consuming maintenance effort

### Test Helper Bugs
- Shared test utilities, factories, or builders — read them as carefully as production code
- Helpers that silently swallow errors, supply wrong defaults, or produce invalid test data
- Factory functions that don't match current schema (added fields missing, removed fields still present)

---

## Phase 3: Regression Effectiveness Assessment

**For each major module**, answer: "If a developer introduced a subtle bug in this module tomorrow, would the tests catch it?"

- Assess whether tests check *behavior* (given X input, expect Y output) or just *execution* (the function ran without crashing)
- Cross-reference with mutation testing results if a Test Coverage run exists — functions with high line coverage but low mutation scores are the worst offenders
- Identify the most dangerous gaps: code that has tests but whose tests wouldn't catch common bug types (off-by-one, null handling, boundary conditions, wrong status codes)

**Rate each module:** Strong (would catch most regressions) / Weak (covers happy path only) / Decorative (tests exist but catch almost nothing) / None

---

## Phase 4: Structural Assessment

- **Test organization**: Consistent? Discoverable? Can you find the tests for a given module without searching?
- **Test naming conventions**: Descriptive (`should return 404 when user not found`) or vague (`test1`, `works correctly`)?
- **Setup/teardown patterns**: Consistent? Appropriate scope? Unnecessarily broad?
- **Custom matchers/utilities**: Well-maintained? Documented? Actually used?
- **Test configuration**: Reasonable timeouts? Appropriate parallelism? Sensible defaults?

---

## Output

Save as `audit-reports/04_TEST_ARCHITECTURE_REPORT_[run-number]_[date]_[time in user's local time].md`.

### Report Structure

1. **Executive Summary** — Suite health rating (decorative / fragile / adequate / strong / excellent), antipattern count by category, regression effectiveness score, one-line verdict: "This test suite [would / would not] catch a subtle billing bug introduced on a Friday afternoon."
2. **Test Inventory** — Classification table, pyramid ratio, coverage distribution.
3. **Antipattern Findings** — Per category: count, worst examples (file + test name + what's wrong), fix pattern. Table: | File | Test | Antipattern | Severity | Suggested Fix |
4. **Regression Effectiveness** — Per-module rating table: | Module | Test Count | Coverage | Effectiveness Rating | Why |
5. **Structural Assessment** — Organization, naming, conventions, configuration.
6. **Recommendations** — Priority-ordered. Focus on: which antipatterns to fix first (highest regression risk), which modules need test rewrites vs. additions, conventions to adopt, and whether the team should invest in better test infrastructure (factories, custom matchers, test database management).

## Chat Output Requirement

Print a summary in conversation:

1. **Status Line** — What you analyzed.
2. **Key Findings** — Specific bullets with severity. "42 tests have zero assertions — they pass even if the code returns garbage." Not "found some test quality issues."
3. **Recommendations** table (if warranted):

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| | ≤10 words | What improves | Low–Critical | Yes/Probably/If time | 1–3 sentences |

4. **Report Location** — Full path.
