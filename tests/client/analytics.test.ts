// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const captureMock = vi.fn();
const initMock = vi.fn();

vi.mock('posthog-js', () => ({
  default: {
    init: (...args: unknown[]) => initMock(...args),
    capture: (...args: unknown[]) => captureMock(...args),
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  captureMock.mockReset();
  initMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('initAnalytics', () => {
  it('does nothing when not in production', async () => {
    vi.stubEnv('PROD', false as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    const { initAnalytics } = await import('@/lib/analytics');
    initAnalytics();
    expect(initMock).not.toHaveBeenCalled();
  });

  it('does nothing when VITE_POSTHOG_KEY is missing in prod', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    const { initAnalytics } = await import('@/lib/analytics');
    initAnalytics();
    expect(initMock).not.toHaveBeenCalled();
  });

  it('calls posthog.init once when prod and key are set', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://app.posthog.com');
    const { initAnalytics } = await import('@/lib/analytics');
    initAnalytics();
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith(
      'phc_real_key',
      expect.objectContaining({
        api_host: 'https://app.posthog.com',
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: false,
      })
    );
  });

  it('is idempotent — second call does not re-init', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    const { initAnalytics } = await import('@/lib/analytics');
    initAnalytics();
    initAnalytics();
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  // Regression test for audit run 30/001 — the pre-fix shape only set
  // `initialized = true` inside the async `loaded` callback, leaving a window
  // where a re-entrant call (e.g. from a future useEffect under StrictMode's
  // double-mount) would pass the guard and call posthog.init() twice. Even
  // with no `loaded` callback simulated, the synchronous flip must hold.
  it('does not double-init when called twice synchronously without simulating posthog load', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    const { initAnalytics } = await import('@/lib/analytics');
    initAnalytics();
    initAnalytics();
    expect(initMock).toHaveBeenCalledTimes(1);
  });
});

describe('track', () => {
  it('does nothing when posthog is not initialized', async () => {
    vi.stubEnv('PROD', false as any);
    const { track } = await import('@/lib/analytics');
    track('some_event', { foo: 'bar' });
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('forwards event name and props to posthog.capture once initialized', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    const { initAnalytics, track } = await import('@/lib/analytics');
    initAnalytics();

    track('prompt_submitted', { source: 'preset', length: 12 });
    expect(captureMock).toHaveBeenCalledWith('prompt_submitted', { source: 'preset', length: 12 });
  });

  it('passes undefined props when none provided', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    const { initAnalytics, track } = await import('@/lib/analytics');
    initAnalytics();

    track('plain_event');
    expect(captureMock).toHaveBeenCalledWith('plain_event', undefined);
  });

  // External integration audit run 33/001 — analytics is a Low-criticality
  // non-critical dependency. PostHog SDK errors must NEVER propagate into
  // the calling component (App.tsx handleGenerate, PromptInput, etc.) and
  // abandon the user flow. A throw from `posthog.capture` (e.g. quota-
  // exhausted sessionStorage on a long-lived tab, security-policy storage
  // block on Brave/Safari Private Mode) is logged and swallowed.
  it('swallows posthog.capture errors and logs structured failure event', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    captureMock.mockImplementation(() => {
      throw new Error('storage quota exceeded');
    });
    const { initAnalytics, track } = await import('@/lib/analytics');
    initAnalytics();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      // Must not throw — analytics failure is non-blocking.
      expect(() => track('prompt_submitted', { foo: 'bar' })).not.toThrow();
      expect(errSpy).toHaveBeenCalled();
      const logged = String(errSpy.mock.calls[0]?.[0]);
      expect(logged).toContain('analytics_track_failed');
      expect(logged).toContain('storage quota exceeded');
    } finally {
      errSpy.mockRestore();
    }
  });
});

// External integration audit run 33/001 — same swallow-and-log contract for
// posthog.init. Init runs from main.tsx BEFORE React mounts; an unhandled
// throw there would surface as a blank page (entire app fails to bootstrap
// because PostHog couldn't access sessionStorage). Locked-down browsers
// (Safari Private Mode, Brave hard mode, corporate kiosks) are a real
// production environment for this app.
describe('initAnalytics — error resilience', () => {
  it('swallows posthog.init errors and logs structured failure event', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    initMock.mockImplementation(() => {
      throw new Error('sessionStorage blocked');
    });
    const { initAnalytics } = await import('@/lib/analytics');

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => initAnalytics()).not.toThrow();
      expect(errSpy).toHaveBeenCalled();
      const logged = String(errSpy.mock.calls[0]?.[0]);
      expect(logged).toContain('analytics_init_failed');
      expect(logged).toContain('sessionStorage blocked');
    } finally {
      errSpy.mockRestore();
    }
  });
});
