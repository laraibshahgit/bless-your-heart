import { createHash } from 'crypto';
import { getDb } from './firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';
import type { RateLimitResult } from '@/types';

const COLLECTION = 'rateLimits';

export function hashIp(rawIp: string): string {
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
    const oneHourMs = 60 * 60 * 1000;

    if (!snap.exists) {
      tx.set(docRef, {
        count: 1,
        windowStart: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + oneHourMs),
      });
      return { allowed: true, remaining: limit - 1 };
    }

    const data = snap.data()!;
    const windowAge = now.toMillis() - data.windowStart.toMillis();

    if (windowAge > oneHourMs) {
      tx.update(docRef, {
        count: 1,
        windowStart: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + oneHourMs),
      });
      return { allowed: true, remaining: limit - 1 };
    }

    if (data.count >= limit) {
      return { allowed: false, retryAfterSec: 60 };
    }

    tx.update(docRef, { count: data.count + 1 });
    return { allowed: true, remaining: limit - data.count - 1 };
  });
}
