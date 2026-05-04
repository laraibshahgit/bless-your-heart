You are running an overnight contract and schema drift audit. Your job is to find every place where types, schemas, validation rules, API contracts, database definitions, configuration declarations, and serialization assumptions have drifted out of alignment with each other — and fix the mechanical ones.

Production bugs from logic errors are obvious. The insidious ones come from drift: the database says a column is nullable but the ORM says it's required. The API returns a field the frontend type doesn't know about. The Zod schema validates five fields but the TypeScript interface has seven. The .env.example lists twelve variables but the code reads fifteen. These mismatches compile fine, pass unit tests, and detonate in production. Find them all.

Branch: contract-drift-[date]

Compare every ORM or model definition against the actual database schema. The database schema is the source of truth — it is what the application will actually encounter at runtime.
Find both sides of the contract:

If the project uses a schema-first ORM (Prisma, Drizzle), the schema file is the model definition. Compare it against the migration history to confirm they agree.

If the project has no ORM and uses raw SQL, find the TypeScript/Python/etc. types that represent database rows and compare those against the schema.

If the project has no database at all, document this and skip to Phase 2.

Handling multiple databases: If the application connects to more than one database (e.g., a primary Postgres + a read replica, or a main DB + an analytics DB), map every ORM model to its target database. Drift in a read replica's schema is just as dangerous — a query routed to the replica with a stale schema will fail at runtime.

Handling schema-per-tenant or multi-schema setups: If the application uses schema-per-tenant (e.g., PostgreSQL schemas for multi-tenancy), verify that the ORM model applies to all tenant schemas, not just the default one. Check whether migrations are applied to every tenant schema or only the default.
For every table, compare the ORM model against the database schema column by column. Check each of the following:

Existence drift:

Nullability drift:

Type drift:

Default value drift:

Enum drift:

Index and constraint drift:

Create a table for every drift item found:

| Table | Column | Issue Type | Database Definition | ORM Definition | Severity | Fix Side | |-------|--------|-----------|-------------------|----------------|----------|----------| | users | middle_name | Orphaned column | VARCHAR(255) NULL | Not in model | Low | Either | | orders | total | Type mismatch | DECIMAL(10,2) | Float | High | ORM | | products | status | Enum drift | enum('active','draft') | enum includes 'archived' | Critical | DB migration |

Severity guide:

Good finding example: "CRITICAL: The orders.total column is DECIMAL(10,2) in the database but the Order Prisma model defines it as Float. Every order total is silently losing precision — $19.99 may be stored as $19.989999771118164. This affects 3 models and 12 queries."

Bad finding example: "Some columns don't match between the database and ORM."
Beyond individual columns, check that relationships between tables are consistent:

If the database has views or materialized views:

Determine whether the documented API contract matches what the code actually implements.
Search for formal API specifications:

If no formal or informal API contract exists at all, document this as a gap and proceed to analyze what the handlers actually accept and return.
List every route handler in the application. Search for route registration patterns:

For each handler, document:

For each route handler, check:

Endpoint existence:

HTTP method alignment:

Request shape drift:

Response shape drift:

Query parameter drift:

Header drift:

For each endpoint that has request validation (Zod, Yup, Joi, class-validator, express-validator, etc.):

| Endpoint | Issue | Spec Says | Code Does | Severity | |----------|-------|-----------|-----------|----------| | POST /api/users | Undocumented field | body: {name, email} | body: {name, email, avatar} | Medium | | GET /api/orders/:id | Wrong status code | 200, 404, 500 | 200, 400, 404 (no 500 handler) | Low | | GET /api/products | Missing from spec | Not documented | Handler exists at line 42 | High | | DELETE /api/sessions | Missing from code | Documented in spec | No handler found | Critical |

