# Output Validation and Retries

## Overview

The generation pipeline's quality gate. After Sonnet returns a candidate, three checks run in sequence: format (does it match the schema?), specificity (does line 2 reference the user's input?), and tone (does it punch at the user?). Any failure triggers a silent retry, capped at 2 attempts. If all retries fail, a curated safe fallback ships so the user never sees an error in place of a poster.

This file specifies each check, the retry budget, and the fallback content.

## Dependencies
- `05_Voice_And_System_Prompt.md` — The voice rules these checks defend
- `08_Generation_API.md` — The function that orchestrates these checks
- `01_Tech_Stack.md` — Zod and Anthropic SDK versions

## The Validation Sequence

For each Sonnet call:

```
parse JSON  ──▶  Zod schema  ──▶  specificity  ──▶  tone (Haiku)  ──▶  pass
     ✗              ✗               ✗              ✗
     │              │               │              │
     └──────────────┴───────────────┴──────────────┴──▶ retry (cap 2)
                                                        └──▶ all fail → safe_fallback
```

Each failure is logged with `reason` (`format` | `specificity` | `tone`) and counts against the retry budget regardless of which stage failed.

## Stage 1: Format Validation (Zod)

```ts
const GenerationSchema = z.object({
  line1: z.string().trim().min(1).max(60),
  line2: z.string().trim().min(1).max(100),
});
```

Hard caps (60 / 100) are above the prompt's targets (30–50 / 50–88). Sonnet usually lands inside the target range; the cap exists to catch drift and to give the photo-fitting pipeline (`14_Text_Fitting_Pipeline.md`) a guarantee.

**Failure modes caught here**:

- Output isn't valid JSON
- Output is JSON but missing fields
- Output has extra fields (the schema is `.strict()` — extra fields fail)
- Either line is empty after trim
- Either line exceeds the cap

```ts
const StrictGenerationSchema = GenerationSchema.strict();
```

Use `.strict()` to fail on unexpected fields like `"explanation"` or `"reasoning"` that some models add despite the prompt.

**On failure**: log `gen_retry` with `reason: 'format'`. Re-call Sonnet with the same prompt. Do not modify the system prompt between retries — that adds variability without adding signal.

## Stage 2: Specificity Validation

The single most important quality check. A generic line 2 ("life is hard") technically passes format but fails the product. This stage tries to detect when line 2 has *not* engaged with the user's specific input.

### Approach

A lightweight overlap check between the user's prompt and line 2:

```ts
function checkSpecificity(prompt: string, line2: string): boolean {
  const promptTokens = tokenize(prompt);     // lowercase, strip punctuation
  const line2Tokens = tokenize(line2);

  // Filter out common stopwords from prompt to find content words
  const contentWords = promptTokens.filter(t => !STOPWORDS.has(t) && t.length > 2);

  if (contentWords.length === 0) {
    // Single-word prompts ("work", "Monday") get a free pass —
    // there's no content-word distinction to check
    return true;
  }

  // At least one content word from the prompt must appear in line 2,
  // OR a synonym/related word (small curated map for common prompts).
  const directOverlap = contentWords.some(w =>
    line2Tokens.includes(w) || line2Tokens.includes(stem(w))
  );

  if (directOverlap) return true;

  // Synonym map for the most common preset/themes
  const synonymHit = checkSynonymMap(contentWords, line2Tokens);
  return synonymHit;
}
```

### The synonym map

Hand-curated; covers the preset themes and their natural lexical neighbors:

| Prompt content word | Counts as overlap if line 2 contains |
|---------------------|--------------------------------------|
| `monday`, `weekday` | day, week, morning, weekend, tomorrow |
| `coffee`, `caffeine` | morning, cup, mug, brew, awake, tired |
| `sleep`, `tired`, `insomnia` | rest, awake, bed, eyes, dark, dawn |
| `work`, `job`, `boss` | office, meeting, email, deadline, career |
| `family`, `mom`, `dad`, `sibling` | relatives, parents, dinner, holidays |
| `dating`, `breakup`, `ex` | romance, love, text, swipe, single |
| `money`, `bills`, `rent` | wallet, account, paycheck, debt, broke |

Author this map alongside the voice prompt. Around 20–30 entries cover most cases. Keep it as `src/content/synonyms.ts`.

### Why not a Haiku-based specificity check

Haiku could classify "is this specific?" with better recall, but: (1) it's an extra API call per generation that triples the cost of validation, (2) the lexical check above is fast and free, and (3) the synonym map is transparent and tunable. Specificity isn't a safety property — false negatives just mean a slightly less-resonant poster, not a harmful one. Lexical is the right tool.

**On failure**: log `gen_retry` with `reason: 'specificity'`. Re-call Sonnet. As above, don't modify the system prompt.

### Specificity bypass for off-topic inputs

The off-topic input handler in `05_Voice_And_System_Prompt.md` produces line 2 lines that pivot to meta-absurdity rather than the literal input. These can fail the specificity check legitimately ("explain quantum physics" → "Superposition will not help with the laundry" — `superposition` matches but only because Sonnet happens to use it).

**Implementation**: Skip the specificity check if the prompt is detected as off-topic. Lightweight detection: prompt contains a question mark, prompt is a single word that isn't an emotion/situation, prompt is gibberish (< 30% letters). Better to under-validate than to retry-loop on inputs the system prompt is intentionally handling differently.

## Stage 3: Tone Check (Haiku)

The last-mile defense against a line 2 that punches at the user. The system prompt forbids it; this check catches drift.

### Haiku call shape

