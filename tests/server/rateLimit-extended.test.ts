import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Firestore Timestamp helpers — the rateLimit module uses them via firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => {
  const Timestamp = {
    now: () => ({
      toMillis: () => Date.now(),
    }),
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
    buildMockDb({
      exists: true,
      data: {
        count: 25,
        windowStart: { toMillis: () => Date.now() - 1000 },
      },
    });
    const result = await checkAndIncrementRateLimit('hash-003');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBe(60);
    expect(mockTx.update).not.toHaveBeenCalled();
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
});
