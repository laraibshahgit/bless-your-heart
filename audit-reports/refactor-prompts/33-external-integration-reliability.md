You are running an overnight external integration reliability audit. Your job: find every point where the application communicates with a system it does not control — payment providers, email/SMS services, cloud storage, auth providers, analytics, AI/ML APIs, search services, CDNs, DNS, monitoring — and assess whether each integration is resilient to the failures that will inevitably happen. Then fix what is safe to fix.

Production outages from your own code are embarrassing. Production outages because a third-party service had a 10-minute blip and your application had no timeout, no fallback, and no meaningful error message — those are preventable. This prompt finds every one of those gaps.

Work on branch external-integration-[date].

Other prompts audit your code. This one audits the seams between your code and everything you don't control.

Your application is only as reliable as its weakest external dependency. You can have 100% test coverage, zero bugs in your business logic, and a perfectly designed architecture — and still suffer a total production outage because Stripe had a 10-minute blip and your checkout endpoint had no timeout configured. The request hangs, the connection pool fills up, and suddenly your search page doesn't work either because it shares the same HTTP agent.

These failures are entirely preventable. But they require deliberate engineering at every integration boundary: timeouts, specific error handling, retry logic, fallbacks, monitoring, and credential hygiene. Most codebases handle the happy path well and leave the failure path as catch (err) { throw err }.

This audit treats every external service as a potential failure point and systematically asks: "What happens when this breaks?" Then it fixes what's safe to fix.

This audit focuses exclusively on the boundary where your code meets systems you don't control.

Map every external service the application communicates with. This inventory is the foundation for the entire audit.

Step 1: Discovery — find every external integration

Search the entire codebase for external communication patterns:

Step 2: For each discovered integration, document:

| Field | What to record | |-------|---------------| | Service name | e.g., "Stripe", "SendGrid", "AWS S3" | | SDK/client used | Package name and version from package.json / requirements.txt / go.mod | | Actively maintained? | Last publish date, open issues, deprecation notices | | Integration location | File path(s) and function names where the service is called | | Operations performed | Read-only? Creates resources? Financial transactions? Deletes data? | | Criticality | Critical / High / Medium / Low (see classification below) | | Credential location | Environment variable name, config file, secret manager reference | | Data sensitivity | Does it send/receive PII, financial data, health data, auth tokens? |

Step 3: Classify criticality

Use this framework consistently:

Key distinction: A service's criticality determines how much defensive infrastructure it needs. Critical services need timeouts, retries, fallbacks, monitoring, and graceful degradation. Low services need a timeout and a catch block.

Step 4: Produce the External Service Inventory table

This table is referenced by every subsequent phase. Make it complete.

For EACH external service in the inventory, answer three questions systematically. Do not skip any service — even "Low" criticality services can cause cascading failures if they block the event loop or exhaust connection pools.

Step 1: Total outage analysis — "What happens right now if this service is completely unreachable for 10 minutes?"

Trace the code path from the external call through error handling to the user-facing response. For each service:

Good finding: "When SendGrid is unreachable, the user registration endpoint hangs for 30 seconds (the global HTTP timeout) before returning a 500 error. The user's account IS created in the database, but they never receive their verification email. There is no retry mechanism — the email is lost. The user sees 'Internal Server Error' with no guidance."

Bad finding: "SendGrid failure might cause issues with email."

Step 2: Latency degradation analysis — "What happens if this service responds, but at 2x / 5x / 10x normal latency?"

This is often worse than total outage because the service appears "up" and retries don't help. A total outage triggers error handling (if it exists). Latency degradation just makes everything slow — and slowness cascades.

Trace the specific cascading failure path:

Document where in this cascade the application currently breaks. Does it have any protection?

Step 3: Unexpected response analysis — "What happens if this service returns unexpected data?"

Third-party APIs change. Schema fields get added, removed, or renamed. Error response formats evolve. New status codes appear. This happens more often than total outages and is harder to detect.

