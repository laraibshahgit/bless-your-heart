import { hashIp } from '@/server/rateLimit';

describe('hashIp', () => {
  beforeEach(() => {
    process.env.IP_SALT_BASE = 'test-salt';
  });

  afterEach(() => {
    delete process.env.IP_SALT_BASE;
  });

  it('returns a deterministic hash for the same IP', () => {
    const hash1 = hashIp('192.168.1.1');
    const hash2 = hashIp('192.168.1.1');
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different IPs', () => {
    const hash1 = hashIp('192.168.1.1');
    const hash2 = hashIp('10.0.0.1');
    expect(hash1).not.toBe(hash2);
  });

  it('always returns exactly 32 hex characters', () => {
    const ips = ['192.168.1.1', '10.0.0.1', '::1', '255.255.255.255', ''];
    for (const ip of ips) {
      const hash = hashIp(ip);
      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('does not contain the raw IP in the output', () => {
    const ip = '192.168.1.1';
    const hash = hashIp(ip);
    expect(hash).not.toContain(ip);
    expect(hash).not.toContain(ip.replace(/\./g, ''));
  });
});
