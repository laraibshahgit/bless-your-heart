# Error Messages — Inventory & Style Guide

Catalogue of every user-visible message in the app, plus the voice rules that
keep them coherent. The audit at
[`audit-reports/23_LOGGING_ERROR_MESSAGE_QUALITY_REPORT_001_2026-05-04_1733.md`](../audit-reports/23_LOGGING_ERROR_MESSAGE_QUALITY_REPORT_001_2026-05-04_1733.md)
created this doc; pair them when revisiting message quality.

---

## Style Guide

### Voice

The product is anti-affirmation comedy: reverent inspirational typography over
landscape photos, with a savagely honest pivot. **Error copy keeps the
wellness-influencer voice** — sincere, not snarky, gently ironic about the
universe's role in your problem. The joke is that the system speaks *like* a
wellness app even when it's failing.

**Two intentional tone exceptions:**
- The **distress interstitial** drops the voice entirely. When someone may be
  in crisis the joke ends. Copy is sincere, plainspoken, and points to a
  real hotline. Lives in [`src/content/copy.ts`](../src/content/copy.ts) under
  `distressCopy` so a future audit can find it without grepping components.
- The **footer disclaimer** ("A comedy product, not therapy…") is similarly
  serious — it's the only legal/safety surface visible on every page render.

### Structure

Every error message answers some subset of `[What happened] + [Why] + [What to do]`.
For this product the dominant pattern is `[Gentle metaphor for what happened] +
[What to do]`. Examples:

| Message | What happened (metaphor) | What to do |
|---|---|---|
| "Even the universe has a daily limit. Try again in a bit." | rate limit hit | retry later |
| "Even the universe is buffering. Try again." | server error | retry |
| "Your connection drifted off into the wilderness. Try again when it's back." | offline | retry when online |
| "Even the download is having a moment. Try once more." | download failed | retry |
| "The page lost the thread. Refreshing usually helps." | React crashed | refresh |

### Words to avoid

- **Technical jargon**: never say "server", "API", "5xx", "rate limit
  exceeded", "validation failed", "internal error". Favour metaphor.
- **Blame-shifting**: never "you entered…", "your input was…", "your request
  was rejected". The voice never punches at the user — that rule applies to
  errors as well as to generated content.
- **Apology theatre**: no "We're sorry, but…", "Unfortunately…". They blunt
  the voice and add no information.
- **Color-only severity**: no `bg-red-500`. Errors use `text-feedback-quiet`
  (`#D9D4C8`), the desaturated cream that fits the brand palette. See
  [`design-system.md`](../.claude/memory/design-system.md).

### Centralization

User-visible strings live in [`src/content/copy.ts`](../src/content/copy.ts).
Components import from there; they do not embed copy inline. The Netlify
function imports the same `errorCopy` keys for `rate_limited`, `blocked` (slur),
and `blocked` (real-person) responses — pinned by the `errorCopy parity` block
in [`tests/server/generate-contract.test.ts`](../tests/server/generate-contract.test.ts).

**Exceptions** (intentional): HTTP 405 ("Method not allowed. Use POST.") and 403
("Forbidden.") in [`netlify/functions/generate.ts`](../netlify/functions/generate.ts)
are returned only to misbehaving non-browser clients (curl scripts, cross-origin
attackers). Real users never see them. Zod issue messages
(`describeZodIssue`, same file) are similarly client-developer-facing. Keeping
them as plain technical English is correct for the audience.

---

## Centralized Copy

All paths relative to repo root.

### `errorCopy` — [`src/content/copy.ts`](../src/content/copy.ts)

| Key | When triggered | Message |
|---|---|---|
| `rateLimit` | server returns `status: 'rate_limited'` (>25 requests/hr) | "Even the universe has a daily limit. Try again in a bit." |
| `slurBlock` | prompt matches slur list (server `status: 'blocked'`) | "Let's try a different one." |
| `realPersonBlock` | prompt names a real person (server `status: 'blocked'`) | "The voice doesn't punch at people. Try a situation instead." |
| `generation.anthropicError` | client receives HTTP 5xx from `/generate` | "Even the universe is buffering. Try again." |
| `generation.timeout` | client fetch times out (declared but currently unused — `unknown` covers timeout via the catch path) | "The cosmos is having one of those days. Give it a moment." |
| `generation.networkOffline` | `!navigator.onLine` after a fetch failure | "Your connection drifted off into the wilderness. Try again when it's back." |
| `generation.unknown` | fetch failed with no clear reason / non-2xx-non-5xx | "Something didn't quite land. One more try?" |
| `frontend.canvasWriteFailed` | declared but currently unused (PosterCanvas calls `onFitFailure` instead) | "The image didn't quite render. One more try?" |
| `frontend.downloadFailed` | `downloadPoster()` returned `false` | "Even the download is having a moment. Try once more." |
| `frontend.fontLoadTimeout` | declared but currently unused | "The typography is taking its time. Refreshing might help." |
| `errorBoundary` | React `componentDidCatch` triggered | "The page lost the thread. Refreshing usually helps." |

