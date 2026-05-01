# Message Quality Audit

You are running an overnight logging and error message quality audit. Your job: ensure that when things go wrong — in production at 3am, or for a confused user — messages actually help people understand what happened and what to do.

Work on branch `message-quality-[date]`.

---

## Global Rules

- Run tests after every batch of changes. Never change business logic or control flow — only message content.
- Match the existing tone/voice of the product's best messages. Consistency > your preference.
- If the project uses i18n, update translation keys/files — don't hardcode strings that bypass the translation layer.
- Sensitive data in logs is a compliance emergency. Fix these FIRST regardless of phase.
- Commit messages: `copy: improve error messages in [module]` (user-facing) or `logging: improve log quality in [module]` (dev-facing).

---

## Phase 1: User-Facing Error Message Audit

### Step 1: Find every user-facing error message

Search the entire codebase: API error responses, form validation, empty states, not-found pages, permission denied, payment errors, upload errors, notifications/emails, CLI output, modals, fallback/offline states.

### Step 2: Evaluate against these criteria

- **Specific?** "Something went wrong" → useless. "We couldn't save your changes because the file exceeds the 10MB limit" → actionable.
- **Tells user what to do next?** Every error should either: (a) explain how to fix it, (b) say to retry and when, or (c) say how to get help.
- **Blame-free?** Never blame the user. "You entered an invalid date" → "Please enter a date in MM/DD/YYYY format."
- **Consistent tone?** No mixing "We're sorry" with "Error: constraint violation." Same voice, formality, and technical level throughout.
- **No leaked internals?** No DB errors, stack traces, file paths, internal field names, or raw third-party service names ("Stripe error" → "Payment processing error").
- **Accessible?** No color-only indicators, messages announced to screen readers (ARIA), plain language.

### Step 3: Fix — priority order

1. **Leaked internals** (UX + security problem)
2. **Critical-path messages** (signup, login, checkout, core workflow)
3. **Generic/unhelpful messages** on common error paths
4. **Tone/consistency** alignment
5. **Accessibility** fixes

Rewrite each to be specific, actionable, and blame-free. Improve centralized error handlers where applicable.

### Step 4: Create `docs/ERROR_MESSAGES.md`

Table: | Location | Trigger | Current Message | Improved Message | Status |

Group by feature. Include a **Message Style Guide** section: voice/tone conventions, structure template (`[What happened] + [Why] + [What to do]`), words to avoid, standard phrases for common situations.

---

## Phase 2: Developer-Facing Log Message Audit

### Step 1: Inventory all log statements

Find every `console.log`, `console.error`, `logger.*`, etc. Categorize by: log level, location, context provided, and whether it's on a hot path.

### Step 2: Evaluate log levels

- **ERROR/FATAL**: Unexpected failures needing human attention, data integrity risks, unhandled exceptions. NOT expected conditions (user not found, invalid input).
- **WARN**: Degraded operation, approaching limits, deprecated paths hit, recoverable unusual conditions.
- **INFO**: Significant operation completions, lifecycle events, state changes. NOT per-request noise.
- **DEBUG**: Detailed diagnostics for development only. Never enabled in production by default.

Flag: `console.log` used for errors, expected conditions as ERROR (alert fatigue), important events as DEBUG (invisible in prod), verbose hot-path logging at INFO.

### Step 3: Evaluate log message quality

Each log message should:

- **Answer "what happened"** with specifics — Bad: `"Error in processOrder"` → Good: `"Failed to process order=${orderId}: insufficient stock for SKU=${sku}"`
- **Include identifying context** — relevant IDs (user, request, resource, session)
- **Include operational context** — what the system was trying to do, what went wrong, input/trigger, system state
- **Be actionable without reading source code** — an on-call engineer at 3am should understand severity, affected user, failed operation, and likely cause
- **Avoid noise** — no logging inside hot loops (aggregate/sample instead), no redundant messages, no large object dumps, no happy-path noise
- **Avoid sensitive data** — no passwords, tokens, full card numbers, PII, API keys, session tokens, or raw user input that may contain PII

### Step 4: Fix — priority order

1. **Sensitive data in logs** (compliance emergency)
2. **Error-level logs with no context** (incident response)
3. **Misleveled logs** (alert fatigue + prod debuggability)
4. **Missing logs on critical operations**
5. **Log noise** removal/downleveling

Rewrite to include: operation, entity with IDs, what happened, relevant state. Use structured format if the project does.

### Step 5: Document infrastructure gaps (don't implement)

Note gaps in: structured logging, log correlation/request IDs, log aggregation, hot-path sampling, centralized redaction framework. Reference any existing audit reports.

---

## Phase 3: Error Handler & Error Boundary Audit

### Step 1: Find all error handlers

Map every error boundary: global middleware, per-route handlers, React error boundaries, background job handlers, WebSocket handlers, cron handlers, startup error handling.

### Step 2: Evaluate each handler

- **Differentiates error types?** Validation (400), auth (401), authz (403), not found (404), conflict (409), internal (500) — bad handlers treat everything as 500.
- **Logs fully, responds safely?** Full error + stack trace + context in logs; sanitized user-friendly message to client.
- **Includes reference ID?** Error responses should include a request/correlation ID the user can give to support.
- **Handles expected errors gracefully?** Validation failures and not-found shouldn't trigger alerts, log at ERROR, return 500, or include stack traces.

### Step 3: Fix handlers

Improve error type differentiation, add reference IDs, ensure expected errors don't pollute monitoring, ensure unexpected errors log fully but respond safely.

---

## Phase 4: Consistency & Standardization

1. **Error codes**: Does the project use machine-readable codes (`CARD_DECLINED`, `EMAIL_TAKEN`)? If yes, are they consistent and complete? If no, document the value of adding them.
2. **Log format**: Consistent field names (`userId` vs `user_id` vs `uid`)? Consistent timestamps? Single logging library or a mix?
3. **Standardize**: Align field names, replace raw `console.*` with the project logger, add missing error codes.

---

## Output

Save as `audit-reports/23_LOGGING_ERROR_MESSAGE_QUALITY_REPORT_[run-number]_[date]_[time in user's local time].md`. Increment run number based on existing reports.

### Report Structure

1. **Executive Summary** — counts of messages audited/improved/remaining, sensitive data exposure instances, error handlers audited/improved
2. **User-Facing Error Messages** — tables for: leaked internals fixed, critical-path improvements, generic messages replaced, messages still needing work. Reference `docs/ERROR_MESSAGES.md`.
3. **Sensitive Data in Logs (CRITICAL)** — every instance found: | File | Line | Data Type | Fix |. State explicitly if none found.
4. **Log Level Corrections** — misleveled logs fixed: | File | Line | Was | Now | Reason |
5. **Log Message Quality Improvements** — context-poor messages improved, critical operations with logging added, noise removed
6. **Error Handler Assessment** — handler inventory: | Handler | Location | Differentiates? | Logs Properly? | Has Reference ID? | Sanitizes? |. Handlers improved with fixes applied.
7. **Consistency Findings** — error code coverage, log format assessment, standardization changes
8. **Logging Infrastructure Recommendations** — structured logging, redaction framework, correlation, conventions for new code
9. **Bugs Discovered** — cases where investigating messages revealed actual bugs (swallowed errors, incorrect status codes, hidden failures)

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
