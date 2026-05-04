You are running an overnight idempotency and safe retry audit. Your single question, applied to every operation in the codebase: "If this runs twice, what breaks?" Find every operation that produces wrong results, duplicate side effects, or data corruption when executed more than once — then fix the safe ones and document the rest.

In distributed systems, everything can run twice. Network timeouts trigger retries. Users double-click. Queue messages redeliver. Webhooks fire again. Cron jobs overlap. Payment providers retry callbacks. If your code is not safe for duplicate execution, you have latent bugs that will surface under load, during outages, and at the worst possible time.

Work on branch idempotency-audit-[date].

Step 1: Find every state-changing endpoint

Search for every POST, PUT, PATCH, and DELETE route/handler. Include REST endpoints, GraphQL mutations, RPC handlers, WebSocket message handlers, and server actions (Next.js, Remix, SvelteKit). For each, document:

| Field | Detail | |-------|--------| | Method + Path | POST /api/orders | | Handler location | File and line number | | Side effects | What it creates, modifies, deletes, or triggers | | Current protection | Idempotency key? Unique constraint? Upsert? Status guard? None? |

Step 2: Simulate duplicate execution

For each endpoint, mentally execute the same request twice in quick succession with identical parameters. Answer:

Step 3: Classify each endpoint

Assign one of these categories:

For every endpoint classified "Needs protection" or "Partially protected," document the specific failure mode and trigger scenario.

Financial operations are the highest-stakes idempotency failures. A double-charge, double-refund, or double-credit is a compliance incident, not just a bug.

Step 1: Inventory every financial operation

Search for: payment charges, refunds, credits, transfers, subscription creates/updates/cancels, invoice generation, billing calculations, wallet debits/credits, payout triggers, tax calculations that create records, coupon/discount applications, trial-to-paid conversions.

Step 2: Audit idempotency key usage

For each financial operation that calls an external payment provider (Stripe, PayPal, Braintree, Square, Adyen, etc.):

Step 3: Audit timeout and failure handling

For each financial API call:

Step 4: Audit internal balance operations

For ledger systems, wallet balances, credit systems, or any internal accounting:

Flag any financial operation without explicit idempotency protection as CRITICAL severity.

Webhooks are the #1 source of duplicate execution in production. Every major provider documents that webhooks can be delivered multiple times. Stripe, GitHub, Shopify, Twilio — all of them.

Step 1: Inventory every webhook handler

Search for: webhook route handlers, callback URLs, event receivers, notification endpoints, provider-specific handlers (Stripe webhook, GitHub webhook, etc.). For each, document:

| Field | Detail | |-------|--------| | Endpoint | Path and provider | | Events handled | Which event types | | Side effects | What it creates, modifies, triggers | | Dedup mechanism | Event ID tracking? Delivery ID check? None? | | Signature validation | Yes/No, which method |

Step 2: Simulate duplicate delivery

For each webhook handler, trace what happens when the exact same payload arrives twice:

Step 3: Assess signature validation

For each webhook endpoint:

Step 4: Assess ordering assumptions

Webhook events can arrive out of order. Check for:

Flag webhook handlers that have side effects (email, charge, state change, external API call) and NO deduplication as HIGH risk.

Message queues guarantee at-least-once delivery, not exactly-once. Every queue consumer MUST be idempotent.

Step 1: Inventory every consumer

Search for: queue consumers, job processors, event subscribers, pub/sub handlers, message listeners, worker functions. Include: Bull/BullMQ, SQS, RabbitMQ, Kafka, Redis pub/sub, Celery, Sidekiq, Cloud Tasks, Pub/Sub, EventBridge targets, and custom job tables polled by workers.

For each, document:

| Field | Detail | |-------|--------| | Consumer/Job name | Identifier | | Queue/Topic | Source | | Handler location | File and line | | Side effects | What it creates, modifies, triggers | | Idempotency protection | Already-processed check? Unique constraint? Status guard? None? | | Visibility timeout / Ack deadline | Configured value | | Retry config | Max retries, backoff |

Step 2: Simulate duplicate processing

