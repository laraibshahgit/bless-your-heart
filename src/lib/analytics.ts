import posthog from 'posthog-js';

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  if (!import.meta.env.PROD) return;
  if (!import.meta.env.VITE_POSTHOG_KEY) return;

  // Flip the guard SYNCHRONOUSLY before calling posthog.init. The previous
  // shape only set `initialized = true` inside the async `loaded` callback,
  // which left a window — between this function being called and posthog
  // finishing its network/script init — where a re-entrant initAnalytics()
  // call would pass the guard and run posthog.init() a second time. The only
  // current call site is `main.tsx` outside the React tree, so this is
  // theoretical today, but a future caller inside a `useEffect` under React
  // StrictMode's double-mount cycle would trigger the double-init for real.
  // posthog-js does NOT document idempotency on double-init: each .init()
  // call attaches its own pageview / beforeunload listeners, so a duplicate
  // init produces duplicate pageview captures. The fix is to gate the
  // function at its boundary, the same shape used for `client` in
  // src/server/anthropic.ts and `db` in src/server/firebaseAdmin.ts.
  // Audit run 30/001.
  initialized = true;

  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: false,
    persistence: 'sessionStorage',
    disable_session_recording: true,
    disable_surveys: true,
  });
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, props);
}
