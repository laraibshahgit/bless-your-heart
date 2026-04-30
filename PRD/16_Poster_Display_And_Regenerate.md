# Poster Display and Regenerate

## Overview

The display surface where the generated poster lives, the loading state that precedes its reveal, and the regenerate action that produces a new one. This is where the second-most-important emotional beat in the journey lives — the recognition / laugh / "oh god, exactly" moment when line 2 lands. The pacing matters.

The 800ms minimum loading state is a design beat, not dead time. Without it, fast-generation latency causes the poster to pop in mechanically, and the reveal flattens. This file specifies the timing, the reveal animation, and the regenerate flow.

## Dependencies
- `04_UI_Design_System.md` — Animation tokens, loading copy
- `07_Input_And_Presets.md` — Generate button state during this flow
- `15_Compositing_Engine.md` — The renderer this surface displays
- `17_Download_PNG.md` — The download action that hangs off this surface

## Layout

The poster reveal area sits below the prompt input, hidden until the first generation. Once a poster has been generated, the area persists for the rest of the session (regenerating swaps the content, never collapses the area).

```
[ prompt input + presets ]   ← persists at top of page
[ Generate button ]
─────────────────────────────
[ poster canvas ]            ← this surface
[ Regenerate · Download ]
─────────────────────────────
[ footer ]                   ← pushed down once poster appears
```

On generation start, the loading state replaces the empty space below the Generate button. On reveal, the loading state cross-fades into the poster canvas.

## Timing

| Phase | Duration | What's visible |
|-------|----------|----------------|
| Submit click | 0ms | Generate button locks; loading copy appears below button |
| Loading | min 800ms, max ~5s | Italic in-voice loading copy with opacity pulse |
| Reveal | 600ms fade-in | Poster canvas crossfades from loading state |
| Settled | indefinite | Poster + Regenerate + Download buttons |

### The 800ms floor

The function call resolves in 1–4 seconds typically. If it returns *before* 800ms have elapsed (cache hits, cold-start avoided, lucky upstream conditions), the frontend continues showing the loading state until 800ms have passed. Without this floor, the visual cadence is "type, click, instant poster" — which kills the anticipation beat that lets line 2 land.

```ts
const LOAD_FLOOR_MS = 800;

async function handleGenerate() {
  setLoading(true);
  const startedAt = performance.now();

  try {
    const result = await callGenerate(prompt);
    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, LOAD_FLOOR_MS - elapsed);
    if (remaining > 0) await sleep(remaining);
    setPoster(result);
  } finally {
    setLoading(false);
  }
}
```

The floor only applies on success. Errors and refusals (rate-limit, distress, blocked) bypass it — there's no anticipation beat for "let's try a different one."

### The ceiling

If generation legitimately takes longer than ~5 seconds, the loading state continues but the loading copy rotates to a more patient phrase ("Some moments take longer than others"). No hard timeout from the frontend — the function's own 10s timeout is the ultimate boundary.

## Loading State

Per `04_UI_Design_System.md`'s loading-state treatment:

- Italic Cormorant Garamond, 18px (mobile) / 20px (desktop), `ink-soft` color
- Centered below the Generate button
- One phrase per generation, picked at submit time from a fixed pool
- Opacity pulses 0.6 → 1.0 → 0.6 over 1600ms (CSS animation)
- No spinner, no robot icon, no progress bar

Phrase pool (in `src/content/copy.ts`):

```ts
export const loadingPhrases = [
  "The universe is composing itself.",
  "Aligning the chakras of your specific situation.",
  "Distilling what you said into something honest.",
  "Consulting the ancient wellness texts.",
  "Some moments take longer than others.",
];
```

The fifth one ("Some moments take longer than others") is the patience phrase — swap to it if loading exceeds 4 seconds.

## Reveal

When the function returns and the load floor has elapsed:

1. The compositor (`15_Compositing_Engine.md`) renders the poster onto the canvas. This is fast (~10–30ms) and happens before any visible transition.
2. The loading state's opacity pulse stops; its element fades to opacity 0 over 200ms.
3. The poster canvas, initially at opacity 0, fades to opacity 1 over 600ms with `easing-soft` (`cubic-bezier(0.4, 0, 0.2, 1)`).
4. The Regenerate and Download buttons fade in alongside the canvas, slightly delayed (~200ms after canvas starts fading).

If the poster is partially below the fold when revealed (mobile, prompt+keyboard pushed it down), trigger a soft scroll-into-view:

```ts
posterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
```

Don't auto-scroll if the poster is already fully visible — annoying jitter on desktop.

### `prefers-reduced-motion`

Per `04_UI_Design_System.md`, all animations respect `prefers-reduced-motion`. Reveal becomes a 0ms swap. Loading-state opacity pulse stops; the loading copy is statically visible. Scroll-into-view uses `behavior: 'instant'`.

## Regenerate Action

Below the poster, two buttons sit side by side:

