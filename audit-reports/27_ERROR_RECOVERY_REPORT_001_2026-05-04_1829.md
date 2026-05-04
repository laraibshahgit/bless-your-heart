# Error Recovery & Resilience Audit — Run 27/001

**Date:** 2026-05-04 18:29 PST
**Branch:** `nightytidy/run-2026-05-01-1532`
**Scope:** 6-phase resilience audit per overnight prompt — timeouts, retries, circuit breakers, partial failure, graceful shutdown, queue/job resilience.
**Test baseline:** 376 → 380 passing (4 new tests added; no regressions).

---

## 1. Executive Summary

**Resilience maturity: moderate.**

The lambda hot path is well-defended. Anthropic calls have explicit per-request timeouts (12s) and prompt caching, the rate-limit Firestore call is bounded by a `Promise.race` with deadline cleanup, the client `fetch` to `/generate` rides on `AbortSignal.timeout(30s)`, and a multi-tier safe fallback exists (`safeFallbacks` photo + line pairs, fail-open on tone/distress check, fail-open on rate-limit error). Prior audit runs (24/001 timer cleanup, 25/001 setTimeout-in-Promise-race scoping, 25/001 rAF throttling, 26/001 prompt caching, 21/001 structured fail-open logs) have closed most of the hot-path gaps.

**Today's audit found one user-visible resilience hole:** `loadImage` in `src/lib/compositor.ts` had **no timeout on `img.decode()`**, and the `onFitFailure` callback path that PosterCanvas already calls in its catch handler **was never wired through PosterReveal to App.tsx**. The compounded effect: if the photo CDN (`firebasestorage.googleapis.com`) ever stalls mid-stream (DNS hang, TLS handshake failure, dropped socket on a degraded mobile connection), the user sees a successful `gen_ok` response come back from `/generate`, watches the loading spinner clear, and is left staring at a blank `<canvas>` indefinitely with no error, no retry button, no escape — only a manual page refresh recovers.

### What happens right now if Firebase Storage goes down for 10 minutes?

* `/generate` continues to return 200 OK with line1/line2/photoId payloads (the lambda never touches Storage; photo metadata is bundled into the lambda from `src/data/photos.json`).
* The **client** then calls `getPhotoUrl(photoId)` → `loadImage(url)` → `img.decode()`.
* Pre-fix: `decode()` never settled. The user sat on a blank `<canvas role="img">` until the tab died or they refreshed. There was no timeout, no fallback, no observable signal in the browser console (no `poster_render_failed` log, no error state transition).
* Post-fix: `decode()` races against a 15-second wall-clock timeout; on fire, it rejects with `Image load timeout after 15000ms: <url>`, the PosterCanvas catch handler logs `{ event: 'poster_render_failed', error: ... }` for ops grep AND now invokes the wired-through `onCanvasFailure` handler in App.tsx, which transitions state to `error` with `errorCopy.frontend.canvasWriteFailed` ("The image didn't quite render. One more try?") and a retryable affordance. Recovery is one button click.

### Top 5 resilience gaps (ordered by impact)

1. **Hung photo CDN strands user on blank canvas** — fixed in this audit (loadImage timeout + onCanvasFailure wiring).
2. **Anthropic SDK `maxRetries` defaults to 2 stacked on top of our outer 3-attempt retry loop** — worst case ~9 attempts × 12s = 108s per request, well past Netlify's 26s lambda kill. In practice the lambda is force-killed and the user sees a 5xx that maps to the retry copy. Documented; no fix tonight (changing SDK retries to 0 would lose tuned exponential backoff).
3. **`onFitFailure` was a phantom callback** — declared in PosterCanvas but never passed by PosterReveal. Pre-fix this had been silently dead-coded since audit run 21/001 added it. Fixed in this audit.
4. **Rate-limit fail-open is unmonitored** — when Firestore is unreachable >3s, we fail open (`rateResult = null`, no rate-limit headers attached) and log `rate_limit_check_failed`. There's no alerting on log volume; an extended Firestore outage could enable abuse without anyone noticing. Documented; needs ops-side monitoring (out of code scope).
5. **No graceful shutdown handler in the lambda** — Netlify Functions / AWS Lambda manages the runtime, but a stray `setTimeout` left armed across an invocation boundary (closed in 25/001 for the rate-limit timer; same pattern would silently re-emerge if a new feature adds an unbounded timer). Documented as a forward-looking convention to thread into CLAUDE.md if more timers are added.

