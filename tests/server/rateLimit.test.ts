import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/firebaseAdmin', () => ({
  db: {},
}));

import { hashIp } from '@/server/rateLimit';

describe('hashIp', () => {
  it('produces a 32-char hex string', () => {
    const result = hashIp('127.0.0.1');
    expect(result).toMatch(/^[a-f0-9]{32}$/);
  });

  it('produces different hashes for different IPs', () => {
    const a = hashIp('127.0.0.1');
    const b = hashIp('192.168.1.1');
    expect(a).not.toBe(b);
  });

  it('produces consistent output for same input on same day', () => {
    const a = hashIp('127.0.0.1');
    const b = hashIp('127.0.0.1');
    expect(a).toBe(b);
  });
});
