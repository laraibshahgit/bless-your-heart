# Bless Your Heart

## Overview

A single-page web app that generates anti-affirmation posters: reverent inspirational typography over a scenic landscape photo, with a two-line text payload — sincere wellness-influencer setup on line 1, savagely honest pivot on line 2. No accounts, no database of user content, no retention play. Land-to-share in under ten seconds, then the user moves on.

## Tech Stack at a Glance

| Layer | Choice |
|-------|--------|
| Frontend | React 18.3+ · TypeScript 5.4+ · Vite 5+ · Tailwind 3.4+ · Shadcn/UI |
| Compositing | Native HTML5 Canvas API |
| Typography | Cormorant Garamond (self-hosted via `@fontsource`) |
| Backend | Netlify Functions on Node 20 LTS |
| AI — generation | Anthropic Claude Sonnet 4.6 |
| AI — safety | Anthropic Claude Haiku 4.5 |
| Data | Firestore (rate-limit counters only) · Firebase Storage (photos) |
| Hosting | Netlify (frontend + functions) |
| Analytics | PostHog (free tier) |
| Domain | Cloudflare Registrar |

See `01_Tech_Stack.md` for full versions, dependencies, and rationale.

## File Structure

| # | File | Contents |
|---|------|----------|
| 00 | `00_README.md` | This file — overview, file index, anti-features, gaps |
| 01 | `01_Tech_Stack.md` | Stack details, dependencies, env vars, model choices |
| 02 | `02_Project_Setup.md` | Repo structure, Vite/Netlify/Firebase configs, dev workflow |
| 03 | `03_Data_Schema.md` | Firestore rate-limit doc + photo metadata JSON shape |
| 04 | `04_UI_Design_System.md` | Colors, typography, components, layout, animation tokens |
| 05 | `05_Voice_And_System_Prompt.md` | Line 1/2 contract, system prompt, off-topic handling |
| 06 | `06_Landing_Page.md` | Landing layout, hero examples, headline, footer |
| 07 | `07_Input_And_Presets.md` | "What's going on?" field, preset buttons, persistence |
| 08 | `08_Generation_API.md` | Netlify function flow, Sonnet call, Zod schema |
| 09 | `09_Output_Validation_And_Retries.md` | Format check, tone check, retry logic, safe fallback |
| 10 | `10_Safety_Guardrails.md` | Distress detection, slurs, real-person block, hotlines |
| 11 | `11_Photo_Library.md` | Library structure, sourcing/licensing, rotation cadence |
| 12 | `12_Photo_Metadata.md` | textZone, capacity, textColor, watermarkPosition, tier |
| 13 | `13_Photo_Curation_Tool.md` | Admin tool for tagging photos at intake, CI lint |
| 14 | `14_Text_Fitting_Pipeline.md` | Stages 1–4, fallback ladder, contract, logging |
| 15 | `15_Compositing_Engine.md` | Canvas API render, font loading, draw order, DPR |
| 16 | `16_Poster_Display_And_Regenerate.md` | Reveal animation, anticipation beat, regenerate |
| 17 | `17_Download_PNG.md` | file-saver, iOS Safari handling, filename, resolution |
| 18 | `18_Watermark.md` | Position, serif treatment, size, rendering rules |
| 19 | `19_Rate_Limiting.md` | Firestore per-IP counter, TTL, soft-fail copy |
| 20 | `20_Error_Handling.md` | API timeouts, in-voice copy, retry button, logging |
| 21 | `21_Site_Foundation.md` | Responsive breakpoints, OG metadata, JS-required fallback |
| 22 | `22_Analytics.md` | PostHog setup, tracked events, leading indicators |
| 23 | `23_Performance.md` | Sub-2s load target, photo CDN, font preload, Canvas perf |
| 24 | `24_Future_Features.md` | All deferred items from the roadmap, P1–P4 |

## Source-of-Truth Resolutions

The source PRD contained two contradictions and one model-version concern that this decomposition has resolved:

1. **Watermark on download.** The feature-list Q&A said *"no watermark, clean image."* The user-journey Q&A said *"add a short 'Bless Your Heart' watermark."* This decomposition follows the **journey doc**, per the tech-stack document's explicit resolution: a small Cormorant Garamond watermark is required so the share-and-discover loop can close. See `18_Watermark.md`.

2. **Model versions.** The PRD specifies Claude Sonnet 4.6 and Haiku 4.5. The Claude family has since moved past those versions. Files specify the PRD's models as written, but the developer should verify current availability before build and substitute the latest equivalents if those versions are deprecated. The architecture is model-agnostic — only the model string in the API call needs updating.

3. **Off-topic input handling.** The PRD describes the desired behavior (the format never breaks; the AI absorbs the absurdity) but doesn't specify implementation. This decomposition handles it **entirely in the Sonnet system prompt** with worked examples — no separate classifier. See `05_Voice_And_System_Prompt.md`.

## Anti-Features (Deliberately Omitted)

These are out of scope by design. Document them so they can't drift in:

- No user accounts, no login
- No database of user-submitted content or generated posters
- No public feed of others' generations
- No streaks, daily prompts, or push notifications
- No celebratory UI on download — the deadpan **is** the joke
- No premium tier at launch
- No social commentary or political content modes

## Top Gaps (Pre-Build Tasks)

These need a decision or content authoring before the build can complete:

| Gap | Owner | Suggested Default |
|-----|-------|-------------------|
| Photo library source + license | Builder | Unsplash+ or Pexels Pro; commercial-use license required |
| Distress phrase seed list | Builder | Author 30–50 high-precision phrases; see `10_Safety_Guardrails.md` |
| Slur/hate-speech list | Builder | Use a maintained open list (e.g. LDNOOBW or similar) |
| OG hero poster image | Builder | Curate one canonical "house example" before launch |
| Domain name | Builder | Register on Cloudflare; suggested: `blessyourheart.app` |
| Hotline list (international) | Builder | 988 (US default); curated list for top 5 traffic countries |

## Key Principles to Preserve

These appear repeatedly across the source docs and should not be eroded during build:

1. **Visual quality is half the joke.** Cheap-looking output kills the product. Cormorant Garamond, the photo selection, and the compositing pipeline all serve this rule.
2. **Specificity is what makes line 2 land.** Generic disappointment is forgettable. Line 2 must reference what the user actually typed.
3. **Punch at the situation, not at the user.** This is the line between cathartic and hostile, and there's no recovery from crossing it.
4. **The format is the joke.** Two lines, line 1 reverent, line 2 savage pivot. The fitting pipeline exists so this contract is never silently broken.
5. **The deadpan is sacred.** Confetti on download, celebration UI, sincere thank-you copy — all corrode the voice.

## Build Sequence

The file numbering reflects implementation order. A reasonable parallel structure:

- **Foundation (00–04)**: Stack, setup, schema, design system. Must be solid before features start.
- **Core engine (05, 08, 09, 14, 15)**: The voice, the API, validation, fitting, compositing. The product fundamentally is these five files working together.
- **User-facing surfaces (06, 07, 16, 17)**: Landing, input, reveal, download.
- **Asset layer (11, 12, 13)**: Photos and their metadata. Can run in parallel with the engine.
- **Hardening (10, 18, 19, 20)**: Safety, watermark, rate limiting, errors.
- **Polish (21, 22, 23)**: Foundation polish, analytics, performance.
- **Reference (24)**: Roadmap, not for v1 build.
