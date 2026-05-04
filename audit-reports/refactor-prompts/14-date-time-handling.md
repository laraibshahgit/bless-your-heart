You are running an overnight date/time handling audit. Your job: find every date/time operation in the codebase and verify it is correct — correct timezone, correct storage type, correct arithmetic, correct display. Date/time bugs are among the hardest to detect because they work fine in one timezone, one season, or one locale, and break silently in another.

Work on branch datetime-audit-[date].

The foundation. Before analyzing correctness, catalog what exists.

Step 1: Identify every date/time library in use

Search the entire codebase (source, config, lock files) for:

For each library found, document:

Flag: Multiple date libraries in the same codebase. This almost always means inconsistent handling.

Step 2: Find every date creation point

Search for every place a date/time value is created or obtained:
# JavaScript/TypeScript patterns
new Date()                    # Server-local time — flag as risky
new Date(string)              # Parsing behavior varies by engine — flag
Date.now()                    # UTC milliseconds — usually safe
Date.parse(string)            # Same parsing issues as new Date(string)
moment()                      # Server-local — flag
moment.utc()                  # Explicit UTC — good
dayjs()                       # Server-local — flag
dayjs.utc()                   # Explicit UTC — good
new Date(year, month, ...)    # Month is 0-indexed — check for off-by-one

# Python patterns
datetime.now()                # Server-local, naive — flag as risky
datetime.utcnow()             # UTC but still naive (no tzinfo) — flag as risky
datetime.now(tz=timezone.utc) # UTC, aware — good
date.today()                  # Server-local date — flag

# Database patterns
NOW()                         # Depends on server timezone config
CURRENT_TIMESTAMP             # Depends on server timezone config
GETDATE()                     # SQL Server, server-local — flag
GETUTCDATE()                  # SQL Server, UTC — good
SYSUTCDATETIME()              # SQL Server, UTC with precision — good
For each creation point, record:

Step 3: Find every date parsing point

Search for every place a date string is parsed into a date object:
# JavaScript
new Date("2024-01-15")          # Treated as UTC at midnight
new Date("2024-01-15T00:00:00") # Treated as LOCAL time (inconsistent with above)
new Date("01/15/2024")          # Locale-dependent, unreliable
Date.parse(...)                 # Same issues
moment("2024-01-15")            # moment's parsing rules
dayjs("2024-01-15")             # dayjs's parsing rules
JSON.parse on date fields       # Returns string, not Date — silent bug if not handled

# Python
datetime.strptime(s, fmt)       # Naive datetime — no timezone
dateutil.parser.parse(s)        # Guesses format — risky on ambiguous inputs
datetime.fromisoformat(s)       # Python 3.7+ — timezone-aware if string has offset
For each: what format is expected? Is it validated? What happens with unexpected formats? Is timezone info preserved or discarded?

Step 4: Summarize creation inventory

Produce a table:

| Location | Code | UTC/Local/Implicit | Purpose | Risk | |---|---|---|---|---| | src/orders/service.ts:42 | new Date() | Implicit server-local | Order creation timestamp | Risky | | src/utils/time.ts:7 | dayjs.utc() | Explicit UTC | Audit log timestamp | Safe |

Count totals: X explicit UTC, Y implicit server-local, Z ambiguous. This is the baseline for all subsequent phases.

How dates are stored determines what operations are safe. Incorrect column types are silent until they explode.

Step 1: Audit every date/time column in the database

Read all migrations, schema files, and ORM model definitions. For every column storing a date or time value, record:

| Table | Column | DB Type | ORM Type | Nullable | Default | Has Index | Stores | |---|---|---|---|---|---|---|---| | orders | created_at | TIMESTAMPTZ | DateTime | No | NOW() | Yes | UTC timestamp | | events | event_date | VARCHAR(10) | string | No | — | No | Date string "YYYY-MM-DD" |

Step 2: Flag dangerous storage patterns

Check for each of these anti-patterns:

Step 3: Verify ORM model definitions match DB

For every date/time column:

Step 4: Audit default values and auto-timestamps

For every created_at, updated_at, deleted_at, and similar auto-managed columns:

Flag: created_at set by DB default (UTC) and updated_at set by application code (new Date(), server-local) = timestamps in different timezones on the same row.

Step 5: Check database server timezone configuration

Search for: SET timezone, SET TIME ZONE, TimeZone in connection strings, timezone in DB config files, .env database URL parameters. Document:

