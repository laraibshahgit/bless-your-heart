# Download PNG

## Overview

The download is the share moment, even before the user opens iMessage. The user committing to download is the leading indicator that the poster is good enough to send. Get this surface wrong and the share loop dies on the most common device — iOS Safari, where the standard `download` attribute silently fails.

This file specifies the export format, filename, resolution, mobile-vs-desktop handling, and the confirmation feedback. The PNG download is the entire export surface at v1; native share sheet and clipboard image copy are deferred to P1 (`24_Future_Features.md`).

## Dependencies
- `15_Compositing_Engine.md` — Canvas the export reads from
- `16_Poster_Display_And_Regenerate.md` — Download button lives in that surface
- `01_Tech_Stack.md` — `file-saver` library

## Export Spec

| Property | Value |
|----------|-------|
| Format | PNG |
| Resolution | 1080×1080 px (matches Canvas logical size) |
| Color profile | sRGB (Canvas default) |
| File size | typically 400 KB – 1.2 MB depending on photo entropy |
| Filename | `bless-your-heart-{shortId}.png` where `shortId` is a 6-char random string |

PNG over JPG: text legibility on PNG is sharper at the same size. Photos compress slightly less efficiently in PNG, but the absolute size is acceptable for sharing. Modern messaging apps re-compress on send anyway; ship the highest-quality artifact we can.

The `shortId` is generated client-side (e.g., `Math.random().toString(36).slice(2, 8)`) so two simultaneous downloads on the same device get distinct filenames. No persistence required — the ID exists only in the filename.

## Why Use `file-saver`

The naive download approach — anchoring an `<a download href="...">` and clicking it programmatically — works on desktop browsers and Android Chrome but **silently fails on iOS Safari**. The user clicks, nothing visible happens, no error is raised. iOS Safari's `download` attribute support is partial and version-dependent, and the failure mode kills the share loop on the most common device.

`file-saver` wraps platform-specific differences:

- Desktop: anchor + blob URL + click trigger
- iOS Safari: opens the blob URL in a new tab where the user can long-press to save
- Android Chrome: native download

This is documented in the library and tested across versions. Don't hand-roll this; trust the library.

## The Download Function

```ts
import { saveAs } from 'file-saver';

async function downloadPoster(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/png')
  );

  if (!blob) {
    showError("The download didn't take. Try once more.");
    return;
  }

  const filename = `bless-your-heart-${shortId()}.png`;
  saveAs(blob, filename);

  trackDownload();              // analytics
  showConfirmation();           // 16_Poster_Display_And_Regenerate.md
}
```

`canvas.toBlob` is asynchronous and runs the encode off the main thread on most browsers. The Promise wrapping handles the callback shape.

### iOS Safari handling

When `file-saver` detects iOS Safari, it opens the blob URL in a new tab. Best-effort UX: the tab loads with the PNG visible; the user long-presses to "Save Image." This is the iOS native pattern that most users already know.

Add a one-line inline instruction near the Download button on iOS Safari only:

> *On iPhone? Long-press the image after the new tab opens to save.*

Detect iOS Safari via user-agent sniff (acceptable for this case — the alternative is letting users hit a confusing failure mode):

```ts
const isIOSSafari =
  /iP(ad|hone|od)/.test(navigator.userAgent) &&
  /Safari/.test(navigator.userAgent) &&
  !/CriOS|FxiOS/.test(navigator.userAgent);
```

The instruction is shown only on the first click of Download per session (track in component state, no persistence needed). Subsequent clicks rely on user familiarity.

### Cross-browser test matrix

| Browser | Path | Test before launch |
|---------|------|--------------------|
| iOS Safari (current) | New tab + long-press | Manual test required — known failure surface |
| iOS Chrome (current) | Same as iOS Safari (uses Safari engine on iOS) | Manual test |
| Android Chrome | Native download | Manual test |
| Desktop Chrome | Anchor download | Manual test |
| Desktop Safari | Anchor download | Manual test |
| Desktop Firefox | Anchor download | Manual test |

This is the single most-likely-to-regress surface in the product. Test every release.

## Download Button

Lives in the poster display surface (`16_Poster_Display_And_Regenerate.md`). Primary button variant per `04_UI_Design_System.md`: sage background, cream text, `Download` icon from `lucide-react`.