| Button | Variant | Behavior |
|--------|---------|----------|
| Regenerate | `secondary` (cream + ink-deep) | Full reroll: new text + new photo, same prompt |
| Download | `primary` (sage + cream) | Triggers PNG download (`17_Download_PNG.md`) |

### Regenerate flow

Per `bless-your-heart-feature-qa.md`: regenerate is a **full reroll** (both new). The button hits `/api/generate` with the same prompt and the in-session `excludePhotoIds` array — see `08_Generation_API.md`. The user does not have separate "new text only" / "new photo only" buttons at v1.

```ts
async function handleRegenerate() {
  setLoading(true);
  const startedAt = performance.now();

  try {
    const result = await callGenerate(prompt, excludePhotoIds);
    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, LOAD_FLOOR_MS - elapsed);
    if (remaining > 0) await sleep(remaining);
    setPoster(result);
    setExcludePhotoIds(prev => [...prev, result.photoId]);
  } finally {
    setLoading(false);
  }
}
```

### What loads during regenerate

Same loading state as initial generation — same phrases, same opacity pulse, same 800ms floor. The previous poster does **not** stay visible during regenerate. It fades out as the loading state fades in:

1. Click Regenerate
2. Poster canvas fades to opacity 0 over 200ms
3. Loading state appears (in the same area) with the standard treatment
4. New poster reveals when generation completes

Why fade out the previous poster: keeping it visible during regenerate creates ambiguity ("did it work?"). The loading-state takeover signals "something new is coming."

### Regenerate UI on rapid clicks

The Regenerate button locks during loading (same pattern as Generate). Rapid clicks during the loading window are no-ops. No queueing.

### No regenerate counter visible to the user

The user has no idea how many regens they've done. No "tries left," no "you've regenerated 3 times" message. The rate limit is silent (`19_Rate_Limiting.md`). Per `00_README.md`'s "deadpan is sacred" principle, the surface stays bare.

## Edit-and-Regenerate

If the user edits the prompt input and clicks Regenerate, the system treats it as a fresh generation with the new prompt — same code path as Regenerate, just with a different prompt value (per `07_Input_And_Presets.md`). No special "edit mode."

Implementation: Regenerate always reads the current value of the prompt input. The user doesn't need to re-click Generate; Regenerate IS the action.

## Confirmation Feedback

After Download fires (per `17_Download_PNG.md`), a single line of caption text appears below the poster for ~2.5 seconds, then fades:

> *Saved. Go forth.*

In-voice, italic Cormorant Garamond, `ink-soft` color, `text-caption` size. No celebration animation. No green checkmark. No "downloaded successfully!" with an exclamation point. The deadpan is the joke.

## State Management

The poster surface owns minimal state:

```ts
type PosterState =
  | { phase: 'idle' }
  | { phase: 'loading'; phrase: string }
  | { phase: 'settled'; line1: string; line2: string; photoId: string }
  | { phase: 'error'; message: string };

const [posterState, setPosterState] = useState<PosterState>({ phase: 'idle' });
const [excludePhotoIds, setExcludePhotoIds] = useState<string[]>([]);
```

`excludePhotoIds` accumulates across regenerates. It's reset only on full page reload, not on prompt edits — even if the user changes their prompt mid-session, they probably don't want to re-see photos they've already seen.

## Error Display in This Surface

If the function returns an error status (`error`, `rate_limited`, `safe_fallback`), the surface handles them differently:

| Status | Surface behavior |
|--------|-----------------|
| `ok` | Standard reveal flow above |
| `safe_fallback` | Standard reveal flow — the user can't tell |
| `rate_limited` | Inline message under the prompt (per `07_Input_And_Presets.md`); poster surface stays untouched |
| `blocked` | Inline message under the prompt; poster surface stays untouched |
| `distress` | Modal interstitial (`10_Safety_Guardrails.md`); poster surface stays untouched |
| `error` | Error in the poster surface area: in-voice copy + a Try Again button, see `20_Error_Handling.md` |

`distress`, `rate_limited`, and `blocked` deliberately don't disturb the poster surface — those are input-side responses.

## Gaps & Assumptions

- **Where the loading state visually lives**: below the Generate button, replacing the would-be poster space. Once a poster has been settled, the loading state for *subsequent* regenerates lives in the poster canvas's location (the canvas fades out, loading copy fades in). Handle the transition with a single common parent that switches between loading and canvas children.
- **Animation easing values**: per `04_UI_Design_System.md`. Don't introduce new easing curves here.
- **Regenerate budget visibility**: deliberately invisible. If the user hits the rate limit (25/hour), the inline soft-fail is the only feedback. No "you've used X of 25" surface.
- **Multiple poster history on the page**: not supported at v1. Each generation replaces the previous in the same slot. Stretch feature in `24_Future_Features.md`.
- **Reveal animation on mobile keyboard up**: when the keyboard is up and the poster reveals below, scroll-into-view should still trigger correctly. Tested behavior on iOS Safari is fine; trust the standard `scrollIntoView` API.
