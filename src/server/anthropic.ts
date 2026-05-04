import Anthropic from '@anthropic-ai/sdk';

// Generation request budget. 200 tokens comfortably covers two lines under the
// 60/100 char caps with JSON wrapper overhead — line1 + line2 + braces is ~50
// tokens worst case, leaving headroom for retries to vary phrasing without
// truncation. Temperature 0.9 keeps generations creative across regenerates;
// the joke depends on phrase variety from one regenerate to the next.
const GENERATION_MAX_TOKENS = 200;
const GENERATION_TEMPERATURE = 0.9;

// Safety classifier budget. Both tone-check and distress-check return EXACTLY
// one word ("safe"|"user", "crisis"|"ok") — 10 tokens leaves slack for any
// model that prefixes whitespace or quotes without truncating the verdict.
// Temperature 0 makes the classifier deterministic for the same input, which
// is correct for a binary classifier (we don't want regenerates flipping the
// verdict on identical text). Exported because safety.ts uses the same budget
// for the distress classifier.
export const SAFETY_MAX_TOKENS = 10;
export const SAFETY_TEMPERATURE = 0;

// Per-request timeout for every Anthropic SDK call (generation + safety).
// The SDK default is 10 minutes, which is dangerous in a serverless context:
// a hung provider would tie up the lambda until Netlify kills it (10s default,
// 26s max on the free tier), wasting the entire budget on one stuck request.
// 12 seconds gives the retry loop ~2 attempts inside a 26s lambda budget
// (worst case: 12s gen + 10s tone-check + 4s margin) while failing fast under
// provider degradation. Exported so safety.ts uses the same value — single
// source of truth for the request-level cap.
export const ANTHROPIC_REQUEST_TIMEOUT_MS = 12_000;

// Duck-type check for an Anthropic SDK APIError-shaped exception. Used to
// extract the HTTP status from a thrown error so structured logs include the
// status code (401 vs 429 vs 5xx vs network-level) for incident diagnosis. We
// don't `instanceof Anthropic.APIError` because the integration tests mock the
// SDK module wholesale (see tests/server/generate-integration.test.ts) and the
// mocked module doesn't preserve the APIError class — duck typing is robust
// against the test harness without coupling to it. APIConnectionError /
// APIConnectionTimeoutError have no status, so this returns undefined for
// network-level failures. Audit run 33/001.
export function getApiErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

// Prompt caching marker. Anthropic supports caching large, stable prompt
// prefixes — subsequent requests that reuse the same prefix pay ~10% of the
// uncached input rate (Sonnet) or ~10% (Haiku) for the cached portion. The
// generation system prompt is ~1300 tokens, the tone-check prompt ~140, and
// the distress-check prompt ~250 — all reused on every request. Marking them
// with `cache_control: { type: 'ephemeral' }` (5-minute TTL) cuts ~70–85% of
// recurring input cost across the entire pipeline at zero behavioral change.
// First request after a cold cache pays a 1.25× write surcharge on the cached
// segment, but breaks even after the second hit and is net-positive at scale.
// Exported so safety.ts uses the same constant (one place to flip if Anthropic
// pricing or TTL options change).
export const PROMPT_CACHE_CONTROL = { type: 'ephemeral' as const };

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const VOICE_SYSTEM_PROMPT = `You are the voice behind Bless Your Heart, a poster generator that produces two-line anti-affirmations. Your output runs on a scenic landscape photo styled like a Pinterest wellness poster.

OUTPUT CONTRACT
You produce exactly two lines:

LINE 1: Sincere, reverent, wellness-influencer voice. The kind of line that could appear unironically on a real motivational poster. Sets up the visual fiction. 30–50 characters. Hard maximum 60.

LINE 2: A savagely honest pivot that lands the joke by referencing the specific situation the user described. Dry, deadpan, true. 50–88 characters. Hard maximum 100.

VOICE RULES (non-negotiable)

1. Line 2 points at the SITUATION, the universal human pattern, or the ABSURDITY of the moment. Never at the user as a person — not their worth, intelligence, appearance, choices, body, or anything they cannot change.

2. The voice is "a friend who has given up pretending to be encouraging." Not mean. Not therapeutic. Not coaching. Loving in a resigned way.

3. Specificity is the whole game. If the user mentions "third coffee," line 2 must reference caffeine or mornings or escalation. If they mention "my sister's wedding," line 2 must touch weddings, family events, or that dynamic. Generic disappointment ("life is hard") fails the brief.

4. No exclamation points. No emojis. No "lol" or "haha." No moralizing ("you should," "try to," "remember"). No naming real people or brands. No politics.

5. Line 1 stays sincere. It does not wink. The trap only snaps shut on line 2.

OFF-TOPIC INPUTS

If the user types something that isn't a feeling or bad-day situation — a factual question ("capital of France"), an explainer request ("explain quantum physics"), gibberish ("asdf"), a single greeting ("hello") — DO NOT refuse. The format never breaks. Line 1 stays reverent on whatever theme the input suggests; line 2 pivots onto the meta-absurdity of having typed that into this app.

Examples:
- "capital of France"
  Line 1: The world contains many beautiful cities.
  Line 2: Paris isn't taking your call right now either.
- "asdf"
  Line 1: Some moments arrive without language.
  Line 2: Even the keyboard has given up.
- "explain quantum physics"
  Line 1: The universe holds mysteries beyond our grasp.
  Line 2: Superposition will not help with the laundry.

OUTPUT FORMAT

Return ONLY a JSON object. No prose, no preamble, no code fences.

{
  "line1": "...",
  "line2": "..."
}

Do not include any other fields. Do not explain your reasoning. Do not apologize. Do not warn about content. Just the object.`;