Step 6: Create migration files for fixes (DO NOT run)

For each dangerous storage pattern found:

Where bugs actually manifest. A date stored correctly in UTC is useless if displayed in the wrong timezone.

Step 1: Identify user timezone source

Search for how the system knows a user's timezone:

Document: Where is it stored? How is it accessed? What's the fallback when unknown? Is it validated against IANA timezone database?

Flag: No timezone source at all = every date display is either UTC (confusing to users) or server-local (wrong for most users).

Step 2: Trace the full timezone conversion flow

For the 3-5 most important date values in the system (order dates, event times, deadlines, subscription dates), trace the full lifecycle:
Creation → Storage → Retrieval → API Response → Client Receipt → Display
At each step, answer:

Draw the flow for each traced value. Example:
Order created:
new Date() [server-local EST]
→ Stored in TIMESTAMP column [no TZ, stores bare EST datetime]
→ Retrieved by ORM [bare datetime, ORM assumes UTC]
→ API returns ISO string without offset [ambiguous]
→ Client parses as local time [user is in PST, off by 3 hours]

Result: Order shows wrong time to every user not in server timezone.
Step 3: Find timezone assumptions

Search for code that assumes a specific timezone without being explicit:

For each: what timezone does the code actually use? What timezone should it use? Do they match?

Step 4: Audit timezone conversion utilities

Search for helper functions, middleware, or decorators that convert between timezones:

Flag these specific patterns:

Step 5: Check server environment timezone

Search for:

Document: Is the server timezone explicitly configured? Is it UTC? What happens if it changes? (Everything using new Date() or datetime.now() silently shifts.)

Multi-server risk: If the application runs on multiple servers (or serverless functions), are they all guaranteed to have the same timezone? If one server is in us-east-1 and another in eu-west-1, new Date() produces different results. Flag this if any implicit server-local date creation exists.

Step 6: Audit test suite timezone sensitivity

If possible, run tests with different TZ environment variables:
TZ=UTC npm test
TZ=America/Los_Angeles npm test
TZ=Asia/Kolkata npm test
TZ=Pacific/Auckland npm test  # UTC+12/+13, crosses date boundary early
If test results differ, catalog every failing test. Each one reveals a timezone assumption.

If running tests with different TZ is not feasible, search test files for:

The bugs that only happen twice a year, on the last day of certain months, or once every four years.

Step 1: Find all date arithmetic

Search for every operation that adds, subtracts, or computes duration between dates:
# Addition/subtraction
date.setDate(date.getDate() + 1)   # JS — adds 1 calendar day (correct)
date.setHours(date.getHours() + 24) # JS — adds 24 hours (WRONG during DST)
date + timedelta(days=1)            # Python — adds 24 hours (WRONG during DST)
date + timedelta(hours=24)          # Python — adds 24 hours (same issue, more obvious)
moment.add(1, 'day')               # moment — adds 1 calendar day (correct)
dayjs().add(1, 'day')              # dayjs — adds 1 calendar day (correct)
date + 86400                       # Unix epoch + seconds — adds 24 hours (WRONG)
date + 86400000                    # Unix epoch + milliseconds — adds 24 hours (WRONG)

# Duration calculation
(end - start) / 86400000           # Milliseconds to days — wrong during DST
(end - start) / (1000 * 60 * 60 * 24) # Same issue, more verbose
Math.ceil((end - start) / DAY_MS)  # Off-by-one possible at DST boundary
For each arithmetic operation, classify:

Step 2: Month arithmetic edge cases

Find every "add months" operation. For each, answer: what does "add 1 month" to January 31st produce?

Which behavior does the code get? Which does it need? Flag mismatches.

Check for:

Step 3: Leap year handling

Search for:

What happens on February 29th?

Step 4: DST transition edge cases

Identify the specific dangerous windows:

Step 5: End-of-day ambiguity

Search for "end of day" representations:

For date ranges:

Step 6: Week boundary edge cases

Search for week-related calculations:

Step 7: Year boundary edge cases

Search for year-related logic:

Step 8: Timezone-sensitive scheduled operations

Search for cron jobs, scheduled tasks, recurring events, and batch processing:

Where off-by-one and precision bugs cause wrong results.

Step 1: Find all date comparisons

