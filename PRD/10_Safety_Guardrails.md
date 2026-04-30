# Safety Guardrails

## Overview

Three input-side filters and one output-side check protect the product from generating cruel, dangerous, or legally risky content. They run inside the generation function, before Sonnet is called (input filters) and after Sonnet returns (output check). Failure of any input filter short-circuits generation and returns a structured response; the output check triggers a silent regeneration.

The voice of these refusals matters as much as the underlying logic. The product's posture toward users is warmth — even when it can't help. Preachy, clinical, or lecturing copy turns a refusal into an experience that itself causes harm. Get the words right.

## Dependencies
- `08_Generation_API.md` — The function that orchestrates these checks
- `09_Output_Validation_And_Retries.md` — Output tone check sits in that file's pipeline
- `03_Data_Schema.md` — Distress and blocked response shapes

## Filter Order (Recap from `08`)

```
1. Rate-limit check
2. Slur / hate-speech filter        ← this file
3. Real-person target filter        ← this file
4. Distress check                   ← this file
5. Generation (Sonnet)
6. Output validation, including tone check  ← reference 09
```

The order matters: cheaper filters run first. Slur and real-person checks are list-based and effectively free. The distress check is a Haiku call (~$0.0003) and runs last so it doesn't pay out on inputs that would have been blocked anyway.

---

## Distress Detection

The most product-defining safety surface. When a user types something that signals genuine self-harm intent or active crisis, the product does not generate a poster. It returns a warm, brief interstitial with a hotline.

### Two-stage detection

**Stage A — phrase list**: a curated list of high-confidence distress signals. Fast, free, no API call. Catches the unambiguous cases. The list lives in `src/content/distress-phrases.ts` and is **server-only** (do not bundle to the client — the list itself is sensitive content).

The list should cover four categories:

1. Direct expressions of intent to harm or end one's life
2. Direct expressions of hopelessness paired with finality language
3. Active-crisis time markers ("tonight," "right now," "today")
4. Specific framings common in crisis contexts (refer to professional crisis-line training resources to author this; the developer should consult published clinical guidance, not author from intuition)

**Critical authoring rule**: the phrase list and the distress classifier prompt below should *not* enumerate specific methods, means, or detailed scenarios. Detection works on intent and framing, not on cataloguing methods. Methods-language in safety code is itself a leak that can surface in error messages, logs, or accidental client bundles.

Match logic is case-insensitive substring matching against the normalized prompt. Any match → distress flow triggers. Do not require multiple matches; precision matters more than recall here, but err toward the safer side at the cost of occasional false positives.

**Stage B — Haiku classifier**: catches phrasings the list misses. Runs only if Stage A doesn't trigger.

```
const distressCheck = await anthropic.messages.create({
  model: env.ANTHROPIC_MODEL_SAFETY,
  max_tokens: 10,
  temperature: 0,
  system: DISTRESS_CHECK_PROMPT,
  messages: [{ role: "user", content: prompt }],
});
const verdict = distressCheck.content[0].text.trim().toLowerCase();
const isDistress = verdict.startsWith("crisis");
```

### Distress classifier prompt

```
You are evaluating a single short text input from a user of a comedy
poster generator. The product helps people laugh at bad days. We need
to know if the input shows signs that the person is in genuine crisis
or expressing intent to harm themselves — in which case the product
should NOT generate a poster and should instead show them a support
resource.

Return EXACTLY one of:

- "crisis" — the input expresses a clear intent to harm oneself,
  active suicidal ideation, or an immediate, severe crisis. Err on
  the side of "crisis" if there is genuine ambiguity around safety.

- "ok" — the input is a normal bad-day situation, even if it uses
  dramatic, emphatic, or hyperbolic language ("I want to die from
  embarrassment", "this is killing me", "I'm dying", etc.). Hyperbole
  about everyday frustrations is not crisis.

Return only the single word. No explanation, no other text.
```

The hyperbole guidance is critical — the product's audience uses dramatic language casually ("I want to die" as embarrassment, "kill me now" as exhaustion). Treating those as crisis would make the product unusable for the very audience it serves. The classifier must distinguish *expressed* hyperbole from *expressed* intent.