export async function generateLines(
  anthropic: Anthropic,
  prompt: string
): Promise<string> {
  const response = await anthropic.messages.create(
    {
      model: process.env.ANTHROPIC_MODEL_GEN ?? 'claude-sonnet-4-6',
      max_tokens: GENERATION_MAX_TOKENS,
      temperature: GENERATION_TEMPERATURE,
      // System prompt is sent as a content-block array (instead of a bare
      // string) so the cache_control marker can attach to the static voice
      // prefix. The prompt text itself is unchanged — this is a wire-format
      // tweak that Anthropic uses to identify the cacheable prefix.
      system: [{ type: 'text', text: VOICE_SYSTEM_PROMPT, cache_control: PROMPT_CACHE_CONTROL }],
      messages: [{ role: 'user', content: prompt }],
    },
    { timeout: ANTHROPIC_REQUEST_TIMEOUT_MS }
  );

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

const TONE_CHECK_PROMPT = `You evaluate whether a line of text punches at the person who asked, or punches at the situation/universal pattern/absurdity.

The line is part of a comedy product where the joke is supposed to land on the SITUATION the user described, not on the user themselves.

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

Return EXACTLY one word: "safe" or "user". Nothing else.`;

export async function checkTone(
  anthropic: Anthropic,
  prompt: string,
  line2: string
): Promise<boolean> {
  if (process.env.ENABLE_TONE_CHECK === 'false') return true;

  try {
    const response = await anthropic.messages.create(
      {
        model: process.env.ANTHROPIC_MODEL_SAFETY ?? 'claude-haiku-4-5',
        max_tokens: SAFETY_MAX_TOKENS,
        temperature: SAFETY_TEMPERATURE,
        system: [{ type: 'text', text: TONE_CHECK_PROMPT, cache_control: PROMPT_CACHE_CONTROL }],
        messages: [{
          role: 'user',
          content: `User input: "${prompt}"\nGenerated line 2: "${line2}"`,
        }],
      },
      { timeout: ANTHROPIC_REQUEST_TIMEOUT_MS }
    );

    // Anthropic responses normally have at least one content block, but the
    // SDK types `content` as a possibly-empty array. Guard the index access
    // so an empty array (or a tool_use-only response) treats the tone-check
    // as safe — same fail-open intent as the catch block below.
    const first = response.content[0];
    const verdict = first && first.type === 'text'
      ? first.text.trim().toLowerCase()
      : 'safe';

    return verdict.startsWith('safe');
  } catch (err) {
    // Surface the HTTP status (when available) alongside the error string so
    // ops can distinguish "auth failure / misconfigured key" (401) from
    // "transient provider 5xx" from "client-side timeout" without re-running
    // a curl against the API. Same shape applied to gen_anthropic_error and
    // distress_check_failed for grep parity. Audit run 33/001.
    console.error(JSON.stringify({
      event: 'tone_check_failed',
      error: String(err),
      status: getApiErrorStatus(err),
    }));
    return true;
  }
}
