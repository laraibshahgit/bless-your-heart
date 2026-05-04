import Anthropic from '@anthropic-ai/sdk';
import { distressPhrases } from './distress-phrases';
import { slurList } from './slur-list';
import { SAFETY_MAX_TOKENS, SAFETY_TEMPERATURE, ANTHROPIC_REQUEST_TIMEOUT_MS, PROMPT_CACHE_CONTROL, getApiErrorStatus } from './anthropic';

// Precompile slur regexes once at module load. Without this, every request
// rebuilt the regex array on the hot path — O(n) RegExp constructor calls per
// request where n = slur list size. The list is static (imported from a frozen
// data module), so a single compilation at module-eval time is correct and
// cheaper. vi.mock('@/server/slur-list') hoists above this evaluation, so test
// suites that swap the list still get their replacement compiled here.
const SLUR_PATTERNS: RegExp[] = slurList.map(
  (slur) => new RegExp(`\\b${escapeRegex(slur)}\\b`, 'i'),
);

export function checkSlurFilter(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return SLUR_PATTERNS.some((pattern) => pattern.test(normalized));
}

const RELATIONSHIP_WORDS = [
  'boss', 'sister', 'brother', 'mom', 'dad', 'wife', 'husband',
  'partner', 'ex', 'girlfriend', 'boyfriend', 'coworker', 'teacher',
  'friend', 'neighbor', 'landlord', 'therapist', 'roommate',
];

const POSSESSIVE_NAME_PATTERN = new RegExp(
  `\\bmy\\s+(${RELATIONSHIP_WORDS.join('|')})\\s+([A-Z][a-z]+)`,
);

const PUBLIC_FIGURES: string[] = [];
const PUBLIC_FIGURE_PATTERNS: RegExp[] = PUBLIC_FIGURES.map(
  (name) => new RegExp(`\\b${escapeRegex(name)}\\b`, 'i'),
);

export function checkRealPersonFilter(prompt: string): boolean {
  if (POSSESSIVE_NAME_PATTERN.test(prompt)) return true;

  const normalized = prompt.toLowerCase();
  return PUBLIC_FIGURE_PATTERNS.some((pattern) => pattern.test(normalized));
}

// Pre-lowercase the distress phrase list once at module load so the per-request
// .some() callback is a pure substring test against a stable array instead of
// rebuilding lowercased strings on every check. ~30 phrases × every request
// adds up under load; this trims allocation cost on the hot safety path.
const DISTRESS_PHRASES_LOWER: string[] = distressPhrases.map((p) => p.toLowerCase());

export function checkDistressPhraseList(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return DISTRESS_PHRASES_LOWER.some((phrase) => normalized.includes(phrase));
}

const DISTRESS_CHECK_PROMPT = `You are evaluating a single short text input from a user of a comedy poster generator. The product helps people laugh at bad days. We need to know if the input shows signs that the person is in genuine crisis or expressing intent to harm themselves — in which case the product should NOT generate a poster and should instead show them a support resource.

Return EXACTLY one of:

- "crisis" — the input expresses a clear intent to harm oneself, active suicidal ideation, or an immediate, severe crisis. Err on the side of "crisis" if there is genuine ambiguity around safety.

- "ok" — the input is a normal bad-day situation, even if it uses dramatic, emphatic, or hyperbolic language ("I want to die from embarrassment", "this is killing me", "I'm dying", etc.). Hyperbole about everyday frustrations is not crisis.

Return only the single word. No explanation, no other text.`;

export async function checkDistressWithHaiku(
  anthropic: Anthropic,
  prompt: string
): Promise<boolean> {
  try {
    const response = await anthropic.messages.create(
      {
        model: process.env.ANTHROPIC_MODEL_SAFETY ?? 'claude-haiku-4-5',
        max_tokens: SAFETY_MAX_TOKENS,
        temperature: SAFETY_TEMPERATURE,
        // Same prompt-caching shape as anthropic.ts — see PROMPT_CACHE_CONTROL
        // comment there. Distress check fires only when the free phrase list
        // misses, so the warm-cache hit rate is moderate but the savings on
        // every Haiku call still amortize positively.
        system: [{ type: 'text', text: DISTRESS_CHECK_PROMPT, cache_control: PROMPT_CACHE_CONTROL }],
        messages: [{ role: 'user', content: prompt }],
      },
      { timeout: ANTHROPIC_REQUEST_TIMEOUT_MS }
    );

    // Same defensive index access as in checkTone — an empty content array
    // or a tool_use-only response should fall through to "ok" (the fail-open
    // verdict for the distress classifier).
    const first = response.content[0];
    const verdict = first && first.type === 'text'
      ? first.text.trim().toLowerCase()
      : 'ok';

    return verdict.startsWith('crisis');
  } catch (err) {
    // Same status-code-in-log shape as tone_check_failed and
    // gen_anthropic_error (audit run 33/001) — distinguish 401/429/5xx in
    // ops dashboards without losing the fail-open behavior that keeps the
    // distress classifier from blocking generation on infra failure.
    console.error(JSON.stringify({
      event: 'distress_check_failed',
      error: String(err),
      status: getApiErrorStatus(err),
    }));
    return false;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