Common dangerous patterns:

Step 4: Produce the Failure Mode Matrix

For each service: Service | Outage Behavior | Latency Behavior | Unexpected Response Behavior | Cascading Impact? | Fallback Exists? | Overall Resilience Rating (Resilient / Fragile / Dangerous)

For every external HTTP client and SDK connection, perform a detailed configuration audit.

Step 1: Connection timeout audit

For each external call, check whether a connection timeout is configured. This is how long the client waits to establish a TCP connection.

Step 2: Read/response timeout audit

For each external call, check whether a response timeout is configured. This is how long the client waits for the server to send data after the connection is established.

Step 3: Connection pooling audit

For each HTTP client / SDK:

Step 4: TLS/SSL configuration audit

Step 5: DNS considerations

Step 6: Produce the Connection Configuration Table

For each external service: Service | Connection Timeout | Response Timeout | Timeout Appropriate? | Connection Pool | Keep-Alive | TLS Verified | Issues Found

For every external call, trace the complete error handling path from the call site to the user-facing response.

Step 1: Error type discrimination

For each external call's error handling, check whether it distinguishes between error types:

| Error Type | What it means | Correct handling | |-----------|---------------|-----------------| | Network error (ECONNREFUSED, ENOTFOUND, ETIMEDOUT) | Service unreachable | Retry with backoff, then fallback or meaningful error | | Connection timeout | TCP connection not established | Retry once, then fail with "service unavailable" | | Response timeout | Connected but response too slow | Retry with caution (request may have been received), then fail | | HTTP 4xx (client error) | Your request is wrong | Do NOT retry. Log details. Fix the request or surface to user | | HTTP 401 (unauthorized) | Token expired or invalid | Refresh token and retry once. If still 401, alert/escalate | | HTTP 403 (forbidden) | Permission denied | Do NOT retry. Check credential permissions | | HTTP 404 (not found) | Resource doesn't exist | Do NOT retry. Handle as business logic (resource was deleted, etc.) | | HTTP 409 (conflict) | State conflict | May need to refresh and retry with new state | | HTTP 429 (rate limited) | Too many requests | Back off per Retry-After header, then retry | | HTTP 5xx (server error) | Service is broken | Retry with exponential backoff. After N retries, fail gracefully | | Malformed response | Response doesn't match expected shape | Log full response for debugging. Fail with meaningful error |

Step 2: Find generic catch blocks

Search for error handling that treats all external failures the same way:

For each generic catch block, determine:

Step 3: Error response parsing

External APIs return error details in their response body. Check whether those details are:

Good finding: "The Stripe payment handler in payments/charge.ts:45 catches all errors in a single catch(e) block that returns { error: 'Payment failed' } regardless of whether the card was declined (4xx — should tell user), Stripe is down (5xx — should retry), or the request timed out (should retry with caution). The Stripe error object includes err.type, err.code, and err.decline_code which are never read."

Bad finding: "Error handling could be more specific in some places."

Step 4: Produce the Error Handling Assessment

For each external call: Location | External Service | Error Types Distinguished? | Specific Handling per Type? | User Message Quality | Error Logged? | Information Leaked? | Rating (Thorough / Partial / Generic / Missing)

Assess whether external calls are retried appropriately and safely.

Step 1: Inventory existing retry logic

For each external call:

Step 2: Idempotency check for retried operations

This is critical. Retrying a non-idempotent operation can cause duplicate charges, double-sends, or duplicate resource creation.

For each retried external call:

Step 3: Find operations that should retry but don't

Step 4: Find operations that retry but shouldn't

Dangerous scenario to check for: Payment API call times out after 25 seconds. The code retries. But the first call DID succeed — the response just arrived after the timeout. Now the customer is charged twice. This is the most dangerous retry pattern and requires idempotency keys to be safe.

Good finding: "The createSubscription call in billing/subscribe.ts:78 retries up to 3 times on timeout with the Stripe SDK's built-in retry, but does not pass an Idempotency-Key. If the first request succeeds but the response is lost (timeout), the retry will create a second subscription. The customer will be double-billed."

