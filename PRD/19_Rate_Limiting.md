# Rate Limiting

## Overview

A per-IP request counter that soft-caps generations at 25 per rolling hour. Exists primarily to protect the Anthropic API budget from a single bad actor draining $25/mo in an afternoon, secondarily to absorb traffic spikes without budget surprises. The cap is generous enough that real users never hit it; the soft-fail copy is in-voice and dismissible.

This file specifies the Firestore document shape (already in `03_Data_Schema.md`), the transactional read-modify-write flow, the daily-salt IP hashing, and the soft-fail UX.

## Dependencies
- `03_Data_Schema.md` — `rateLimits` collection schema and `RateLimitDoc` interface
- `08_Generation_API.md` — Step 3 of the function flow invokes this logic
- `01_Tech_Stack.md` — Firebase Admin SDK, Firestore configuration

## The Cap

| Property | Value |
|----------|-------|
| Limit | 25 generations |
| Window | 1 rolling hour |
| Scope | Per (hashed) IP |
| Configurable via env | `RATE_LIMIT_PER_HOUR` (default 25) |
| Hard or soft | Soft — user gets in-voice copy and can try later |

25/hour means a user who really wants to test the product can run a generation every ~2.5 minutes for an hour and not hit the cap. In practice no real user comes close. The cap exists for the malicious case.

## IP Identification

Read from Netlify-injected headers in the function:

```ts
const rawIp = (
  event.headers['x-nf-client-connection-ip'] ||
  event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  'unknown'
).toString();
```

`x-nf-client-connection-ip` is Netlify's authoritative source. `x-forwarded-for` is the standard fallback. `'unknown'` is the degraded case — treat as a single shared bucket.

### Daily-salted hash

Never store the raw IP. Hash with a daily-rotating salt before using as the document ID:

```ts
import { createHash } from 'crypto';

function hashIp(rawIp: string): string {
  const date = new Date().toISOString().slice(0, 10);  // 'YYYY-MM-DD'
  const salt = `${process.env.IP_SALT_BASE}:${date}`;
  return createHash('sha256').update(`${rawIp}:${salt}`).digest('hex').slice(0, 32);
}
```

The 32-char prefix is plenty of entropy for collision-free hashing across the user base. The daily-rotating component means even if the database is compromised, hashes from different days can't be cross-referenced to track a user across time.

`IP_SALT_BASE` is a non-secret-but-also-not-public constant in env vars. Generate once during setup; never rotate (the daily-date component handles rotation).

## The Transactional Flow

Read-modify-write transactionally to avoid race conditions when a single user fires multiple requests near-simultaneously.

```ts
import { firestore } from 'firebase-admin';

async function checkAndIncrementRateLimit(hashedIp: string): Promise<RateLimitResult> {
  const docRef = firestore().collection('rateLimits').doc(hashedIp);

  return await firestore().runTransaction(async tx => {
    const snap = await tx.get(docRef);
    const now = firestore.Timestamp.now();

    if (!snap.exists) {
      // First request from this IP today
      tx.set(docRef, {
        count: 1,
        windowStart: now,
        expiresAt: addHours(now, 1),
      });
      return { allowed: true, remaining: LIMIT - 1 };
    }

    const data = snap.data() as RateLimitDoc;
    const windowAge = now.toMillis() - data.windowStart.toMillis();

    if (windowAge > 60 * 60 * 1000) {
      // Stale window — reset rather than block
      tx.update(docRef, {
        count: 1,
        windowStart: now,
        expiresAt: addHours(now, 1),
      });
      return { allowed: true, remaining: LIMIT - 1 };
    }

    if (data.count >= LIMIT) {
      return { allowed: false, retryAfterSec: 60 };
    }

    tx.update(docRef, {
      count: data.count + 1,
      // Don't update windowStart or expiresAt — they pace the window
    });
    return { allowed: true, remaining: LIMIT - data.count - 1 };
  });
}
```

### Why transactional

Without transactions, two concurrent reads of `count: 24` could both increment to 25, allowing 26 total generations. Firestore transactions handle this with optimistic concurrency — if the document changes between read and write, the transaction retries automatically.

### Why "stale window → reset" instead of "rolling window per request"

A true rolling window (last 25 generations within the trailing 60 minutes) requires storing per-request timestamps, which is more expensive in Firestore reads. The fixed-window approach is approximate — a user could generate 25 at minute 59 of one window and 25 more at minute 0 of the next, getting 50 in two minutes. In practice this doesn't matter at v1 scale; the cap is a budget protector, not a precise SLA.

## TTL Configuration

Per `03_Data_Schema.md`, the `expiresAt` field has Firestore TTL applied (Firestore console → TTL → add policy on `rateLimits.expiresAt`). Once configured:

- Documents are deleted automatically once `expiresAt` passes
- Deletion happens in the background; documents may persist briefly past expiry
- No manual cleanup, no scheduled jobs

The TTL is set 1 hour after document creation (or last reset). Stale documents disappear without ceremony.

