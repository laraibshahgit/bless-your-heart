# Resource Lifecycle & Cleanup Audit — Run 28/001

**Date:** 2026-05-04 18:48 PT
**Branch:** `nightytidy/run-2026-05-01-1532`
**Scope:** Every resource the app creates — connections, handles, listeners, timers, in-memory caches — traced from creation to destruction across happy-path and error-path scenarios.
**Baseline tests:** 380 / 380 passing in 1.08s. Typecheck clean.
**Post-fix tests:** 380 / 380 passing in 1.08s. Typecheck clean.

---

## Summary

The codebase enters this audit in genuinely good shape. Recent audit runs (24/001 timer cleanup, 25/001 setTimeout-in-finally + rAF coalescing, 26/001 Anthropic per-request timeout, 27/001 image decode timeout) closed every previously-known resource lifecycle issue. **One narrow state-machine race** survived those passes and is fixed here: a stale `PosterCanvas` effect could call `onFitFailure` after unmount, overwriting App's freshly-set `loading` state with `error`. No leaks, no orphaned timers, no unreleased connections found.

---

## Phase 1: Resource Inventory

The app is a single-page React + Netlify Function backend. There are no databases other than Firestore (used only for rate-limit docs), no file system writes, no child processes, no WebSockets, no message queues. The full inventory:

### Backend (Netlify Lambda)

| # | Resource | File:Line | Pool/Singleton | Cleanup | Status |
|---|----------|-----------|----------------|---------|--------|
| 1 | Anthropic SDK client | `src/server/anthropic.ts:48` | Module-scope singleton | None needed (HTTP keep-alive across warm invocations; SDK manages sockets) | OK |
| 2 | Firestore client | `src/server/firebaseAdmin.ts:24` | Module-scope singleton | None needed (gRPC channel reused across warm invocations) | OK |
| 3 | Rate-limit `setTimeout` (Promise.race deadline) | `netlify/functions/generate.ts:181` | Per-request | `clearTimeout` in `finally` block (line 208) | OK (closed by run 25/001) |
| 4 | Anthropic per-call timeout | `src/server/anthropic.ts:116`, `:162`; `src/server/safety.ts:81` | Per-request | SDK-managed via `{ timeout: ANTHROPIC_REQUEST_TIMEOUT_MS }` | OK |
| 5 | Static lookup arrays (slur regex / public-figure regex / lowercased phrases) | `src/server/safety.ts:12,32,47` | Module-load preallocated | N/A — long-lived frozen data | OK (closed by run 25/001) |
| 6 | Firestore transaction handle | `src/server/rateLimit.ts:59` | Per-request | Auto-released by `runTransaction` | OK |

### Frontend