Good finding example: "HIGH: GET /api/products returns a discountPercent field (number) in the response body, but the OpenAPI spec at docs/openapi.yaml does not document this field. The React frontend ProductCard component reads product.discountPercent and renders a badge — if this field were ever removed, the badge would silently show 'undefined% off' with no test or type error catching it."

Bad finding example: "Some API endpoints are not documented."
If the project uses GraphQL, perform these additional checks:

If the project uses WebSockets, Server-Sent Events, or real-time subscriptions:

Find every place where the frontend defines types for data that comes from the backend, and check whether they actually agree.
Look for:

For each type that represents data crossing the frontend-backend boundary, compare field by field:

Missing fields:

Optionality mismatches:

Type mismatches:

Nested object drift:

Search for patterns that paper over contract mismatches:

Quantify the problem: Count total type assertions at API boundaries. If there are more than a handful, this is a systemic issue — the types and the API have drifted to the point where developers routinely override the type system to make things compile.

Good finding example: "HIGH: src/api/userService.ts contains 14 as type assertions on API response data. The UserProfile type was last updated 8 months ago, but the backend /api/profile endpoint was updated 3 weeks ago to add preferences and notificationSettings fields. The frontend type has neither field — every response silently drops this data."

Bad finding example: "Found some type assertions in the codebase."
If the project uses code generation for types (OpenAPI codegen, GraphQL codegen, tRPC, Protobuf):

| Frontend Type | Backend Source | Field | Frontend Says | Backend Sends | Severity | |--------------|---------------|-------|---------------|---------------|----------| | User | GET /api/users/:id | avatarUrl | string (required) | Not returned | Critical | | Order | GET /api/orders | total | number | "19.99" (string) | High | | Product | GET /api/products | tags | string[] | null when empty | Medium | | UserProfile | Generated from OpenAPI | phone | string? | Now required (spec updated, codegen stale) | High |
If the frontend uses a generated or hand-written API client library (e.g., an apiClient.ts or generated SDK):

If the frontend uses a state management store (Redux, Zustand, Pinia, MobX, Vuex):

Find every validation schema in the codebase and check whether it agrees with the type it validates, the database it writes to, and the API docs it represents.
Search for all validation libraries and their schemas:

For each schema found, document: where it's defined, what data it validates, and where it's used (which route handler, which form, which data pipeline).
For each validation schema, find the TypeScript type (or equivalent) it's supposed to represent. Compare field by field:

Field existence drift:

Type constraint drift:

Required/optional drift:

Zod-to-TypeScript inference check:

For each validation schema that guards data being written to the database:

Find places where validation exists at one boundary but not another:

Specific cross-boundary patterns to search for:

| Boundary Path | What to Check | |--------------|---------------| | Frontend form → API endpoint | Does frontend validation match backend validation? Are error messages consistent? | | API endpoint → Database write | Does API validation enforce all DB constraints (NOT NULL, length, enum, uniqueness)? | | Webhook → Database write | Is the incoming webhook payload validated before being written? | | Queue consumer → Database write | Is the consumed message validated before processing? | | CSV/file upload → Database write | Is the uploaded data validated row by row before bulk insert? | | Admin panel → Database write | Do admin forms have the same validation as user-facing forms? (Often relaxed — security risk.) |

Good finding example: "CRITICAL: The POST /api/payments endpoint validates amount as z.number().positive() but the payments table column is DECIMAL(8,2) — the Zod schema allows 9999999.999 which exceeds the column precision and will be silently truncated to 99999.99 by PostgreSQL, charging the customer 100x less than intended."

Bad finding example: "Validation schemas could be improved."
| Schema Location | Validates For | Compared Against | Issue | Severity | |----------------|---------------|-----------------|-------|----------| | src/schemas/user.ts (Zod) | POST /api/users | User TypeScript type | Type has role field, schema doesn't validate it | High | | src/schemas/user.ts (Zod) | POST /api/users | users table | Schema allows 500-char name, DB column is VARCHAR(100) | Medium | | src/forms/LoginForm.tsx (Yup) | Login form | POST /api/auth/login | Frontend validates email format, backend doesn't | High | | (none) | POST /api/webhooks/stripe | Webhook payload | No validation at all — raw JSON trusted blindly | Critical |

