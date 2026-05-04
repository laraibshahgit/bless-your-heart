# Cross-Cutting Concerns Consistency Audit

Find patterns that should be identical across the codebase but have drifted. Other audits check within a single module; this one checks each pattern **across every instance, file, and layer** — drift between implementations is the bug.

Branch: `cross-cutting-consistency-[date]`. Report: `audit-reports/13_CROSS_CUTTING_CONSISTENCY_REPORT_[run-number]_[date]_[time in user's local time].md`.

---

## Global Rules

- Run tests after every change. Commits: `fix: standardize [pattern] in [module]`
- Per concern: **(1)** find every instance, **(2)** identify dominant/best pattern, **(3)** catalog every deviation, **(4)** fix only mechanical low-risk deviations, **(5)** document everything else.
- **Only fix** when: canonical pattern is unambiguous, change is mechanical (not behavioral), code has test coverage, no API contract or user-facing behavior changes.
- **Do NOT fix**: public endpoint response shapes, business logic, untested code, or 50/50 splits (document both, recommend team decision).
- **Be exhaustive.** "37 of 40 endpoints use offset/limit, 3 use cursor-based" is valuable. "Most use offset/limit" is not. Count everything.
- For multi-tenancy and soft-delete: missing filters = potential data leak bugs. Treat as security-severity.

---

## Phase 1: Pagination Consistency

Find every list/collection endpoint, query, UI list, and GraphQL connection. For each, catalog:

- **Strategy**: offset/limit, page/pageSize, cursor-based, keyset, or unbounded
- **Param names**: `page`/`limit`/`per_page`/`pageSize`/`cursor`/`after`/`next_token`/etc.
- **Defaults & max page size** (flag missing maximums)
- **Response metadata shape**: `{ total, page, pageSize }` vs `{ totalCount, hasMore, nextCursor }` vs wrapped vs none
- **Where logic lives**: handler, service, shared utility, ORM scope, inline
- **Edge cases**: page 0 vs 1, negative, beyond total, pageSize=0, pageSize=999999

**Safe fixes**: Add missing max page size limits. Align internal param names. Standardize metadata on internal endpoints. Add missing defaults.

**Report table**: Location | Type | Strategy | Params | Defaults | Max Size | Metadata Shape | Canonical? | Fixed?

---

## Phase 2: Sorting & Filtering Consistency

Find every sortable/filterable endpoint or dynamic query. Catalog:

- **Sort format**: `?sort=name` vs `?sort_by=name&order=asc` vs `?sort=name:asc` vs others
- **Multi-field sort** support and syntax
- **Default sort** (explicit or implicit insertion order = fragile)
- **Filter format**: `?status=active` vs `?filter[status]=active` vs others
- **Filter operators**: equality only or range/contains/in? Consistent syntax?
- **Search**: `?q=` vs `?search=` vs `?query=` — type (full-text, LIKE, regex) and which fields
- **Validation**: sort fields checked against allowlist? (Flag missing allowlists)
- **SQL injection risk**: dynamic fields parameterized or concatenated? (**CRITICAL** if concatenated)

**Safe fixes**: Standardize internal param names. Add missing sort field allowlists. Add default sorts. Fix SQL injection risks.

**Report table**: Location | Sort Format | Filter Format | Search Format | Default Sort | Validated? | Canonical?

---

## Phase 3: Soft Delete & Data Lifecycle Consistency

Find every deletion operation (DELETE queries, `.destroy()`/`.delete()`, status→deleted/archived, `deleted_at`/`is_deleted` updates, hard deletes). Catalog:

- **Strategy**: hard delete, soft delete (timestamp vs boolean vs status-based), or mixed
- **Field used**: `deleted_at` vs `deletedAt` vs `is_deleted` vs `status` vs `active` (inverted)
- **Query filtering**: do ALL read queries on soft-delete tables exclude deleted records? (Missing filters = silent data integrity bugs)
- **Unique constraints**: can soft-deleted records block new records with same unique field?
- **Cascade**: parent soft-deleted → children soft-deleted? hard-deleted? orphaned?
- **Restoration path**, permanent purge process
- **API behavior**: DELETE returns what? GET on deleted record returns 404, 410, or flagged record?

**Most dangerous drift**: some queries filtering soft-deleted records, others not.

