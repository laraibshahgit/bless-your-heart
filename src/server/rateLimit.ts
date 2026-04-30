import { createHash } from 'crypto';
import { getFirestore } from './firebaseAdmin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { RateLimitResult } from '@/types';

const LIMIT = parseInt(process.env.RATE_LIMIT_PER_HOUR || '25', 10);
const ONE_HOUR_MS = 60 * 60 * 1000;

export function hashIp(rawIp: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const salt = `${process.env.IP_SALT_BASE || 'byh-salt'}:${date}`;
  return createHash('sha256').update(`${rawIp}:${salt}`).digest('hex').slice(0, 32);
}

function addHours(ts: Timestamp, hours: number): Timestamp {
  return Timestamp.fromMillis(ts.toMillis() + hours * ONE_HOUR_MS);
}

export async function checkAndIncrementRateLimit(hashedIp: string): Promise<RateLimitResult> {
  try {
    const db = getFirestore();
    const docRef = db.collection('rateLimits').doc(hashedIp);

    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const now = Timestamp.now();

      if (!snap.exists) {
        tx.set(docRef, {
          count: 1,
          windowStart: now,
          expiresAt: addHours(now, 1),
        });
        return { allowed: true, remaining: LIMIT - 1 };
      }

      const data = snap.data()!;
      const windowAge = now.toMillis() - data.windowStart.toMillis();

      if (windowAge > ONE_HOUR_MS) {
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

      tx.update(docRef, { count: FieldValue.increment(1) });
      return { allowed: true, remaining: LIMIT - data.count - 1 };
    });
  } catch (err) {
    console.error('Rate limit check failed, failing open:', err);
    return { allowed: true };
  }
}