Find every configuration value the application reads and verify it's documented, typed, and present in all required environments.
Search the entire codebase for every place a configuration or environment variable is read:

For each variable found, document:

Find all places that document expected environment variables:

Variables read in code but not in `.env.example`:

Variables in `.env.example` that no code reads:

Variables in CI/CD but not in `.env.example` (or vice versa):

Type assumption drift:

Required vs optional ambiguity:

Secret vs non-secret confusion:

Environment-specific drift:

Good finding example: "CRITICAL: process.env.DB_POOL_SIZE is read at src/db/connection.ts:12 and passed directly to parseInt(). If the variable is missing, parseInt(undefined) returns NaN, which is passed to the connection pool constructor. The pg-pool library interprets NaN as 0, creating a pool with zero connections — every database query hangs indefinitely with no error message. This variable is not in .env.example, not in the README, and not validated at startup."

Bad finding example: "Some environment variables are missing from .env.example."
| Variable | Read In Code | In .env.example | In CI/CD | In Docs | Issue | Severity | |----------|-------------|-----------------|----------|---------|-------|----------| | STRIPE_WEBHOOK_SECRET | src/webhooks.ts:15 | No | Yes | No | Missing from .env.example | High | | LEGACY_API_URL | (nowhere) | Yes | Yes | Yes | Dead config — no code reads it | Low | | PORT | src/server.ts:8 | Yes | Yes | Yes | Used as number, no parseInt | Medium | | ENABLE_CACHE | src/cache.ts:3 | No | No | No | Compared to boolean true, always false | High | | DB_POOL_SIZE | src/db.ts:12 | No | No | No | Undocumented, crash on startup if missing | Critical |

Find every place data crosses a serialization boundary and check whether the code handles the transformation correctly.
Search for every point where structured data becomes a flat format (or vice versa):

For each boundary, record: what data crosses it, in which direction, what format it uses, and whether either side validates the data after crossing.
For every place data is deserialized (parsed from a flat format into structured data), check:

Is the parsed data validated or just trusted?

Bad patterns:
// Lying to the compiler — JSON.parse returns `any`, this assertion is unchecked
const user = JSON.parse(data) as User;

// Trusting API response shape
const { data } = await axios.get<User[]>('/api/users');
// TypeScript thinks `data` is `User[]` but it's actually `any` at runtime

// Trusting cache contents
const cached = JSON.parse(await redis.get('user:123'));
// If cache format changed, this silently produces wrong data
Good patterns:
// Actually validated
const user = UserSchema.parse(JSON.parse(data));

// Runtime type check
const data = await response.json();
if (!isUserArray(data)) throw new Error('Invalid response shape');
For each deserialization point, record: what data is being parsed, whether it's validated, and what happens if the shape is wrong (crash, silent corruption, handled gracefully).

Severity classification for unvalidated deserialization:

| Data Source | Trust Level | Severity if Unvalidated | |-------------|------------|------------------------| | User input (request body, query params, form data) | Zero trust | Critical | | Webhook payload from external service | Zero trust | Critical | | Data from external API call | Low trust | High | | Data from internal service API | Medium trust | Medium | | Data from own database | High trust (but migrations can change schema) | Medium | | Data from own cache (Redis, etc.) | High trust (but format can drift between deploys) | Medium | | Data from local file (config, fixtures) | High trust | Low |
Date handling:

BigInt and large numbers:

Special values:

Custom toJSON methods:

Prototype pollution and injection:

