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
    await initAnalytics();
    expect(initMock).not.toHaveBeenCalled();
  });

  it('does nothing when VITE_POSTHOG_KEY is missing in prod', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    const { initAnalytics } = await import('@/lib/analytics');
    await initAnalytics();
    expect(initMock).not.toHaveBeenCalled();
  });

  it('calls posthog.init once when prod and key are set', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://app.posthog.com');
    const { initAnalytics } = await import('@/lib/analytics');
    await initAnalytics();
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
    await initAnalytics();
    await initAnalytics();
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  // Regression test for audit run 30/001 — the pre-fix shape only set
  // `initialized = true` inside the async `loaded` callback, leaving a window
  // where a re-entrant call (e.g. from a future useEffect under StrictMode's
  // double-mount) would pass the guard and call posthog.init() twice. With
  // the audit-37/001 lazy-load shape the same invariant must hold across the
  // synchronous flip — the deferred SDK load can be in flight when the
  // second initAnalytics() is called, and that re-entrant call must not
  // schedule a second SDK load.
  it('does not double-init when called twice synchronously without simulating posthog load', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    const { initAnalytics } = await import('@/lib/analytics');
    // Fire two calls in the same tick BEFORE either resolves — second call
    // must hit the `initState !== 'pending'` early return.
    const p1 = initAnalytics();
    const p2 = initAnalytics();
    await Promise.all([p1, p2]);
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
    await initAnalytics();

    track('prompt_submitted', { source: 'preset', length: 12 });
    expect(captureMock).toHaveBeenCalledWith('prompt_submitted', { source: 'preset', length: 12 });
  });

  it('passes undefined props when none provided', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    const { initAnalytics, track } = await import('@/lib/analytics');
    await initAnalytics();

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
    await initAnalytics();

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

  // Audit run 37/001 — events fired between initAnalytics() and the
  // deferred SDK load completing are buffered, not dropped. Pre-fix (audit
  // 30/001 era) the same window dropped events because `initialized` was a
  // single boolean. Now it's a state machine and the 'loading' state
  // accumulates events until the SDK lands.
  it('buffers track() calls fired during the loading window and flushes on SDK load', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    const { initAnalytics, track } = await import('@/lib/analytics');

    // Fire events BEFORE awaiting the init promise — these land while
    // initState === 'loading' and the SDK chunk is still in flight.
    const initPromise = initAnalytics();
    track('event_during_loading_a', { i: 1 });
    track('event_during_loading_b', { i: 2 });

    // Capture should not have been called yet — SDK is still loading.
    expect(captureMock).not.toHaveBeenCalled();

    await initPromise;

    // Both buffered events should now be flushed in enqueue order.
    expect(captureMock).toHaveBeenCalledTimes(2);
    expect(captureMock).toHaveBeenNthCalledWith(1, 'event_during_loading_a', { i: 1 });
    expect(captureMock).toHaveBeenNthCalledWith(2, 'event_during_loading_b', { i: 2 });
  });

  // Audit run 37/001 — bound the queue against pathological growth in case
  // the deferred SDK load stalls and a long-lived tab keeps firing events.
  // The cap is generous (50) for the expected 0–3 deep queue.
  it('drops events past EVENT_QUEUE_MAX while loading', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    const { initAnalytics, track } = await import('@/lib/analytics');

    const initPromise = initAnalytics();
    // Fire 60 events while loading; only the first 50 should buffer.
    for (let i = 0; i < 60; i++) track('flood_event', { i });

    await initPromise;
    expect(captureMock).toHaveBeenCalledTimes(50);
  });

  // Audit run 37/001 — failed init must terminate the queue (no flush, no
  // future captures) so a stuck failure doesn't grow memory or look like a
  // working analytics path.
  it('drops events when init fails — no late flush, no later captures', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    initMock.mockImplementation(() => {
      throw new Error('sessionStorage blocked');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { initAnalytics, track } = await import('@/lib/analytics');

      const initPromise = initAnalytics();
      track('event_during_failed_init', { i: 1 });

      await initPromise;

      // SDK init threw; no captures.
      expect(captureMock).not.toHaveBeenCalled();

      // Subsequent tracks are no-ops.
      track('event_after_failed_init', { i: 2 });
      expect(captureMock).not.toHaveBeenCalled();
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
// production environment for this app. Audit 37/001 keeps this contract
// across the lazy-load refactor — init failures are swallowed, logged, and
// the state machine transitions to 'failed' so subsequent tracks no-op.
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
      await expect(initAnalytics()).resolves.toBeUndefined();
      expect(errSpy).toHaveBeenCalled();
      const logged = String(errSpy.mock.calls[0]?.[0]);
      expect(logged).toContain('analytics_init_failed');
      expect(logged).toContain('sessionStorage blocked');
    } finally {
      errSpy.mockRestore();
    }
  });
});