**Safe fixes**: Add missing `WHERE deleted_at IS NULL`. Standardize field names via migration files (don't run).

**Report table**: Entity | Strategy | Field | All Queries Filter? | Cascade | Unique Constraint Issue? | Restoration? | Purge?

---

## Phase 4: Audit Logging & Activity Tracking Consistency

Find every audit mechanism (audit tables, activity feeds, event tracking, `created_by`/`updated_by` fields, timestamps, change history, webhooks). For every create/update/delete on every significant entity, catalog:

- **Is it logged?** Via what mechanism?
- **What's captured?** Actor, action, target, timestamp, before/after values, IP/session context
- **Where logged?** Inline, middleware, ORM hook, DB trigger, event subscriber
- **Storage & retention**

**Flag operations with no audit trail**, especially: user data changes, permission/role changes, financial ops, admin actions, auth events, data exports, config changes, deletions.

**Safe fixes**: Add missing `updated_at` auto-update. Populate `created_by`/`updated_by` where pattern exists but was missed. Add audit entries for unlogged critical ops using existing mechanism. Do NOT introduce new audit mechanisms.

**Report table**: Entity | Create Logged? | Update Logged? (diff?) | Delete Logged? | Actor Captured? | Mechanism | Gaps

---

## Phase 5: Timezone & Date/Time Handling Consistency

Find every date/time operation (creation, parsing, formatting, storage, comparison, arithmetic, timezone conversion, display). Catalog:

- **Storage TZ**: UTC, server-local, user-local, mixed? Column types: `TIMESTAMP` vs `TIMESTAMPTZ` vs `DATETIME` vs `VARCHAR`?
- **Library**: `Date`, `moment`, `date-fns`, `dayjs`, `luxon` — multiple in use?
- **Server-side creation**: `new Date()` (server TZ), `Date.now()`, `moment.utc()`, DB `NOW()`?
- **User display**: converted to user TZ? Where does user TZ come from?
- **API format**: ISO 8601? Unix timestamps? Locale strings? Mixed?
- **Date-only values**: stored as datetime (midnight of which TZ?), date type, or string?
- **DST handling**: adds 24 hours (wrong) or 1 calendar day (right)?
- **Date boundaries**: "today's records" — whose today?

**Dangerous drift**: some DB columns UTC, others server-local (invisible until multi-zone or DST). Mixed API date formats.

**Safe fixes**: Replace `new Date()` with UTC equivalents per convention. Standardize internal API dates to ISO 8601. Add TZ-aware column types in migration files. Replace deprecated date library usage.

**Report table**: Location | Operation | Library | Timezone | Format | Storage Type | Canonical? | Risk

---

## Phase 6: Currency & Numeric Precision Consistency

**Skip if app doesn't handle money/prices/precision-sensitive numbers. State why.**

Find every monetary/precision operation. Catalog:

- **Storage**: integer cents, `DECIMAL(x,y)`, `FLOAT`, string?
- **Code representation**: float, BigDecimal, integer cents, money library?
- **Arithmetic**: float math (precision loss), integer math (truncation), library-based?
- **Rounding**: method and consistency
- **Currency**: hardcoded, per-record, configurable?
- **Display & API format**: consistent?

**Dangerous drift**: mixing float and integer cents (off-by-one-cent bugs at scale).

**Report table**: Location | Value Type | Storage | Code Rep | Arithmetic | Rounding | Display | Canonical? | Precision Risk?

---

## Phase 7: Multi-Tenancy & Data Isolation Consistency

**Skip if single-tenant with no org/workspace/team concept. State why.**

Identify tenancy model (row-level `tenant_id`, schema-per-tenant, etc.). For every query, endpoint, and background job, audit:

- **Tenant scoping applied?** Via middleware (automatic) or manual per-query?
- **Bypassable?** Can developers write unscoped queries?
- **Background jobs**: receive and enforce tenant context?
- **Caches, file storage, search indexes**: tenant-scoped?
- **Unique constraints**: scoped to tenant?

**Missing tenant scoping on user-data table = CRITICAL cross-tenant data exposure.**

**Report table**: Entity | Has tenant_id? | Scoping Method | All Queries Scoped? | Cache Scoped? | Files Scoped? | Gaps

---

## Phase 8: Error Response & Status Code Consistency

For each scenario below, find every occurrence across all endpoints and compare responses:

**Scenarios**: Validation failure (400 vs 422, shape), Not found (404), Not authorized (401 vs 403), Forbidden, Conflict/duplicate (409 vs 400), Rate limited (429 + headers), Internal error (500, detail leakage), Method not allowed (405), Request too large (413)

For each: catalog dominant response, deviations (with location), and whether deviation is intentional.

**Safe fixes**: Align error responses on internal endpoints to dominant pattern.

**Report table per scenario**: Endpoint | Status Code | Response Shape | Message | Canonical? | Fixed?

---

## Phase 9: Synthesis & Drift Map

### Drift Heat Map
Rate each concern: **Consistent** (90%+), **Minor drift** (70-90%), **Significant drift** (50-70%), **No standard** (<50%).

### Root Cause Analysis
Per area with significant drift: missing shared utility? Convention changed over time? Different developer conventions? Pattern never decided?

### Prevention Recommendations
Per concern: shared utility to build, linter rule to enforce, code review checklist item, documentation to write.

---

## Chat Output Requirement

Print a summary in conversation (don't make user open the report):

1. **Status Line** — What you did, whether tests pass.
2. **Key Findings** — Specific, actionable bullets with severity. Lead with impact.
- ✅ "CRITICAL: 4 of 22 queries on `orders` don't filter `deleted_at` — soft-deleted orders appear in invoices."
- ❌ "Found some inconsistencies with soft deletes."
3. **Changes Made** (if any) — Bullet list. Skip for read-only runs.
4. **Drift Heat Map** — Summary table from report.
5. **Recommendations** — Table (only if warranted):

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| *n* | *≤10 words* | *What improves* | *Low/Med/High/Critical* | *Yes/Probably/Only if time* | *1–3 sentences* |

Order by risk descending. Be honest in "Worth Doing?" — not everything is worth the engineering time.

6. **Report Location** — Full path to detailed report.
