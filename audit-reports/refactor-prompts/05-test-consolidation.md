# Test Consolidation

You are running an overnight test consolidation pass. Your job: find every test that is testing the same behavioral path as another test, eliminate the duplicates, and leave the suite smaller, clearer, and no less correct. You are not improving tests — you are removing noise so the real coverage is visible.

Work on branch `test-consolidation-[date]`.

---

## Global Rules

- Run the full test suite before touching anything. Establish a green baseline. If it's already red, stop and document that as a CRITICAL finding — do not consolidate a broken suite.
- Run the full test suite after every consolidation. If tests go red, revert the entire change immediately and document it.
- **Never consolidate tests that cover distinct behavioral sub-cases**, even if they look similar. Two tests with different inputs are only redundant if the behavior under test is identical for both inputs.
- A merged test must be at least as expressive as the originals. If consolidation makes the intent less clear, don't do it.
- When in doubt about whether two tests are truly redundant, they are not. Document them instead.
- Make small, atomic commits — one logical consolidation per commit. Commit format: `test: consolidate duplicate [description] tests in [file]`
- You have all night. Accuracy matters more than speed.

---

## Phase 1: Baseline & Inventory

**Step 1: Establish baseline**
Run the full test suite. Record: total test count, pass/fail/skip counts, coverage percentage if available. If any tests are failing, stop and document before proceeding.

**Step 2: Catalog every test file**
For each file, record: path, framework, test count, and the module it covers. Note files that appear to test the same module from different angles.

---

## Phase 2: Duplicate Detection

Work through these categories systematically. For each duplicate group found, document before touching anything.

### Category 1: Verbatim and near-verbatim duplicates
- Tests with identical or near-identical bodies under different names
- Tests that differ only in local variable names with no effect on what's asserted
- Copy-paste tests where setup and assertions are structurally identical
- Tests in different files that exercise the exact same code path with the exact same inputs and assert the exact same outputs

### Category 2: Redundant happy-path saturation
Find feature areas where multiple tests all exercise the happy path with no meaningful variation — valid inputs, expected outputs, no error conditions, no edge cases. Five tests confirming the same function returns the correct value for five slightly different valid inputs is not coverage breadth; it's noise. Flag every cluster where:
- All tests use valid inputs of the same category
- No test in the group covers a different outcome or code branch
- Removing all but one would leave identical behavioral coverage

### Category 3: Parameterizable tests
Tests that are not verbatim duplicates but differ only in input/output values and would be more clearly expressed as a single parameterized test (`it.each` / `test.each` / `@pytest.mark.parametrize` / equivalent). These are not duplicates to delete — they are duplicates to merge into a table-driven test that is more readable and easier to extend.

Candidates: test blocks that share the same `describe`, have parallel structure, and differ only in their data.

### Category 4: Redundant cross-layer testing
Find cases where the exact same specific assertion is verified at multiple test layers — unit, integration, and E2E all asserting the identical return value or behavior. Note: this is not always bad. Cross-layer tests catch different failure modes. Only flag as redundant when the tests are truly checking the same thing at the same fidelity and neither adds what the other doesn't.

---

## Phase 3: Build the Consolidation Map

Before changing anything, produce a complete consolidation plan:

| Group | Files | Test Count | What They All Test | Proposed Action | Tests After | Risk Level |
|---|---|---|---|---|---|---|

**Proposed actions:**
- **Delete** — Remove all but the best-named instance (verbatim duplicates)
- **Parameterize** — Merge into a single `it.each` / data-driven test
- **Merge into describe** — Consolidate into one well-structured describe block
- **Leave** — Not redundant on closer inspection; document why

Review this plan in its entirety before executing. The plan is your contract — don't deviate during execution.

---

## Phase 4: Execute Consolidations

Work through the plan one group at a time.

**For each consolidation:**

1. Re-read every test in the group to confirm your earlier analysis still holds
2. Make the change (delete, parameterize, or restructure)
3. Run the full test suite
4. If green: commit with a clear message listing what was removed/merged and why
5. If red: revert the entire change immediately, document what happened, move to the next group

**Parameterization standards:**
- Each row in the parameter table must be self-documenting — a reader should understand what case it covers without reading the test body
- Use descriptive case labels, not `case1` / `case2`
- The parameterized test must cover every case the originals covered — count assertions before and after

**Deletion standards:**
- Keep the test with the most descriptive name
- If the tests have different names that each capture something, write a new name that captures both before deleting
- Never delete a test that has a comment explaining non-obvious behavior — preserve that comment

---

## Phase 5: Post-Consolidation Validation

After all consolidations are complete:

1. Run the full test suite one final time
2. Record: new total test count, pass/fail/skip counts, coverage percentage
3. Compare before/after: tests removed, tests parameterized, net change in coverage (should be zero or improved)
4. Run the linter if the project has one — consolidated files may need formatting fixes

---

## Output

Create `audit-reports/` in project root if needed. Save as `audit-reports/05_TEST_CONSOLIDATION_REPORT_[run-number]_[date]_[time in user's local time].md`, incrementing run number based on existing reports.

### Report Structure

1. **Executive Summary** — Baseline test count, final test count, tests removed, tests parameterized, coverage before/after, all tests passing.

2. **Consolidation Map** — The full plan table from Phase 3, updated with actual outcomes (executed / skipped / reverted).

3. **Consolidations Executed** — For each: what was merged, how many tests removed, commit hash, tests passing after.

4. **Consolidations Reverted** — What was attempted, what broke, why it couldn't be resolved safely.

5. **Consolidations Identified but Not Executed** — Groups that were flagged but left alone: why (ambiguous intent, no safe merge, time constraints).

6. **Remaining Redundancy** — Areas of the suite that still have high happy-path saturation, no adversarial coverage, or cross-layer redundancy — flagged here for the Test Quality & Adversarial Coverage run to address.

7. **Recommendations** — Conventions to adopt to prevent re-accumulation (parameterized test patterns, code review checklist items, file organization suggestions).

---

## Chat Output Requirement

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish.

### 1. Status Line
One sentence: what you did, how long it took, whether all tests still pass, and the before/after test count.

### 2. Key Findings
The most important things discovered — specific and actionable.

**Good:** "Found 34 verbatim duplicate tests across `user.test.ts` and `user.service.test.ts` — all testing the same happy-path token validation with different variable names."
**Bad:** "Found some duplicate tests."

### 3. Changes Made
Bullet list of consolidations executed. Skip if nothing was changed.

### 4. Recommendations

If there are legitimately beneficial recommendations worth pursuing right now, present them in a table. Do **not** force recommendations — if the audit surfaced no actionable improvements, simply state that no recommendations are warranted at this time and move on.

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| *Sequential number* | *Short description (≤10 words)* | *What improves if addressed* | *Low / Medium / High / Critical* | *Yes / Probably / Only if time allows* | *1–3 sentences explaining the reasoning, context, or implementation guidance* |

Order rows by risk descending. Be honest in "Worth Doing?" — not everything flagged is worth the engineering time.

### 5. Report Location
State the full path to the detailed report file for deeper review.

---

**Formatting rules for chat output:**
- Use markdown headers, bold for severity labels, and bullet points for scannability.
- Do not duplicate the full report contents — just the highlights and recommendations.
- If you made zero findings in a phase, say so in one line rather than omitting it silently.