Search for every place two dates are compared:
# Direct comparison
if (date1 > date2)
if (date1 >= date2)
if (date1 === date2)       # Reference equality in JS — almost always wrong
if (date1.getTime() === date2.getTime())  # Value equality — correct
if (date1 == date2)        # Type coercion — unreliable

# SQL comparisons
WHERE created_at > '2024-01-15'
WHERE created_at >= '2024-01-15'
WHERE created_at BETWEEN '2024-01-15' AND '2024-01-31'
WHERE DATE(created_at) = '2024-01-15'
For each comparison:

Step 2: Find precision mismatches

Common sources:

Search for: integer division by 1000, multiplication by 1000, calls to Math.floor/Math.round/Math.ceil on timestamps, UNIX_TIMESTAMP(), EXTRACT(EPOCH FROM ...).

Step 3: Audit date range queries

Find every database query that filters by a date range. For each:

Step 4: Find timezone-naive comparisons

Search for comparisons between dates that might be in different timezones:

Step 5: Audit "relative time" calculations

Search for "time since," "time until," "time ago" logic:

Step 6: Audit date-based business logic

Search for business rules that depend on dates:

Step 7: Audit date sorting and ordering

Search for places dates determine sort order:

How dates cross system boundaries.

Step 1: Audit API date formats

For every API endpoint that sends or receives dates, document:

| Endpoint | Direction | Field | Format | Has TZ? | Example | |---|---|---|---|---|---| | POST /orders | Request | delivery_date | ISO 8601 | No | "2024-01-15" | | GET /orders/:id | Response | created_at | ISO 8601 | Yes | "2024-01-15T10:30:00Z" | | GET /events | Response | start_time | Unix (seconds) | N/A | 1705312200 |

Flag:

Step 2: Check serialization/deserialization correctness

Search for date handling in JSON serialization:
// JavaScript
JSON.stringify(new Date())              // → "2024-01-15T10:30:00.000Z" (UTC ISO string)
JSON.parse('{"date":"2024-01-15T10:30:00.000Z"}').date  // → STRING, not Date object

// Is there a reviver function to parse dates?
JSON.parse(str, (key, value) => {
if (isDateField(key)) return new Date(value);  // Does this exist? For all date fields?
return value;
});
Check for:

Step 3: Audit date formatting for display

Search for every place dates are formatted for user display:
// JavaScript
date.toLocaleDateString()          // Locale-dependent — different output per user
date.toISOString()                 // UTC ISO — not user-friendly
date.toString()                    // Includes timezone name — ugly, inconsistent
moment(date).format('MM/DD/YYYY') // US format hardcoded — wrong for non-US users
dayjs(date).format('YYYY-MM-DD')  // ISO format — universally parseable but not user-friendly
new Intl.DateTimeFormat('en-US', options).format(date)  // Locale-aware — good
For each display point:

Step 4: Check date formatting library consistency

If the codebase uses formatting functions:

Step 5: Audit date input components (frontend)

If the codebase has a frontend, check date picker / date input components:

Fix only mechanical, clearly correct issues. Document everything else.

Step 1: Replace unsafe date creation

Where the codebase convention is UTC:

Run tests after each batch.

Step 2: Fix precision mismatches

Where seconds vs. milliseconds are mixed:

Step 3: Standardize API dates

Where internal APIs use inconsistent formats:

Step 4: Fix off-by-one date range bugs

Where range boundaries are incorrect:

Step 5: Replace deprecated library usage

If moment.js is used:

Step 6: Create migration files for column type upgrades

For each TIMESTAMP column that should be TIMESTAMPTZ (or equivalent):

Step 7: Fix timezone-sensitive tests

For tests that fail under different TZ settings:

Produce a date/time conventions document for the team.

Step 1: Document current state

Based on your findings, document:

Step 2: Document the gaps

Create a clear list of:

Step 3: Create diagnostic queries

Write SQL queries (or equivalent) to detect:

Label all queries: "Run manually after review. Do not execute unattended."