| # | Resource | File:Line | Per-mount/Singleton | Cleanup | Status |
|---|----------|-----------|---------------------|---------|--------|
| 7 | `window.resize` listener (PosterCanvas) | `src/components/PosterCanvas.tsx:40` | Per-mount | `removeEventListener` in useEffect cleanup (`:42`) | OK |
| 8 | `requestAnimationFrame` (resize coalesce) | `src/components/PosterCanvas.tsx:35` | Per-mount | `cancelAnimationFrame` in cleanup (`:43`) | OK (closed by run 25/001) |
| 9 | Image decode timeout | `src/lib/compositor.ts:70` | Per-image | `clearTimeout` in `finally` (`:81`) | OK (closed by run 27/001) |
| 10 | `DownloadButton` auto-reset `setTimeout` | `src/components/DownloadButton.tsx:38,50` | Per-mount | Captured in `resetRef`, cleared on unmount + before re-arm | OK (closed by run 25/001) |
| 11 | `PromptInput` debounce `setTimeout` | `src/components/PromptInput.tsx:61` | Per-mount | Captured in `debounceRef`, cleared on unmount + before re-arm | OK (closed by run 25/001) |
| 12 | `App.sleep()` `setTimeout` (loading-floor) | `src/App.tsx:21` | Per-call | Fire-and-forget Promise; resolves and frees | OK |
| 13 | `AbortSignal.timeout` (callGenerate) | `src/lib/api.ts:22` | Per-fetch | Browser-managed; auto-collected when fetch settles | OK |
| 14 | `fetch` socket | `src/lib/api.ts:18` | Per-call | Browser HTTP stack | OK |
| 15 | `new Image()` (loadImage) | `src/lib/compositor.ts:61` | Per-load | GC after Promise settles + `cancelled` flag in caller | OK |
| 16 | Offscreen canvas (checkFit) | `src/lib/compositor.ts:187` | Per-call | Local var; GC after function returns | OK |
| 17 | `canvas.toBlob` Blob (download) | `src/lib/download.ts:19` | Per-download | Handed to `file-saver`, which `createObjectURL` → `revokeObjectURL` (verified in `node_modules/file-saver/dist/FileSaver.js:116-118,174-179`) | OK |
| 18 | sessionStorage entry `byh:lastPrompt` | `src/components/PromptInput.tsx:62` | Browser-scoped | Browser-managed (cleared on tab close); 200-char cap bounds size | OK |
| 19 | `document.fonts.ready` + `document.fonts.load` promises | `src/lib/fonts.ts:9-13` | Module-scope cached promise | Native font registry; one-time setup | OK |
| 20 | PostHog SDK | `src/lib/analytics.ts:10` | Module-scope singleton | App-level; no SPA route changes; lives until tab close | OK |
| 21 | React `lazy` chunk for `DistressInterstitial` | `src/App.tsx:14` | Module-scope cached | Standard Vite/webpack chunking; long-lived | OK |
| 22 | `useEffect` `cancelled` closure flag (PosterCanvas image-load) | `src/components/PosterCanvas.tsx:48` | Per-mount | Cleanup function sets `cancelled = true` (`:82`) | **One stale-effect race — fixed below** |

### What this codebase doesn't use

For completeness, here's the resource categories the audit prompt asked about that are **absent** from this codebase:

- **No traditional database connection pools** (Postgres / MySQL / MongoDB) — the only persistence is Firestore for rate-limit docs, which uses a long-lived singleton gRPC channel
- **No file system writes** in the lambda or client — no temp files, no upload handling, no generated artifacts on disk (downloads stream straight to the browser via Blob)
- **No child processes** (`exec`, `spawn`, `fork`) — pure Node.js + Anthropic SDK calls
- **No worker threads** (`worker_threads`)
- **No WebSockets** (`ws`, `socket.io`) — stateless HTTP only
- **No raw TCP/UDP sockets**
- **No file watchers** (`fs.watch`, `chokidar`)
- **No process-level signal handlers** (`SIGTERM`, `SIGINT`) — Netlify Lambda runtime handles container lifecycle
- **No in-memory caches with eviction risk** — all "caches" are module-load constants (slur regex, font promise) with bounded size
- **No streams** (`fs.createReadStream`, `fs.createWriteStream`)
- **No `setInterval`** anywhere in the codebase

The architectural simplicity (single endpoint, single SPA, no auth, no database of user content) eliminates entire classes of resource lifecycle risk by design.

---

## Phase 2-3: Happy-path & error-path lifecycle tracing

Every resource above was traced through both happy and error paths. Highlights:

**Anthropic per-call timeout** (`anthropic.ts:116, :162`, `safety.ts:81`):
- Threaded into all three `messages.create` call sites: `generateLines`, `checkTone`, `checkDistressWithHaiku`.
- The SDK's built-in `{ timeout: ANTHROPIC_REQUEST_TIMEOUT_MS }` arg handles AbortController cleanup internally — no hand-rolled `setTimeout`/`clearTimeout` needed.
- Failure path: timeout rejects the promise, caller's `try/catch` logs structured event, fail-open or retry.

