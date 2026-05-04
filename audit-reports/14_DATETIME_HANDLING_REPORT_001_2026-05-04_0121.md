# 14 — Date/Time Handling Audit (Run 001)

- **Date**: 2026-05-04 01:21 (user local) / branch: `nightytidy/run-2026-05-01-1532`
- **Mode**: implementation (read codebase, apply mechanical fixes, document conventions)

---

## 1. Executive Summary

**Health rating: SOLID.** Bless Your Heart has the smallest date/time surface I have ever audited in a working web application: zero third-party date libraries, exactly one `new Date()` call (UTC-anchored, well-commented), one `Timestamp.now()` call, and zero user-facing date displays. The full test suite (351 tests across 27 files) passes identically under `TZ=UTC`, `TZ=America/Los_Angeles`, `TZ=Asia/Kolkata`, and `TZ=Pacific/Auckland` — empirical proof that the code is genuinely timezone-independent.

The audit found **zero correctness bugs** and **one minor coverage gap** (now closed): the `expiresAt` field that drives Firestore TTL auto-delete had no test pinning the contract `expiresAt = windowStart + 1 hour`. A refactor that dropped or miscalculated that line would silently let the `rateLimits` collection grow forever. Three tests were added to close that gap and pin the counterpart contract that count-increments must NOT slide `windowStart`/`expiresAt`.

The one product behavior worth flagging (not a bug, intentional): at UTC midnight, the daily salt rotation effectively gives every IP a fresh rate-limit window, because the `hashedIp` doc key changes. A user can make 25 requests at 23:59:59 UTC and another 25 at 00:00:01 UTC. This is documented behavior of the daily-salt design, but it does loosen the "rolling hour" contract at the UTC day boundary.

---

## 2. Date/Time Library Inventory

| Library | Version | Import Count | Files | Primary/Legacy | Deprecated? |
|---|---|---|---|---|---|
| native `Date` (V8/Node) | — | 4 src + ~6 test | `src/server/rateLimit.ts`, several test files | Primary | No |
| `firebase-admin/firestore` `Timestamp` | 13.8.0 | 1 src + 4 test | `src/server/rateLimit.ts`, test files | Primary | No |

**No `moment`, `dayjs`, `date-fns`, `luxon`, `@js-joda/*`, or `temporal-polyfill`.** The only `package.json` scan that turned up date-related text was `@fontsource/cormorant-garamond` — which is a typeface, not a date library. No transitive date-library bloat either.

**Why this is good**: every place that needs to handle time uses an explicit, narrow API. There is zero risk of "moment treats this string differently than dayjs" because there is only one tool in use.

---

## 3. Date Creation Inventory

| Location | Code | UTC/Local/Implicit | Purpose | Risk | Fixed? |
|---|---|---|---|---|---|
| `src/server/rateLimit.ts:13` | `new Date().toISOString().slice(0, 10)` | **Explicit UTC** | Daily-rotated salt for IP hash | Safe | n/a (already correct, comment added in pending diff) |
| `src/server/rateLimit.ts:36` | `Timestamp.now()` | **Explicit UTC** (Firestore admin always returns UTC ms) | Rate-limit window start | Safe | n/a |
| `src/server/rateLimit.ts:44, 61` | `Timestamp.fromMillis(nowMs + oneHourMs)` | **Explicit UTC** | Rate-limit `expiresAt` for TTL deletion | Safe | n/a |
| `netlify/functions/generate.ts:128` | `setTimeout(() => reject(...), 3000)` | n/a (duration, not wall clock) | 3s race timeout for Firestore call | Safe | n/a |
| `src/App.tsx:21` | `setTimeout(r, ms)` | n/a (duration) | `sleep(ms)` helper for `LOAD_FLOOR_MS` | Safe | n/a |
| `src/App.tsx:69, 97` | `performance.now()` | n/a (high-res monotonic) | Measure elapsed time for `LOAD_FLOOR_MS` floor | Safe | n/a |
| `src/components/PromptInput.tsx:15, 26` | `setTimeout(...)` | n/a (duration) | 300ms debounce on `sessionStorage` write | Safe | n/a |
| `src/components/DownloadButton.tsx:28, 34` | `setTimeout(...)` | n/a (duration) | 2.5s/3s status reset | Safe | n/a |

