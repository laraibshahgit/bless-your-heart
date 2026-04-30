# Future Features (Post-MVP)

## Overview

Everything that didn't make v1, organized by priority tier. Sourced from the tech-stack roadmap and the source PRD's "Possible Features" list. Each entry names a clear "when to add" trigger so the next round of work isn't speculative.

This file exists for two reasons: (1) so the v1 build doesn't accidentally include items, and (2) so the next iteration has a defensible starting list rather than a pile of untriaged ideas.

## Dependencies
- `00_README.md` — Anti-features (deliberately permanent omissions, NOT in this file)

## Tier definitions

| Tier | Meaning |
|------|---------|
| **P1** | High-value, low-cost. Should ship in the first post-MVP update if anything ships. |
| **P2** | High-value, moderate-cost. Earns its place if the product gains traction. |
| **P3** | Lower-priority polish. Nice if traction supports the work. |
| **P4** | Ambitious. Pursue only with intentional reason — e.g., chasing a TikTok moment. |

---

## P1 — High-Value, Low-Cost

### Native share sheet via `navigator.share`

**What**: One-tap share sheet on mobile. User clicks Share, OS opens its native share menu, user picks iMessage / WhatsApp / Slack / etc.

**Why deferred**: Not strictly required for v1; download + manual attach works. But this collapses the friction between "I have the poster" and "they have the poster" — high ROI given the share moment is the most-important emotional beat in the journey (`bless-your-heart-journey-qa.md`).

**Trigger to ship**: First v1.1 update. Always.

**Complexity**: Low. ~0.5 day. Use `navigator.share` with the canvas `Blob`; falls back to existing download flow on unsupported browsers.

**Notes**: Browser support is iOS Safari 15.4+, Android Chrome current, desktop Chrome with reduced functionality. The fallback path (download) handles all remaining cases.

### Clipboard image copy

**What**: A "Copy" button alongside Download. Copies the rendered PNG to the clipboard, ready to paste into iMessage/Slack/Discord.

**Why deferred**: V1 ships with download only. But for desktop sharers in particular, copy-paste is faster than download-and-attach.

**Trigger to ship**: Same v1.1 update as native share sheet — they pair naturally.

**Complexity**: Low. ~0.5 day. Use `navigator.clipboard.write` with a `ClipboardItem` containing the PNG blob. Browser support is iOS Safari 13.4+, modern desktop browsers.

---

## P2 — High-Value, Moderate-Cost

### Shareable permalink URLs

**What**: Every generated poster gets a URL like `/p/abc123` that re-renders server-side. Recipients receive the link in chat; the page shows the rendered poster with the prompt input below to convert them.

**Why deferred**: Requires light Firestore persistence (a row per shared poster), which pushes against the "no database of user content" ethos. Worth it for virality — but only if the current download-and-share flow proves limiting.

**Trigger to ship**: Posters start showing up in the wild and people ask for "the link." If a Reddit thread or Twitter post explicitly mentions wanting URLs, that's the trigger.

**Complexity**: Medium. ~3–5 days. Requires:
- Firestore collection for shared posters (line1, line2, photoId, hashed-creator-IP, expiresAt for cleanup)
- New route `/p/:id` with server-side render via Netlify Edge or a serverless OG image generator
- Permalink button on the poster surface
- TTL on shared posters (90 days?) to prevent indefinite accumulation

**Soul-of-product trade-off**: persisting any user-generated content needs careful framing in the privacy posture. Consider opt-in (the user clicks "Get a shareable link," explicitly choosing to persist) rather than auto-creating a URL for every generation.

### Aspect-ratio variants

**What**: Square (current), vertical 1080×1350 (Instagram Stories / Reels), horizontal 1200×630 (group chat preview). User toggles which they want before downloading.

**Why deferred**: Square covers the dominant share surfaces (iMessage, group chats, IG feed). Vertical is meaningful only if Stories sharing emerges as a notable use case.

**Trigger to ship**: PostHog data shows users frequently downloading and re-sharing to Instagram Stories. Indirect signal — direct traffic from `instagram.com` referrers spiking.