**Rate-limit Promise.race timer** (`generate.ts:170-209`):
- `setTimeout` armed on every limited request; `clearTimeout` lives in `finally` block.
- Critical because Lambda warm-container freeze carries pending timers across invocations. Verified by reading lines 174-180 (the comment explicitly calls out this caveat).

**Image decode timeout** (`compositor.ts:65-82`):
- 15-second wall-clock cap; on success, `finally` clears the timer; on timeout, the timer self-clears by firing.
- Pre-fix (run 27/001), a stalled CDN left `decode()` pending forever and the user saw a blank canvas with no error path.

**Canvas blob → download** (`download.ts:16-31`):
- `canvas.toBlob` → Blob → `file-saver`'s `saveAs` internally does `URL.createObjectURL(blob)` → click anchor → `URL.revokeObjectURL(url)` synchronously after the browser starts the download (verified at `node_modules/file-saver/dist/FileSaver.js:116-118` and `:174-179`).
- No leaked Object URLs.

**rAF coalescing for resize** (`PosterCanvas.tsx:32-44`):
- Frame handle stored in outer closure; resize handler short-circuits if a frame is already queued; cleanup cancels any pending frame.
- Without coalescing, every resize fire (60+/sec during drag) would re-execute the image-load effect.

---

## Phase 4: Event listener audit

Only **two** listeners exist in the entire codebase:

| # | Event | Target | Registered | Removed | Verdict |
|---|-------|--------|------------|---------|---------|
| 1 | `resize` | `window` | `PosterCanvas.tsx:40` (useEffect) | `PosterCanvas.tsx:42` (cleanup) | OK |
| 2 | (none) | — | — | — | — |

No `addEventListener` calls outside of PosterCanvas. No `EventEmitter` use. No `process.on(...)` handlers. No accumulating listener risk.

---

## Phase 5: Timer audit

Eight `setTimeout` call sites total. **Zero `setInterval` call sites** in the entire codebase.

| # | Type | Purpose | Created At | Cleanup | Overlap Risk | Verdict |
|---|------|---------|------------|---------|--------------|---------|
| 1 | setTimeout | App loading-floor (`sleep`) | `App.tsx:21` | Fire-and-forget — Promise resolves and frees | None — single shot | OK |
| 2 | setTimeout | Image decode race deadline | `compositor.ts:70` | `clearTimeout` in `finally` (`:81`) | None | OK |
| 3 | setTimeout | DownloadButton error auto-reset | `DownloadButton.tsx:38` | `clearTimeout` on unmount + before re-arm | None | OK |
| 4 | setTimeout | DownloadButton success auto-reset | `DownloadButton.tsx:50` | Same as above | None | OK |
| 5 | setTimeout | PromptInput debounce | `PromptInput.tsx:61` | `clearTimeout` on unmount + before re-arm | None | OK |
| 6 | setTimeout | Rate-limit Promise.race deadline | `generate.ts:181` | `clearTimeout` in `finally` (`:208`) | None | OK |
| 7 | requestAnimationFrame | Resize coalesce | `PosterCanvas.tsx:35` | `cancelAnimationFrame` in cleanup (`:43`) | None — guarded by `frame !== 0` short-circuit | OK |
| 8 | AbortSignal.timeout | Client fetch deadline | `api.ts:22` | Browser-managed, GC'd with signal | None | OK |

No timer-ID-loss bugs (every `setTimeout` either captures the handle or is intentionally fire-and-forget). No async-callback overlap risk (no `setInterval` exists; only one polling-shaped pattern, the rate-limit Promise.race, has a strict 1:1 timer-to-call relationship).

---

## Phase 6: Cache & buffer audit

