import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Firestore Timestamp helpers — the rateLimit module uses them via firebase-admin/firestore.
// Important: capture Date.now() ONCE per Timestamp.now() call. Earlier shape was
// `now: () => ({ toMillis: () => Date.now() })` which re-read the wall clock on
// every `.toMillis()` invocation. The TTL-contract assertions read
// `written.windowStart.toMillis()` after `written.expiresAt.toMillis()`; if a
// millisecond ticked between those two reads, `expiresAt - windowStart` came
// back as 3599999 instead of 3600000 and the test failed once every ~5 runs.
vi.mock('firebase-admin/firestore', () => {
  const Timestamp = {
    now: () => {
      const ms = Date.now();
      return { toMillis: () => ms };
    },
    fromMillis: (ms: number) => ({
      toMillis: () => ms,
    }),
  };
  return { Timestamp };
});

// Mock firebaseAdmin so we control the db instance
vi.mock('@/server/firebaseAdmin', () => {
  return {
    getDb: () => mockDb,
  };
});

let mockDb: any;
let mockTx: any;
let mockDocRef: any;

function buildMockDb(snap: { exists: boolean; data?: any }) {
  mockTx = {
    get: vi.fn().mockResolvedValue({
      exists: snap.exists,
      data: () => snap.data,
    }),
    set: vi.fn(),
    update: vi.fn(),
  };
  mockDocRef = { id: 'doc' };
  mockDb = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => mockDocRef),
    })),
    runTransaction: vi.fn(async (fn: any) => fn(mockTx)),
  };
  return mockDb;
}

import { hashIp, getClientIp, checkAndIncrementRateLimit } from '@/server/rateLimit';

describe('hashIp (extended)', () => {
  it('produces a 32-char hex string', () => {
    expect(hashIp('1.2.3.4')).toMatch(/^[a-f0-9]{32}$/);
  });

  it('produces consistent output for same IP within the same day', () => {
    expect(hashIp('1.2.3.4')).toBe(hashIp('1.2.3.4'));
  });

  it('uses IP_SALT_BASE env var when set', () => {
    // try/finally guarantees env restoration even if assertion throws — otherwise
    // a failed expectation in this test would leak `IP_SALT_BASE='different-salt'`
    // into every subsequent hashIp call in this file's worker.
    const original = process.env.IP_SALT_BASE;
    try {
      process.env.IP_SALT_BASE = 'custom-salt';
      const a = hashIp('1.2.3.4');
      process.env.IP_SALT_BASE = 'different-salt';
      const b = hashIp('1.2.3.4');
      expect(a).not.toBe(b);
    } finally {
      if (original === undefined) delete process.env.IP_SALT_BASE;
      else process.env.IP_SALT_BASE = original;
    }
  });

  it('handles empty string IP without crashing', () => {
    expect(hashIp('')).toMatch(/^[a-f0-9]{32}$/);
  });

  it('handles IPv6 IPs', () => {
    expect(hashIp('2001:db8::1')).toMatch(/^[a-f0-9]{32}$/);
  });

  // Daily-salt UTC anchoring (regression pin). A future refactor that swapped
  // `new Date().toISOString().slice(0, 10)` for a server-local equivalent
  // (`toLocaleDateString()`, `getDate()`, etc.) would break determinism across
  // multi-region serverless deployments — same user, same instant, different
  // hash depending on which region served the request. These three cases pin
  // the contract that the salt rotates ONLY at UTC midnight, regardless of the
  // host TZ. Captured by the audit at audit-reports/14_DATETIME_HANDLING_*.md.
  describe('hashIp — UTC-anchored salt rotation', () => {
    const fixedSalt = 'fixed-base';
    let originalSalt: string | undefined;

    beforeEach(() => {
      originalSalt = process.env.IP_SALT_BASE;
      process.env.IP_SALT_BASE = fixedSalt;
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      if (originalSalt === undefined) delete process.env.IP_SALT_BASE;
      else process.env.IP_SALT_BASE = originalSalt;
    });

    it('produces the same hash at two different UTC times within the same UTC day', () => {
      vi.setSystemTime(new Date('2026-05-04T00:01:00Z'));
      const earlyMorning = hashIp('203.0.113.42');
      vi.setSystemTime(new Date('2026-05-04T23:59:00Z'));
      const lateNight = hashIp('203.0.113.42');
      expect(earlyMorning).toBe(lateNight);
    });

    it('produces a different hash when crossing UTC midnight', () => {
      vi.setSystemTime(new Date('2026-05-04T23:59:00Z'));
      const beforeMidnight = hashIp('203.0.113.42');
      vi.setSystemTime(new Date('2026-05-05T00:01:00Z'));
      const afterMidnight = hashIp('203.0.113.42');
      expect(beforeMidnight).not.toBe(afterMidnight);
    });

    it('is deterministic for a given (IP, UTC day, salt-base) tuple', () => {
      // Pinning a literal hash makes salt-format drift immediately visible.
      // If someone changes the salt template (e.g. swaps the colon for a
      // hyphen, or reorders fields), this test fails with a clear diff.
      vi.setSystemTime(new Date('2026-05-04T12:00:00Z'));
      // sha256('203.0.113.42:fixed-base:2026-05-04').hex.slice(0, 32)
      const expected = '609930eb3dcb58e5232ac9d29f0b65b0';
      expect(hashIp('203.0.113.42')).toBe(expected);
    });
  });
});

