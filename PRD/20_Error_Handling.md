# Error Handling

## Overview

Error states are part of the product surface, not an afterthought. The voice carries through every failure mode — the user should never see a generic browser error, a stack trace, or a "Something went wrong" string written by a developer. This file specifies the error categories, the in-voice copy for each, the placement on screen, and the retry behavior.

The principle: every error message reads like it came from the same author as line 2.

## Dependencies
- `03_Data_Schema.md` — Error response shapes from the function
- `07_Input_And_Presets.md` — Inline message slot beneath the prompt
- `16_Poster_Display_And_Regenerate.md` — Error display in the poster surface
- `08_Generation_API.md` — Server-side error origins

## Error Taxonomy

Three categories of error reach the user. Each has a different screen location and retry pattern.

| Category | Example | Where it shows | Retry pattern |
|----------|---------|----------------|---------------|
| Pre-generation refusals | rate-limit, slur, real-person, distress | Inline beneath input (or modal for distress) | User edits or waits |
| Generation failures | Anthropic 5xx, function timeout, network flake | In poster surface area | Retry button; same prompt re-runs |
| Frontend / unrecoverable | Canvas write failed, font load timed out | In poster surface area | Retry button; full re-render |

Each category gets in-voice copy. Below: the canonical strings.

## Canonical Error Copy

Lives in `src/content/copy.ts`. Every error path imports from this file — no inline strings.

### Pre-generation refusals

```ts
export const errorCopy = {
  rateLimit:
    "Even the universe has a daily limit. Try again in a bit.",
  slurBlock:
    "Let's try a different one.",
  realPersonBlock:
    "The voice doesn't punch at people. Try a situation instead.",
  // distress copy lives in DistressInterstitial — separate component
};
```

### Generation failures

```ts
  generation: {
    anthropicError:
      "Even the universe is buffering. Try again.",
    timeout:
      "The cosmos is having one of those days. Give it a moment.",
    networkOffline:
      "Your connection drifted off into the wilderness. Try again when it's back.",
    unknown:
      "Something didn't quite land. One more try?",
  },
```

### Frontend failures

```ts
  frontend: {
    canvasWriteFailed:
      "The image didn't quite render. One more try?",
    downloadFailed:
      "Even the download is having a moment. Try once more.",
    fontLoadTimeout:
      "The typography is taking its time. Refreshing might help.",
  },
```

### Tone notes

Italic Cormorant Garamond, `feedback-quiet` color, `text-caption` size for inline placements; `text-body` size for poster-surface placements. No exclamation points anywhere. No "oops" or "uh-oh." No technical specificity ("HTTP 503").

## Placement

### Inline beneath prompt input

For pre-generation refusals (rate-limit, slur, real-person):

```
[ "What's going on?" input ]
[ preset chips ]
[ Generate ]
[ ← refusal copy here, faint, single line, no icon ]
```

Persists until the user edits the input or successfully generates. Faded in over 200ms; no fade-out animation when dismissed by edit (just disappears).

### Poster surface

For generation and frontend failures, the error replaces the would-be poster in the same slot the loading state used:

```
[ poster surface ]
   in-voice error copy (centered)
   [ Try Again button ]
```

Try Again button uses the `secondary` variant per `04_UI_Design_System.md`. On click: re-runs the same prompt. The 800ms loading floor still applies on the retry.