| State | Behavior |
|-------|----------|
| Idle | Enabled, default styling |
| Pressed | Brief 98% scale-down, no color change |
| During download | Locked for ~500ms to prevent double-fires |

Copy: `Download`. Don't change to `Saving...` during the lock window — too tech-flavored. The button stays "Download," just briefly unclickable.

## Confirmation Feedback

After `saveAs` returns, render a single line below the poster (per `16_Poster_Display_And_Regenerate.md`):

> *Saved. Go forth.*

`text-caption`, italic, `ink-soft`, fades in over 200ms, persists 2.5s, fades out over 400ms.

**No celebration animation.** No green checkmark. No bouncing icon. Per the source PRD's anti-features ("the deadpan IS the joke"): the absence of celebration is the feature.

If the iOS Safari path opens a new tab instead of downloading, the confirmation does NOT fire (the user hasn't yet saved — they need to long-press). Detect via `file-saver`'s return signal where possible, or skip the confirmation entirely on iOS to avoid lying about a download that hasn't happened yet.

## Filename Convention

```
bless-your-heart-{6-char-id}.png
```

| Element | Why |
|---------|-----|
| `bless-your-heart` prefix | The poster's source is recognizable in the user's downloads folder; serves as quiet attribution |
| 6-char random ID | Disambiguates multiple downloads in a session; no semantic meaning |
| `.png` extension | Some chat apps inspect extensions to render previews |

Don't include the user's prompt in the filename. Privacy: filenames sometimes get shared with screenshots; we don't want yesterday's bad-day text to surface.

Don't include a timestamp. The user's filesystem already sorts by created-time; a timestamp in the filename is redundant noise.

## Watermark in the Downloaded PNG

The watermark (per `18_Watermark.md`) is rendered as part of the canvas — it's already in the exported PNG. No separate watermark step at download time.

Per the source-of-truth resolution in `00_README.md`, the watermark is required (the journey doc supersedes the feature-list "no watermark" line). Without it, the share-and-discover loop has no path back to the site.

## Error Cases

| Error | Handling |
|-------|----------|
| `canvas.toBlob` returns null | Show in-voice error inline; suggest retry |
| `saveAs` throws (rare) | Same |
| User cancels native save dialog | No-op; the cancellation is normal user behavior |
| User dismisses iOS new tab without saving | No way to detect; we accept this gracefully |

In-voice error copy:

```
"Even the download is having a moment. Try once more."
```

`text-caption`, `feedback-quiet` color, in the same slot as the confirmation feedback.

## Analytics

Track every successful download as a discrete PostHog event (`22_Analytics.md`):

```ts
posthog.capture('poster_downloaded', {
  fittingRung: poster.fittingRung,
  // No prompt content, no generated text, no photoId
});
```

Volume of `poster_downloaded` is the leading indicator of share intent (per `bless-your-heart-journey-qa.md`'s success metrics). It is the closest analytics-trackable proxy for "this poster was good enough."

## Mobile Browser Considerations

- **In-app browsers** (Instagram, X, TikTok webview): the download often falls back to "image opens in viewer." The user can tap-and-hold to save. Don't show a special-case UI for in-app browsers; the iOS Safari instruction copy covers most edge cases.
- **PWA installed to home screen**: same code path as Safari; downloads go to the device's Files app.
- **Clipboard image copy**: deferred to P1 (`24_Future_Features.md`). Adding it would collapse the friction between "I have the poster" and "they have the poster" — high ROI feature for v1.1.

## Gaps & Assumptions

- **PNG size optimization**: not pursued at v1. PNGs in the 400 KB – 1.2 MB range are within share-app expectations. If file size becomes an issue (e.g., MMS limits in some regions), revisit and consider a quality-tuned JPG export option as a fallback.
- **Vertical aspect ratio variant** (1080×1350 for Stories): deferred to P2 (`24_Future_Features.md`). v1 ships square only.
- **Filename localization**: keep the English `bless-your-heart` prefix even if the site is localized later (P3). The brand name is the brand name in any language.
- **Web Share API** (`navigator.share` with the blob): deferred to P1. Once added, it replaces or supplements the download flow on supporting browsers (iOS 15.4+, Android Chrome) — the user can share directly to iMessage, WhatsApp, etc., without going through the download dance.
- **Confirmation feedback on iOS new-tab path**: skipped at v1 because we can't reliably detect when the user actually saves. Revisit if Web Share API supersedes file-saver and gives us a meaningful completion signal.
