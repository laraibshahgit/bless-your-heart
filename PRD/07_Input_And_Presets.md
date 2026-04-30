# Input and Presets

## Overview

The "What's going on?" input and the row of preset mood chips are the entire user input layer. This file specifies behavior, not just appearance: empty state, character limit, selection state, persistence across regenerations, and the edit-and-regenerate flow.

The input is doing more emotional work than it appears to. Typing into it is itself a small acknowledgment of the bad mood — the act of articulating what's wrong is part of the catharsis.

## Dependencies
- `04_UI_Design_System.md` — Input and chip styling (button variants `preset` and `primary`)
- `06_Landing_Page.md` — Where this layer lives in the page
- `08_Generation_API.md` — What happens after Generate is clicked
- `19_Rate_Limiting.md` — Soft-fail copy if the user has hit the per-IP cap

## The Prompt Field

A single-line text input, full-width on mobile, max-width ~520px on desktop. Centered under the hero examples.

| Property | Value |
|----------|-------|
| Element | `<input type="text">` (not `<textarea>`) — single line forces concision |
| `maxLength` | 200 |
| Placeholder | Rotates per page-load: see "Placeholder Pool" below |
| Autofocus | **No** on mobile (avoids keyboard pop on landing); **No** on desktop (let users scan the examples first) |
| Autocomplete | `off` |
| Spellcheck | `off` (typos are part of the input flavor; "fixing" them changes the voice) |
| Background | `bg-paper` |
| Border | None resting; `accent-sage` 2px focus ring |
| Internal padding | `~20px` left/right, `~16px` vertical |
| Font | Cormorant Garamond, 18px, regular, `ink-deep` typing color, `ink-faint` placeholder |

**Why no autofocus**: Mobile autofocus pops the keyboard immediately and shoves the hero examples off-screen. Desktop autofocus steals attention from the examples. The user will tap or click when ready.

### Placeholder pool

Rotates on each page load (random pick from a fixed list). All in lowercase italic to suggest casualness. They demonstrate the format expected without instructing.

```ts
export const placeholders = [
  "haven't started yet",
  "third coffee of the morning",
  "Monday again",
  "the group chat is silent",
  "everything is fine",
  "an email i don't want to send",
  "she didn't text back",
  "another sunday afternoon"
];
```

These also serve as voice-calibration examples for users — the placeholder previews what kind of input lands well without saying so.

### Character counter

Hidden until the user is within 20 characters of the cap. At 180 chars typed, a faint counter appears in `text-caption` size, `ink-faint` color, right-aligned beneath the field: `180 / 200`. At 200, it switches to `200 / 200` in `feedback-quiet` and the input refuses additional characters (HTML `maxLength` does this natively).

No "you're over the limit!" copy. The counter is the only feedback.

## Preset Mood Chips

A horizontal row of preset-mood buttons that auto-fill the input field. Provide the most universal bad-day shapes so a user with a vague mood can engage in one tap.

### Starter set (v1)

```ts
export const presets = [
  "Monday again",
  "Can't sleep",
  "Work",
  "Family",
  "Dating",
  "Money",
  "Just one of those days",
  "Adulting",
];
```

These cover ~80% of common bad-day shapes per the feature spec. Don't add an "Other" preset — the freeform input field IS the "other."

### Behavior

- **Click a preset** → the input field is populated with the preset's text. Text is editable (the user can append, delete, or replace). Generate becomes enabled.
- **Selected state** → the clicked preset shows the `preset` button variant in selected state (sage border, ink-deep text per `04_UI_Design_System.md`). Other presets dim slightly.
- **Edit after selecting** → the selected state clears. The user is now using a custom prompt, even if it started from a preset.
- **Click another preset** → replaces the field's contents. Confirms there is no merge logic.

### Layout

- Desktop: a single horizontal row, wraps gracefully if all 8 don't fit. Centered.
- Mobile: horizontally scrollable with `overflow-x-auto` and `snap-x snap-mandatory`. First and last preset have edge padding so they're easy to reach with a thumb.
- Each chip uses `rounded-full`, ~14px vertical / 18px horizontal padding, `text-label`. Touch targets ≥ 44px tall.

### Empty-state behavior

The Generate button is disabled when the input field is empty AND no preset is "selected" (in the sense above — selecting a preset auto-fills the field, so an empty field always means nothing is selected). Disabled state uses `bg-mist` text color and reduced opacity, no hover effect.

## Generate Button

Below the presets, prominently centered.

| State | Style | Behavior |
|-------|-------|----------|
| Disabled | `bg-mist` background, `ink-faint` text, no shadow | Empty input |
| Enabled (resting) | `accent-sage` background, `bg-cream` text, soft shadow | Input has content |
| Hover | `accent-sage-deep` background | Desktop only |
| Active / pressed | Slight scale-down (98%), no color change | Tactile feedback |
| Loading (during generation) | Locked, copy changes to "..." or in-voice loading text | Prevents double-fires |

