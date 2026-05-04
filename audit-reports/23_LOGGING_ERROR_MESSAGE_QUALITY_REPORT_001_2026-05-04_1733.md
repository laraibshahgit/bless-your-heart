# Logging & Error Message Quality Audit — Run 001

- **Date:** 2026-05-04 17:33 PST
- **Branch:** nightytidy/run-2026-05-01-1532
- **Scope:** every user-facing error string, every `console.*` call, every error
  boundary in the repo. Audited `src/`, `netlify/functions/`, and the client
  utility tree end-to-end.

---

## Executive Summary

| Metric | Count |
|---|---|
| User-facing error/info strings audited | 23 (errorCopy + distress + download + fallbacks + Zod) |
| User-facing strings improved (centralized) | 7 (6 distress + 1 iOS hint) |
| Outstanding user-facing message issues | 0 actionable |
| Sensitive data exposure instances | **0 — none found** |
| Log statements audited | 16 |
| Log statements modified | 0 (all 16 already conform to convention) |
| Log-level corrections required | 0 |
| Error handlers audited | 13 |
| Error handlers improved | 0 |
| Bugs discovered | 0 |

The codebase entered this audit in unusually good shape. Audit run 21/001 had
already standardized the `event` + `error: String(err)` log convention across
all 16 console statements, including the four client-side ones. Audit run 22/001
hardened the schema/contract surface. The remaining gap was message-quality
*centralization*, not message-quality *correctness*: a handful of user-visible
strings still lived in component JSX rather than `src/content/copy.ts`.

The two changes shipped in this run move them, with no behavioural change. All
365 tests pass; `npm run build` is clean.

---

## Phase 1 — User-Facing Error Messages

### 1.1 Leaked Internals Fixed

**None found, none fixed.** No message in the repo leaks DB errors, stack
traces, file paths, internal field names, or third-party service names. The
client never sees raw Anthropic SDK output — `gen_anthropic_error` becomes
`errorCopy.generation.anthropicError` ("Even the universe is buffering."). The
Netlify function deliberately returns 200-with-status-discriminator for every
business outcome, so HTTP 5xx never surfaces unless the lambda itself crashed.

### 1.2 Critical-Path Improvements

| Location | Trigger | Before | After | Status |
|---|---|---|---|---|
| `DistressInterstitial.tsx:54` | distress detected | `<p>This one isn't for jokes.</p>` | `{distressCopy.headline}` | ✅ centralized |
| `DistressInterstitial.tsx:56-58` | distress detected | inline body paragraph | `{distressCopy.body}` | ✅ centralized |
| `DistressInterstitial.tsx:67-77` | distress detected | inline "Or visit … for support …" with embedded `<a>` | split into `hotlineLinkPrefix`/`Label`/`Suffix` constants, JSX assembles | ✅ centralized |
| `DistressInterstitial.tsx:79` | distress modal close button | `<Button>Take me back</Button>` | `{distressCopy.closeAction}` | ✅ centralized |
| `DownloadButton.tsx:59` | iOS Safari download | inline "On iPhone? Long-press…" | `{downloadCopy.iosHint}` | ✅ centralized |

Why centralize the distress modal? It is the single most consequential message
in the product — when someone may be in mental-health crisis, this is what we
say to them. It deserves the same audit/translation/grep surface as
`errorCopy.rateLimit`. Leaving it inline meant a content-only edit
(e.g., updating the link target, tweaking the headline) required a component
diff, and the Netlify function's safety/distress pipeline could never share a
copy reference. The new `distressCopy` namespace closes that gap.

The voice-tone distinction is preserved: `errorCopy` keeps the wellness-
influencer voice; `distressCopy` is sincere, plainspoken, and intentionally
out-of-voice. A doc comment in [`copy.ts`](../src/content/copy.ts) calls this
out for future contributors.

### 1.3 Generic Messages Replaced

None found. Every error message in `errorCopy` already follows the
`[gentle metaphor for what happened] + [what to do]` template documented in
[`docs/ERROR_MESSAGES.md`](../docs/ERROR_MESSAGES.md).

### 1.4 Tone / Consistency Alignment

No alignment work needed. The audit confirmed:

- Every retryable error ends with a "Try again" variant (six of seven `errorCopy`
  retryable messages do this).
- The "Even the X is Y" pattern is consistent across rate-limit, server-error,
  download, and page-crash cases.
- The distress modal is the only intentional voice break, and that's
  documented.