---

## 2. Timeout Audit

### Inventory of every external/I-O call

| # | Operation | File | Pre-audit timeout | Post-audit timeout | Notes |
|---|---|---|---|---|---|
| 1 | `anthropic.messages.create` (generation, Sonnet) | `src/server/anthropic.ts:104` | 12_000ms via `{ timeout }` SDK arg | unchanged | Closed in earlier run; threaded as `ANTHROPIC_REQUEST_TIMEOUT_MS` |
| 2 | `anthropic.messages.create` (tone check, Haiku) | `src/server/anthropic.ts:151` | 12_000ms | unchanged | Same convention |
| 3 | `anthropic.messages.create` (distress check, Haiku) | `src/server/safety.ts:69` | 12_000ms | unchanged | Same convention |
| 4 | Firestore `runTransaction` (rate-limit) | `src/server/rateLimit.ts:59`, called from `netlify/functions/generate.ts:172` | 3_000ms via `Promise.race` + `setTimeout`; cleaned up in `finally` | unchanged | Closed in run 25/001 |
| 5 | Client `fetch('/.netlify/functions/generate')` | `src/lib/api.ts:18` | 30_000ms via `AbortSignal.timeout` | unchanged | Closed in earlier run |
| 6 | `img.decode()` (photo from Firebase Storage) | `src/lib/compositor.ts:44` | **NONE** — could hang forever | **15_000ms via `Promise.race` with timer cleanup** | **Fixed in this audit** |
| 7 | `document.fonts.ready` + `document.fonts.load(...)` | `src/lib/fonts.ts:9-13` | none | none | Browser-internal, well-bounded; failure surfaces as a system-serif fallback that visibly differs but doesn't hang |
| 8 | `posthog.init` / `posthog.capture` | `src/lib/analytics.ts:10` | n/a — fire-and-forget telemetry | unchanged | If posthog.com is unreachable, `loaded` callback never fires, `initialized` stays false, every `track()` is a no-op (correct fail-silent behavior for analytics) |
| 9 | `canvas.toBlob` (download) | `src/lib/download.ts:18` | none (browser-internal) | unchanged | Catch path returns `false` → status='error' → user-visible error message |
| 10 | DOM `Image()` constructor (hero examples, eager-loaded) | `src/components/HeroExamples.tsx` | none — browser-managed | unchanged | Failure → broken-image icon; not user-blocking |

### Operations still without explicit timeouts

* **Browser font loading (`document.fonts.ready`)**: no explicit cap. The font system in modern browsers eventually times out internally and falls back to a system serif. This is acceptable because (a) failure mode is graceful (system fallback renders, just with the wrong typography), (b) the main pipeline awaits `ensureFontsReady()` before measuring/drawing, so there's no infinite hang. If we ever need a hard cap, the `errorCopy.frontend.fontLoadTimeout` string already exists for the eventual UX.
* **PostHog `init`**: the `loaded` callback is the only signal that initialization completed. If posthog.com is unreachable, `initialized` stays `false` and `track()` is a permanent no-op. This is the *correct* design for analytics — telemetry must never block product behavior — but it does mean we silently lose analytics during an outage with no observability into "we should be capturing more events." Out of scope.

### Fix delta

Added to `src/lib/compositor.ts`:

```ts
export const IMAGE_LOAD_TIMEOUT_MS = 15_000;

export async function loadImage(url, timeoutMs = IMAGE_LOAD_TIMEOUT_MS) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  let timeoutHandle;
  try {
    await Promise.race([
      img.decode(),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          img.src = '';
          reject(new Error(`Image load timeout after ${timeoutMs}ms: ${url}`));
        }, timeoutMs);
      }),
    ]);
    return img;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}
```

Tests added: 4 new cases in `tests/client/compositor.test.ts` covering (1) decode-resolves-before-timeout success, (2) decode-hangs → reject with descriptive message, (3) clearTimeout cleanup on success path (no dangling setTimeout firing after resolve), (4) underlying decode-error propagation.

---

## 3. Retry Logic Audit

### Existing retries

