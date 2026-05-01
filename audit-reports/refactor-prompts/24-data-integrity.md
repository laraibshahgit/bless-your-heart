You are running an overnight data integrity and validation audit. Your job is to find gaps in how data is validated, constrained, and kept consistent — the class of bugs that ships silently and causes serious pain at scale.

Work on branch: `data-integrity-[date]`

## Phase 1: Input Validation Audit

**Step 1: Map all input boundaries**
Identify every place the system accepts external data: API request bodies, query/URL params, file uploads, webhook payloads, message queue events, CLI arguments, environment variables, CSV/Excel/JSON imports.

**Step 2: Audit validation at each boundary**
For each input boundary, check:
- Is there ANY validation? Are validation rules comprehensive?
- Required fields enforced, string length limits, numeric ranges (no negative quantities, no $0 prices)
- Format validation for emails, URLs, phones, dates (not just "is it a string?")
- Enum fields restricted to valid values, array/collection size limits, nested object depth limits
- Is validation at the right layer? (handler level, not buried in the data layer)
- Frontend vs. backend consistency — flag cases where frontend validates but backend doesn't
- Are validation errors returned in a consistent, helpful format?

**Step 3: Fix what's safe**
- Add missing validation using the project's existing patterns/libraries
- Add string length and array size limits to unbounded fields
- Align backend validation to match frontend rules where backend is less strict
- Run tests after each batch. Commit: `fix: add input validation to [endpoint/module]`

## Phase 2: Database Constraint Audit

**Step 1: Map the schema**
Read all migrations and/or ORM model definitions. For each table, document: columns, types, nullable status, defaults, indexes, foreign keys, unique constraints, check constraints.

**Step 2: Find missing constraints**
Compare schema against application code usage:

- **Missing NOT NULL**: Columns always set during creation, read without null checks, or used in WHERE/JOIN without null handling
- **Missing foreign keys**: Columns referencing other tables (`*_id`) without FK constraints — orphaned records possible
- **Missing unique constraints**: Emails, slugs, external IDs (Stripe, OAuth), compound uniqueness rules
- **Missing check constraints**: Non-negative prices, valid status values, start < end dates, percentages 0–100
- **Missing cascade rules**: FKs without ON DELETE behavior — is the current behavior intentional?
- **Overly permissive types**: VARCHAR(255) for short fields, TEXT without limits, INT for booleans

**Step 3: Write migration files (DO NOT run them)**
- Create migration files for recommended constraints
- Each migration must include a comment explaining: what and why, whether existing data might violate it (with suggested cleanup query if so), and downtime impact
- Commit: `chore: add migration for [constraint type] on [table]`

## Phase 3: Orphaned Data & Referential Integrity

**Step 1: Identify deletion patterns**
Find every hard delete, soft delete, or archive in the code. For each, trace: are child records handled? References cleaned up? Associated files/assets removed? Caches invalidated?

**Step 2: Find orphan risks**
- Deletions without cascade leaving dangling references
- Soft-deleted parents with non-deleted children (queries on children don't filter by parent's deleted status)
- Missing cleanup (deleted user's files, sessions, API keys persist forever)
- Multi-step deletions that can fail halfway, leaving inconsistent state

**Step 3: Write diagnostic queries (don't run on production)**
Write queries to detect: records pointing to non-existent parents, soft-deleted parents with active children, and stale automated records (expired tokens, abandoned carts, temp records). Include in the report for team review.

## Phase 4: Schema vs. Application Drift

**Step 1: Compare ORM models to actual schema**
Flag: fields in model but not schema (runtime crash), fields in schema but not model (unused or raw-queried), type/default/nullable mismatches.

**Step 2: Check raw query risks**
Find all raw SQL in the codebase. For each: does it reference current columns? Correct types? Parameterized? Fragile references like `SELECT *`?

**Step 3: Validate enum/status consistency**
For every status/type/role/category field: are the same values used everywhere (no "active" vs "Active")? Are all values handled in switch/match statements? Do code values match DB enum definitions?

## Phase 5: Business Invariant Documentation

Identify multi-table or conditional invariants that can't be expressed as DB constraints. For each:
- Document it clearly
- Write a diagnostic query to detect violations
- Note enforcement status (enforced, partial, none)
- Recommend enforcement method (app logic, DB trigger, scheduled job)

## Output

Save to `audit-reports/24_DATA_INTEGRITY_REPORT_[run-number]_[date]_[time in user's local time].md`, incrementing run number based on existing reports.

### Report Structure

1. **Executive Summary** — Overall health (poor/fair/good/excellent), critical gaps, totals for validation/constraint/orphan issues
2. **Input Validation** — Unvalidated endpoints (with severity), frontend vs. backend inconsistencies, fixes implemented, remaining gaps
3. **Database Constraints** — Missing constraints table (Table | Column | Missing Constraint | Risk | Migration File), existing data violations, pending migrations
4. **Orphaned Data** — Deletion flows with orphan risks (Deletion Point | Related Data | Current Behavior | Risk), diagnostic queries, recommended cascade/cleanup rules
5. **Schema Drift** — ORM vs. schema mismatches, raw query risks, enum/status inconsistencies
6. **Business Invariants** — Table: Invariant | Currently Enforced? | Diagnostic Query | Recommendation
7. **Recommendations** — Priority-ordered fixes, which migrations to review first, suggested ongoing practices

## Rules
- Run tests after every code change
- DO NOT run migrations or cleanup queries — only create files for review
- DO NOT change business logic — only add validation and document gaps
- Label all diagnostic queries as "run manually after review"
- For constraints: note impact on existing data and downtime requirements
- When uncertain whether a constraint should exist, document it as a question for the team
- Prefer documenting over guessing. Wrong constraints are worse than missing ones.
- Be thorough. Check every table, every endpoint, every deletion path.

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
