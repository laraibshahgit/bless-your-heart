import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/firebaseAdmin', () => ({
  db: {},
}));

import { hashIp } from '@/server/rateLimit';

// The hex-string and same-day-consistency assertions live in rateLimit-extended.test.ts
// (which mocks Firestore comprehensively). This file keeps only the assertion that's NOT
// redundant: that DIFFERENT IPs hash to different values.
describe('hashIp', () => {
  it('produces different hashes for different IPs', () => {
    const a = hashIp('127.0.0.1');
    const b = hashIp('192.168.1.1');
    expect(a).not.toBe(b);
  });
});