Good finding example: "HIGH: src/services/webhookProcessor.ts:34 does const event = JSON.parse(req.body) as StripeEvent — the Stripe webhook payload is parsed and immediately trusted as a StripeEvent type. If Stripe changes their payload schema (they have a history of adding fields and changing nested structures), this code will not detect the mismatch. The event.data.object.amount access on line 41 would return undefined if Stripe restructured the payload, and the downstream calculation amount / 100 would produce NaN, which would be written to the database as the order total."

Bad finding example: "JSON.parse is used without validation in several places."
Check that serialization is consistent across boundaries:

Key ↔ casing transformation checks:

| Location | Boundary | Data | Issue | Severity | |----------|----------|------|-------|----------| | src/api/users.ts:45 | API response → frontend | User object | JSON.parse(response) as User — no validation | High | | src/cache/sessions.ts:20 | Redis GET → app | Session data | Cache format changed last month, no validation on read | Critical | | src/utils/export.ts:88 | App → JSON file | Report data | Dates serialized to strings, never parsed back on import | Medium | | src/models/Order.ts:30 | DB → app | Order total | BigInt column, JavaScript Number may lose precision on large values | High |
Check how errors are serialized across boundaries:

Check whether the database migration state, API versions, and service dependencies are consistent and current.
Compare migrations on disk vs applied migrations:

Pending migrations:

Conflicting migrations:

Destructive migrations:

If the application consists of multiple services, or depends on external services with versioned APIs:

Check runtime dependency version expectations:

Lock file drift:

| Component | Issue | Current State | Expected State | Severity | |-----------|-------|--------------|----------------|----------| | DB migration #47 | Pending | Not applied | Code depends on new column | Critical | | User service API | Version mismatch | Service B calls v1 | Service B now serves v2 only | Critical | | PostgreSQL | Feature dependency | Using v11 in staging | jsonb_path_query requires v12+ | High | | Migration #23 | Destructive | Drops legacy_users table | Code still references legacy_users model | Critical |

Good finding example: "CRITICAL: Migration file migrations/0047_add_preferences_column.sql adds a preferences JSONB NOT NULL column to the users table. This migration has not been applied (not in _prisma_migrations table based on migration file analysis), but the Prisma schema already includes the preferences field and the UserService.updatePreferences() method on line 89 of src/services/userService.ts writes to it. Any call to this method will crash with a 'column does not exist' error."

Bad finding example: "There might be some pending migrations."

Fix the mechanical drift issues found in Phases 1-7. Only fix issues where the correct resolution is unambiguous.
Type alignment fixes:

Validation fixes:

Configuration fixes:

Documentation fixes:

Serialization boundary fixes:

Migration generation:

Test additions:

Apply fixes in this order to minimize cascading issues:

After completing all fixes:

Create audit-reports/ in project root if needed. Save as audit-reports/22_CONTRACT_SCHEMA_DRIFT_REPORT_[run-number]_[date]_[time in user's local time].md, incrementing run number based on existing reports.

| File | Change | Phase Source | Source of Truth | Lines Changed |     |------|--------|-------------|-----------------|---------------|     | src/models/User.ts | Added middleName nullable field | Phase 1, Row 3 | DB migration #42 | 1 |

| Issue | Phase | Why Not Fixed | Recommended Action |     |-------|-------|--------------|-------------------|     | User.status enum includes 'archived' not in DB | Phase 1 | Unclear if DB needs migration or code needs revert | Product decision needed |

| Boundary | Critical | High | Medium | Low | Overall |     |----------|----------|------|--------|-----|---------|     | Database ↔ ORM | 0 | 2 | 3 | 1 | Fragile |     | API ↔ Docs | 1 | 0 | 4 | 2 | Partial |     | Frontend ↔ Backend | 0 | 3 | 1 | 0 | Fragile |     | Validation ↔ Types | 0 | 1 | 2 | 3 | Partial |     | Config ↔ Code | 1 | 1 | 0 | 2 | Fragile |     | Serialization | 0 | 2 | 1 | 0 | Fragile |     | Migrations | 0 | 0 | 1 | 1 | Solid |

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
