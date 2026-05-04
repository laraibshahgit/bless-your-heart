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

  // Defensive wrap around the SDK init call. PostHog's init touches
  // sessionStorage, attaches DOM listeners, and may dispatch synchronous
  // bootstrap work — Safari Private Mode, Brave on hard mode, and locked-
  // down corporate browsers can throw on storage access alone. The init is
  // called from `main.tsx` BEFORE React mounts; an unhandled throw there
  // would surface as a blank page (the entire app fails to bootstrap because
  // an analytics SDK couldn't access sessionStorage). Catch and log so the
  // app continues to render — analytics is a Low-criticality non-critical
  // dependency and must NEVER block the user flow.
  // Audit run 33/001 (external integration audit).
  try {
    posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
      api_host: import.meta.env.VITE_POSTHOG_HOST,
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: false,
      persistence: 'sessionStorage',
      disable_session_recording: true,
      disable_surveys: true,
    });
  } catch (err) {
    console.error(JSON.stringify({ event: 'analytics_init_failed', error: String(err) }));
  }
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  // Defensive wrap. `posthog.capture` is generally robust but the SDK
  // queues events to sessionStorage and dispatches network requests — both
  // can throw on locked-down browsers or quota-exhausted storage. Without
  // this guard, a throw from the SDK would propagate into the calling
  // component's event handler (e.g. `handleGenerate` in App.tsx), abandoning
  // the user flow mid-generation because an analytics call failed. Analytics
  // is non-critical; failures must be logged and swallowed.
  // Audit run 33/001.
  try {
    posthog.capture(event, props);
  } catch (err) {
    console.error(JSON.stringify({ event: 'analytics_track_failed', error: String(err) }));
  }
}
