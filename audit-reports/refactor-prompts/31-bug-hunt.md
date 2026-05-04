# Bug Hunt

Overnight bug detection pass. Find bugs — logic errors, off-by-ones, unhandled edge cases, silent failures, incorrect assumptions. Be thorough and skeptical. Read every file.

**Default posture: SURFACE bugs, not fix them.** Only fix if ALL criteria are met: (1) ≥90% confident it's a bug, (2) mechanical/obvious fix, (3) tests exist to verify, (4) no business logic or user-facing behavior change. Everything else: document only.

Branch: `bug-hunt-[date]` · Commit format: `fix: [brief description] in [file/module]`

## Global Rules

- Run tests after every fix. Fail → revert immediately → reclassify as document-only.
- DO NOT change business logic, refactor, or install new tools.
- A bug fix changes the minimum lines to correct the defect — nothing else.
- False positives are cheap. Missed bugs are expensive. When in doubt, report it.
- When you find a bug, search for the same pattern elsewhere. Bugs cluster.
- For every finding, include: what's wrong, why, likely correct behavior, trigger/reproduction, confidence (High/Medium/Low), and a suggested test.

---

## Phase 1: Static Analysis — Pattern-Based Detection

Scan the entire codebase for each category explicitly.

### 1. Comparison & Equality
- `=` vs `==`/`===` in conditionals
- `==` vs `===` (type coercion: `0 == ""`, `null == undefined`, `"0" == false`)
- Inverted comparisons (`>` vs `<`, `>=` vs `>`)
- Unhandled `null`/`undefined`/`NaN` in comparisons (`NaN !== NaN`; `null >= 0` is true but `null > 0` is false)
- Float equality without epsilon
- String vs numeric comparison (`"10" < "9"` is true)
- Reference equality where deep equality was intended

