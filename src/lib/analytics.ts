// Lazy-loaded PostHog SDK. The SDK is ~70 KB ungzip / ~24 KB gzip and is not
// critical for first paint — it's an observation tool, not a function of the
// app. Pre-fix it was a top-level `import posthog from 'posthog-js'`, which
// pulled the entire SDK into the main bundle and made the parse-execute cost
// part of every cold load. Audit run 37/001 deferred the SDK load:
//
//   1. `initAnalytics()` flips the synchronous `initState` flag immediately so
//      the audit-30/001 idempotency contract still holds (no double-init under
//      StrictMode dev double-mount).
//   2. The actual `import('posthog-js')` is scheduled past first paint via
//      `requestIdleCallback` (with a `setTimeout` fallback for jsdom + Safari
//      <16.4). The browser is free to render the page before the SDK arrives.
//   3. `track()` calls fired between `initAnalytics()` and the SDK landing are
//      buffered in `eventQueue` and flushed when the SDK is ready. The queue
//      bound prevents pathological growth if the deferred load fails.
//   4. The 'inactive' (non-prod / no key) and 'failed' states never queue or
//      capture — they're terminal no-ops.
//
// Audit-31/30/33 invariants preserved end-to-end:
//   - 30/001: synchronous `initState` flip prevents double-init.
//   - 33/001: every PostHog call (init, capture, queued capture flush) is
//     wrapped in try/catch so SDK errors never propagate into App.tsx flows.
//   - 33/001: failures are logged with the structured shape
//     `{ event: 'analytics_X_failed', error: String(err) }`.

type PosthogModule = typeof import('posthog-js').default;

type InitState = 'pending' | 'inactive' | 'loading' | 'active' | 'failed';
let initState: InitState = 'pending';
let posthogInstance: PosthogModule | null = null;

// Hard cap on the queued-event buffer. The expected queue depth is 0–3
// events (the time between initAnalytics() and SDK-loaded is typically
// <300 ms post-paint, during which a user can fire at most one or two
// events). 50 is generous headroom; past that we drop events rather than
// growing memory unbounded if the deferred load fails or stalls.
const EVENT_QUEUE_MAX = 50;
const eventQueue: Array<[string, Record<string, unknown> | undefined]> = [];

function logFailure(event: string, err: unknown): void {
  console.error(JSON.stringify({ event, error: String(err) }));
}

function captureSafely(ph: PosthogModule, event: string, props?: Record<string, unknown>): void {
  try {
    ph.capture(event, props);
  } catch (err) {
    logFailure('analytics_track_failed', err);
  }
}

function scheduleIdle(cb: () => void): void {
  // requestIdleCallback isn't in Safari <16.4 / older WebViews / jsdom; fall
  // back to setTimeout(0) which still yields after the current task. We pick
  // 'idle' over a fixed delay so the SDK doesn't compete with the first paint
  // on slow devices — rIC fires only when the browser has spare cycles.
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => cb(), { timeout: 2000 });
  } else {
    setTimeout(cb, 0);
  }
}

export function initAnalytics(): Promise<void> {
  if (initState !== 'pending') return Promise.resolve();

  if (!import.meta.env.PROD || !import.meta.env.VITE_POSTHOG_KEY) {
    initState = 'inactive';
    return Promise.resolve();
  }

  // Flip to `loading` SYNCHRONOUSLY so a re-entrant call (e.g. a future
  // useEffect under StrictMode dev double-mount) is a no-op even before the
  // dynamic import resolves. Mirrors the audit-30/001 contract.
  initState = 'loading';

  return new Promise<void>((resolve) => {
    scheduleIdle(() => {
      void (async () => {
        try {
          const mod = await import('posthog-js');
          const ph = mod.default;
          ph.init(import.meta.env.VITE_POSTHOG_KEY, {
            api_host: import.meta.env.VITE_POSTHOG_HOST,
            autocapture: false,
            capture_pageview: true,
            capture_pageleave: false,
            persistence: 'sessionStorage',
            disable_session_recording: true,
            disable_surveys: true,
          });
          posthogInstance = ph;
          initState = 'active';

          // Flush any events fired between initAnalytics() returning and the
          // SDK becoming active. Drain order = enqueue order so the funnel
          // remains causally consistent.
          for (const [event, props] of eventQueue) {
            captureSafely(ph, event, props);
          }
          eventQueue.length = 0;
        } catch (err) {
          // posthog.init can throw on Safari Private Mode, Brave hard mode,
          // and locked-down corporate browsers (sessionStorage access, DOM
          // listener attach). The dynamic import itself can throw on a chunk
          // 404 or aborted fetch. Either way the right behavior is the same:
          // log + give up + drop the queue. Analytics is non-critical.
          logFailure('analytics_init_failed', err);
          initState = 'failed';
          eventQueue.length = 0;
        } finally {
          resolve();
        }
      })();
    });
  });
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (initState === 'pending' || initState === 'inactive' || initState === 'failed') {
    // Either initAnalytics() hasn't been called yet (pending), the env said
    // analytics is disabled (inactive), or the deferred load failed (failed).
    // All three are intentional no-ops.
    return;
  }

  if (initState === 'loading') {
    // SDK still loading — buffer for flush. The queue drains in initAnalytics's
    // success branch; a `failed` transition discards the queue (the events were
    // never going to land anyway since the SDK is gone).
    if (eventQueue.length < EVENT_QUEUE_MAX) {
      eventQueue.push([event, props]);
    }
    return;
  }

  // initState === 'active' — posthogInstance is non-null by construction
  // (set in the same atomic block as the state transition).
  if (posthogInstance) {
    captureSafely(posthogInstance, event, props);
  }
}