Once a poster has been settled previously and a regenerate fails, the error displays in the same area (the previous poster is already faded out at this point — see `16_Poster_Display_And_Regenerate.md`'s regenerate flow). The previous poster does not return; the user must Try Again or change their prompt.

### Modal

Reserved exclusively for distress (`10_Safety_Guardrails.md`). No other error rises to modal level.

## Frontend Retry Logic

The frontend does **not** auto-retry. Every retry is user-initiated via Try Again. Reasons:

- Auto-retry creates surprise: the user sees a flash of error, then the loading state again, then either success or repeated error. Confusing.
- Auto-retry burns budget on systemic outages.
- The user-initiated retry is fast (one click) and predictable.

The function-side retry logic (Anthropic 5xx, validation regen — see `08_Generation_API.md` and `09_Output_Validation_And_Retries.md`) is invisible to the frontend; it returns a final response after exhausting its budget.

## Network Offline Detection

Browsers expose `navigator.onLine` and an `'offline'` window event. Use both for proactive feedback:

```ts
window.addEventListener('offline', () => setOfflineState(true));
window.addEventListener('online', () => setOfflineState(false));
```

If the user is offline and clicks Generate, short-circuit with the `networkOffline` copy without making the fetch attempt — the fetch would otherwise fail with a confusing "Failed to fetch" message in console. Show the same Try Again pattern; clicking it tries the request anyway in case `navigator.onLine` is wrong (it sometimes is).

## Function Timeout

Netlify Functions default to a 10-second timeout. If Anthropic hangs and the function exits, the frontend sees a 502 from Netlify. Map this to the `timeout` copy.

```ts
async function callGenerate(prompt) {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, excludePhotoIds }),
    });
    if (!response.ok) throw new HttpError(response.status);
    return await response.json();
  } catch (err) {
    if (!navigator.onLine) return { status: 'error', message: errorCopy.generation.networkOffline, retryable: true };
    if (err instanceof HttpError && err.status >= 500) {
      return { status: 'error', message: errorCopy.generation.anthropicError, retryable: true };
    }
    return { status: 'error', message: errorCopy.generation.unknown, retryable: true };
  }
}
```

Frontend always lands on a structured response — never an unhandled exception that bubbles up to the React error boundary.

## React Error Boundary

A top-level `<ErrorBoundary>` wraps the app. Catches rendering errors that escape the normal error-handling paths. Shows a generic in-voice fallback:

```
The page lost the thread. Refreshing usually helps.
[ Refresh ]
```

The Refresh button calls `window.location.reload()`. No state-recovery logic — the page is stateless except for the input prompt (which persists in `sessionStorage` per `07_Input_And_Presets.md`), so a reload is a clean recovery.

Log the rendering error to the console with full stack trace; useful for diagnostics if a developer is shoulder-surfing. Don't log to PostHog — frontend exceptions are out of scope at v1.

## Logging Errors

| Where | What gets logged | What does NOT |
|-------|------------------|---------------|
| Server-side (Netlify Functions) | Event name + reason + timestamp (per `08_Generation_API.md`) | User prompt, generated text, raw IP |
| Server-side errors (Anthropic 5xx, etc.) | HTTP status + abbreviated message | Full response body (might contain prompt-derived content) |
| Client-side console | Full error for developer debugging | Auto-shipped to any service |
| PostHog | High-level event categories only | No error messages, no stack traces |

V1 doesn't ship to a frontend error-tracking service (Sentry, etc.). Add later if production debugging proves harder than expected.

## Specific Error Edge Cases

### Generate clicked while a request is already in flight

The Generate button locks during loading (`07_Input_And_Presets.md`). If the user clicks before the lock applies (very narrow race), drop the duplicate click silently — the in-flight request continues.

### Regenerate clicked while a request is already in flight

Same — the Regenerate button locks. The in-flight request finishes; the user can regenerate again from the result.

### User navigates away mid-request

Browser cancels the fetch; the function may still complete (no way to cancel mid-execution from the frontend). Cost of the wasted Sonnet call is minor and unavoidable.

### Function returns malformed JSON (extreme rare)

The `await response.json()` throws. Caught by the surrounding `try/catch`; mapped to `errorCopy.generation.unknown`.

### Prompt contains characters that fail JSON-encoding

Defensively, `JSON.stringify` handles every Unicode codepoint. No special handling needed.

## What This File Does NOT Cover

- **Client-side validation errors** (empty input, exceeds 200 chars) — handled by `07_Input_And_Presets.md`'s disabled-state and `maxLength`.
- **Image load failures** — handled silently in the compositor; if the photo URL fails, the React effect's `cancelled` flag (`15_Compositing_Engine.md`) prevents a half-render. The user sees the loading state; if it persists past 5s the patience phrase appears.
- **Distress and safety refusals** — they aren't "errors" per se; they are intentional flows handled in `10_Safety_Guardrails.md`.

## Gaps & Assumptions

- **Sentry or similar frontend error tracking**: deferred. V1 relies on Netlify function logs and PostHog event volume to detect issues. Add a frontend error-tracking service if the product gains traction and silent client-side errors become a real diagnostic gap.
- **Error copy localization**: V1 is English-only. Localizing error copy is part of the broader localization effort scoped as P3 (`24_Future_Features.md`).
- **Differentiated copy for different Anthropic error codes**: the user doesn't care whether it was a 502, a 429, or a 503. Single `anthropicError` copy is enough; the function logs the specific status for diagnostics.
- **Retry budget on user-initiated Try Again**: unlimited from the frontend's perspective. Each retry hits the rate limiter (`19_Rate_Limiting.md`) which is the actual ceiling.
