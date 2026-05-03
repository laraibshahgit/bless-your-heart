import Anthropic from '@anthropic-ai/sdk';
import { distressPhrases } from './distress-phrases';
import { slurList } from './slur-list';

export function checkSlurFilter(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return slurList.some((slur) => {
    const pattern = new RegExp(`\\b${escapeRegex(slur)}\\b`, 'i');
    return pattern.test(normalized);
  });
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

export function checkRealPersonFilter(prompt: string): boolean {
  if (POSSESSIVE_NAME_PATTERN.test(prompt)) return true;

  const normalized = prompt.toLowerCase();
  return PUBLIC_FIGURES.some((name) => {
    const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
    return pattern.test(normalized);
  });
}

export function checkDistressPhraseList(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return distressPhrases.some((phrase) => normalized.includes(phrase.toLowerCase()));
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
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL_SAFETY ?? 'claude-haiku-4-5',
      max_tokens: 10,
      temperature: 0,
      system: DISTRESS_CHECK_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const verdict = response.content[0].type === 'text'
      ? response.content[0].text.trim().toLowerCase()
      : 'ok';

    return verdict.startsWith('crisis');
  } catch (err) {
    console.error(JSON.stringify({ event: 'distress_check_failed', error: String(err) }));
    return false;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