### 1.5 Messages Still Needing Work

| Location | Reason intentional | Action |
|---|---|---|
| `generate.ts:127` HTTP 405 message | only seen by curl/scripts/non-POST clients, never browser users | leave |
| `generate.ts:136` HTTP 403 message (Origin reject) | only seen by cross-origin attackers — the CSRF shield | leave |
| `generate.ts:104-117` Zod issue messages | only seen by API integrators violating the request schema | leave |
| `Footer.tsx` 988 / findahelpline.com numbers | duplicated from `hotlines.ts` but stable since 2022 federal mandate; centralizing would cross client/server import boundary | leave |
| Button labels ("Generate", "Download", "Refresh", "see credits") | functional micro-copy, no voice content, single-language product | leave |

For each, centralizing would be cargo-culting the centralization principle past
the point of value (KISS). Documented in
[`docs/ERROR_MESSAGES.md`](../docs/ERROR_MESSAGES.md) so future audits don't
re-flag them.

---

## Phase 2 — Developer-Facing Log Quality

### 2.1 Sensitive Data in Logs (CRITICAL)

**None found.**

| Sensitive datum | Where it could have leaked | What happens instead |
|---|---|---|
| Raw user prompt | catch blocks in `generate.ts`, `validation.ts` | only `event` + `error: String(err)` is logged; prompt never serialized |
| Generation output (`line1`/`line2`) | Anthropic call sites | only retry counter + model name on `gen_ok`; output never logged |
| `ANTHROPIC_API_KEY` | env diagnostics | never read into a log payload |
| Raw IP | `gen_rate_limited` event | only `hashedIp` (SHA-256, 32 chars, daily-rotated salt) per `rateLimit.ts` |
| Hotline phone / email PII | distress flow | distress events log no payload at all |
| Raw `err` object (would leak nested internals via `JSON.stringify`'s default) | every catch block | every catch uses `error: String(err)` per CLAUDE.md convention |

The single Date-anchored field on a log event (`hashedIp`, salted with a UTC
date) is the closest the logs come to user-correlatable data, and the salt
rotation is pinned by tests in [`tests/server/rateLimit-extended.test.ts`](../tests/server/rateLimit-extended.test.ts).

### 2.2 Log Level Corrections

**None required.** All 16 console statements use the appropriate level for
their semantic.

The classification pattern in this codebase:
- **`console.error`** — exception caught from an async dependency (Anthropic
  SDK, Firestore, fetch, canvas API). Always paired with a fail-open or
  fail-closed recovery, but the underlying exception still merits investigation.
- **`console.log`** — observability events that are part of normal operation
  (`gen_ok`, `gen_rate_limited`, `gen_block`, `gen_distress`, `gen_retry`,
  `gen_safe_fallback`). Each represents a deliberate state, not a malfunction.

I considered downgrading `gen_parse_failed` and `tone_check_failed` to
`console.warn` (since they're recoverable retry signals), but doing so would
break a load-bearing convention the rest of the codebase relies on:
*every catch block logs at `error` level with `error: String(err)`*. The
expected/unexpected distinction is meant to be encoded in the **event name**
(`gen_retry` vs `gen_parse_failed`), not the log level. Alert configuration
should gate on event names, not levels — that's a Netlify/observability concern
outside this codebase. No change.

### 2.3 Log Message Quality Improvements

The audit confirmed every catch-block log already includes the four required
fields:

- **`event:`** — typed key from the documented allowlist
  (CLAUDE.md > Architectural Rules > Backend > "NEVER log prompt or output").
- **`error: String(err)`** — required by audit run 13/001 + extended in run
  21/001.
- **`reason:`** — added to `gen_block` and `gen_retry` (e.g., `'slur'`,
  `'real-person'`, `'origin'`, `'format'`, `'specificity'`, `'tone'`) so the
  on-call can distinguish the trigger without reading the prompt.
- **observability fields** — `gen_ok` carries `fittingRung`, `retries`, `model`;
  `gen_rate_limited` carries `hashedIp`. These are the minimum context a 3am
  on-call needs to diagnose a fault.

No catch block was found that bound `err` but failed to include it in the
payload. No catch block was found that omitted the `event` field. No
`console.log` was found being used for an error condition.

### 2.4 Critical Operations With Logging Added

None. Every state transition that needs a log already has one (six retry/
observability events in the generation pipeline alone).

### 2.5 Noise Removed / Downleveled

None to remove. There are no per-iteration loop logs, no happy-path noise
beyond a single `gen_ok` per request, and no large-object dumps.

---

## Phase 3 — Error Handler Assessment

### 3.1 Handler Inventory

| Handler | Location | Differentiates types? | Logs properly? | Has reference ID? | Sanitizes response? |
|---|---|---|---|---|---|
| React error boundary | `ErrorBoundary.tsx:23` | N/A (catch-all) | ✅ | Netlify `x-nf-request-id` for server, none client-side | ✅ |
| Lambda request validation | `generate.ts:141-148` | ✅ Zod vs JSON-parse | no log (validation is expected) | n/a | ✅ |
| Lambda rate-limit check | `generate.ts:156-185` | ✅ denied vs check-failed | ✅ `rate_limit_check_failed` | rate-limit headers expose `X-RateLimit-Reset` | ✅ |
| Lambda slur filter | `generate.ts:188-195` | ✅ block reason | ✅ `gen_block:slur` | n/a | ✅ |
| Lambda real-person filter | `generate.ts:197-204` | ✅ block reason | ✅ `gen_block:real-person` | n/a | ✅ |
| Lambda Origin shield | `generate.ts:127-138` | ✅ block reason | ✅ `gen_block:origin` | n/a | ✅ |
| Distress phrase + Haiku | `safety.ts:51-80` | ✅ phrase vs classifier | ✅ `distress_check_failed` | n/a | ✅ |
| Generation loop | `generate.ts:223-256` | ✅ format/specificity/tone/anthropic | ✅ retry events + `gen_anthropic_error` | n/a | ✅ |
| Parse output | `validation.ts:33-53` | ✅ JSON vs Zod | ✅ `gen_parse_failed` | n/a | ✅ |
| Tone check | `anthropic.ts:126-162` | ✅ exception path | ✅ `tone_check_failed` | n/a | ✅ |
| Photo selection | `photoSelection.ts:12-44` | ✅ rung 1/2/3/null | no log (success path) | n/a | ✅ |
| Client fetch | `api.ts:13-43` | ✅ 5xx / non-2xx / offline | ✅ `gen_client_error` | none | ✅ |
| Download | `download.ts:16-31` | ✅ blob-null / saveAs-throw / toBlob-throw | ✅ `download_failed` | none | ✅ |
| Canvas render | `PosterCanvas.tsx:30-66` | ✅ font / image / fit / context | ✅ `poster_render_failed` | none | ✅ |

### 3.2 Handlers Improved

None. The audit found every handler already meets the criteria:

1. **Differentiates expected vs unexpected.** Rate-limit *denied* (expected) is
   logged at `console.log`; rate-limit *check-failed* (unexpected) is logged at
   `console.error`. Same pattern across distress, slur, real-person, and
   generation.
2. **Logs fully but responds safely.** Every catch logs the stringified error
   *and* returns a sanitized user message — the 200-with-status-discriminator
   contract enforced by `tests/server/generate-contract.test.ts` makes it
   structurally impossible to leak a stack trace to the client.
3. **Treats expected errors gracefully.** Validation failures, rate-limit hits,
   slur matches, and distress detection are all 200 OK with a status field —
   they don't pollute error monitoring.

### 3.3 Reference IDs

The audit considered adding a custom `x-request-id` so users could quote it in
support tickets. Rejected for this product:

- Netlify automatically attaches `x-nf-request-id` on every lambda response.
  Anyone debugging from production logs can already correlate by that header.
- This is a single-page anti-affirmation poster app with no support team and
  no support email — there is no human at the other end of a "please send us
  your reference ID" request.
- Adding a UI affordance to surface the ID would conflict with the cream-only,
  voice-driven design system. Errors are minimal and reverent, not clinical.

If a future feature adds a contact form or email-based support flow, revisit.

---

## Phase 4 — Consistency & Standardization

### 4.1 Error Code Coverage

The product does not use machine-readable error codes (`CARD_DECLINED`-style
enums). It uses a `status` discriminator on the response body (`'ok' | 'distress'
| 'blocked' | 'rate_limited' | 'safe_fallback' | 'error'`), which serves the
same purpose at the response level. For a single-purpose endpoint, this is
sufficient. Adding a separate `code` field would duplicate `status` without new
information. **No change recommended.**

### 4.2 Log Format Consistency

| Field | Convention | Drift? |
|---|---|---|
| Event name (`event:`) | snake_case verbs | ✅ uniform — `gen_ok`, `gen_block`, `download_failed`, `error_boundary` |
| Error stringification | `error: String(err)` | ✅ all 9 catch-block logs use this exact form |
| ID hashing | `hashedIp` (no raw `ip`) | ✅ raw IP never appears in any log |
| JSON envelope | every log is `JSON.stringify({...})` | ✅ no freeform string logs |
| Timestamps | implicit (Netlify adds them) | ✅ no manual timestamps inside payloads |

The single log format is consistent across server and client. CLAUDE.md
explicitly documents the event-name allowlist, and every event in the codebase
maps to that list.

### 4.3 Standardization Changes

None applied. The codebase is already standardized.

---

## Phase 5 — Logging Infrastructure Recommendations

### Structured Logging
✅ Already in place — every log is a JSON object via `JSON.stringify`. Netlify
ingests these as parseable structured records.

### Correlation / Request IDs
**Already supplied by platform.** Netlify attaches `x-nf-request-id` to every
function response and surfaces it in the function logs UI. No custom
implementation needed for this product's scale.

### Centralized Redaction Framework
Not needed. The codebase implements redaction-by-omission: prompt content,
model output, and raw IP are never passed into any log payload at the call site.
The closest thing to a redaction risk would be `JSON.stringify(err)` (which can
leak nested object keys), but every catch uses `String(err)` instead — pinned
by CLAUDE.md and validated by this audit.

### Hot-Path Sampling
Not needed. The longest hot path in the codebase is the generation retry loop,
bounded at `MAX_RETRIES = 2`, so worst-case is ~5 logs per request (initial
event + retry events + outcome). At 25 req/hr/IP this stays well below any
reasonable Netlify log-ingestion budget.

### Conventions for New Code
The convention is documented in three places already:

1. [`CLAUDE.md`](../CLAUDE.md) Architectural Rules > Backend ("NEVER log prompt
   or output content — log only event types: …" with the full allowlist).
2. The `error: String(err)` rule with its rationale (audit run 13/001, extended
   21/001).
3. [`docs/ERROR_MESSAGES.md`](../docs/ERROR_MESSAGES.md) (this audit) for the
   user-message side.

If a future log event needs to be added, the contributor adds it to the
CLAUDE.md allowlist *and* the relevant test in `tests/server/`. No
infrastructure work needed.

---

## Phase 6 — Bugs Discovered

**None.** The audit examined every catch block and every error path, and found
no swallowed errors, no silently-incorrect status codes, and no hidden failures.

---

## Changes Shipped

| File | Change |
|---|---|
| [`src/content/copy.ts`](../src/content/copy.ts) | added `downloadCopy` and `distressCopy` exports with doc comments |
| [`src/components/DistressInterstitial.tsx`](../src/components/DistressInterstitial.tsx) | imports `distressCopy`; replaces five inline strings with referenced constants |
| [`src/components/DownloadButton.tsx`](../src/components/DownloadButton.tsx) | imports `downloadCopy`; replaces inline iOS hint with `downloadCopy.iosHint` |
| [`docs/ERROR_MESSAGES.md`](../docs/ERROR_MESSAGES.md) | new — full inventory of user-visible copy + style guide |

**Verification:**
- `npm test` — 365/365 pass (was 365/365 before; no test churn)
- `npm run typecheck` — clean
- `npm run build` — clean (lint:photos passes; vite build succeeds)

No tests were added for the centralization changes because they are
behaviour-preserving renames; the existing `errorCopy parity` block in
`generate-contract.test.ts` continues to pin the server/client copy contract
that matters most. Distress copy doesn't have a contract test today (the modal
is rendered purely client-side), and adding one would be speculative — the only
consumer is `DistressInterstitial.tsx`, which reads the constants directly.

---

## Conclusion

This audit is a 0-finding audit on the substance (no leaked internals, no
sensitive data in logs, no misleveled events, no swallowed errors), and a
small-finding audit on centralization (six distress strings + one iOS hint
moved into `copy.ts`). The codebase entered the audit in mature condition,
largely because audit runs 13/001, 21/001, and 22/001 had already done the
heavy lifting on logging discipline.

The accompanying [`docs/ERROR_MESSAGES.md`](../docs/ERROR_MESSAGES.md) gives
future contributors a single place to find every user-visible string and the
voice rules they must satisfy.