```ts
const toneCheck = await anthropic.messages.create({
  model: env.ANTHROPIC_MODEL_SAFETY,
  max_tokens: 10,
  temperature: 0,
  system: TONE_CHECK_PROMPT,
  messages: [
    { role: "user", content:
      `User input: "${prompt}"\nGenerated line 2: "${line2}"`
    },
  ],
});

const verdict = toneCheck.content[0].text.trim().toLowerCase();
const passed = verdict.startsWith("safe");
```

### Tone-check prompt

```
You evaluate whether a line of text punches at the person who asked,
or punches at the situation/universal pattern/absurdity.

The line is part of a comedy product where the joke is supposed to land
on the SITUATION the user described, not on the user themselves.

PUNCHES AT THE USER (return "user"):
- Targets the user's worth, intelligence, body, appearance, life choices
- Implies the user is a failure as a person
- Implies the user deserves their bad situation
- Insults the user directly

PUNCHES AT SITUATION (return "safe"):
- Comments on the universal experience the user described
- Notes the absurdity or futility of the moment
- Resigned commentary on life, time, work, etc.
- Could be said by a friend who has given up pretending to be encouraging

Return EXACTLY one word: "safe" or "user". Nothing else.
```

The check is asymmetric — false positives (saying "user" when it's actually safe) just cost a regeneration; false negatives (saying "safe" when it punches at the user) ship a hostile poster. Tune the prompt toward false-positive bias if needed.

**On failure**: log `gen_retry` with `reason: 'tone'`. Re-call Sonnet.

### Optional: skip tone check after stable run

`01_Tech_Stack.md` notes that the tone check can be dropped if Sonnet's voice stays clean over time. To enable this gracefully, add an env flag `ENABLE_TONE_CHECK` (default `true`). If set to `false`, Stage 3 is skipped entirely. Don't remove the code — keep the lever available.

## Retry Budget

| Attempt | What happens |
|---------|--------------|
| 1 (initial) | Standard system prompt + user input |
| 2 (retry 1) | Identical call — relies on temperature variance |
| 3 (retry 2) | Identical call — last chance |
| All failed | Trigger safe fallback (below) |

**Why no third retry**: per the source PRD, the third retry rarely succeeds and burns cost. Empirically, if two well-formed Sonnet calls at temperature 0.9 can't pass validation, the prompt itself is likely the issue and the safe fallback is the right move.

**Why no prompt modification on retry**: changing the prompt mid-loop introduces uncontrolled variability. If retries consistently fail for a class of input, the fix is to update the system prompt for everyone — not to silently retry-with-different-prompt.

## Stage 4: Safe Fallback

When all retries fail, ship a curated "house" poster: a fixed line 1 + line 2 paired with a known-good high-capacity photo. The user gets a poster — the contract holds — but it's deliberately generic.

### Fallback content

A pool of ~5 prewritten fallback posters in `src/content/fallbacks.ts`. Random pick on trigger. Each pairs with a specific high-capacity photo ID so the fitting pipeline doesn't need to be re-run.

```ts
export const safeFallbacks = [
  {
    line1: "The path forward is not always clear.",
    line2: "Yours, in particular, is currently buffering.",
    photoId: "misty-fjord-01"  // confirmed high-capacity
  },
  {
    line1: "You are exactly where you need to be.",
    line2: "Statistically, this is bad news.",
    photoId: "sunrise-meadow-02"
  },
  // ... ~3 more
];
```

These are intentionally on-brand, not error-flavored. The user shouldn't be able to tell they got a fallback. The only signal is in server logs — `event: 'gen_safe_fallback'`.

### Why the fallbacks are universal, not specific

By definition, a safe fallback ships when the system has failed to generate something specific. Trying to be specific in the fallback would be a contradiction. The fallback voice leans into the universal pattern, which is what line 2 is allowed to do.

### Fallback as a quality alarm

`event: 'gen_safe_fallback'` rate above ~1% in production is a signal that something is broken — likely the prompt has drifted or Sonnet's behavior has changed. Investigate, don't ignore.

## What This File Does NOT Validate

- **Input safety** (distress, slurs, real-person targets) — that's `10_Safety_Guardrails.md`, runs before generation
- **Photo fitting at the visual level** — that's `14_Text_Fitting_Pipeline.md`, runs after this file's checks pass and includes client-side width verification
- **Output content moderation beyond tone** — Sonnet is well-aligned and the system prompt is tight. Adding broader content moderation here adds cost without adding value at v1 scale.

## Test Strategy

Author a small Vitest suite covering:

- Zod schema with valid input → passes
- Zod schema missing `line2` → fails
- Zod schema with extra `explanation` field → fails (strict)
- Specificity: prompt "haven't started yet", line2 "Statistically, this is false" → passes
- Specificity: prompt "haven't started yet", line2 "Life is hard" → fails
- Specificity: single-word prompt → free pass
- Synonym map: prompt "Monday again", line2 "the week loops" → passes via synonym

Tone-check tests are integration-only (real Haiku calls) and not part of unit tests.

## Gaps & Assumptions

- **STOPWORDS list**: Use a standard English stopword list (~150 entries). Doesn't need to be custom; available in any NLP utility npm package or as a static array.
- **Stem function**: Simple suffix-stripping (e.g., remove `-ing`, `-ed`, `-s`) is enough; full Porter stemming is overkill. ~20 lines of regex.
- **Synonym map authoring**: Initial pass during build. Track misses in `gen_retry { reason: 'specificity' }` log volume; add entries when patterns emerge.
- **Tone-check prompt tuning**: Run against ~30 known-good and ~30 known-bad outputs before launch. Adjust if false-positive or false-negative rate is unacceptable.
- **Fallback rotation**: Pure random; no need for round-robin or session memory at this volume.
- **Off-topic detection for specificity bypass**: The heuristics described above (question mark, single-word, gibberish) are coarse; refine if logs show legitimate off-topic outputs being looped through retry unnecessarily.