Bad finding: "Some retry logic exists but could be improved."

Step 5: Produce the Retry & Idempotency Assessment

For each external call: Location | Service | Retry Exists? | Backoff Strategy | Jitter? | Max Retries | Idempotent? | Idempotency Key? | Issues

Find and assess every webhook handler — both incoming (receiving events from external services) and outgoing (sending events to external endpoints).

Step 1: Inventory incoming webhook handlers

Search for:

Step 2: Assess each incoming webhook handler

For each handler, check:

| Check | Why it matters | What to look for | |-------|---------------|-----------------| | Signature validation | Without it, anyone can send fake events. Impersonating a payment success webhook = free products. | HMAC verification, signature header check, Svix validation. If missing: CRITICAL security risk. | | Quick acknowledgment | Webhook senders expect a 200 within 5-30 seconds. Long processing = timeout = retry = duplicate delivery. | Does the handler return 200 immediately and process in the background (queue, async, scheduled job)? Or does it do all processing synchronously before responding? | | Idempotency | Webhooks are retried. The same event WILL be delivered 2-3 times. | Is there a deduplication check? (Store processed event IDs, check before processing.) Without it: double charges, double emails, duplicate records. | | Event ordering | Events can arrive out of order. "Payment succeeded" might arrive before "payment created." | Does the handler assume a specific order? Does it handle receiving events for resources it hasn't seen yet? | | Error handling | If processing fails, is the failure visible? Can it be retried? | What happens if the handler throws? Is the error logged? Is there a dead letter mechanism? Or is the event just lost? | | Payload validation | Webhook payloads change over time. New fields appear, formats evolve. | Is the payload validated/parsed with a schema? Or does the code blindly destructure and crash on unexpected shapes? |

Step 3: Inventory outgoing webhooks/callbacks

If the application sends webhooks or event notifications to external endpoints:

Step 4: Produce the Webhook Assessment Table

For each webhook handler: Endpoint | Direction (In/Out) | Source/Destination | Signature Validated? | Quick Ack? | Idempotent? | Order Handling | Error Recovery | Rating (Solid / Partial / Vulnerable)

Assess whether the application respects external service rate limits and manages its own API consumption.

Step 1: Document known rate limits for each external service

For each service in the inventory:

If you can't determine the tier/plan, note it as unknown and still document the limits.

Step 2: Find rate-limit-vulnerable code patterns

Search for code that could accidentally hit rate limits:

Step 3: Assess rate limit handling in code

For each external call:

Step 4: Quota monitoring assessment

Step 5: Batch endpoint opportunities

For each external service, check whether batch/bulk endpoints exist that the code isn't using:

Calculate the potential improvement: "Currently making 100 individual calls (100 API quota units, ~10 seconds total latency). Batch endpoint could do this in 1 call (1 quota unit, ~0.5 seconds)."

Good finding: "The bulk user import in admin/import.ts iterates through a CSV file and calls sendgrid.send() per row with no throttling. A 5,000-user import would make 5,000 API calls in under a minute. SendGrid's free tier allows 100 emails/day. The paid tier allows 100/second but the code doesn't batch or throttle. On a large import, this will hit rate limits after ~100 calls, and the remaining ~4,900 emails will fail with 429 errors that are caught by a generic catch(err) and silently dropped. SendGrid has a batch send endpoint (/v3/mail/send with personalizations array) that could handle all 5,000 in ~5 calls."

Bad finding: "Rate limiting might be an issue for some API calls."

Audit how external service credentials are stored, scoped, and managed.

Step 1: Credential storage audit

For each external service:

Step 2: Credential scoping audit

For each set of credentials:

Step 3: Credential lifecycle audit

Step 4: Credential exposure audit

Search for credentials leaking into observable locations:

Step 5: Environment configuration audit