**Complexity**: Medium. ~1–2 days. Requires:
- Photo metadata extension: text-zone per aspect ratio (or a base zone + per-ratio inset rules)
- Compositor variant for non-square canvases
- UI toggle for ratio selection

### PWA install affordance

**What**: "Add to home screen" prompt on mobile. The web manifest (per `21_Site_Foundation.md`) already supports the install; this adds explicit prompting.

**Why deferred**: For a one-shot product, "install once and use later" is a soft fit. The vision doc explicitly de-emphasizes daily return.

**Trigger to ship**: Returning visitor rate is high enough that the install would meaningfully reduce friction for repeat visits.

**Complexity**: Low-Medium. ~1 day. Detect installability, show a soft prompt in the footer ("Save this to your home screen"), respect dismissal.

---

## P3 — Lower-Priority Polish

### "Bless someone's heart" gift mode

**What**: Landing variant where the user describes a friend's situation and the framing makes the for-someone-else context explicit. Maps to the sender path (`bless-your-heart-journey-qa.md`).

**Why deferred**: V1 folds sender path into the same flow per the journey-doc decision. Splitting them is only worth it if data shows sender mode at ~50% of usage.

**Trigger to ship**: PostHog event data shows enough sessions where the prompt mentions a third person ("she," "he," "they," "my friend") that a dedicated UI would serve them.

**Complexity**: Low-Medium. ~1–2 days. New entry-point variant; tweaks to the system prompt to bias the voice slightly toward "this is for them" framing.

### localStorage history of last ~10 posters

**What**: Recent generations available as a small carousel below the input. User can return to one they almost downloaded.

**Why deferred**: Many users won't miss it. Adds clutter to a deliberately minimal surface.

**Trigger to ship**: User research (or thoughtful introspection) confirms recall is wanted.

**Complexity**: Low. ~1 day. Pure client-side localStorage, no server changes.

### Voice input via Web Speech API

**What**: A mic button that fills the prompt field via speech-to-text. Matches the energy of muttering to yourself on a bad day.

**Why deferred**: Mobile typing isn't actually onerous for 200 characters. The feature is more delightful than essential.

**Trigger to ship**: Mobile usage dominates (>70%) and PostHog shows long pause distributions before `prompt_submitted` (suggesting typing friction).

**Complexity**: Low. ~1 day. `webkitSpeechRecognition` on Chrome/Safari, graceful absence on Firefox.

### Multi-language support

**What**: Localized site copy plus per-language voice tuning. Spanish, German, French as initial targets — each requires a translated system prompt and independently-curated tone.

**Why deferred**: V1 voice is culturally specific (American wellness-influencer parody). Translating loses calibration unless the new voice is independently authored.

**Trigger to ship**: A meaningful share of traffic comes from a single non-English country. Minimum viable v1.5 covers UI strings only; voice localization is a separate, larger effort.

**Complexity**: Medium-High. ~3–5 days for UI strings, ~2 weeks per language for genuine voice tuning. Don't auto-translate the voice — that produces hollow output. Hire a writer in the target language.

### Localized error and distress copy

**What**: Error copy and the distress interstitial in the user's locale.

**Trigger to ship**: With multi-language support; the hotline list is already region-aware (`10_Safety_Guardrails.md`).

**Complexity**: Low (incremental on the multi-language work).

### Subtle texture / grain overlay

**What**: A subtle paper-grain or photographic-noise overlay on the rendered poster, pushing the wellness aesthetic from "stock image" to "framed in a yoga studio."

**Why deferred**: Risk of overcomplicating. The library curation already targets the aesthetic; an overlay layer is belt-and-suspenders.

**Trigger to ship**: User feedback (or first-impression critique) says the posters feel "too clean" or "stock-photo-ish."

**Complexity**: Low. Single PNG overlay applied as a final compositor pass.

### Soft chime on generation complete

**What**: A meditation-app-style chime when the poster reveals. Deployed ironically.

**Why deferred**: Audio in web pages is often hostile — autoplay restrictions, surprise volume. The visual reveal is enough.

**Trigger to ship**: Probably never. Listed for completeness because the source PRD flagged it.

**Complexity**: Low. ~0.25 day. Honestly, just leave it.

### Time-of-day photo skewing

