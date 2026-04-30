# Voice & Safety

## The Two-Line Contract

| Element | Target | Hard Cap | Voice |
|---------|--------|----------|-------|
| Line 1 | 30–50 chars | 60 | Sincere, reverent, wellness-influencer. Could appear unironically on Pinterest |
| Line 2 | 50–88 chars | 100 | Savagely honest pivot. Dry, deadpan, true. References user's specific situation |

**The format is the joke.** Without contrast, both lines fail. Line 1 stays sincere — no winking. The trap only snaps shut on line 2.

## Voice Rules (Non-Negotiable)

1. Line 2 punches at **the situation**, universal patterns, or absurdity — never at the user's worth, intelligence, body, or appearance
2. Voice = "a friend who has given up pretending to be encouraging." Not mean. Not therapeutic
3. **Specificity is the whole game.** If user mentions "third coffee," line 2 must reference caffeine/mornings/escalation
4. No exclamation points, emojis, "lol," moralizing, real-person names, politics
5. Line 1 stays sincere — no winking

## Tone Calibration

- OK: Could appear in a 10-year friendship group chat or @disappointingaffirmations
- Too far: Would appear in a roast set
- Too soft: Would appear in a self-help book

## Off-Topic Input Handling

The format never breaks. Factual questions, gibberish, or explainers get absorbed:
- Line 1 stays reverent on whatever theme the input suggests
- Line 2 pivots to the meta-absurdity of having typed that into this app

## Safety Filter Pipeline (Cost-Optimized Order)

1. **Rate-limit check** — Firestore read
2. **Slur/hate-speech filter** — word-list, free, whole-word match
3. **Real-person target filter** — ~100 named public figures + possessive+name regex
4. **Distress check Stage A** — phrase list (~30–50 high-precision phrases), server-only
5. **Distress check Stage B** — Haiku classifier (only if Stage A doesn't trigger)
6. **Generation** — Sonnet call
7. **Output validation** — format (Zod) → specificity (lexical) → tone (Haiku classifier)

## Output Validation Sequence

```
JSON parse → Zod schema → specificity check → tone check (Haiku) → pass
     ✗            ✗             ✗                  ✗
     └─────────────┴─────────────┴──────────────────┴─ retry (cap 2) → safe_fallback
```

- **Specificity check**: lexical — word overlap, stem matching, synonym map (~20–30 entries)
- **Tone check**: Haiku classifies "punches at user" vs "punches at situation"
- Asymmetric tuning: false positives cost a regeneration; false negatives ship hostile content

## Distress Response

Modal: warm, brief, dismissible. No clinical language, no scolding. Input NOT cleared on dismiss.
Hotline routing: `x-country` header → localized number from `src/content/hotlines.ts`.
Fallback: findahelpline.com for unmapped countries.

## Content Files (All in `src/content/`)

| File | Purpose | Client/Server |
|------|---------|--------------|
| `presets.ts` | Mood button labels | Client |
| `examples.ts` | Hero poster text | Client |
| `copy.ts` | In-voice UI strings | Client |
| `distress-phrases.ts` | Crisis phrase list | **Server only** |
| `hotlines.ts` | Crisis line routing | Server |
| `slur-list.ts` | Hate-speech filter | **Server only** |
| `synonyms.ts` | Specificity check map | Server |
| `fallbacks.ts` | Safe canned posters | Server |
