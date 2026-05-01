# Test Quality & Adversarial Coverage Audit

You are running an overnight test quality and adversarial coverage audit. Unlike Test Coverage (which measures how many lines are touched) and Test Architecture (which evaluates structure and antipatterns), your job is narrower and more pointed: **do these tests verify behavior that actually matters, and would they catch what a real user — or a malicious one — would actually do?**

This is a READ-ONLY analysis. Do not create a branch or modify any code.

Ideally, run this after the Test Consolidation pass so you're analyzing a clean suite, not one padded with duplicates.

---

## Global Rules

- Evaluate every test by asking: "If the production code silently returned the wrong answer here, would this test catch it?" If the answer is no, that's a finding.
- Be specific. "12 tests in `payment.test.ts` all verify the same happy-path charge with slightly different amounts — none test negative amounts, zero, or non-numeric input" is useful. "Tests lack edge case coverage" is not.
- A test that always passes regardless of whether the code is correct is worse than no test. Name these explicitly.
- Adversarial coverage is not about security theater — it's about testing the inputs real users send when confused, impatient, or malicious. These are the inputs that reveal the real behavior of the system.
- You have all night. Read every test file and its corresponding source module.

---

## Phase 1: Assertion Quality Audit

Find tests that are executing code without meaningfully verifying anything.

### Category 1: Execution-only tests
Tests that run code but make no meaningful assertion about output, state, or side effects:
- `expect(() => fn()).not.toThrow()` as the only assertion — proves it didn't crash, nothing about correctness
- Calling a function and not asserting the return value
- Rendering a component and not asserting what rendered
- `expect(mock).toHaveBeenCalled()` on a mock that is unconditionally called in `beforeEach` (always passes regardless of production code behavior)

### Category 2: Tautological assertions
Assertions that are structurally guaranteed to pass:
- Asserting the shape of a mock's return value — you defined the mock, so it always returns what you told it to
- `expect(result).toBeDefined()` when the code path always returns a value
- `expect(arr.length).toBeGreaterThan(0)` on an array built from hardcoded test setup
- Asserting a boolean is `true` after calling a function that literally `return true`s unconditionally

### Category 3: Implementation-coupled assertions
Tests that claim to verify behavior but only verify implementation details:
- Asserting a specific internal method was called N times when what matters is the observable output
- Asserting the exact SQL query string instead of the query result
- Testing internal class state instead of observable behavior
- Asserting mock call order when order doesn't affect correctness

### Category 4: Assertion density
For each test file, calculate: total meaningful assertions / total tests. Files with a ratio below 1.5 are high-risk. Report the 10 worst offenders with specifics.

---

## Phase 2: Test Intent vs. Test Name Audit

Find tests where the name promises one thing and the assertions verify something different — or nothing at all.

Scan for:
- Test name says "validates email" but assertions only check the function doesn't throw
- Test name says "returns 404 when user not found" but the mock always returns a user
- Test name says "handles concurrent requests" but the test is entirely synchronous
- `describe` block label is no longer accurate because the underlying code changed
- Test describes a specific scenario but setup creates a different one

These are the most confidence-eroding tests in a suite. They pass in CI and make the team believe something is covered that isn't.

---

## Phase 3: Boundary & Edge Case Coverage

For every module with test coverage, evaluate whether tests cover what actually happens at the edges — not just the comfortable middle.

For each function and endpoint, check whether the following are covered. Report the gaps.

**Numeric boundaries:** zero, negative numbers, max integer, floating point imprecision (e.g., `0.1 + 0.2`), NaN, Infinity

**String boundaries:** empty string, single character, maximum allowed length, over-maximum length, whitespace-only

**Collection boundaries:** empty array/object, single element, maximum count, duplicate elements, null inside collection

**Boolean/falsy ambiguity:** `null` vs `false` vs `undefined` vs `0` vs `""` — all falsy, not interchangeable. Tests that only cover `null` when code paths also handle `undefined` differently are gaps.

**Date and time edges:** midnight, end of month, leap day (Feb 29), DST transition, epoch (0), far future, far past

**Reference edges:** non-existent ID, deleted-entity ID, ID belonging to a different user, ID of wrong entity type

For each module, rate boundary coverage: **Thorough** / **Partial** / **Happy-path only** / **None**

---

## Phase 4: Adversarial Input Coverage

This is the gap most test suites leave entirely open. Real users — and attackers — don't send well-formed inputs. Check whether any test in the suite covers the following categories for each API endpoint, form handler, data import function, or external input boundary.

