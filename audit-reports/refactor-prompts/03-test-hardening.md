# Test Hardening

## Prompt

```
You are running an overnight test hardening pass. You have several hours. Your job is to make the existing test suite more reliable and more complete in two specific areas: flaky test diagnosis/repair and API contract testing.

Work on a branch called `test-hardening-[date]`.

## Your Mission

### Phase 1: Flaky Test Diagnosis & Repair

Flaky tests are tests that sometimes pass and sometimes fail without code changes. They erode trust in the test suite and train developers to ignore failures. Your job is to find and fix them.

**Detection:**
- Run the full test suite 3-5 times in sequence
- Note any tests that produce different results across runs
- Look for tests that have been skipped/disabled with comments like "flaky", "intermittent", "timing issue", "TODO: fix"
- Search git history for tests that have been re-run in CI (if CI config is visible)
- Look for common flaky patterns even in currently-passing tests:
- Tests that depend on wall clock time or `Date.now()`
- Tests that depend on execution order (shared mutable state between tests)
- Tests that use `setTimeout` or arbitrary delays instead of proper async waiting
- Tests that depend on database auto-increment IDs or insertion order
- Tests that depend on file system state, network availability, or external services without mocking
- Tests that use random/non-deterministic data without seeding
- Tests with race conditions in async setup/teardown
- Tests that assert on floating point equality without tolerance
- Tests that depend on object key ordering or array sort stability

**For each flaky or potentially flaky test found:**
1. Diagnose the root cause — explain WHY it's flaky
2. Fix it:
- Replace time-dependent assertions with deterministic alternatives (mock clocks, inject time)
- Isolate shared state — each test gets its own setup
- Replace arbitrary delays with proper async waiting (waitFor, polling, event-based)
- Mock external dependencies that introduce non-determinism
- Use deterministic test data with explicit seeds if randomness is needed
- Fix setup/teardown ordering issues
3. Run the test 5 times to verify the fix holds
4. Commit: `fix: resolve flaky test in [module] — [root cause]`

**For currently-disabled flaky tests:**
- Attempt to fix and re-enable them
- If you can fix them, commit with: `fix: re-enable previously flaky test [name]`
- If you can't fix them, document why in the report

### Phase 2: API Contract Testing

Verify that the actual API behavior matches what consumers expect. This catches drift between documentation, types, and reality.

**Step 1: Map all API endpoints**
- Crawl the routing layer to find every endpoint
- For each endpoint, document:
- Method (GET/POST/PUT/DELETE/PATCH)
- Path (including URL parameters)
- Expected request body schema
- Expected response body schema for each status code
- Required headers / authentication
- Query parameters

**Step 2: Compare against documentation**
- If OpenAPI/Swagger docs exist, compare the actual code against the spec
- If TypeScript types/interfaces exist for request/response, compare against actual behavior
- Flag any discrepancies:
- Endpoints that exist in code but not in docs (undocumented)
- Endpoints in docs but not in code (stale docs)
- Response fields that exist in code but not in types
- Required fields in types that are actually optional in practice
- Status codes returned that aren't documented

**Step 3: Write contract tests**
For each endpoint, write tests that verify:
- Correct response status code for valid requests
- Correct response body structure (all expected fields present, correct types)
- Correct error response format for invalid requests (400, 401, 403, 404, 422)
- Required fields are actually required (omitting them returns appropriate error)
- Optional fields work when omitted
- Pagination behavior if applicable (correct page size, next/prev links, total count)
- Content-Type headers are correct
- CORS headers are present if expected

**Contract test quality standards:**
- Tests should validate STRUCTURE and TYPES, not specific values (unless values are constants)
- Use schema validation where possible (JSON Schema, Zod, Joi — match what the project uses)
- Test against a running instance of the app with a test database — not mocked responses
- Each endpoint gets its own test file or describe block
- Include authentication setup in test fixtures

**Step 4: Identify undocumented behavior**
As you write contract tests, you'll discover behavior that isn't documented anywhere:
- Default values for optional parameters
- Implicit filtering or sorting
- Hidden query parameters that work but aren't documented
- Rate limiting behavior
- Error message formats and codes

Document all of this. It's valuable even if you don't write tests for all of it.

## Output Requirements

Create the `audit-reports/` directory in the project root if it doesn't already exist. Save the report as `audit-reports/03_TEST_HARDENING_REPORT_[run-number]_[date]_[time in user's local time].md` (e.g., `03_TEST_HARDENING_REPORT_01_2026-02-16_2129.md`). Increment the run number based on any existing reports with the same name prefix in that folder.

### Report Structure

1. **Summary**
- Flaky tests found and fixed: X
- Flaky tests found but couldn't fix: X
- Previously disabled tests re-enabled: X
- API endpoints found: X
- Contract tests written: X
- Documentation discrepancies found: X

2. **Flaky Tests Fixed**
- Table: | Test Name | File | Root Cause | Fix Applied |

3. **Flaky Tests Unresolved**
- Table: | Test Name | File | Root Cause | Why It Couldn't Be Fixed |

4. **API Endpoint Map**
- Complete table of all endpoints with method, path, auth requirement, and test status

5. **Documentation Discrepancies**
- Every mismatch between docs/types and actual behavior
- Include what the docs say vs. what the code does

6. **Undocumented Behavior**
- Behavior you discovered that isn't documented anywhere

7. **Recommendations**
- Patterns that are causing flakiness that the team should stop using
- Suggestions for preventing future documentation drift

## Rules
- Branch: `test-hardening-[date]`
- When fixing flaky tests, DO NOT change the test's intent — only fix the non-determinism
- If a flaky test reveals that the underlying code has a race condition, document it as a bug — don't hide it by making the test more tolerant
- For contract tests, test against the actual running app, not mocks
- Don't generate contract tests for endpoints you can't actually call (missing auth setup, etc.) — document them as gaps instead
- Match existing test framework and conventions
- You have all night. Be thorough.
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
