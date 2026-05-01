You are running an overnight integration and boundary testing audit. Your job is to evaluate whether the codebase has adequate test coverage at every system boundary — where services meet databases, APIs, external providers, caches, and queues — and to fill the most critical gaps.

Production outages rarely come from a single function doing the wrong thing. They come from the spaces between systems: a schema that drifted, a timeout nobody tested, a retry that wasn't idempotent, a mock that lied about what the real service returns. Find those gaps.

Branch: integration-testing-[date]

Map every point where the application talks to something external or between major internal modules.

Step 1: Identify all boundaries by category

| Category | What to find | |----------|-------------| | Database | Every ORM model, raw query, migration, stored procedure call | | External APIs | HTTP clients, SDK calls, webhook handlers (both sending and receiving) | | Internal service-to-service | Inter-service API calls, shared libraries, event bus communication | | Cache | Redis/Memcached operations, in-memory cache with invalidation logic | | Message queues | Publishers, consumers, dead letter handling | | File storage | S3/GCS/local filesystem reads and writes | | Auth providers | OAuth, SSO, JWT validation against external issuers | | Email/SMS/Push | Notification service integrations | | Search | Elasticsearch, Algolia, full-text search integrations | | Payment | Stripe, PayPal, billing provider integrations |

Step 2: For each boundary, document:

Step 3: Produce a boundary inventory table. This is the foundation for everything that follows.

For each boundary from Phase 1, determine what integration test coverage exists.

Step 1: Find existing integration tests

Step 2: Evaluate each existing integration test

Step 3: Produce a coverage matrix

For each boundary: Boundary Name | Owning Module | Integration Tests Exist? | Happy Path | Error Handling | Failure Modes | Contract Validation | Deterministic? | Overall Rating (Strong / Weak / None)

Evaluate whether API contracts between systems are formally tested or just hoped for.

Step 1: Identify all contracts

Step 2: Assess contract testing for each

Step 3: Identify breaking-change-blind spots

Assess whether the codebase has adequate deploy-time verification.

Step 1: Find existing smoke tests

Step 2: Evaluate smoke test adequacy

A good smoke suite answers one question: "Is the app alive and are the critical paths working?" Check whether it covers:

Step 3: Identify smoke test gaps

Evaluate whether end-to-end tests cover the journeys that matter most.

Step 1: Map critical user journeys

List the 5-15 most important user workflows. For each: what steps does the user take? What systems are touched? What data is created or modified?

Examples of critical journeys (vary by product):

Step 2: Assess E2E coverage per journey

For each journey:

Step 3: Assess E2E infrastructure

Assess whether integration and E2E tests run against realistic, reproducible environments.

Step 1: Environment fidelity

What do integration tests run against? (Test containers, in-memory DB, shared staging, local Docker, mocked everything)

Flag major fidelity gaps:

Step 2: Test data management

Step 3: Reproducibility

Write the most critical missing tests identified in Phases 2-6.

Prioritization (work top-down):

For each test written:

Do NOT write:

Create audit-reports/ in project root if needed. Save as audit-reports/08_INTEGRATION_BOUNDARY_TESTING_REPORT_[run-number]_[date]_[time in user's local time].md, incrementing run number based on existing reports.
In addition to writing the full report file, you MUST print a summary directly in the conversation when you finish. Do not make the user open the report to get the highlights. The chat summary should include:
One sentence: what you did, how long it took, and whether all tests still pass.
The most important things discovered — bugs, risks, wins, or surprises. Each bullet should be specific and actionable, not vague. Lead with severity or impact.

Good: "CRITICAL: The Stripe webhook handler has zero integration tests — a payload schema change would reach production undetected." Bad: "Found some gaps in integration testing."
Bullet list of what was actually modified, added, or removed. Skip this section for read-only analysis runs.
If there are legitimately beneficial recommendations worth pursuing right now, present them in a table. Do not force recommendations — if the audit surfaced no actionable improvements, simply state that no recommendations are warranted at this time and move on.

When recommendations exist, use this table format:

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details | |---|---|---|---|---|---| | Sequential number | Short description (≤10 words) | What improves if addressed | Low / Medium / High / Critical | Yes / Probably / Only if time allows | 1–3 sentences explaining the reasoning, context, or implementation guidance |

Order rows by risk descending (Critical → High → Medium → Low). Be honest in the "Worth Doing?" column — not everything flagged is worth the engineering time. If a recommendation is marginal, say so.
State the full path to the detailed report file for deeper review.

Formatting rules for chat output:
