import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateProdEnv } from '@/server/configValidation';

// Stub env shape — passing a custom env object via the function's optional
// argument keeps tests independent of process.env mutations and side effects.
function buildEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    CONTEXT: 'production',
    IP_SALT_BASE: 'real-salt',
    ALLOWED_ORIGINS: 'https://blessyourheart.app',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    FIREBASE_PROJECT_ID: 'bless-your-heart',
    FIREBASE_CLIENT_EMAIL: 'firebase@example.com',
    FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\n...',
    ...overrides,
  };
}

describe('validateProdEnv', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('is a no-op when CONTEXT is undefined (local dev)', () => {
    const result = validateProdEnv(buildEnv({ CONTEXT: undefined, IP_SALT_BASE: undefined }));
    expect(result).toEqual({ ok: true, missing: [] });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('is a no-op for deploy-preview context (PR previews skip validation)', () => {
    const result = validateProdEnv(buildEnv({ CONTEXT: 'deploy-preview', IP_SALT_BASE: undefined }));
    expect(result).toEqual({ ok: true, missing: [] });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('is a no-op for branch-deploy context', () => {
    const result = validateProdEnv(buildEnv({ CONTEXT: 'branch-deploy', ALLOWED_ORIGINS: undefined }));
    expect(result).toEqual({ ok: true, missing: [] });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('returns ok when all required vars are present in production', () => {
    const result = validateProdEnv(buildEnv());
    expect(result).toEqual({ ok: true, missing: [] });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('flags missing IP_SALT_BASE in production', () => {
    const result = validateProdEnv(buildEnv({ IP_SALT_BASE: undefined }));
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('IP_SALT_BASE');
    expect(consoleSpy).toHaveBeenCalledOnce();
  });

  it('flags missing ALLOWED_ORIGINS in production (CSRF shield disabled)', () => {
    const result = validateProdEnv(buildEnv({ ALLOWED_ORIGINS: undefined }));
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('ALLOWED_ORIGINS');
  });

  it('treats empty-string values as missing (whitespace-only too)', () => {
    const result = validateProdEnv(buildEnv({ IP_SALT_BASE: '   ', ALLOWED_ORIGINS: '' }));
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('IP_SALT_BASE');
    expect(result.missing).toContain('ALLOWED_ORIGINS');
  });

  it('reports all missing vars in a single log line (not one per var)', () => {
    validateProdEnv(buildEnv({
      IP_SALT_BASE: undefined,
      ALLOWED_ORIGINS: undefined,
      ANTHROPIC_API_KEY: undefined,
    }));
    expect(consoleSpy).toHaveBeenCalledOnce();
    const arg = consoleSpy.mock.calls[0]?.[0];
    expect(typeof arg).toBe('string');
    const parsed = JSON.parse(arg as string);
    expect(parsed.event).toBe('config_validation_failed');
    expect(parsed.context).toBe('production');
    expect(parsed.missing).toEqual(['IP_SALT_BASE', 'ALLOWED_ORIGINS', 'ANTHROPIC_API_KEY']);
  });

  it('flags all four Firebase env keys when missing (Firestore client unusable)', () => {
    const result = validateProdEnv(buildEnv({
      FIREBASE_PROJECT_ID: undefined,
      FIREBASE_CLIENT_EMAIL: undefined,
      FIREBASE_PRIVATE_KEY: undefined,
    }));
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('FIREBASE_PROJECT_ID');
    expect(result.missing).toContain('FIREBASE_CLIENT_EMAIL');
    expect(result.missing).toContain('FIREBASE_PRIVATE_KEY');
  });
});