### `distressCopy` — [`src/content/copy.ts`](../src/content/copy.ts)

| Key | Message |
|---|---|
| `headline` | "This one isn't for jokes." |
| `body` | "If you're going through something serious, please talk to someone who can actually help. You're not alone in it." |
| `hotlineLinkPrefix` | "Or visit " |
| `hotlineLinkLabel` | "findahelpline.com" |
| `hotlineLinkSuffix` | " for support anywhere in the world." |
| `closeAction` | "Take me back" |

The hotline phone number / name come from the server-side response (see
[`src/server/hotlines.ts`](../src/server/hotlines.ts)) and are sanitized in
[`DistressInterstitial.tsx`](../src/components/DistressInterstitial.tsx) before
rendering — `safeTelHref` and `safeHotlineHref`.

### `downloadCopy` — [`src/content/copy.ts`](../src/content/copy.ts)

| Key | When triggered | Message |
|---|---|---|
| `iosHint` | iOS Safari user agent during a download | "On iPhone? Long-press the image after the new tab opens to save." |

### `downloadConfirmation` — [`src/content/copy.ts`](../src/content/copy.ts)

| Key | When triggered | Message |
|---|---|---|
| `downloadConfirmation` | non-iOS browser, `downloadPoster()` returned `true` | "Saved. Go forth." |

### `loadingPhrases` — [`src/content/copy.ts`](../src/content/copy.ts)

Five phrases rotated during the 800ms+ generation wait:

- "The universe is composing itself."
- "Aligning the chakras of your specific situation."
- "Distilling what you said into something honest."
- "Consulting the ancient wellness texts."
- "Some moments take longer than others."

### `safeFallbacks` — [`src/server/fallbacks.ts`](../src/server/fallbacks.ts)

Five hand-crafted two-line posters returned when generation fails after retries.
Same voice, but pre-written so we never ship raw model errors.

### Footer disclaimer — [`src/components/Footer.tsx`](../src/components/Footer.tsx)

- "Bless Your Heart · made with affection and resignation"
- "A comedy product, not therapy. If you're in crisis, please reach out: 988 (US) · findahelpline.com (worldwide)"
- "Photos: [credits link] · This site uses anonymous analytics"

The 988 number is duplicated from [`src/server/hotlines.ts`](../src/server/hotlines.ts).
Considered centralizing but rejected — `hotlines.ts` is server-only and
importing into a client component would cross the security boundary defined in
[`CLAUDE.md`](../CLAUDE.md). The 988 number has been the federally-mandated US
mental-health hotline since 2022; drift risk is negligible.

---

## Server-side validation messages

Generated by `describeZodIssue` in
[`netlify/functions/generate.ts`](../netlify/functions/generate.ts). Returned
only when a non-browser client violates the request schema — never seen by real
users. Voice deliberately matches generic API error conventions:

| Trigger | Message |
|---|---|
| no specific issue | "Invalid request." |
| `invalid_type` | "Invalid request: `{path}` has the wrong type." |
| `too_small` | "Invalid request: `{path}` is too short." |
| `too_big` | "Invalid request: `{path}` is too long." |
| `unrecognized_keys` | "Invalid request: unexpected fields in `{path}`." |
| any other Zod issue | "Invalid request: `{path}` is invalid." |
| HTTP 405 | "Method not allowed. Use POST." |
| HTTP 403 (Origin allowlist failure) | "Forbidden." |

---

## Voice precedents

Consult these when you need to add a new error and aren't sure how it should
sound. They are stable enough to pattern-match against.

- **"Try again" pattern**: every retryable error ends with a gentle nudge.
  "Try again." / "Try again in a bit." / "Try once more." / "One more try?" —
  vary the form, keep the intent.
- **"Even the X is Y" pattern**: assigns failure to the universe / cosmos /
  download / page. Never to the user, never to the system. The product itself
  is the universe; the universe is fallible.
- **Single-clause headline + period**: most messages are one or two short
  sentences. If you need three, the message is probably doing too much — split
  it or simplify the underlying state.