For each consumer, trace what happens when the same message is processed twice:

Step 3: Assess redelivery risk

Step 4: Assess out-of-order processing

Flag consumers with side effects and no "already processed" guard as HIGH risk.

Users double-click. They click and then click again because "nothing happened." They tap on mobile where debouncing is unreliable. They use browser back/forward to re-navigate to a submission page. Every mutation trigger in the frontend must handle this.

Step 1: Inventory every frontend mutation trigger

Search for: form submit handlers, button click handlers that trigger API calls, mutation hooks (React Query useMutation, Apollo useMutation, SWR mutations, tRPC mutations), fetch/axios POST/PUT/PATCH/DELETE calls initiated from UI events, file upload triggers, confirmation dialog actions.

Step 2: Assess double-click protection

For each mutation trigger:

Step 3: Assess navigation-triggered resubmission

Step 4: Assess optimistic UI consistency

For optimistic updates (UI updates before server confirms):

Step 5: Assess mobile-specific patterns

The database layer is the last line of defense. Even if application code fails to prevent duplicates, proper constraints and atomic operations can catch them.

Step 1: Find unguarded INSERT operations

Search for every INSERT / create / save operation. For each:

Step 2: Find unguarded read-modify-write patterns

Search for patterns where code reads a value, modifies it in application logic, and writes it back:

Step 3: Find unguarded status transitions

Search for every UPDATE that changes a status, state, or phase field:

Step 4: Find operations that generate side effects on every invocation

Search for code paths where a database write triggers additional actions:

For each: is there an "already done" guard? (Flag in the record, unique constraint on the side effect record, idempotency key on the outbound call.)

Step 5: Verify unique constraint coverage

For each table, assess:

Every outbound API call that produces a side effect is a potential duplicate-execution risk. If your call times out, did it succeed or fail? If you retry, will it execute twice?

Step 1: Inventory every side-effect-producing outbound call

Search for: HTTP client calls (fetch, axios, got, httpx, requests) that use POST/PUT/PATCH/DELETE, SDK calls that create/modify/delete resources, email sending (SendGrid, SES, Mailgun, SMTP), SMS sending (Twilio, SNS), push notification dispatch, file/object creation in cloud storage, external webhook/callback triggers, third-party resource creation (Stripe customers, GitHub issues, Slack messages).

For each, document:

| Field | Detail | |-------|--------| | Call location | File and line | | Target service | What external system | | Operation | What it creates/modifies | | Idempotency support | Does the target API accept idempotency keys? | | Key used? | Is the code sending one? What is it derived from? | | Retry behavior | Does the code retry on failure/timeout? | | Timeout behavior | What happens on timeout specifically? |

Step 2: Assess timeout handling

For each outbound call with side effects:

The most dangerous pattern: Fire-and-forget call wrapped in a retry loop with no idempotency key and no success check. Each retry is a new execution at the target.

Step 3: Assess retry safety by target service

For each external service called:

Step 4: Find fire-and-forget calls

Search for API calls with no error handling, no await, or error caught and swallowed:

Step 5: Assess cross-service consistency

For operations that span multiple external services:

Scheduled tasks that run on an interval can overlap with themselves if a run takes longer than the interval. They can also run on multiple instances in a scaled deployment.

Step 1: Inventory every scheduled/recurring task

Search for: cron expressions, setInterval, node-cron, APScheduler, Celery Beat, Sidekiq scheduled, Kubernetes CronJobs, Cloud Scheduler, @Scheduled annotations, recurring Temporal workflows, database-polled job queues.

Step 2: Assess overlap protection

For each scheduled task:

Step 3: Assess idempotency of task logic

For each task:

Apply mechanical, clearly-correct fixes. For each fix, run tests. Commit each category separately.

Database-level protections (migration files, DO NOT run):

Application-level protections:

Frontend protections:

Write idempotency tests for every fix:

Do NOT fix:

Create audit-reports/ in project root if needed. Save as audit-reports/30_IDEMPOTENCY_REPORT_[run-number]_[date]_[time in user's local time].md, incrementing run number based on existing reports.

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