### 2. Off-by-One & Boundaries
- `array[array.length]`, `array[-1]` (both undefined in JS)
- Loop bounds: `<` vs `<=`, start index 0 vs 1, `.length` vs `.length - 1`
- Substring/slice inclusive vs exclusive end
- Pagination: page 0 vs 1, last page calc (`ceil` vs `floor`), empty last page
- Date/time: midnight, month boundaries (31→28), timezone crossing, DST
- Chained range checks (`min <= value <= max` doesn't work in most languages)
- Fence-post errors in counting/partitioning

### 3. Null/Undefined/Empty Handling
- Property access on potentially null/undefined without checks
- Missing `?.` or wrong fallback (`?? "Unknown"` when null means something different)
- Empty string as falsy when valid (`if (!input)` rejects `""` and `null`)
- Empty array/object as truthy (`if (results)` is always true for `[]`)
- Default params masking caller bugs (`f(x = 0)` — is 0 valid or hiding a missing arg?)
- Destructuring without nested defaults
- Missing `.length === 0` before accessing first/last element

### 4. Async & Promises
- Missing `await` (returns Promise instead of value — often silent)
- `await` inside `forEach` (doesn't await — use `for...of` or `Promise.all(arr.map(...))`)
- Missing `.catch()` / try-catch on promises
- Race conditions assuming sequential async execution
- `async` functions that never await (unnecessary wrapper or forgotten await)
- `new Promise(async (resolve) => ...)` anti-pattern
- Swallowed errors in middleware catch blocks
- `Promise.all` where `Promise.allSettled` was needed
- Async in constructors or synchronous-looking paths

### 5. Logic Errors
- De Morgan violations, double negatives inverting intent
- Short-circuit side effects: `a && doSomething()` where `doSomething` should always run
- Switch missing `break` (fall-through), missing `default`, incomplete enum coverage
- Early returns skipping cleanup (resource release, state reset)
- Identical then/else branches (copy-paste)
- Always-true/false conditions (dead branches)
- Variable shadowing (inner scope hiding outer value)
- Operator precedence: `a & b == c` → `a & (b == c)`
- Chained ternary associativity
- `x || default` failing on falsy valid values (`0`, `""`, `false`)

### 6. Data & Type Bugs
- Mutating shared objects/arrays passed by reference
- Sort without comparator (JS default is lexicographic: `[10,9,80].sort()` → `[10,80,9]`)
- Integer overflow/underflow
- `parseInt` pitfalls: `parseInt("08")` octal, `parseInt("123abc")` → 123, `Number("")` → 0
- Regex: unescaped specials, missing anchors, greedy vs lazy, catastrophic backtracking
- `JSON.parse`/`stringify`: `undefined` dropped, `Date` → string, `BigInt` throws, circular refs
- Spread shallow copy (nested objects share references)
- Map/Set with object keys (reference equality)

### 7. API & Integration
- HTTP status codes unchecked (assuming success)
- Response body structure assumed without validation
- No timeout on HTTP requests
- Retry on non-idempotent operations (POST retry = duplicate)
- Non-idempotent webhook handlers (redelivery = duplicate processing)
- URL construction: missing `encodeURIComponent`, double slashes, query param bugs
- Content-Type mismatches
- Pagination: not fetching all pages, off-by-one, ignoring `hasMore`/`nextCursor`

### 8. Security-Adjacent Logic
- Auth check without permission-level check
- IDOR: user-supplied ID without ownership verification
- Rate limit bypass via alternate routes
- Timing leaks (different response times for user-exists vs not)
- Mass assignment: request body spread into DB update without field filtering
- Permission checked at entry but not on downstream operations

---

## Phase 2: Semantic Analysis — Intent vs Implementation

### Function Contract Analysis
For every function on critical paths (auth, payments, data mutation, core logic):
- Infer intended contract from name, params, docs, callers
- Compare to actual behavior for ALL inputs, including edge cases
- Check if callers can violate the function's assumptions

### State Machine Verification
For every entity with status/state (orders, payments, subscriptions, etc.):
- Map all states and transitions (code locations)
- Check for: unguarded impossible transitions, states with no exit, skipped intermediate states, concurrent transition conflicts

### Business Rule Consistency
- Same rules applied consistently everywhere? (Discount in checkout AND summary AND invoice)
- Frontend-only validation without backend enforcement?
- Hardcoded values duplicated with different values across files?

### Error Path Analysis
For every error handler/catch/fallback:
- Does it accomplish the intended recovery?
- Does the error propagate correctly or get swallowed?
- Is the user informed? Or does it fail silently?
- Is the system left in a consistent state? (Partial writes, uncommitted transactions, half-updated UI)

---

## Phase 3: Data Flow Analysis

### Trace Critical Flows End-to-End (top 5-10 operations)
- Data correctness through every transformation
- Types preserved/converted correctly at each boundary
- Precision preserved (float money, timestamp truncation, timezone loss)
- Required fields guaranteed present at every stage

### Cross-Feature Interference
- Two features writing to the same field with different expectations
- Stale cached values modified by another feature
- Feature A's error handler resetting state Feature B depends on
- Event handler ordering across features

### Migration & Backwards Compatibility
- DB fields that changed meaning over time (old records have different semantics)
- API consumers sending old-format requests
- Serialized objects (DB, cache, queue) in old format
- Code reading data without accounting for schema changes without data migration

---

## Phase 4: Test-Informed Detection

### Existing Failures & Skips
- Skipped tests with `// BUG`, `// FIXME`, `// broken`, `// flaky` = known unfixed bugs
- Tests asserting surprising behavior (`// this is weird but correct`) — verify it IS correct

### Coverage Gaps
- Code with NO test coverage = most likely bug locations
- Functions tested only happy-path (edge cases are where bugs live)
- Untested error paths

### Test Correctness
- Tests asserting the wrong thing (passes but doesn't verify correct behavior)
- Tautological tests (`expect(mock).toHaveBeenCalled()` on unconditionally-called mock)
- Tests that test the mock more than the code

---

## Phase 5: Fix High-Confidence Bugs

For each finding meeting ALL fix criteria:
1. Write minimal fix → 2. Run full test suite → 3. Pass: commit → 4. Fail: revert, reclassify as document-only

**Fixable:** Missing null checks, `==`→`===`, missing `await`, pagination off-by-one, swallowed errors, missing `break`, numeric sort without comparator.

**Document-only:** Business logic that might be intentional, race conditions needing architecture changes, state machine gaps needing product decisions, performance issues, ambiguous "correct" behavior.

---

## Output

Save to `audit-reports/31_BUG_HUNT_REPORT_[run-number]_[date]_[time in user's local time].md` (create dir if needed, increment run number).

### Report Sections
1. **Executive Summary** — Total bugs, confidence breakdown, fixed vs documented, critical count, highest-density areas.
2. **Critical Bugs** — Data loss, security, core UX. Per bug: Title, Location (file/line/function), Confidence + reasoning, Description, Impact, Trigger condition, Suggested fix, Status (Fixed w/ commit or Document Only w/ reason).
3. **High-Priority** — Incorrect behavior, data inconsistency, degraded UX. Same format.
4. **Medium-Priority** — Edge cases, minor issues. Same format.
5. **Low-Priority / Potential** — Suspicious but uncertain. Emphasize confidence and what would confirm/disprove.
6. **Bugs Fixed Table** — | File | Bug | Fix | Confidence | Tests Pass? | Commit |
7. **State Machine Analysis** — Per entity: state diagram, valid transitions w/ code locations, missing guards, stuck/impossible states.
8. **Data Flow Findings** — Transformation issues, cross-feature interference, schema/migration concerns.
9. **Test Suite Observations** — Known-bug tests, suspicious assertions, coverage gaps, test correctness issues.
10. **Bug Density Map** — Files/modules with most findings.
11. **Recommendations** — Recurring patterns, missing validation, tests to write.

---

## Chat Output (Primary Deliverable)

The user should NOT need to open the report. Print everything that matters in the conversation.

### 1. Status Line
One sentence: what you did, duration, whether tests pass.

### 2. Bugs Fixed
Per fix: file/line, what was wrong (1 sentence), what you changed (1 sentence), confidence + reasoning (e.g. "99% — mechanical, tests cover this"), commit. Flag any ambiguity with ⚠️.

### 3. Bugs Found — Needs Human Review
ALL bugs not fixed, by severity (Critical → Low). Per bug:
- **Severity + confidence** (e.g. "HIGH (Medium confidence)")
- **File/line**
- **What's wrong** (specific: code does X, should do Y)
- **Trigger condition** (specific: "when user submits empty array for line items")
- **Impact** (data corruption, wrong price, silent failure, crash, etc.)
- **Suggested fix** (plain language or short snippet)
- **Why not fixed** ("not confident it's unintentional" / "no test coverage" / "requires business decision" / "too many call sites")

List ALL findings. Completeness beats brevity.

### 4. Patterns & Hot Spots
- Bug clusters (e.g. "`payments/` had 6 findings")
- Recurring patterns (e.g. "missing null checks ×8 — consider lint rule")
- Risky untested areas

### 5. Report Location
Full path to detailed report.