Good finding: "The Stripe API key is read from STRIPE_SECRET_KEY at the time of first use (payments/stripe.ts:12), not at startup. If the environment variable is missing, the application starts successfully and serves all non-payment routes. The first payment attempt crashes with Error: No API key provided — a confusing error message. Adding startup validation would catch this immediately."

Bad finding: "Environment variables should be validated."

Step 6: Produce the Credential Safety Table

For each service: Service | Credential Type | Storage Location | In Version Control? | Properly Scoped? | Separate per Env? | Rotatable without Downtime? | Logged/Exposed Anywhere? | Issues

Assess whether external integration health is monitored — can you detect when an integration is degraded before users report it?

Step 1: Per-service monitoring audit

For each external service in the inventory:

| Monitoring aspect | What to check | |-------------------|--------------| | Latency tracking | Are external call response times measured and recorded? (Histogram, percentile tracking, APM integration) | | Error rate tracking | Are external call errors counted? Is there spike detection? Can you see "SendGrid error rate jumped from 0.1% to 15% at 3:42 AM"? | | Availability tracking | Is there monitoring that detects "this service is down"? (Separate from error rate — a service returning 503 is "up but broken") | | Alerting | Are there alerts when an external service degrades? Who gets alerted? How quickly? | | Dashboards | Can you see the health of all external integrations in one place? |

Step 2: Logging quality for external calls

For each external call:

Step 3: Health check assessment

Step 4: Incident diagnosis capability

Answer this question for the overall system: "If a user reports 'checkout is broken,' can you determine within 5 minutes which external service is causing the issue?"

Check for:

Step 5: Alerting threshold assessment

For services that do have monitoring:

Step 6: Produce the Monitoring Assessment Table

For each service: Service | Latency Tracked? | Error Rate Tracked? | Alerting Configured? | Alert Thresholds Appropriate? | Log Quality | Health Check Included? | Can Diagnose Failures? | Runbook Exists? | Rating (Observable / Partially Observable / Blind)

Assess whether the application properly separates critical-path integrations from non-critical ones. Failure of analytics should never block checkout.

Step 1: Map external calls to request paths

For each user-facing request path (API endpoint, page load, user action):

Step 2: Find non-critical services blocking critical paths

This is one of the most impactful findings in this entire audit. Look for:

Step 3: Find missing circuit breakers / bulkheads

For critical services:

Step 4: Application startup dependency analysis

Check what happens during application startup:

Step 5: Graceful degradation assessment

For each external service integration, assess whether the application has a degradation strategy:

| Strategy | Example | When to use | |----------|---------|-------------| | Queue for later | Email fails → add to retry queue → send when service recovers | Any async notification or non-time-critical operation | | Fallback to simpler method | Search service down → fall back to database LIKE query | When a less-capable alternative exists | | Cached results | AI recommendation service down → show last-cached recommendations | When stale data is better than no data | | Skip gracefully | Analytics service down → skip tracking, continue with request | When the feature is truly optional | | Informative error | Payment service down → "We can't process payments right now, please try again in a few minutes" | When there's no fallback but the user needs to know | | None (crash/hang) | Service down → user sees 500 or request hangs | This is the failure you're trying to eliminate |

Classify each integration by its current degradation strategy and whether a better one is feasible.

Good finding: "The order confirmation endpoint in api/orders/confirm.ts synchronously awaits three external calls in sequence: Stripe charge (critical), SendGrid confirmation email (non-critical), and Segment analytics event (non-critical). If SendGrid is down, the user's payment has already been charged but they see a 500 error and think the order failed. The email and analytics calls should be queued asynchronously — they are not needed to confirm the order."

Bad finding: "Some non-critical calls might be blocking."

Apply safe, mechanical fixes for issues identified in Phases 1-10. Each fix must be individually tested and committed.

Safe to fix — apply these:

Category 1: Missing timeouts (Highest priority)

Add connection and response timeouts to every external call that lacks them.