- **No in-memory caches with eviction risk.** The only "caches" are module-load constants:
  - `SLUR_PATTERNS` regex array (~tens of entries, frozen at module-eval) — `safety.ts:12`
  - `PUBLIC_FIGURE_PATTERNS` regex array (currently empty) — `safety.ts:32`
  - `DISTRESS_PHRASES_LOWER` lowercased copies (~30 phrases) — `safety.ts:47`
  - `fontsReadyPromise` (singleton Promise) — `fonts.ts:3`
  - `_db` Firestore singleton — `firebaseAdmin.ts:4`
  - `client` Anthropic singleton — `anthropic.ts:44`
- **Bounded user-controlled state:** `excludePhotoIds` accumulator in `App.tsx:108` is sliced with `.slice(-MAX_EXCLUDE_PHOTO_IDS)` (cap = 50). Cannot grow unbounded across a long regenerate session.
- **Bounded sessionStorage:** `byh:lastPrompt` is capped at `MAX_PROMPT_LENGTH = 200` chars on both write (browser maxLength) and restore (`PromptInput.tsx:48` defensive `.slice(0, MAX_PROMPT_LENGTH)`).
- **Firestore TTL:** `rateLimits` collection writes `expiresAt = windowStart + 1 hour`. The Firestore TTL policy must be configured at the project level for actual deletion (operational dependency documented in CLAUDE.md). The code-side contract is correct.

No accumulation risk found.

---

## Phase 7-8: Child processes & shutdown paths

- **No child processes.** No `spawn`, `exec`, `fork`, `Worker`, or `worker_threads` use.
- **No application-level shutdown handler needed.** Netlify Functions run on AWS Lambda where the container handles its own teardown; the only resources the lambda holds across invocations (Anthropic singleton, Firestore singleton) are reused intentionally to avoid cold-start cost. The host runtime kills the container on idle timeout.
- **No SIGTERM/SIGINT handlers.** Not applicable to the Netlify Lambda runtime.
- **Frontend "shutdown" = tab close.** Browser handles cleanup of all DOM, JS heap, and pending fetches automatically. No special cleanup needed.

---

## Phase 9: Fix applied

**Bug:** `PosterCanvas` image-load effect had `if (cancelled) return` checks after `await loadImage(...)` but **not** after `await checkFit(...)`. This is a narrow race:

1. User clicks Generate → response is `ok` → posterState becomes `settled` → `PosterCanvas` mounts.
2. Effect starts: `await ensureFontsReady()` → `await loadImage()` → `await checkFit()`.
3. The Regenerate button is rendered alongside `PosterCanvas` in the `settled` branch (`PosterReveal.tsx:39-56`), so it is **clickable before the canvas finishes drawing**.
4. User clicks Regenerate during step 2's `checkFit` await:
   - `App.tsx:62` sets `posterState = { phase: 'loading', ... }`.
   - `PosterReveal` re-renders into the loading branch — `PosterCanvas` unmounts, cleanup runs, `cancelled = true`.
5. The OLD effect's `await checkFit(...)` resolves. Without the `cancelled` check:
   - If `!fit.ok`, the OLD effect calls `onFitFailure?.()`, which routes through `App.tsx:147 handleCanvasFailure` and calls `setPosterState({ phase: 'error', ... })` — **overwriting App's freshly-set `loading` state with `error`**, flashing a stale error message over the new generation.
   - If `fit.ok`, the OLD effect calls `setupCanvas` + `composite` on a detached canvas (no visible effect) and `onReady?.()` on the new mount's PosterReveal (sets `canvasReady=true` prematurely for the new canvas).