## Response on Rate-Limit Hit

When `allowed: false`, the function returns:

```ts
{
  status: 'rate_limited',
  message: "Even the universe has a daily limit. Try again in a bit.",
}
```

The frontend renders this inline beneath the prompt input (per `07_Input_And_Presets.md`), in `feedback-quiet` color, no exclamation point, no countdown timer. The input field's contents are preserved.

The message doesn't explain the rate-limit mechanism, doesn't show "X generations remaining," doesn't tell the user when to retry. Per the deadpan principle, the surface stays minimal.

## What Counts Toward the Limit

| Action | Counts? |
|--------|---------|
| Successful generation | ✓ |
| Distress refusal | ✗ — increments before this check; could double-count. **Order: rate-limit BEFORE safety filters.** Distress users shouldn't burn quota. |
| Slur or real-person block | ✗ — same reasoning |
| Retry inside a generation (validation failed) | ✗ — counted as one user-facing generation regardless of internal retry count |
| Safe fallback | ✓ — the user got a poster |
| Rate-limited request | ✗ — naturally, since it didn't generate |

Per the order in `08_Generation_API.md`, the rate-limit check is step 3, *before* the safety filters at steps 4–6. This is the correct order: a user in distress or accidentally typing a slur shouldn't have their quota burned. Trade-off: the rate-limit check is a Firestore read regardless of whether the user would have been blocked anyway. At v1 scale, this is fine — Firestore reads are fast and cheap.

## Cost

Firestore Spark (free) tier provides 50,000 reads/day and 20,000 writes/day. Each generation is one read + one write (the transaction). At a healthy 5,000 generations/month average ~167/day:

- 167 reads/day × 30 = 5,010/month — 0.3% of the daily free-tier read budget
- 167 writes/day × 30 = 5,010/month — 0.8% of the daily free-tier write budget

The product can grow ~30× before paying anything for Firestore.

## Logging

Per `08_Generation_API.md`, log `event: 'gen_rate_limited'` with `hashedIp` (the document ID, not the raw IP). Volume of this event signals either:

- Healthy growth — many distinct IPs hitting the cap means the cap is working
- A targeted abuser — a single hashedIp hitting the cap repeatedly across days

For v1, just log volume. If a single hashedIp pattern emerges as abuse, lower `RATE_LIMIT_PER_HOUR` via env var without redeploy.

## Bypass for Local Dev

Local dev (via `netlify dev`) hits the same code path with the same IP-detection. To avoid burning quota during testing, either:

1. Set `RATE_LIMIT_PER_HOUR` to a much higher number (`9999`) in `.env.local`
2. Skip the rate-limit check entirely if `process.env.NODE_ENV !== 'production'`

Option 2 is cleaner — wrap the check in a guard:

```ts
if (process.env.NODE_ENV === 'production') {
  const result = await checkAndIncrementRateLimit(hashedIp);
  if (!result.allowed) return rateLimitedResponse();
}
```

Local dev bypasses; deployed environments enforce.

## Edge Cases

| Case | Handling |
|------|----------|
| Firestore unavailable | Fail open — generate the poster, log `event: 'rate_limit_check_failed'`. Better to occasionally ship past the cap than to break the product entirely. |
| `unknown` IP (header missing) | All such requests share document `'unknown'`. Could cause false rate-limiting if traffic is high. Acceptable degraded case; raw deploys on Netlify always populate the IP header. |
| User behind shared NAT (office, school, library) | Bucket users together by IP. A power user in such an environment could rate-limit colleagues. Acceptable — this is the same trade-off every IP-based limiter makes. |
| User on rotating IPs (mobile networks, VPNs) | Bypasses the limit by accident. Same trade-off. The cost of more sophisticated identification (browser fingerprinting, device IDs) doesn't justify the complexity at v1. |
| Daylight Saving / timezone shift | Hash uses ISO-format date in UTC; no timezone discontinuities. |

## Gaps & Assumptions

- **Cap precision**: ±1 generation due to fixed-window approximation. Acceptable. Don't pursue a true rolling window at v1.
- **No per-user override**: there's no way to manually grant a specific user higher limits. If needed (e.g., for a tester), bypass via the dev-mode env-var pattern.
- **No daily cap, only hourly**: the source PRD specifies "25/hour"; no daily cap exists. A patient abuser could generate 600/day. At Anthropic prices (~$0.006/gen) that's $3.60/day per IP. Not enough to chase at v1; revisit if abuse patterns emerge.
- **`addHours` helper**: simple Firestore Timestamp arithmetic — implement inline or use `date-fns` if already a dep. Not worth a new dependency.
- **Transaction retries on contention**: Firestore retries automatically on optimistic-locking failures; no special handling needed.
- **Why not Upstash Redis or another rate-limiter**: per `01_Tech_Stack.md`, adding a third platform for one feature isn't worth the operational cost. Firestore is already in the stack; the latency is acceptable; the free tier covers the load.
