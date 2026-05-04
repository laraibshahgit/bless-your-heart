You are running an overnight API design and consistency audit. Evaluate the API surface for design consistency, correctness, and HTTP convention adherence — fix safe issues and document the rest.

Work on branch `api-consistency-[date]`.

## Phase 1: API Surface Discovery

**Step 1: Inventory every endpoint.** For each, document:
- HTTP method, path (including URL params), controller/handler
- Middleware applied (auth, validation, rate limiting, etc.)
- Request body schema, query parameters accepted
- Response body schema per status code
- Whether it's documented (OpenAPI, README, inline) and whether it has tests

**Step 2: Identify endpoint groupings**
- Organized by resource, feature, or ad hoc?
- Versioned and unversioned endpoints mixed?
- Same-resource endpoints scattered across files?

## Phase 2: Naming & URL Consistency

**Guiding principle:** For each dimension below, either convention is acceptable — but mixing is not. Identify the dominant convention and flag all deviations.

**URL paths — check for consistency in:**
- Pluralization (`/users/:id` vs `/user/:id`)
- Casing (lowercase-hyphenated, camelCase, snake_case)
- Nesting depth and patterns for related resources
- Action endpoints (`POST /users/:id/activate` vs `PATCH /users/:id { active: true }`)
- ID parameter naming (`:id` vs `:userId` vs `:user_id`)

**Request/response fields — check for consistency in:**
- Field casing (camelCase vs snake_case)
- Naming patterns for equivalent concepts (`created_at` vs `createdAt` vs `dateCreated`; `id` vs `_id`)
- Boolean naming (`is_active` vs `active` vs `isActive`)
- Collection naming (`items` vs `data` vs `results`)

Document the dominant convention for each category — this becomes the target for alignment.

## Phase 3: HTTP Method & Status Code Correctness

**Method audit** — verify semantic correctness:
- **GET**: Read-only, no side effects. Flag any GET that modifies data or triggers actions.
- **POST**: Creates a resource or triggers an action. Flag POSTs that are reads or updates.
- **PUT**: Full replacement. Flag PUTs doing partial updates (should be PATCH).
- **PATCH**: Partial update. Flag PATCHes requiring all fields (should be PUT).
- **DELETE**: Removes a resource. Should be idempotent (second call returns 204 or 404).
- **Idempotency**: PUT and DELETE should be idempotent. Verify.

**Status code audit** — check every returned code:
- 200 vs 201: Resource-creating POSTs should return 201.
- 204 vs 200: Bodyless DELETE/PUT/PATCH responses should use 204.
- 400 vs 422: Pick one convention for validation errors; use it everywhere.
- 401 vs 403: 401 = not authenticated, 403 = not authorized. Flag misuse.
- 404 vs 403: For inaccessible resources — either convention is fine, but be consistent within a resource type.
- Flag: internal errors returned as 4xx, user errors returned as 5xx.
- Empty list results should be 200 with empty array, not 404.

## Phase 4: Error Response Consistency

1. **Catalog every error response shape** across all endpoints.
2. **Identify the dominant pattern** — this is the target format.
3. **Flag deviations** — for each, note: current format, target format, and whether changing it would break consumers.
4. **Evaluate error quality:**
- Are messages helpful and specific? (Not just "Validation failed")
- Are all field errors returned at once, or fail-on-first?
- Are machine-readable error codes included?
- Is sensitive info leaked? (SQL errors, stack traces, internal paths)
5. **Fix safe inconsistencies** — align error format where it won't break consumers. Improve unhelpful messages.

## Phase 5: Pagination Consistency

1. **Find all list endpoints.**
2. **Audit each:**
- Paginated at all? (Unbounded lists = performance/security risk)
- Strategy: offset/limit, page/perPage, cursor-based?
- Parameter names consistent? (`page` vs `p`, `limit` vs `per_page` vs `pageSize`)
- Default and maximum page size enforced?
- Response includes pagination metadata? (total count, current page, next/prev links) Format consistent?
3. **Fix safe issues** — add defaults/maximums where missing, standardize param and metadata formats.

## Phase 6: Request Validation Consistency

1. **Audit validation patterns:**
- Does every input-accepting endpoint have validation?
- What library/approach? Consistent or mixed?
- Where does validation happen? (Middleware, handler, service layer, mixed?)
2. **Audit validation behavior:**
- Consistent failure status code? Consistent error format (matching Phase 4)?
- All errors returned at once or one at a time?
- Same fields validated the same way across endpoints?
3. **Fix safe issues** — add missing validation using existing patterns, standardize error format.

## Phase 7: Miscellaneous API Quality

- **Rate limiting**: Coverage, consistent headers (`X-RateLimit-*`), missing on public/auth/expensive endpoints?
- **Versioning**: Strategy, consistency, deprecated endpoints marked?
- **Content types**: JSON endpoints verify `Content-Type` header? Responses include `Content-Type: application/json`?
- **Idempotency**: Write endpoints (especially payments/orders) support idempotency keys? Mechanism consistent?
- **Discoverability** (informational only): Links to related resources? API index endpoint?

## Output

Create `audit-reports/` in project root if needed. Save as `audit-reports/09_API_DESIGN_REPORT_[run-number]_[date]_[time in user's local time].md`, incrementing run number based on existing reports.

### Report Structure

1. **Executive Summary** — Consistency score (poor/fair/good/excellent), total endpoints, endpoints with issues, issues fixed, issues documented for review.
2. **API Surface Map** — Endpoint inventory table: Method | Path | Auth | Validated? | Paginated? | Tested? | Documented? — Plus grouping assessment.
3. **Naming Conventions** — Dominant conventions table, URL and field inconsistencies with current vs expected, fixes applied.
4. **HTTP Correctness** — Method misuse and status code issues with recommendations, fixes applied.
5. **Error Response Consistency** — Dominant format, deviations table, error quality assessment.
6. **Pagination** — List endpoints table with strategy/params/metadata/max size, inconsistencies and fixes.
7. **Validation** — Coverage table, unprotected endpoints sorted by risk, fixes applied.
8. **Miscellaneous** — Rate limiting, versioning, content types, idempotency.
9. **API Style Guide** — Generate `docs/API_DESIGN_GUIDE.md` codifying dominant patterns for: URL naming, field naming, pagination, error format, status codes, validation. This is the reference for new endpoints.
10. **Recommendations** — Priority-ordered fixes, breaking changes needing versioning/migration, tooling recommendations.

## Rules

- Branch: `api-consistency-[date]`
- Run tests after every change. Commit with descriptive messages per module.
- **DO NOT** change endpoint URLs or HTTP methods — these are breaking changes. Document as recommendations.
- **DO NOT** change response structure on endpoints with known external consumers — document as recommendations.
- **Safe to fix**: error message wording, missing validation, pagination defaults, rate limit headers, internal/undocumented endpoint standardization.
- Confirm deviations are unintentional before flagging — some may be deliberate exceptions.
- If no dominant convention exists (true 50/50 split), document both and recommend the team decide.
- Generate the API Style Guide regardless of how much you fix.
- Be thorough. Check every endpoint.

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