describe('getClientIp', () => {
  it('prefers x-nf-client-connection-ip when present', () => {
    expect(
      getClientIp({
        'x-nf-client-connection-ip': '1.2.3.4',
        'x-forwarded-for': '5.6.7.8, 9.10.11.12',
      })
    ).toBe('1.2.3.4');
  });

  it('falls back to the first entry of x-forwarded-for', () => {
    expect(getClientIp({ 'x-forwarded-for': '5.6.7.8, 9.10.11.12' })).toBe('5.6.7.8');
  });

  it('trims whitespace from x-forwarded-for entries', () => {
    expect(getClientIp({ 'x-forwarded-for': '  5.6.7.8  ,9.10.11.12' })).toBe('5.6.7.8');
  });

  it('returns "unknown" when no IP headers are present', () => {
    expect(getClientIp({})).toBe('unknown');
  });

  it('returns "unknown" when only undefined headers are present', () => {
    expect(getClientIp({ 'x-other': undefined })).toBe('unknown');
  });
});

describe('checkAndIncrementRateLimit', () => {
  beforeEach(() => {
    delete process.env.RATE_LIMIT_PER_HOUR;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new doc with count=1 when no existing entry', async () => {
    buildMockDb({ exists: false });
    const result = await checkAndIncrementRateLimit('hash-001');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(24); // default 25 - 1
    expect(mockTx.set).toHaveBeenCalled();
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it('increments count on existing doc within the window', async () => {
    buildMockDb({
      exists: true,
      data: {
        count: 5,
        windowStart: { toMillis: () => Date.now() - 1000 }, // 1 sec ago
      },
    });
    const result = await checkAndIncrementRateLimit('hash-002');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19); // 25 - 5 - 1
    expect(mockTx.update).toHaveBeenCalledWith(mockDocRef, { count: 6 });
  });

  it('blocks (allowed=false) when count >= limit within the window', async () => {
    process.env.RATE_LIMIT_PER_HOUR = '25';
    const windowStartMs = Date.now() - 1000;
    buildMockDb({
      exists: true,
      data: {
        count: 25,
        windowStart: { toMillis: () => windowStartMs },
      },
    });
    const result = await checkAndIncrementRateLimit('hash-003');
    expect(result.allowed).toBe(false);
    // retryAfterSec must reflect time until the WINDOW expires (windowStart + 1hr - now),
    // not a hardcoded 60s. The previous "60" let users retry every minute and get blocked
    // every minute, which is misleading.
    expect(result.retryAfterSec).toBeGreaterThan(3590);
    expect(result.retryAfterSec).toBeLessThanOrEqual(3600);
    const expectedResetAt = Math.floor((windowStartMs + 60 * 60 * 1000) / 1000);
    expect(result.resetAt).toBe(expectedResetAt);
    expect(result.limit).toBe(25);
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it('clamps retryAfterSec to a minimum of 1 at the window expiry boundary', async () => {
    // Edge case: when now ≈ windowStart + 1hr, naive computation = 0 (or negative under
    // clock skew). Math.max(1, ...) keeps the Retry-After header meaningful.
    process.env.RATE_LIMIT_PER_HOUR = '25';
    const oneHourMs = 60 * 60 * 1000;
    buildMockDb({
      exists: true,
      data: {
        count: 25,
        windowStart: { toMillis: () => Date.now() - oneHourMs },
      },
    });
    const result = await checkAndIncrementRateLimit('hash-boundary');
    if (!result.allowed) {
      expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
    }
  });

  it('includes limit and resetAt on allowed responses (for X-RateLimit-* headers)', async () => {
    process.env.RATE_LIMIT_PER_HOUR = '25';
    buildMockDb({ exists: false });
    const result = await checkAndIncrementRateLimit('hash-headers-1');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(25);
    expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('resets the window when the existing one is older than 1 hour', async () => {
    buildMockDb({
      exists: true,
      data: {
        count: 30,
        windowStart: { toMillis: () => Date.now() - 60 * 60 * 1000 - 1 }, // just over 1 hour ago
      },
    });
    const result = await checkAndIncrementRateLimit('hash-004');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(24);
    expect(mockTx.update).toHaveBeenCalledWith(
      mockDocRef,
      expect.objectContaining({ count: 1 })
    );
  });

  it('respects RATE_LIMIT_PER_HOUR env var', async () => {
    process.env.RATE_LIMIT_PER_HOUR = '5';
    buildMockDb({
      exists: true,
      data: {
        count: 4,
        windowStart: { toMillis: () => Date.now() },
      },
    });
    const result = await checkAndIncrementRateLimit('hash-005');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // 5 - 4 - 1
  });

  it('writes to the rateLimits collection', async () => {
    buildMockDb({ exists: false });
    await checkAndIncrementRateLimit('hash-006');
    expect(mockDb.collection).toHaveBeenCalledWith('rateLimits');
  });

  it('uses the hashedIp as the document key', async () => {
    buildMockDb({ exists: false });
    const docMock = vi.fn(() => mockDocRef);
    mockDb.collection = vi.fn(() => ({ doc: docMock }));
    await checkAndIncrementRateLimit('hash-007');
    expect(docMock).toHaveBeenCalledWith('hash-007');
  });

  it('boundary: blocks when count exactly equals limit', async () => {
    process.env.RATE_LIMIT_PER_HOUR = '10';
    buildMockDb({
      exists: true,
      data: {
        count: 10,
        windowStart: { toMillis: () => Date.now() },
      },
    });
    const result = await checkAndIncrementRateLimit('hash-008');
    expect(result.allowed).toBe(false);
  });

  it('boundary: allows when count is one below limit', async () => {
    process.env.RATE_LIMIT_PER_HOUR = '10';
    buildMockDb({
      exists: true,
      data: {
        count: 9,
        windowStart: { toMillis: () => Date.now() },
      },
    });
    const result = await checkAndIncrementRateLimit('hash-009');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  // Mutation kill: writes count: 1 (not 0) on a brand-new doc — otherwise the very first
  // request of every IP/day would be uncounted, silently giving an extra free call.
  it('writes count: 1 on initial doc creation (first request is counted, not free)', async () => {
    buildMockDb({ exists: false });
    await checkAndIncrementRateLimit('hash-init');
    expect(mockTx.set).toHaveBeenCalledWith(
      mockDocRef,
      expect.objectContaining({ count: 1 })
    );
  });

  // Mutation kill: writes count: 1 (not 0) when the previous window expired
  it('writes count: 1 when resetting an expired window (first request of new window is counted)', async () => {
    buildMockDb({
      exists: true,
      data: {
        count: 30,
        windowStart: { toMillis: () => Date.now() - 60 * 60 * 1000 - 1 },
      },
    });
    await checkAndIncrementRateLimit('hash-reset');
    expect(mockTx.update).toHaveBeenCalledWith(
      mockDocRef,
      expect.objectContaining({ count: 1 })
    );
  });

  // TTL contract: expiresAt MUST be windowStart + 1 hour on every write that
  // touches windowStart (initial creation + window reset). Firestore's TTL
  // policy auto-deletes documents at `expiresAt`, which is what keeps the
  // `rateLimits` collection from growing without bound. A refactor that drops
  // the `expiresAt: Timestamp.fromMillis(nowMs + oneHourMs)` line — or
  // miscalculates it — would silently let the collection grow forever and
  // eventually exceed the Firestore free-tier (audited
  // 2026-05-04 in datetime-handling report 001).
  it('writes expiresAt = windowStart + 1 hour on initial doc creation (TTL contract)', async () => {
    const oneHourMs = 60 * 60 * 1000;
    buildMockDb({ exists: false });
    await checkAndIncrementRateLimit('hash-ttl-create');
    expect(mockTx.set).toHaveBeenCalledTimes(1);
    const written = mockTx.set.mock.calls[0][1];
    const windowStartMs = written.windowStart.toMillis();
    const expiresAtMs = written.expiresAt.toMillis();
    expect(expiresAtMs - windowStartMs).toBe(oneHourMs);
  });

  it('writes expiresAt = windowStart + 1 hour when resetting an expired window (TTL contract)', async () => {
    const oneHourMs = 60 * 60 * 1000;
    buildMockDb({
      exists: true,
      data: {
        count: 30,
        windowStart: { toMillis: () => Date.now() - oneHourMs - 1 },
      },
    });
    await checkAndIncrementRateLimit('hash-ttl-reset');
    expect(mockTx.update).toHaveBeenCalledTimes(1);
    const written = mockTx.update.mock.calls[0][1];
    expect(written.windowStart, 'reset path must rewrite windowStart').toBeDefined();
    expect(written.expiresAt, 'reset path must rewrite expiresAt for TTL').toBeDefined();
    const windowStartMs = written.windowStart.toMillis();
    const expiresAtMs = written.expiresAt.toMillis();
    expect(expiresAtMs - windowStartMs).toBe(oneHourMs);
  });

  // Counterpart: the count-increment branch (still inside the window) must
  // NOT touch windowStart or expiresAt. Otherwise users could keep their
  // window alive past 1 hour by spamming requests, defeating the cap, AND
  // TTL deletion would slide forward indefinitely.
  it('count-increment within the window does NOT rewrite windowStart or expiresAt', async () => {
    buildMockDb({
      exists: true,
      data: {
        count: 5,
        windowStart: { toMillis: () => Date.now() - 1000 }, // 1 sec ago, still valid
      },
    });
    await checkAndIncrementRateLimit('hash-ttl-noop');
    expect(mockTx.update).toHaveBeenCalledTimes(1);
    const written = mockTx.update.mock.calls[0][1];
    expect(written.windowStart, 'increment must not slide windowStart').toBeUndefined();
    expect(written.expiresAt, 'increment must not slide expiresAt (TTL would never fire)').toBeUndefined();
  });

  // Boundary: corrupt Firestore document. There is no read-time schema check,
  // so a doc missing `windowStart` (manual edit, partial write, schema drift)
  // would crash inside the transaction. The handler's try/catch around the
  // rate-limit call is what saves the user — these tests pin that the
  // FUNCTION ITSELF rejects the promise (rather than e.g. returning a wrong
  // result) so the catch in generate.ts:69 fires and the request fails open.
  it('rejects when an existing doc is missing windowStart (corrupt data)', async () => {
    buildMockDb({
      exists: true,
      data: { count: 5 }, // windowStart absent — TypeError on `.toMillis()`
    });
    await expect(checkAndIncrementRateLimit('hash-corrupt-1')).rejects.toThrow();
    // Critical: tx must NOT have been written. A partial write here would
    // poison the doc further.
    expect(mockTx.update).not.toHaveBeenCalled();
    expect(mockTx.set).not.toHaveBeenCalled();
  });

  // Defensive: snap.exists could be true while snap.data() returns undefined
  // in unusual SDK conditions (post-deletion race, sentinel state). The
  // function treats this as "first hit in the window" so the transaction
  // never throws into the catch block and the request is allowed.
  it('treats exists-but-undefined-data as a fresh window (defensive)', async () => {
    buildMockDb({ exists: true, data: undefined });
    const result = await checkAndIncrementRateLimit('hash-ghost');
    expect(result.allowed).toBe(true);
    expect(mockTx.set).toHaveBeenCalledWith(
      mockDocRef,
      expect.objectContaining({ count: 1 })
    );
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it('rejects when windowStart exists but is not a Timestamp-shaped value (corrupt data)', async () => {
    buildMockDb({
      exists: true,
      data: {
        count: 3,
        // Plain number instead of { toMillis: ... } — would happen if a future
        // refactor stored windowStart as ms directly without updating the read.
        windowStart: 1234567890,
      },
    });
    await expect(checkAndIncrementRateLimit('hash-corrupt-2')).rejects.toThrow();
  });

  // Defensive parsing of RATE_LIMIT_PER_HOUR. Without these guards, a misconfig
  // produces silent pathological behavior:
  //   - 'abc'    → parseInt = NaN → `count >= NaN` is always false → unlimited
  //                requests pass through (the rate limiter is effectively off)
  //   - '-5'     → negative → `count=1 >= -5` is true on first hit → every
  //                request is blocked from the very first call
  //   - '0'      → zero → `count=1 >= 0` is true on first hit → same as above
  //   - ''       → empty string → parseInt = NaN → same as 'abc'
  // All four cases must fall back to the documented default (25). Audited
  // 2026-05-04 in run 24/001.
  describe('checkAndIncrementRateLimit — RATE_LIMIT_PER_HOUR misconfiguration falls back to default 25', () => {
    let original: string | undefined;

    beforeEach(() => {
      original = process.env.RATE_LIMIT_PER_HOUR;
    });

    afterEach(() => {
      if (original === undefined) delete process.env.RATE_LIMIT_PER_HOUR;
      else process.env.RATE_LIMIT_PER_HOUR = original;
    });

    it.each([
      ['non-numeric string', 'abc'],
      ['empty string', ''],
      ['negative integer', '-5'],
      ['zero', '0'],
      ['negative float', '-3.14'],
    ])('falls back to limit=25 when RATE_LIMIT_PER_HOUR is %s', async (_label, raw) => {
      process.env.RATE_LIMIT_PER_HOUR = raw;
      buildMockDb({ exists: false });
      const result = await checkAndIncrementRateLimit('hash-misconfig');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(25);
      expect(result.remaining).toBe(24);
    });

    it('falls back to limit=25 when RATE_LIMIT_PER_HOUR is undefined', async () => {
      delete process.env.RATE_LIMIT_PER_HOUR;
      buildMockDb({ exists: false });
      const result = await checkAndIncrementRateLimit('hash-undef');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(25);
    });

    it('uses the parsed value when RATE_LIMIT_PER_HOUR is a positive integer', async () => {
      process.env.RATE_LIMIT_PER_HOUR = '100';
      buildMockDb({ exists: false });
      const result = await checkAndIncrementRateLimit('hash-100');
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(99);
    });
  });
});