**Summary**: 8 total creation/timing points. **All 8 are safe**. The 4 wall-clock points (`new Date`, `Timestamp.now`, `Timestamp.fromMillis`, and `Date.now()` inside test mocks) are all explicitly UTC. The 4 duration points (`setTimeout` × 3, `performance.now`) are timezone-independent by definition.

There is **no code path** in this codebase that:
- Calls `new Date(string)` with a parseable string (no parser-divergence risk)
- Calls `new Date(year, month, day)` (no 0-indexed-month off-by-one risk)
- Calls `getMonth()`, `getDate()`, `getHours()` etc. on a Date (no implicit-server-local risk)
- Performs "add days/months/years" arithmetic (no DST gap/overlap risk)
- Uses `toLocaleDateString()`, `toLocaleTimeString()`, or `Intl.DateTimeFormat` (no locale-divergence risk)
- Reads or writes the `TZ` env var (no test/prod divergence risk)

---

## 4. Storage & Schema Analysis

**Database: Firestore (NoSQL).** Every Firestore `Timestamp` is internally a `(seconds, nanoseconds)` pair anchored to the Unix epoch in UTC — there is no equivalent of SQL's `TIMESTAMP WITHOUT TIME ZONE` ambiguity in Firestore.

Single date-bearing collection in the entire app:

| Collection | Field | Type | Stores | Source of writes | Source of reads |
|---|---|---|---|---|---|
| `rateLimits` | `windowStart` | `Timestamp` | UTC instant of first request in current window | `rateLimit.ts:43, 60` | `rateLimit.ts:55, 71` |
| `rateLimits` | `expiresAt` | `Timestamp` | UTC instant when Firestore TTL should auto-delete the doc (= `windowStart + 1h`) | `rateLimit.ts:44, 61` | Firestore TTL policy (no app-side reads) |
| `rateLimits` | `count` | `number` | Request count in window | `rateLimit.ts:42, 59, 81` | `rateLimit.ts:54, 74` |

**Document key**: `sha256(rawIp + ":" + IP_SALT_BASE + ":" + UTC-YYYY-MM-DD).hex.slice(0, 32)` (see §5).

**Migrations**: `firestore.indexes.json` is empty. There are no SQL migrations because there is no SQL database. Firestore's TTL policy is configured in the Firebase console (one-time setup, not in source) and points at the `expiresAt` field. No migration needed for this audit.

**Dangerous-pattern check** (none found):
- No `VARCHAR(N)` storing dates as strings — all timestamps go through Firestore `Timestamp`.
- No mixed date formats — only one collection, one schema.
- No "stored as Unix seconds vs. milliseconds" mismatch — `Timestamp.fromMillis()` is the only writer.
- No naive `datetime` columns — Firestore `Timestamp` is always UTC-aware.
- No "DB default UTC + app default server-local" mismatch — all writes go through the same `Timestamp.now()` call.

**Server timezone configuration**:
- Netlify Functions run on AWS Lambda, which **defaults to UTC**. The repo never sets `TZ`, so this default is used.
- Multi-region risk **is mitigated by code**: every wall-clock read uses `.toISOString()` or `Timestamp.now()`, both of which return UTC regardless of host TZ. Even if Netlify changed Lambda's default TZ tomorrow, no behavior would change.

---

## 5. Timezone Flow Analysis

### Single traced value: rate-limit window

```
1. Request arrives at Netlify Function (Lambda, TZ=UTC by default)
2. Handler calls hashIp(rawIp):
     date = new Date().toISOString().slice(0, 10)   // "2026-05-04" (UTC)
     salt = `${IP_SALT_BASE}:${date}`
     key  = sha256(rawIp:salt).hex.slice(0, 32)
3. Handler calls checkAndIncrementRateLimit(key):
     - Reads/writes Firestore at rateLimits/{key}
     - windowStart = Timestamp.now()              // UTC
     - expiresAt   = Timestamp.fromMillis(now+1h) // UTC
4. Handler responds with Unix epoch SECONDS:
     resetAt        = Math.floor(windowEndMs/1000)   // UTC seconds since epoch
     retryAfterSec  = Math.ceil((windowEndMs - now)/1000)  // delta seconds
5. Headers:
     X-RateLimit-Reset = String(resetAt)        // epoch seconds (Twitter/GitHub convention)
     Retry-After       = String(retryAfterSec)  // delta seconds (RFC 7231 § 7.1.3)
6. Client (App.tsx): receives `rate_limited` body but uses only result.message;
   resetAt and retryAfterSec are exposed in the wire format but the SPA does not
   currently render a "you can try again at..." countdown. Available for future use.
```