### Distress response

When either stage triggers, return:

```ts
{
  status: 'distress',
  hotline: { countryCode, name, phone, url? }
}
```

The frontend renders a modal interstitial (per `04_UI_Design_System.md`'s dialog spec). Copy:

> ***This one isn't for jokes.***
>
> *If you're going through something serious, please talk to someone who can actually help. You're not alone in it.*
>
> **[Country-localized hotline name and number]**
>
> *Or visit [findahelpline.com] for support anywhere in the world.*
>
> [ Take me back ]

Tone notes: warm, brief, no clinical language ("if you're experiencing a mental health crisis"), no scolding ("we noticed your message contains..."). Not preachy. Not performative. The user can dismiss with the "Take me back" button — focus returns to the prompt input, the input is **not cleared** (the user may want to re-phrase a non-crisis prompt that triggered a false positive).

### Hotline routing by region

Use Netlify's edge headers to detect the user's country:

```ts
const country = (event.headers['x-country'] || '').toUpperCase() || 'XX';
const hotline = getHotlineForCountry(country);
```

`x-country` is provided automatically by Netlify Edge for every request — no geolocation service needed.

Maintain a mapping in `src/content/hotlines.ts` for the highest-traffic countries (cover at least US, UK, CA, AU, IE, IN, DE, FR, NZ at v1). For any country without an entry, fall back to:

```ts
{
  countryCode: 'INTL',
  name: 'Find a Helpline',
  phone: '',
  url: 'https://findahelpline.com',
}
```

`findahelpline.com` is a legitimate international aggregator maintained by ThroughLine; it covers most countries the fallback is likely to encounter.

**Verification before launch**: confirm each listed hotline is currently operational and has the correct number. Hotline numbers change, and shipping a wrong number is a serious harm. Re-verify quarterly as part of the photo-rotation cadence — they happen to share a calendar.

### Logging

Log `event: 'gen_distress'` with no prompt content, no IP, no identifying data. Volume is the only signal we care about.

---

## Slur and Hate-Speech Filter

A simple word-list filter that refuses generation if the input contains slurs or unambiguous hate-speech terms.

### List

Use a maintained open-source list — `LDNOOBW` (List of Dirty, Naughty, Obscene, and Otherwise Bad Words) is one widely-used option, though authoring or curating from a more focused hate-speech list is preferable for precision. Author at build time; check it into the repo as `src/content/slur-list.ts`.

**This is not a profanity filter.** Common profanity (`fuck`, `shit`) is allowed in user input — the product's audience uses it casually. The filter targets slurs and hate terms only. Be deliberate about the list.

### Match logic

Case-insensitive whole-word match (use word boundaries `\b...\b`). Substring matching produces too many false positives (e.g., legitimate words containing letter sequences that match slurs).

### Response

```ts
{ status: 'blocked', message: "Let's try a different one." }
```

Frontend shows the message inline beneath the input field in `feedback-quiet` color. The input is preserved (the user can edit and try again). No lecture, no "you typed something offensive," no explanation of which word triggered.

### Logging

`event: 'gen_block', reason: 'slur'`. No prompt content logged.

---

## Real-Person Targeting

Refuse generations aimed at named individuals.

### Patterns to detect

1. **Named public figures**: a curated list of high-profile names (politicians, celebrities, executives). The list is maintained manually; ~100 names cover the high-risk surface. Use word-boundary matching like the slur filter.

2. **Possessive-relationship + name patterns**: regex match for `my\s+(boss|sister|brother|mom|dad|wife|husband|partner|ex|girlfriend|boyfriend|coworker|teacher|friend|neighbor|landlord|therapist|roommate)\s+([A-Z][a-z]+)` — i.e., the user names a real person in their life by first name.

The first pattern blocks "rant about [Public Figure]." The second blocks "Bless [Specific Real Person]."

### Why both

Public figures need protection from a product that could mass-produce posters that look like coordinated attacks. Named people in users' lives need protection because: (a) the user's friend hasn't consented to becoming a meme, and (b) shipping that opens a harassment vector if the poster is sent without context.

### Response

Same shape as the slur filter:

```ts
{ status: 'blocked', message: "The voice doesn't punch at people. Try a situation instead." }
```

The "try a situation instead" copy is the only filter that lightly explains itself, because the redirect is constructive — situations work, people don't. This is the one filter where a short cue helps the user succeed on their next try.

### Logging

`event: 'gen_block', reason: 'real-person'`.

### Edge case: relationships without names

`"my boss"` is fine — there's no name. `"my boss Linda"` is blocked. The first targets a role and a universal pattern; the second targets a specific person.

`"my ex"` is fine — and is a preset-adjacent prompt the voice handles gracefully.

`"Donald"` alone — blocked if on the public-figure list, allowed if not. The list is the disambiguator.

---

## Output Tone Check (cross-reference)

The fourth safety surface is the Haiku-based tone check on the *generated* line 2, fully specified in `09_Output_Validation_And_Retries.md` (Stage 3 of validation). It catches outputs that drift to "punching at the user" despite the system prompt's rules. On failure: silent regeneration, not a user-facing block.

---

## Combined Safety Posture

| Surface | Mechanism | User-facing experience on hit |
|---------|-----------|-------------------------------|
| Distress (input) | Phrase list + Haiku classifier | Warm modal with hotline; dismissible |
| Slurs (input) | Curated word list | Inline "let's try a different one" |
| Real-person (input) | Public-figure list + relationship regex | Inline "voice doesn't punch at people" |
| Tone (output) | Haiku classifier | Silent regeneration; user sees no block |

The asymmetry is intentional. Distress is the only refusal that earns ceremony, because the user might genuinely need the resource. Slur and real-person blocks are minimal and quick — they correct course without lecturing. Output tone failures are invisible.

---

## What This File Doesn't Do

- **Output content moderation beyond tone**. Sonnet is well-aligned. The system prompt is tight. Adding broader output moderation at v1 adds cost without adding meaningful value.
- **CSAM detection** or other illegal-content scanning. The input surface is 200 characters of text; the architecture has no image upload, no URL fetching, no cross-user content. The vector doesn't exist.
- **Country-specific legal compliance**. The footer's "comedy product, not therapy" line plus the distress flow is the floor. Region-specific compliance (UK Defamation Act, EU DSA) is out of scope at v1; revisit if traffic concentrates in a single high-regulation jurisdiction.

## Privacy of Safety Logs

All safety logs (`gen_distress`, `gen_block`) record only:

- The event name
- The reason (for blocks)
- A timestamp

They do **not** record:

- The user's prompt
- The hashed IP
- The country
- Any classifier confidence scores

This is non-negotiable. The product's safety posture rests on minimal retention. We cannot accidentally accumulate a corpus of crisis-state messages from users.

## Gaps & Assumptions

- **Distress phrase list authoring**: Not provided in the PRD. The developer should consult published clinical guidance (e.g., resources from suicide-prevention organizations on safe messaging) when authoring the seed list. ~30–50 high-precision phrases is the right size — recall comes from the Haiku classifier, not the list.
- **Public-figure list maintenance**: Author once at build (~100 names spanning current politicians, major celebrities, tech executives), revisit annually. List drift over time is acceptable; we're not trying to be exhaustive.
- **Hotline list verification**: Quarterly re-verification. Pair with the photo-rotation calendar to make it a single ops cadence.
- **What if the Haiku classifier itself fails (network error)?**: Fail open on the safety side — generate the poster anyway, log `event: 'distress_check_failed'`. Failing closed (block on classifier failure) creates a worse experience for the 99% of users who aren't in distress and would punish them for an upstream issue. The phrase list catches the highest-risk cases regardless.
- **False-positive rate on distress check**: Track via dismissals of the interstitial. If the rate is high (users dismissing and re-prompting in the same minute), the classifier prompt needs tuning toward the hyperbole exception.
- **Localization of distress copy**: V1 is English-only. The hotline name/number is country-localized; the surrounding copy is not. P3 future work.