| Operation | Correct? | Issues | Fix |
|---|---|---|---|
| **Outer generation loop in `generate.ts`** (3 attempts: 1 + MAX_RETRIES=2) | mostly correct | No exponential backoff; no error-class filter (retries on 4xx Anthropic errors that won't recover); no time-budget tracking | Documented — fixing changes business behavior; SDK has its own backoff and lambda kill provides the time bound |
| **Anthropic SDK built-in retries** (default `maxRetries: 2`, exponential backoff with jitter) | well-tuned | Stacks with our outer loop → up to 9 attempts × 12s = 108s worst case | Documented; lambda kill at 26s makes this effectively bounded |
| **Rate-limit Firestore txn** (no retry, fail-open) | correct | Fail-open enables abuse during sustained outage | Out of scope — needs alerting, not retry |
| **Client `fetch` → `/generate`** (no retry; user manually retries via "Try Again" button) | correct | User-driven retry is the right pattern; auto-retry would burn lambda budget | None |
| **`canvas.toBlob`** (no retry) | correct | Synchronous-ish; failure is in our code, not transient | None |

### Retries added in this audit

None. Retries are inherently behavior-changing; the existing strategy is correct for the workload.

### Operations that need retries but don't have them — and why no fix

* **`loadImage`**: a single-fetch failure on a flaky cellular connection often recovers on retry. But auto-retry would (a) add 15s+ to the worst-case wait, (b) fight the user-driven "Regenerate" affordance which already retries the whole pipeline including a *different* photo selection. User-controlled retry is the right pattern here.
* **PostHog `capture`**: telemetry, fail-silent is correct.

---

## 4. Circuit Breaker & Fallback Recommendations

| Dependency | Current failure mode | Recommended config | Fallback behavior | Effort |
|---|---|---|---|---|
| **Anthropic API** | 12s timeout per call → outer retry loop (3 attempts) → `safeFallbacks` array of 6 pre-baked line/photo pairs returned with `status: 'safe_fallback'` | No circuit breaker needed at this scale; existing 3-tier fallback (retry → fallback array → user-visible error if even fallback fails to ship) is appropriate | Already implemented via `respondWithSafeFallback` | n/a — already done |
| **Firestore (rate-limit)** | 3s timeout → fail-open with `console.error('rate_limit_check_failed')`, no rate-limit headers attached to response | Add log-volume alert in Netlify/Datadog: ≥10 events/min for 5min → page on-call. No code change required. | Fail-open already implemented; the gap is observability | Low — pure ops config |
| **Firebase Storage (photos)** | Pre-fix: `loadImage` hangs forever, blank canvas. Post-fix: 15s timeout → reject → `onCanvasFailure` → state=`error` with retryable copy | If Storage outage rate exceeds X% over Y minutes, switch to inline base64 photo data in the lambda response (would require reshaping `safeFallbacks` to embed image bytes) | Today: user sees retryable error after 15s. Future: inline photo bytes in `safe_fallback` response | Medium — only worth doing if Storage outages become a recurring incident |
| **PostHog (analytics)** | Init silently fails; `track()` becomes permanent no-op. No user-visible impact, no observability into "we're missing events" | None needed — telemetry must not block product. Optional: add a fallback log line for critical funnel events | Already correct | n/a |
| **Cormorant Garamond fonts (@fontsource bundled)** | If browser fails to decode the bundled font, system serif renders. The two-line typography is visibly wrong but the joke still lands | None needed — already inlined into the bundle, no network dependency | Already correct | n/a |

---

## 5. Partial Failure Analysis

### Multi-step operations

| Operation | Steps | Failure modes | Current handling | Fixes applied | Remaining risk |
|---|---|---|---|---|---|
| **`/generate` lambda** | 1. Origin allowlist · 2. Zod validation · 3. Rate-limit txn · 4. Slur filter · 5. Real-person filter · 6. Distress phrase list · 7. Distress Haiku · 8. Generation loop (Sonnet × 3) · 9. Tone check (Haiku) · 10. Photo selection · 11. Response | Anthropic outage at step 8 → retries → safe_fallback. Firestore outage at step 3 → fail-open → continue. Photo selection no-match → safe_fallback. | All paths are well-defined; safe_fallback is the universal exit valve | None | None — pipeline is well-defended |
| **Client poster pipeline** | 1. Receive `ok` from API · 2. Set state=`settled` · 3. PosterCanvas mounts · 4. `getPhotoById(photoId)` · 5. `ensureFontsReady()` · 6. `loadImage(getPhotoUrl(photoId))` · 7. `checkFit` · 8. `composite` · 9. `onReady` → scroll into view | Step 6 hung CDN → blank canvas. Step 7 fit miss → blank canvas. Step 8 canvas exception → blank canvas. | Pre-fix: catch handler called `onFitFailure?.()` which was undefined → silent dead end. Post-fix: timeout on step 6 + handler wired through `onCanvasFailure` → state transitions to `error` with retryable affordance | `loadImage` timeout, `onCanvasFailure` wired through PosterReveal → App, error transition | The "Try Again" button on the error state re-runs `handleGenerate()`, which re-rolls `excludePhotoIds` and gets a different photo — sidesteps a single-CDN-edge-bad-photo failure mode for free |
| **Rate-limit Firestore write** | 1. `tx.get(docRef)` · 2. Compute new state · 3. `tx.set` or `tx.update` | Network drop between get and set → transaction aborts and retries automatically (Firestore SDK guarantee). Outage past 3s → outer `Promise.race` fires → fail-open. | Firestore SDK handles step-level retry; our fail-open handles the SDK-level outage | None | TTL policy on `rateLimits.expiresAt` is configured in Firebase console, not in code — if the policy is missing, the collection grows forever despite tests passing. **Documented in CLAUDE.md** |
| **Download** | 1. `canvas.toBlob` · 2. `saveAs(blob, filename)` | toBlob returns null → return false. saveAs throws → catch returns false. Both surface as `status='error'` | Already correct | None | None |

### External side effects inside transactions?

Reviewed — there are none. The Firestore txn is purely Firestore-internal. No emails, no third-party calls, no file writes happen inside any transaction boundary.

---

## 6. Graceful Shutdown

### Current state

Netlify Functions runs each invocation on AWS Lambda. The runtime owns SIGTERM/SIGINT handling; our code doesn't (and shouldn't) install handlers. The Anthropic SDK and Firebase Admin SDK manage their own connection lifecycle.