**Conversion points**: zero. The value is born UTC, lives UTC in Firestore, and exits the API as either UTC epoch seconds (`resetAt`) or duration seconds (`retryAfterSec`). The browser never converts.

### User timezone source

**There is no user timezone source.** The app does not display any date or time to the user, so it does not need one. If a future client-side feature wanted to render "you can try again at 3:42 PM your time," it would compute `new Date(resetAt * 1000)` in the browser — at which point the browser's IANA TZ (already known to the user) handles display correctly. No backend action needed today.

### Server timezone

- `process.env.TZ` is NOT set anywhere in `netlify.toml`, `package.json` scripts, or test config.
- Lambda default is `UTC`. The code does not depend on this — see test-suite TZ proof below.

### Test suite TZ sensitivity

Ran the full suite (27 files, 351 tests) under four timezones:

| TZ | Outcome |
|---|---|
| `UTC` | 351/351 pass |
| `America/Los_Angeles` (UTC-8/-7) | 351/351 pass |
| `Asia/Kolkata` (UTC+5:30, half-hour offset) | 351/351 pass |
| `Pacific/Auckland` (UTC+12/+13, crosses date boundary early) | 351/351 pass |

The half-hour offset and the early-day-boundary timezones are the most aggressive stress tests, and both pass identically. **There is no hidden TZ assumption anywhere in the codebase.**

---

## 6. DST & Calendar Edge Cases

| Location | Operation | Type | Edge Case | Current Behavior | Correct Behavior | Risk |
|---|---|---|---|---|---|---|
| `rateLimit.ts:37` | `60 * 60 * 1000` | Fixed-duration constant | DST spring-forward / fall-back | Adds exactly 3600000 ms regardless of wall-clock DST | DST is irrelevant — UTC milliseconds don't have DST | None |
| `rateLimit.ts:13` | `.toISOString().slice(0,10)` | UTC date stamp | Local-time date drift across UTC midnight | Always reports UTC date (e.g. user in `America/Los_Angeles` at 16:00 PT on 2026-05-03 sees `2026-05-04` because 16:00 PT = 00:00 UTC next day) | Intentional — UTC anchoring is the design | None |

**Month/year arithmetic**: not used.
**Leap-year handling**: not used.
**DST spring-forward gap (e.g. `2:30 AM` in spring-forward zones)**: not used.
**DST fall-back overlap (`1:30 AM` happens twice)**: not used.
**End-of-day ambiguity (`23:59:59` vs. `00:00:00` next day)**: not used. The rate-limit window is millisecond-precise UTC and does not deal in calendar boundaries.
**Week boundary (Sunday vs. Monday start, ISO 8601 week numbers)**: not used.

The one edge case that *does* exist:

**Daily salt rotation at UTC midnight ⇒ effective rate-limit reset at the day boundary.** Because `hashIp` includes the UTC date in the salt, every IP gets a brand-new Firestore document at 00:00:00 UTC. A user at the limit at 23:59:59 UTC can immediately make 25 more requests at 00:00:01 UTC (50 requests in 2 seconds total). This is a known consequence of the daily-salt design (a privacy feature: same user, different day, no traceable hash). The CLAUDE.md and `api-and-backend.md` describe the cap as "25/hour rolling per IP" — at the UTC day boundary, the rolling window can be reset early. Not a bug, but worth recording.

If this becomes a concern, two non-mechanical fixes are available (do NOT apply unattended):
- Drop the date from the salt (kills the privacy property — same hash forever for a given IP).
- Use a sliding-window algorithm (more Firestore writes; defeats free-tier budget).

Both involve real product/cost tradeoffs. Recommendation: leave as-is, document the behavior.

---

## 7. Date Comparison & Range Query Analysis

| Location | Code | Issue | Impact | Fixed? |
|---|---|---|---|---|
| `rateLimit.ts:55-57` | `windowAge = nowMs - data.windowStart.toMillis(); if (windowAge > oneHourMs) ...` | Pure UTC ms subtraction | Correct — DST-safe, TZ-safe | n/a |
| `rateLimit.ts:71-72` | `windowEndMs = data.windowStart.toMillis() + oneHourMs; resetAt = Math.floor(windowEndMs / 1000)` | UTC ms → epoch seconds, integer divide | Correct (`Math.floor` rounds down to whole seconds) | n/a |
| `rateLimit.ts:77` | `retryAfterSec = Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000))` | Duration ms → seconds with `Math.max(1)` clamp | Correct — defends against clock-skew negatives and zero-rounding at exact boundary | n/a |

