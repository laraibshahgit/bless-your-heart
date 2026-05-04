import { createHash } from 'crypto';
import { getDb } from './firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';
import type { RateLimitDoc, RateLimitResult } from '@/types';

const COLLECTION = 'rateLimits';

// Rate-limit window — fixed 1-hour bucket per IP. Pinned by the TTL contract
// in tests/server/rateLimit-extended.test.ts: `expiresAt = windowStart + 1 hour`
// must be written on initial-create AND window-reset; the count-increment path
// must NOT touch expiresAt (otherwise a busy IP would slide TTL forward
// indefinitely and the rateLimits collection would grow past the free tier).
// Hardcoded rather than env-driven because changing this changes Firestore
// document layout (the resetAt header math derives from this).
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export function hashIp(rawIp: string): string {
  // UTC-anchored daily salt. `.toISOString()` always returns UTC regardless of
  // the host TZ — do NOT swap to `.toLocaleDateString()` or `getDate()`/`getMonth()`,
  // which would shift the rotation boundary by host TZ and produce mismatched
  // hashes across multi-region serverless deployments.
  const date = new Date().toISOString().slice(0, 10);
  const salt = `${process.env.IP_SALT_BASE ?? 'byh-default-salt'}:${date}`;
  return createHash('sha256')
    .update(`${rawIp}:${salt}`)
    .digest('hex')
    .slice(0, 32);
}

export function getClientIp(headers: Record<string, string | undefined>): string {
  return (
    headers['x-nf-client-connection-ip'] ??
    headers['x-forwarded-for']?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export async function checkAndIncrementRateLimit(hashedIp: string): Promise<RateLimitResult> {
  const limit = parseInt(process.env.RATE_LIMIT_PER_HOUR ?? '25', 10);
  const db = getDb();
  const docRef = db.collection(COLLECTION).doc(hashedIp);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const now = Timestamp.now();
    const nowMs = now.toMillis();

    if (!snap.exists) {
      tx.set(docRef, {
        count: 1,
        windowStart: now,
        expiresAt: Timestamp.fromMillis(nowMs + RATE_LIMIT_WINDOW_MS),
      });
      return {
        allowed: true,
        remaining: limit - 1,
        limit,
        resetAt: Math.floor((nowMs + RATE_LIMIT_WINDOW_MS) / 1000),
      };
    }

    // `snap.exists` is false above, so `snap.data()` returns the stored doc.
    // Type as RateLimitDoc to keep field shape (count/windowStart/expiresAt)
    // aligned with the source of truth in src/types/index.ts.
    const data = snap.data() as RateLimitDoc | undefined;
    if (!data) {
      // Treat the unreachable case as "first hit in window" so we never throw
      // through the transaction boundary.
      tx.set(docRef, {
        count: 1,
        windowStart: now,
        expiresAt: Timestamp.fromMillis(nowMs + RATE_LIMIT_WINDOW_MS),
      });
      return {
        allowed: true,
        remaining: limit - 1,
        limit,
        resetAt: Math.floor((nowMs + RATE_LIMIT_WINDOW_MS) / 1000),
      };
    }

    const windowAge = nowMs - data.windowStart.toMillis();

    if (windowAge > RATE_LIMIT_WINDOW_MS) {
      tx.update(docRef, {
        count: 1,
        windowStart: now,
        expiresAt: Timestamp.fromMillis(nowMs + RATE_LIMIT_WINDOW_MS),
      });
      return {
        allowed: true,
        remaining: limit - 1,
        limit,
        resetAt: Math.floor((nowMs + RATE_LIMIT_WINDOW_MS) / 1000),
      };
    }

    const windowEndMs = data.windowStart.toMillis() + RATE_LIMIT_WINDOW_MS;
    const resetAt = Math.floor(windowEndMs / 1000);

    if (data.count >= limit) {
      // Pre-fix this returned a hardcoded 60s, which let users retry every minute
      // and get blocked every minute. The real wait is until the window expires.
      const retryAfterSec = Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000));
      return { allowed: false, retryAfterSec, resetAt, limit };
    }

    tx.update(docRef, { count: data.count + 1 });
    return {
      allowed: true,
      remaining: limit - data.count - 1,
      limit,
      resetAt,
    };
  });
}