**What**: Generate at 11pm, the photo selection biases toward moodier dusk shots. Generate at 7am, biases toward sunrises.

**Why deferred**: Adds metadata (`mood: 'morning' | 'evening' | 'neutral'`) and selection bias logic. Subtle benefit; significant build.

**Trigger to ship**: After a meaningful library expansion (>150 photos) where mood-tagging starts to differentiate experiences.

**Complexity**: Low-Medium. ~1–2 days. New per-photo metadata field; selection logic gates on local time.

---

## P4 — Ambitious

### Animated / video export

**What**: Subtle parallax on the photo with line 2 fading in 1.5s after line 1, exported as MP4 or GIF for video-first platforms (TikTok, Reels). Massively expands shareability into platforms the static PNG can't reach.

**Why deferred**: Architecturally heavy. Requires server-side rendering (Remotion, Vercel OG, or equivalent) since browser-based MP4 export is unreliable. Significant infra change.

**Trigger to ship**: Decision to chase a TikTok moment intentionally. Don't accidentally pursue this — it's a project, not a feature.

**Complexity**: High. ~5–7 days plus a new render service in the architecture.

### "Read it to me" — TTS in a wellness-influencer voice

**What**: Tap a speaker icon, hear the poster read aloud in a soft, theatrical TTS voice. Funny in itself; adds a sensory layer the static poster can't reach.

**Why deferred**: TTS quality is uneven; the joke depends on the voice landing exactly right. Bad TTS ruins it.

**Trigger to ship**: A specific TTS service emerges with the right vocal register, or ElevenLabs-style custom-voice cloning becomes cheap enough to use a single hand-tuned voice across all generations.

**Complexity**: High. ~5–7 days plus monthly TTS cost.

### Bot in iMessage / Slack / Discord

**What**: `/bless [situation]` invocation that returns a poster directly in the chat. Distribution lives where the friends already are.

**Why deferred**: Each platform has its own integration model; meaningful build per platform. For the right discovery mode (audiences who never visit the site), it's high-leverage.

**Trigger to ship**: Specific user segment requests (e.g., a Slack admin asks for a workplace-friendly mode).

**Complexity**: High per platform. ~5–7 days each.

### iMessage / WhatsApp sticker pack

**What**: User exports favorite generations as an installable sticker pack. The joke lives in the user's keyboard.

**Why deferred**: Platform-specific build; iOS App Store review for iMessage stickers; each pack is per-user content management.

**Trigger to ship**: Strong signal that users curate favorites and want them outside the browser.

**Complexity**: High. ~7–10 days plus App Store overhead.

---

## Anti-Features (Reminder)

These are documented in `00_README.md` and **should not move into this file**. They are deliberately permanent omissions, not deferred work:

- User accounts, login
- Public feed of others' generations
- Streaks, daily prompts, push notifications
- Celebratory UI on download
- Premium / paid tier
- Social commentary or political content modes
- Database of user-submitted prompts

If a future feature here would require breaking one of these — say, "Bless your year" annual recap requiring stored history — note the trade-off explicitly in that feature's entry.

## How to Reorder This List

When new ideas surface or signals shift, update this file (don't keep them in your head). Use these prompts when triaging:

1. *Is this serving the share moment, or only retention?* Share-moment features earn priority; retention features fight the product's nature.
2. *Does this require breaking an anti-feature?* If yes, the bar is much higher.
3. *What's the smallest version that proves whether it's worth fully building?* If there isn't one, the feature is probably P3 or P4.
4. *Does it require new infrastructure?* Anything requiring a new service, region, or platform integration is P3+ unless it's serving a top-3 emotional beat.

## Gaps & Assumptions

- **Trigger criteria are estimates**, not hard thresholds. "Returning visitor rate is high enough" is not measured here; whoever picks up post-MVP work will need to define what "high enough" means based on the actual data they're seeing.
- **Effort estimates are calendar days for one developer working with Claude Code or similar AI assistance**. Adjust by team and tooling.
- **No timeline commitments**. This file orders features; it does not schedule them.
- **The list is not exhaustive**. Reasonable ideas not flagged in the source PRD aren't here. If something obviously useful emerges from real usage, add it here rather than treating its absence as a reason not to build it.