**Precision mismatches**: none. The only millisecond↔second boundary is the deliberate `Math.floor / Math.ceil` pair for HTTP header values. Both round in the right direction (`floor` to give the client a slightly-too-early reset epoch, never a too-late one; `ceil` to ensure `Retry-After` always crosses the actual window expiry).

**Range queries**: zero. There are no Firestore queries with `where('createdAt', '>', ...)` or any other date range — the only Firestore access is `db.collection('rateLimits').doc(hashedIp).get()` (single document by key). No off-by-one BETWEEN-style risks.

**Reference equality on dates**: zero (no `===` between Date objects).

**Relative time ("3 minutes ago") rendering**: not used.

**Timezone-naive comparisons**: zero — all timestamps share the same UTC reference.

---

## 8. API & Display Format Inventory

| Endpoint | Direction | Field | Format | Has TZ? | Consistent? |
|---|---|---|---|---|---|
| `POST /generate` | Response (rate_limited body) | `retryAfterSec` | Integer seconds (delta) | n/a (duration) | Yes |
| `POST /generate` | Response (rate_limited body) | `resetAt` | Integer Unix epoch SECONDS | UTC by definition | Yes |
| `POST /generate` | Response header | `X-RateLimit-Reset` | Integer Unix epoch SECONDS | UTC | Yes — string-cast of `resetAt` |
| `POST /generate` | Response header | `X-RateLimit-Limit` | Integer | n/a | Yes |
| `POST /generate` | Response header | `X-RateLimit-Remaining` | Integer | n/a | Yes |
| `POST /generate` | Response header | `Retry-After` | Integer seconds (delta) — RFC 7231 § 7.1.3 form | n/a | Yes |

**No `Date` objects on the wire**. No ISO 8601 strings. No `Date.toString()`. No `JSON.parse` reviver. No `toLocaleDateString()`. The wire format is **integer seconds only** for time-related fields, which:
- Eliminates string-parser divergence between Node and browsers.
- Eliminates DST/TZ ambiguity.
- Is JSON-safe with no encoding/decoding concerns.

**Display formats**: zero. No date is rendered to a user anywhere in the app. The poster contains text and a photo; the only timing-related UI is loading-state copy (`"Even the universe has a daily limit. Try again in a bit."`), which is a static string, not a formatted date.

---

## 9. Fixes Applied

| File | Change | Category | Tests Pass? | Commit |
|---|---|---|---|---|
| `tests/server/rateLimit-extended.test.ts` | Added 3 new tests pinning the TTL contract: `expiresAt = windowStart + 1h` on initial create, same on window reset, and counterpart that count-increments do NOT touch either field | Coverage gap (TTL contract) | Yes — 351/351 | this audit |
| `src/server/rateLimit.ts` | Comment expanded explaining UTC-anchored daily salt (`.toISOString()` cannot drift by host TZ) | Documentation | Yes | already in pending diff before this audit |
| `tests/server/rateLimit-extended.test.ts` | Pre-existing pending diff: 3 salt-rotation regression tests pinning UTC anchoring | Coverage hardening | Yes | already in pending diff before this audit |

**No source code logic changes were made.** The audit found no behavioral bugs to fix. The TTL test additions are pure coverage hardening — they catch a class of refactor mistake (drop `expiresAt` write, slide it on every increment) that would not be visible until the Firestore quota was exhausted weeks later.

**No migration files were created** (Firestore is schemaless; the TTL policy lives in console config; no SQL exists).

**No tests were marked `// BUG:` or skipped.**

---

## 10. Conventions Document

This is the canonical date/time conventions for Bless Your Heart, derived from the audit findings. Keep this section in sync with `src/server/rateLimit.ts`, `src/types/index.ts`, and the test files above.

### Rule 1 — UTC, always, everywhere