Copy: **"Generate"** when resting. During the loading window: see `04_UI_Design_System.md`'s loading-state treatment — italic in-voice text replaces "Generate," not a spinner icon.

Icon: `Sparkles` from `lucide-react`, left of the label, faintly. The irony of a sparkle icon over savage output is intentional.

## Persistence Through Regeneration

When the user clicks Regenerate (per `16_Poster_Display_And_Regenerate.md`), the input field's contents do **not** clear. The user can:

1. **Click Regenerate as-is** — re-runs the same prompt, gets new text + new photo (full reroll).
2. **Edit the field, then click Regenerate** — equivalent to the user editing their prompt and clicking Generate. The system doesn't distinguish; both paths hit `/api/generate`.

This is the "edit-and-regenerate without page reload" requirement from the feature spec. No special "edit mode."

## Persistence Across Page Reloads

The input field's contents are stored in `sessionStorage` on every keypress (debounced ~300ms). On page load, if `sessionStorage` has a value, the field re-populates. Storage key: `byh:lastPrompt`.

**Why sessionStorage, not localStorage**: A user who opens the site fresh tomorrow shouldn't be greeted with yesterday's bad-day text in the input — that's a small but real failure of empathy. Session-scoped storage covers the "I accidentally refreshed" case without the cross-day awkwardness.

This is **not** a "history feature" or a recall surface. The only thing that persists is the last typed prompt. No list of past inputs, no "recently used" suggestions. (Both deferred to `24_Future_Features.md`.)

## Empty Input Edge Cases

| Case | Handling |
|------|----------|
| User clears the field after typing | Generate disables. Selected preset state (if any) was already cleared by the prior edit. |
| User types only whitespace | Treated as empty. Trim happens client-side before enabling Generate. |
| User pastes 2,000 characters | Browser truncates to 200 via `maxLength`; counter immediately shows `200 / 200`. No visible "we truncated this" copy. |
| User pastes a multiline value | Newlines are stripped on paste (handle the `paste` event). Single-line input is part of the constraint that pushes good prompts. |

## Submit Behavior

| Trigger | Action |
|---------|--------|
| Click Generate | Submits |
| Press Enter inside the input | Submits (no need for an explicit form submit handler beyond this) |
| Mobile "Go" key on the keyboard | Submits |

Wrap the input + Generate button in a `<form>` element with `onSubmit={handleGenerate}` and `e.preventDefault()`. This single pattern covers all three triggers.

After submit, the button locks (loading state), and the in-voice loading copy plays under the prompt input. The poster reveal area appears below per `16_Poster_Display_And_Regenerate.md`.

## Rate-Limit Soft Fail

If the function returns `status: 'rate_limited'` (per `03_Data_Schema.md`'s response shape), the input layer does NOT clear, the button unlocks, and a single line of in-voice copy appears in `feedback-quiet` color beneath the prompt:

> *"Even the universe has a daily limit. Try again in a bit."*

The user can keep their prompt and try later. No countdown timer, no progress bar — that would acknowledge a rate-limit system more than feels right for a passion product.

## Distress Refusal

If the function returns `status: 'distress'`, the input layer is preserved exactly as it is, but the response is a modal interstitial (per `10_Safety_Guardrails.md`), not an inline error. When the user dismisses the interstitial, focus returns to the input field — *not* cleared, but waiting in case they want to type something different.

## Accessibility

- The input has a visually hidden `<label>` reading "What's going on?" (the headline serves visually but isn't programmatically associated).
- Preset chips are real `<button>` elements (not divs with click handlers), with `aria-pressed` reflecting selected state.
- Generate button is a `<button type="submit">` inside the form.
- Keyboard tab order: input → presets (left to right) → Generate.
- Loading state uses `aria-live="polite"` so screen-reader users hear the loading copy.

## Gaps & Assumptions

- **Preset ordering rationale**: The starter set is ordered roughly by how often each is likely to be used (Monday again leads, Adulting trails). No data to back this; revisit if PostHog event data shows one preset dominating or being ignored entirely.
- **Localized presets**: V1 is English-only and the presets are culturally calibrated to the same audience as the voice. Don't auto-translate; treat localization as a P3 future feature.
- **"Use voice input" affordance**: Deferred (`24_Future_Features.md` P3).
- **What if the user types in another language?**: The system prompt absorbs it; Sonnet generally handles multilingual input gracefully. The voice will be in English regardless. If we see meaningful non-English usage in PostHog, that's the trigger for the localization feature, not a v1 concern.
- **Paste-formatting handling**: Strip newlines on paste; do not strip emoji. Emoji are valid input and the prompt handles them per the feature-list "Emoji prompt" stretch goal — Sonnet absorbs them naturally.