### Malformed structure
- Completely wrong type: string where integer expected, array where object expected, object where array expected, number where boolean expected
- Missing required fields
- Extra unexpected fields
- Deeply nested structures beyond expected depth
- Extremely large payloads

### Injection and encoding
- SQL injection strings in any text field: `' OR '1'='1`, `'; DROP TABLE users; --`
- Script tags in user-supplied text: `<script>alert(1)</script>`
- Path traversal sequences: `../../../etc/passwd`, `..%2F..%2F`
- Null bytes: `hello\0world`
- Unicode edge cases: right-to-left override characters, zero-width spaces, lookalike characters, emoji in identifier fields

### Numeric attacks
- Negative prices or quantities
- Zero as an amount where zero is semantically invalid (zero-dollar charges, zero-item orders)
- Floating point that doesn't round evenly: `$0.001`, `33.333...`
- Integer overflow values
- Scientific notation where plain integers are expected

### Auth and permission boundary inputs
- Valid session token belonging to a different user, used against another user's resource (IDOR test)
- Expired token
- Malformed token (truncated, wrong signature, wrong algorithm)
- Token with claims removed or altered
- Request with no auth where auth is required
- Request with auth for a lower-permission role on a higher-permission endpoint

For each input boundary in the codebase, report: **Covered** / **Partially covered** / **Not covered**, and the specific missing categories.

---

## Phase 5: State-Dependent & Concurrency Gaps

Real users encounter states that tests rarely simulate. For every stateful entity or multi-step flow in the codebase:

**Idempotency:** What happens if the same action is submitted twice? (double form submission, duplicate API call, retry after timeout) Is there a test for it?

**Out-of-order operations:** What happens if step 2 is performed before step 1? If a resource is accessed after deletion? If a user acts on a resource that was modified by another user since they loaded it?

**Permission revocation mid-session:** User loads a page with permission, permission is revoked, user submits — what happens?

**Partial failure state:** Multi-step operation (create + notify + log) — if step 2 fails, what state is the system in? Is there a test that simulates that failure?

For each stateful entity, report: states tested vs. states that exist, untested transitions, and the worst-case consequence of an untested path.

---

## Phase 6: Error Path Coverage Ratio

Most tests cover happy paths. Find the gap for each critical module.

For each module with significant test coverage, estimate:
- Total error-producing code paths (catch blocks, null returns, 4xx responses, validation failures, thrown exceptions)
- How many of those have a corresponding test that actually triggers them

Report the ratio and the worst uncovered error paths — specifically the ones where being wrong means data corruption, silent failure, or incorrect behavior visible to users.

---

## Output

Create `audit-reports/` in project root if needed. Save as `audit-reports/06_TEST_QUALITY_REPORT_[run-number]_[date]_[time in user's local time].md`, incrementing run number based on existing reports.

### Report Structure

1. **Executive Summary** — Overall quality rating (illusory / weak / adequate / strong / excellent), assertion quality score, adversarial coverage score, one-line verdict: "This suite [would / would not] catch a realistic injection attempt or a subtle off-by-one in billing logic."

2. **Assertion Quality Findings** — Tables per category (execution-only, tautological, implementation-coupled), assertion density table (10 worst offenders with file, ratio, and worst examples).

3. **Test Intent vs. Name Mismatches** — Full list: | File | Test Name | Claims to Test | Actually Tests | Risk |

4. **Boundary Coverage** — Per-module rating table: | Module | Numeric | String | Collection | Date/Time | Reference | Overall |. Worst gaps with specific missing cases.

5. **Adversarial Input Coverage** — Per input boundary: | Endpoint/Function | Malformed Structure | Injection/Encoding | Numeric Attacks | Auth Boundary | Overall |. Every "Not covered" entry on an auth or data-mutation endpoint is HIGH severity.

6. **State-Dependent & Concurrency Gaps** — Per entity: | Entity | States Tested | States Untested | Idempotency Tested? | Worst Untested Scenario |

7. **Error Path Coverage** — Per module: | Module | Error Paths | Tested | Untested | Consequence of Worst Uncovered |

8. **Priority Remediation List** — Ordered by risk: which gaps to close first, what specific tests to write, estimated effort per item.

---

## Chat Output Requirement

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish.

### 1. Status Line
One sentence: what you analyzed and how long it took. (No code was changed — no test status to report.)

### 2. Key Findings
The most important gaps discovered — specific and actionable, not vague. Lead with impact.

**Good:** "HIGH: Zero adversarial input tests exist on any auth or payment endpoint — no test covers a negative price, a stolen session token, or SQL injection in any user-supplied field."
**Bad:** "Found some test quality issues."

### 3. Changes Made
This is a read-only run — skip this section.

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