- All wall-clock reads MUST use `Timestamp.now()` (server) or `Date.now()` (utility / test mocks).
- All wall-clock writes MUST use `Timestamp.fromMillis(...)`.
- Any "current date" string MUST be derived from `new Date().toISOString().slice(0, 10)`. **NEVER** use `toLocaleDateString()`, `getDate()`, `getMonth()`, or `getFullYear()` — these read host TZ.
- The repo MUST NOT set `TZ=` in any of: `netlify.toml`, `package.json` scripts, GitHub Actions, dev scripts, test runner config. Tests MUST pass under `TZ=UTC`, `TZ=America/Los_Angeles`, `TZ=Asia/Kolkata`, and `TZ=Pacific/Auckland` (verified 2026-05-04).

### Rule 2 — No date/time on the wire other than integer seconds

- HTTP responses MUST express time as either `epochSeconds: number` (for absolute instants) or `deltaSeconds: number` (for durations).
- Do NOT add ISO 8601 strings (`"2026-05-04T01:21:00Z"`) to API responses unless a future requirement strictly demands them — and if added, the parsing rules MUST be unit-tested.
- HTTP headers: `X-RateLimit-Reset` is epoch seconds (Twitter/GitHub convention). `Retry-After` is delta seconds (RFC 7231 § 7.1.3). Do not switch to HTTP-date form without auditing all clients.
- Math when converting: epoch ms → epoch seconds uses `Math.floor` (round down); duration ms → duration seconds uses `Math.ceil` (round up so the client never asks before the window expires); both clamped with `Math.max(1, ...)` for delta values to handle clock-skew negatives.

### Rule 3 — No date arithmetic beyond fixed-duration constants

- Allowed: `nowMs + oneHourMs`, `windowEndMs - nowMs`, `Math.floor(ms / 1000)`. These are pure ms arithmetic on UTC integers — DST-safe, TZ-safe.
- Disallowed without explicit review: `setDate()`, `setMonth()`, `setFullYear()`, `setHours()`, `getDay()` (week-start ambiguity), and any "add 1 day" / "add 1 month" / "next Monday" pattern. These re-introduce all the calendar/DST/locale risks the codebase currently doesn't have.
- If a future feature genuinely needs calendar arithmetic (e.g. "block IPs for 7 days"), prefer ms arithmetic on UTC instants (`now + 7 * 24 * 60 * 60 * 1000`). If that is wrong (e.g. "block until same time of day, 7 calendar days from now, accounting for DST"), introduce a typed library (`date-fns/utc`) — and add this to the conventions document.

### Rule 4 — Storage = Firestore `Timestamp`, not strings, not ms-numbers

- Date-bearing fields MUST be Firestore `Timestamp` (the SDK type). Do not store ms-since-epoch as a `number`, do not store ISO strings.
- Document fields and their TTL relationship MUST be tested. The pattern: a test for the "writer" side that asserts the on-disk value, and a test for the "non-writer" branch that asserts the field is NOT touched. See `rateLimit-extended.test.ts` "TTL contract" tests.
- TTL policies (Firestore field-level TTL) live in console config, NOT source. Document the field name (`expiresAt`) in `CLAUDE.md` and `api-and-backend.md` so the deploy runbook can verify it.

### Rule 5 — No date display, period, until product asks

