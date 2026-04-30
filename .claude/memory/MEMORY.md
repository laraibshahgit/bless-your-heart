# Bless Your Heart — Memory Index

Navigation index for AI agent context. Each entry links to a topic file with detailed implementation notes.

## Topic Files

- [Voice & Safety](voice-and-safety.md) — Working on generation prompts, safety filters, distress detection, or tone validation
- [Canvas & Compositing](canvas-and-compositing.md) — Working on poster rendering, text fitting pipeline, font loading, or download
- [Design System](design-system.md) — Building or modifying UI components, colors, typography, spacing, or animations
- [API & Backend](api-and-backend.md) — Working on the Netlify function, rate limiting, or request/response handling
- [PRD Index](prd-index.md) — Need detailed specs for any topic — maps subjects to PRD document numbers

## Cross-Cutting Patterns

- **No user data stored** — rate-limit counters only in Firestore; no accounts, no generated content persisted
- **Cost optimization** — filters ordered cheapest-first: word lists (free) → Haiku ($0.0003) → Sonnet ($0.005)
- **Contract always holds** — user always gets a poster, never a raw error; safe fallback is the last rung
- **Single typeface** — Cormorant Garamond everywhere: site UI and Canvas poster text
- **Server-side safety** — distress phrases, slur list, and all AI calls never exposed to client
- **Visual quality is half the joke** — cheap-looking output kills the product; never cut corners on rendering