The one footgun in this runtime is **state that survives across invocations on a warm container**. AWS Lambda freezes the event loop between invocations; an unfired `setTimeout` carries into the next request. Closed in run 25/001 with `try/finally + clearTimeout` on the rate-limit deadline timer.

### Resource cleanup checklist

| Resource | Cleaned up? | Notes |
|---|---|---|
| Anthropic HTTP connections | yes — managed by SDK keep-alive | per-call timeout limits worst case |
| Firestore connections | yes — managed by `firebase-admin` | `getDb()` is lazy-init at module load, reused across invocations |
| `setTimeout` handles | yes — closed in run 25/001 (`finally`-clear pattern in `generate.ts:208`) | Convention threaded into CLAUDE.md |
| `setInterval` handles | n/a — none exist | grep confirms |
| File handles | n/a — no fs operations on the request path | |
| In-flight Promises | n/a — request lifecycle ends with handler return | |

### Forward-looking convention

If a future feature adds a hand-rolled `setTimeout` (not via the SDK timeout option), it MUST capture the handle and clear it in a `finally`. Pinned in CLAUDE.md by run 25/001; document inherits.

---

## 7. Queue & Job Resilience

This codebase has **no message queues, no background jobs, no scheduled functions, no webhook handlers, no DLQ infrastructure**. The architecture is a single synchronous lambda endpoint.