Save as audit-reports/14_DATETIME_HANDLING_REPORT_[run-number]_[date]_[time in user's local time].md. Create directory if needed. Increment run number based on existing reports.
1. Executive Summary 3-5 sentences: overall date/time health rating (dangerous / risky / moderate / good / solid), total findings by severity, critical gaps, headline stats (e.g., "23 date creation points found, 6 use implicit server-local time, 4 database columns use TIMESTAMP without timezone").

2. Date/Time Library Inventory

| Library | Version | Import Count | Files | Primary/Legacy | Deprecated? | |---|---|---|---|---|---| | dayjs | 1.11.10 | 47 | 23 | Primary | No | | moment | 2.29.4 | 3 | 2 | Legacy | Yes (maintenance mode) |

3. Date Creation Inventory

| Location | Code | UTC/Local/Implicit | Purpose | Risk | Fixed? | |---|---|---|---|---|---| | src/orders/service.ts:42 | new Date() | Implicit server-local | Order timestamp | Risky | Yes → dayjs.utc() |

Summary: X total creation points, Y explicit UTC, Z implicit server-local, W fixed.

4. Storage & Schema Analysis

| Table | Column | DB Type | Expected Type | Risk | Migration Created? | |---|---|---|---|---|---| | orders | created_at | TIMESTAMP | TIMESTAMPTZ | High | Yes: migrations/xxx_fix_orders_timestamps.sql |

Dates-as-strings inventory. Mixed format inventory. DB timezone configuration.

5. Timezone Flow Analysis

For each traced value: full flow diagram (creation → storage → retrieval → API → display), timezone at each step, conversion points, identified gaps.

User timezone source documentation. Server timezone configuration. Test timezone sensitivity results.

6. DST & Calendar Edge Cases

| Location | Operation | Type | Edge Case | Current Behavior | Correct Behavior | Risk | |---|---|---|---|---|---|---| | src/billing/cycle.ts:87 | date + 86400000 | Clock arithmetic | DST spring-forward | Shifts by 24h (wrong) | Should use calendar day add | High |

Month arithmetic findings. Leap year findings. DST gap/overlap findings. End-of-day ambiguity findings. Week boundary findings.

7. Date Comparison & Range Query Analysis

| Location | Query/Code | Issue | Impact | Fixed? | |---|---|---|---|---| | src/reports/daily.ts:23 | WHERE date <= '2024-01-15 23:59:59' | Misses last second | Missing records in daily reports | Yes → < next day |

Precision mismatches. Timezone-naive comparisons. Off-by-one boundaries. Relative time calculation issues.

8. API & Display Format Inventory

| Endpoint | Direction | Field | Format | Has TZ? | Consistent? | |---|---|---|---|---|---| | GET /orders | Response | created_at | ISO 8601 | Yes (Z) | Yes | | POST /events | Request | start_time | Unix seconds | N/A | No (others use ISO) |

Serialization issues. Display format inconsistencies. Date input component findings.

9. Fixes Applied

| File | Change | Category | Tests Pass? | Commit | |---|---|---|---|---| | src/orders/service.ts | new Date() → dayjs.utc().toDate() | UTC creation | Yes | fix: use UTC for order timestamps |

Migration files created (not run). Tests fixed for timezone sensitivity.

10. Conventions Document The date/time conventions document produced in Phase 8. Include inline or as a separate file referenced from the report.

11. Diagnostic Queries All SQL queries for detecting data anomalies, with safety warnings.

12. Risk Map All findings ranked by likelihood x impact. Focus on:

13. Recommendations Priority-ordered list: immediate fixes, schema migrations to review, library migration plan, convention documentation, tests to write, monitoring to add.

In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish. Do not make the user open the report to get the highlights. The chat summary should include:
One sentence: what you did, how long it took, and whether all tests still pass.
The most important things discovered — bugs, risks, wins, or surprises. Each bullet should be specific and actionable, not vague. Lead with severity or impact.

Good: "CRITICAL: No backup configuration found for the primary Postgres database — total data loss risk." Bad: "Found some issues with backups."
Bullet list of what was actually modified, added, or removed. Skip this section for read-only analysis runs.
If there are legitimately beneficial recommendations worth pursuing right now, present them in a table. Do not force recommendations — if the audit surfaced no actionable improvements, simply state that no recommendations are warranted at this time and move on.

When recommendations exist, use this table format:

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details | |---|---|---|---|---|---| | Sequential number | Short description (≤10 words) | What improves if addressed | Low / Medium / High / Critical | Yes / Probably / Only if time allows | 1–3 sentences explaining the reasoning, context, or implementation guidance |

Order rows by risk descending (Critical → High → Medium → Low). Be honest in the "Worth Doing?" column — not everything flagged is worth the engineering time. If a recommendation is marginal, say so.
State the full path to the detailed report file for deeper review.

Formatting rules for chat output:
