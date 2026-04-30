# PRD Document Index

All specification documents live in `/PRD/`. Use this index to find detailed specs by topic.

| # | File | Topics Covered |
|---|------|---------------|
| 00 | `00_README.md` | Project overview, anti-features, key principles, build sequence |
| 01 | `01_Tech_Stack.md` | Dependencies, versions, env vars, model choices, cost analysis |
| 02 | `02_Project_Setup.md` | Repo structure, configs, local dev workflow, deploy pipeline |
| 03 | `03_Data_Schema.md` | Firestore schema, photos.json shape, request/response types |
| 04 | `04_UI_Design_System.md` | Colors, typography, spacing, components, animations, accessibility |
| 05 | `05_Voice_And_System_Prompt.md` | Voice rules, two-line contract, system prompt, off-topic handling |
| 06 | `06_Landing_Page.md` | Page structure, hero examples, footer, OG metadata |
| 07 | `07_Input_And_Presets.md` | Prompt input behavior, presets, persistence, submit flow |
| 08 | `08_Generation_API.md` | Endpoint, request/response, Sonnet call, photo selection, logging |
| 09 | `09_Output_Validation_And_Retries.md` | Format/specificity/tone checks, retry budget, safe fallback |
| 10 | `10_Safety_Guardrails.md` | Distress detection, slur filter, real-person block, tone check |
| 11 | `11_Photo_Library.md` | Sourcing, licensing, rotation cadence |
| 12 | `12_Photo_Metadata.md` | Field semantics (id, textZone, capacity, tier, etc.) |
| 13 | `13_Photo_Curation_Tool.md` | Metadata tagging tool, CI lint rules |
| 14 | `14_Text_Fitting_Pipeline.md` | Four stages, fallback ladder, monitoring metrics |
| 15 | `15_Compositing_Engine.md` | Canvas setup, font loading, draw order, Stage 4 verification |
| 16 | `16_Poster_Display_And_Regenerate.md` | Reveal animation, regenerate button, download prompt |
| 17 | `17_Download_PNG.md` | file-saver, iOS handling, filename, resolution |
| 18 | `18_Watermark.md` | Position, serif treatment, size, rendering rules |
| 19 | `19_Rate_Limiting.md` | Per-IP counter, Firestore transaction, TTL, soft-fail UX |
| 20 | `20_Error_Handling.md` | API timeouts, in-voice copy, retry button, logging |
| 21 | `21_Site_Foundation.md` | Favicons, manifest, robots/sitemap, headers, 404, browser support |
| 22 | `22_Analytics.md` | PostHog setup, tracked events, privacy posture |
| 23 | `23_Performance.md` | Load targets, bundle budgets, font preload, Canvas perf |
| 24 | `24_Future_Features.md` | P1–P4 roadmap (permalink pages, dark mode, localization, etc.) |

## Quick Lookup by Task

| If you're working on... | Read these PRDs |
|------------------------|----------------|
| Setting up the project | 01, 02 |
| Building the UI | 04, 06, 07, 16 |
| Generation endpoint | 08, 09, 10 |
| Canvas rendering | 14, 15, 17, 18 |
| Photo library | 11, 12, 13 |
| Safety & moderation | 05, 10 |
| Analytics & monitoring | 22, 23 |
| Deploy & infrastructure | 02, 21 |