**Severity:** Low. The race window is narrow (~10-50ms checkFit duration), `!fit.ok` is rare (the server's photoSelection picks photos that fit), and the symptom is a brief error flash that gets overwritten by the next successful generation.

**Fix:** Mirror the existing post-`loadImage` pattern after every `await` in the effect:

```diff
       await ensureFontsReady();
+      if (cancelled) return;
       const img = await loadImage(getPhotoUrl(photoId));
       if (cancelled) return;

       const fit = await checkFit(line1, line2, photo);
+      if (cancelled) return;
       if (!fit.ok) {
         onFitFailure?.();
         return;
       }
```

Two new guards: one after `ensureFontsReady` (cheap; saves the photo network fetch when cancelled during cold-font loading) and one after `checkFit` (closes the state-overwrite race).

**Files modified:**
- `src/components/PosterCanvas.tsx:58-66` — added two `if (cancelled) return;` checks with an explanatory comment.

**Tests:** All 380 tests still pass. The race itself is hard to unit-test deterministically without a renderer (the existing test suite has no React-component-render tests by design, per CLAUDE.md), and the fix is a pattern-mirror of an already-tested adjacent line. Adding a synthetic vitest harness for this would require pulling in `@testing-library/react`, which the project explicitly avoids (CLAUDE.md "Don't reach for testing-library on autopilot" rule). The fix's correctness is covered by code review of the pattern parity with line 60.

---

## Phase 10: Test coverage assessment

The existing test suite already covers the critical resource-cleanup invariants:
- **`tests/client/compositor.test.ts:435-453`** — `clears the timeout on success (no dangling rejection)` — pins the `loadImage` `clearTimeout` contract.
- **`tests/client/compositor.test.ts:424-433`** — `rejects with a descriptive error when decode() exceeds the timeout` — pins the timeout-fire path.
- **`tests/server/rateLimit-extended.test.ts`** — TTL contract (`expiresAt = windowStart + 1 hour`).
- **`tests/server/anthropic.test.ts`** + **`tests/server/safety-extended.test.ts`** — `attaches the request timeout` contract for all three Anthropic call sites.

No additional tests warranted for the PosterCanvas fix (see explanation in Phase 9).

---

## Files modified

- `src/components/PosterCanvas.tsx` — added two `if (cancelled) return;` guards in the image-load effect to close a stale-effect state-overwrite race.

## Files created

- `audit-reports/28_RESOURCE_LIFECYCLE_REPORT_001_2026-05-04_1848.md` (this file).

## Files removed

None.

---

## Recommendations

| # | Recommendation | Impact | Risk if Ignored | Worth Doing? | Details |
|---|---------------|--------|-----------------|--------------|---------|
| 1 | Document Firestore TTL policy in deploy runbook | Operational clarity | Medium — without the project-level TTL policy, `rateLimits` docs accumulate forever despite correct code-side `expiresAt` writes | Probably | CLAUDE.md flags this as an operational dependency the code can't enforce. A one-time `gcloud firestore` command + verification step in the Netlify deploy doc would close the loop. Not strictly a code change. |
| 2 | Add an `AbortSignal` parameter to `loadImage` | Cancel in-flight image fetches on regenerate | Low — currently the in-flight fetch finishes its download (wasted bandwidth ~150KB/regenerate) but does not leak memory or pin timers indefinitely | Only if time allows | Modern browsers don't support AbortSignal on `new Image()` directly, but pairing the existing `img.src = ''` cancel hint with an `AbortSignal` listener would let `PosterCanvas` actively cancel pending decodes when the user re-generates rapidly. The cleanup is already correct (timer clears in `finally`); this is a perf opt, not a leak fix. |

The recommendations are not urgent. The critical resource lifecycle issues have all been closed by prior audits.

---

## Conclusion

The codebase passes a thorough resource lifecycle audit cleanly. Cumulative work across runs 24/001, 25/001, 26/001, and 27/001 closed every previously-known leak (Anthropic per-call timeout, Lambda warm-container `setTimeout` leak, image decode hang, rapid-regenerate `setTimeout` accumulation, resize-listener thundering herd). This run closed one final state-machine race (`PosterCanvas` post-checkFit cancelled check) and confirmed no other lifecycle gaps exist. Architectural simplicity — no DB pools, no file I/O, no streams, no workers, no `setInterval` anywhere — is the underlying reason this audit landed clean.