// BEFORE — dangerous: will hang indefinitely if Stripe is down
const charge = await stripe.charges.create({ amount, currency });

// AFTER — safe: will throw after 30 seconds
const charge = await stripe.charges.create(
{ amount, currency },
{ timeout: 30000 }
);
Category 2: Error handling specificity

Replace generic catch blocks with error-type-specific handling for critical-path external calls.

// BEFORE — generic: every error returns the same thing
try {
await processPayment(amount);
} catch (err) {
return res.status(500).json({ error: 'Payment failed' });
}

// AFTER — specific: different errors get different handling
try {
await processPayment(amount);
} catch (err) {
if (err.type === 'StripeCardError') {
return res.status(400).json({ error: err.message }); // "Your card was declined"
}
if (err.type === 'StripeRateLimitError') {
logger.warn('Stripe rate limited', { err });
return res.status(503).json({ error: 'Payment service busy, please try again' });
}
if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
logger.error('Stripe unreachable', { err });
return res.status(503).json({ error: 'Payment service temporarily unavailable' });
}
logger.error('Unexpected payment error', { err });
return res.status(500).json({ error: 'An unexpected error occurred with payment processing' });
}
Category 3: Webhook signature validation

Add signature validation to any incoming webhook handler that accepts unvalidated payloads.

Category 4: Rate limit awareness

Add 429 handling with backoff to external calls that currently ignore rate limit responses.

Category 5: Non-critical path separation

Move non-critical external calls off the critical path where it's straightforward and safe.

Only apply this when:

Category 6: Logging improvements

Add structured logging to external calls that currently have no observability.

// Example: structured log for an external call
const start = Date.now();
try {
const result = await stripe.charges.create({ amount, currency });
logger.info('External call succeeded', {
service: 'stripe',
operation: 'charges.create',
duration_ms: Date.now() - start,
status: 'success',
});
return result;
} catch (err) {
logger.error('External call failed', {
service: 'stripe',
operation: 'charges.create',
duration_ms: Date.now() - start,
status: 'error',
error_type: err.type,
error_code: err.code,
error_message: err.message,
// Do NOT log: err.raw, full request body with card numbers, etc.
});
throw err;
}
Category 7: Missing startup validation

If external service configuration (API keys, base URLs, required environment variables) is missing and the application starts successfully but fails at runtime when the variable is first needed, add startup validation.

Verification step for all fixes:

After applying all fixes:

Document only — do NOT fix:

Create audit-reports/ in project root if needed. Save as audit-reports/33_EXTERNAL_INTEGRATION_REPORT_[run-number]_[date]_[time in user's local time].md, incrementing run number based on existing reports.

| Service | SDK/Client | Version | Criticality | Operations | Credential Storage | Data Sensitivity | Actively Maintained? |

| Service | Outage Behavior | Latency Behavior | Unexpected Response Behavior | Cascading Impact? | Fallback? | Resilience Rating |

| Service | Connection Timeout | Response Timeout | Appropriate? | Pool Config | TLS Verified? | Issues |

| Location | Service | Error Types Distinguished? | Per-Type Handling? | User Message | Logged? | Leaked? | Rating |

| Location | Service | Retries? | Backoff? | Jitter? | Idempotent? | Idempotency Key? | Issues |

| Endpoint | Direction | Service | Signature Validated? | Quick Ack? | Idempotent? | Order Handling | Error Recovery | Rating |

| Service | Known Limits | Client-Side Limiting? | 429 Handling? | Batch Endpoints Used? | Vulnerable Patterns | Rating |

| Service | Credential Type | Storage | In VCS? | Scoped? | Per-Environment? | Rotatable? | Exposed? | Issues |

| Service | Latency Tracked? | Error Rate? | Alerts? | Log Quality | Health Check? | Diagnosable? | Rating |

| Endpoint/Action | External Services Called | Critical Path? | Async? | Non-Critical Blocking Critical? | Issues |

| File | Change Description | Category | Tests Pass? | Commit Hash |

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
