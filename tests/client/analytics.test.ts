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
    // Simulate the loaded callback firing
    const opts = initMock.mock.calls[0][1];
    opts.loaded?.();
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
    // Trigger the loaded callback to set initialized=true
    const opts = initMock.mock.calls[0][1];
    opts.loaded?.();

    track('prompt_submitted', { source: 'preset', length: 12 });
    expect(captureMock).toHaveBeenCalledWith('prompt_submitted', { source: 'preset', length: 12 });
  });

  it('passes undefined props when none provided', async () => {
    vi.stubEnv('PROD', true as any);
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_real_key');
    const { initAnalytics, track } = await import('@/lib/analytics');
    initAnalytics();
    const opts = initMock.mock.calls[0][1];
    opts.loaded?.();

    track('plain_event');
    expect(captureMock).toHaveBeenCalledWith('plain_event', undefined);
  });
});
