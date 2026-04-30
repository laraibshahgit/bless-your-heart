import posthog from 'posthog-js';

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  if (!import.meta.env.PROD) return;
  if (!import.meta.env.VITE_POSTHOG_KEY) return;

  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: false,
    persistence: 'sessionStorage',
    disable_session_recording: true,
    disable_surveys: true,
    loaded: () => {
      initialized = true;
    },
  });
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, props);
}