**Verified by grep:**
* No `bull`, `bullmq`, `agenda`, `bee-queue`, `pg-boss` in `package.json`.
* No SQS / Pub/Sub / Kafka client libraries.
* No Netlify scheduled functions (`netlify/edge-functions/` and `netlify/scheduled/` don't exist).
* No `setInterval` anywhere in `src/` or `netlify/`.

This phase is a no-op. If async work is ever added (e.g. email send-after-share, background photo re-optimization), revisit this section.

---

## 8. Cascading Failure Risk Map

```
                     User browser
                        │
                        │ fetch (30s AbortSignal cap)
                        ▼
         Netlify Function: /generate
            │     │     │     │     │
            ▼     ▼     ▼     ▼     ▼
       Firestore  Anthropic  Anthropic
       (rate)    (Sonnet)   (Haiku)
                                   │
                                   └─→ tone + distress checks

                     User browser
                        │ on success
                        ▼
              Firebase Storage
              (loadImage 15s cap)
                        │
                        ▼
              Canvas composite (in-process)
                        │
                        ▼
              file-saver download (in-process)
```

### Critical paths and blast radius

| Dependency | Scope of impact when down | Detection latency | Recovery latency | Has fallback? |
|---|---|---|---|---|
| **Anthropic API** | 100% of generation requests | 12s per attempt, ~36s to safe_fallback | Immediate when service returns | Yes — `safeFallbacks` array |
| **Firebase Storage** | 100% of post-generation poster renders | Pre-fix: ∞. Post-fix: 15s. | Immediate when service returns | Now: user-visible error + retry. Pre-fix: silent strand |
| **Firestore (rate-limit)** | None to the user (fail-open) — but enables abuse during outage | Immediate (3s timeout) | Immediate when service returns | Fail-open |
| **PostHog** | Telemetry only, no user impact | n/a | n/a | Silent no-op |
| **Cormorant Garamond fonts** | Typography degrades to system serif | Browser-managed | Browser-managed | System fallback |

**No single dependency outage today causes a hard product failure.** Pre-fix, Firebase Storage was the exception (silent strand on a blank canvas); post-fix it falls into the standard error/retry pattern.

---

## 9. Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---|---|---|---|---|
| 1 | ~~Add timeout to `loadImage` and wire `onFitFailure` through PosterReveal → App~~ | ~~Hung CDN no longer strands user on blank canvas~~ | ~~High~~ | ~~Yes~~ | **Done in this audit.** Test count went 376 → 380. |
| 2 | Add ops alerting on `rate_limit_check_failed` log volume | Detect Firestore outages before abuse exploits the fail-open | Medium | Probably | Pure ops/observability config — Netlify log drain → Datadog/Sentry, threshold ≥10 events/5min pages on-call. No code change. |
| 3 | Thread loadImage timeout convention into CLAUDE.md alongside the existing Anthropic/setTimeout/rate-limit timeout rules | Prevent regression on future image fetch additions | Low | Yes (next audit run) | Single line under "Frontend": "Any image fetch that awaits `decode()` MUST race a wall-clock timeout via `loadImage(url, ms)` — bare `decode()` will hang indefinitely on a stalled CDN." |
| 4 | Set `maxRetries: 0` on the Anthropic SDK client and rely on the outer retry loop | Tighter worst-case latency (36s vs 108s) — both still over 26s lambda budget but more predictable | Low | Only if time allows | Behavior change. The SDK's exponential-backoff-with-jitter is well-tuned for transient 5xx; our outer loop has none. Net outcome may be MORE fallbacks under flaky upstream. Don't do without staged rollout. |
| 5 | Add error-class filter to outer retry loop (skip retries on Anthropic 4xx errors) | Save up to 24s per request on guaranteed-fail inputs | Low | Only if time allows | Need to detect 4xx via `err instanceof Anthropic.BadRequestError` etc. Worth it only if 4xx errors become common in practice (today they're vanishingly rare since we control the prompt format). |
| 6 | Inline photo bytes in `safe_fallback` response payload | Decouples worst-case generation outage from photo CDN outage | Low | No | Currently `safe_fallback` returns a `photoId` referencing the same Firebase-Storage-hosted assets. If both Anthropic AND Storage are down, the fallback also fails. Edge case — both providers + the fallback path going simultaneously is rare. |
| 7 | Add monitored DLQ infrastructure | n/a — no async work in codebase | n/a | No | The architecture has no async work. Reopen if/when added. |
| 8 | Chaos / failure injection tests | Catch resilience regressions before prod | Medium-Low | Probably | Add a `tests/chaos/` suite that mocks each external dep to fail/hang and asserts the lambda still responds within budget. Not done tonight (would expand the test surface considerably). The current contract+integration test split already covers the main paths. |

---

## 10. Changes Made

| File | Change | LoC |
|---|---|---|
| `src/lib/compositor.ts` | Add `IMAGE_LOAD_TIMEOUT_MS = 15_000` and rewrite `loadImage` to race `img.decode()` with a setTimeout, clearing the handle in `finally` | +30 / -3 |
| `src/components/PosterReveal.tsx` | Add optional `onCanvasFailure` prop and pass it through as `onFitFailure` to `PosterCanvas` | +6 / -1 |
| `src/App.tsx` | Add `handleCanvasFailure` callback that transitions state to `error` with `errorCopy.frontend.canvasWriteFailed` and `retryable: true`; pass to `PosterReveal` as `onCanvasFailure` | +14 / -1 |
| `tests/client/compositor.test.ts` | Add 4 new tests under a new `describe('loadImage', ...)` block: success path, timeout rejection, clearTimeout cleanup verification, decode-error propagation | +75 |

**Verification:** `npm test` → 380 passing (was 376). `npm run typecheck` → clean.