- Today the app displays zero dates to users. Adding the first one introduces all the locale/timezone/format-divergence risks the codebase currently doesn't have. Before adding any user-visible date or "X minutes ago" rendering:
  1. Establish a user timezone source (browser-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`).
  2. Use `Intl.DateTimeFormat` for any rendering — not `.toLocaleDateString()` (which uses the *system* locale, not the user's chosen one).
  3. Add tests under at least 3 timezones, including a half-hour-offset one (`Asia/Kolkata`).
  4. Update this section.

---

## 11. Diagnostic Queries

**Run manually after review. Do not execute unattended.** These are read-only Firestore queries (CLI: `gcloud firestore` or admin SDK script) for periodic health checks.

```javascript
// 1. Documents with windowStart > expiresAt — corrupt data (TTL would never fire)
// Expected: 0 docs. Any result indicates a bug in rateLimit.ts.
const snap = await db.collection('rateLimits').get();
const corrupt = snap.docs.filter(d => {
  const data = d.data();
  return data.windowStart && data.expiresAt &&
         data.windowStart.toMillis() > data.expiresAt.toMillis();
});
console.log('Corrupt rows (windowStart > expiresAt):', corrupt.length);
```

```javascript
// 2. Documents where expiresAt - windowStart != 1 hour (3,600,000 ms) — schema drift
// Expected: 0 docs. Any result indicates a writer-side regression.
const snap = await db.collection('rateLimits').get();
const drift = snap.docs.filter(d => {
  const data = d.data();
  if (!data.windowStart || !data.expiresAt) return true;
  const delta = data.expiresAt.toMillis() - data.windowStart.toMillis();
  return delta !== 60 * 60 * 1000;
});
console.log('Schema-drift rows (delta != 1h):', drift.length);
```

```javascript
// 3. Documents older than 24 hours that weren't TTL-deleted — TTL policy unconfigured
// Expected: 0 docs after Firestore TTL ran (~24h grace). Persistent results = TTL not configured.
const snap = await db.collection('rateLimits').get();
const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
const stale = snap.docs.filter(d => {
  const data = d.data();
  return data.expiresAt && data.expiresAt.toMillis() < dayAgoMs;
});
console.log('TTL-leak rows (expiresAt < now-24h, still present):', stale.length);
```

```javascript
// 4. Total document count by approximate UTC day (sanity check)
// Cross-check against the "expected daily users" figure from analytics.
// Documents are keyed by sha256(ip:salt:UTC-day), so the count of distinct
// documents created per UTC day approximates "distinct IPs that hit /generate
// at least once that day".
// Note: this is an approximation — same IP at UTC midnight produces 2 docs.
```

---

## 12. Risk Map

| Likelihood | Impact | Finding |
|---|---|---|
| Low | Low | Daily-salt rotation at UTC midnight effectively resets rate-limit windows. **Documented, intentional.** Worst case: a single user can do ~50 generations in ~2 seconds at the UTC day boundary. Anthropic spend impact: trivial (50 × ~$0.006 = $0.30). |
| Very low | Medium | A future contributor adds `toLocaleDateString()` or `getDate()` to compute the salt, accidentally rolling on host-local midnight instead of UTC midnight. **Mitigated**: source comment + 3 regression tests pin the UTC anchoring. Test would fail in CI before merge. |
| Very low | Medium | A future contributor drops the `expiresAt` write or slides it forward on every count increment, breaking Firestore TTL deletion. **Mitigated as of this audit**: 3 new tests pin the contract. |
| Very low | Low | Lambda's default `TZ=UTC` changes upstream. **Code does not depend on it** (all reads UTC-explicit), so no behavioral impact. Worth a postmortem if it ever happens. |
| Very low | High | Future feature adds user-facing date display without going through Conventions § Rule 5. **No mitigation today** beyond the rule itself. Recommend adding a CI check that greps for `toLocaleDateString`, `toLocaleString`, `Intl.DateTimeFormat` and fails if introduced without a paired test. (Not implemented — out of scope for this audit.) |

---

## 13. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | Document the UTC-midnight rate-limit reset behavior in `CLAUDE.md` or `api-and-backend.md` | Clarity for future contributors | Low | Probably | Two-sentence note: "Daily salt rotation means each IP gets a fresh rate-limit document at UTC 00:00. Effective max burst at the day boundary is ~50 requests per IP per ~2-second window." Worth ~5 lines in `api-and-backend.md`. |
| 2 | Add a one-line CI guard against `toLocaleDateString` / `toLocaleString` / `Intl.DateTimeFormat` in `src/` | Prevent regression of Conventions § Rule 5 | Medium | Only if time allows | A grep step in the build script (`npm run build` already runs `lint:photos`). Could be a 3-line addition to `tools/lint-photos.ts` or a new `tools/lint-datetime.ts`. Best done as a small dedicated PR — out of scope for an audit run. |
| 3 | Verify Firestore TTL policy on `rateLimits.expiresAt` is actually enabled in production | Prevent silent collection bloat | Medium | Yes | One-time deploy-runbook check, not source code. Run diagnostic query #3 against prod. If it returns >0 docs older than 24h, the TTL policy was never enabled and the collection is growing. |
| 4 | Periodically run the diagnostic queries from §11 against production | Catch corruption / schema drift | Low | Probably | Monthly is plenty. Not worth automating until the dataset is much larger than today's free-tier scale. |

---

## 14. Files Modified

- `tests/server/rateLimit-extended.test.ts` — added 3 tests pinning the `expiresAt = windowStart + 1h` TTL contract (initial create, window reset, count-increment counterpart). Test count: 28 → 31 in this file; total suite: 348 → 351 tests, all passing.

No source code logic was changed. No files were deleted or renamed. No migration files created (no SQL).
