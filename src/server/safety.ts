import Anthropic from '@anthropic-ai/sdk';
import { distressPhrases } from './distress-phrases';
import { slurList } from './slur-list';

const DISTRESS_CHECK_PROMPT = `You are evaluating a single short text input from a user of a comedy poster generator. The product helps people laugh at bad days. We need to know if the input shows signs that the person is in genuine crisis or expressing intent to harm themselves — in which case the product should NOT generate a poster and should instead show them a support resource.

Return EXACTLY one of:

- "crisis" — the input expresses a clear intent to harm oneself, active suicidal ideation, or an immediate, severe crisis. Err on the side of "crisis" if there is genuine ambiguity around safety.

- "ok" — the input is a normal bad-day situation, even if it uses dramatic, emphatic, or hyperbolic language ("I want to die from embarrassment", "this is killing me", "I'm dying", etc.). Hyperbole about everyday frustrations is not crisis.

Return only the single word. No explanation, no other text.`;

const PUBLIC_FIGURES = [
  'trump', 'biden', 'obama', 'clinton', 'bush',
  'musk', 'bezos', 'zuckerberg', 'gates',
  'swift', 'beyonce', 'kardashian', 'jenner',
  'rogan', 'oprah', 'ellen',
  'putin', 'xi jinping', 'modi',
  'the queen', 'the king', 'prince harry',
];

const RELATIONSHIP_NAME_REGEX = /\bmy\s+(boss|sister|brother|mom|dad|mother|father|wife|husband|partner|ex|girlfriend|boyfriend|coworker|teacher|friend|neighbor|landlord|therapist|roommate)\s+([A-Z][a-z]+)/;

export function checkSlurFilter(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return slurList.some((slur) => {
    const regex = new RegExp(`\\b${slur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(normalized);
  });
}

export function checkRealPersonFilter(prompt: string): { blocked: boolean; message: string } {
  const lower = prompt.toLowerCase();

  for (const name of PUBLIC_FIGURES) {
    const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) {
      return { blocked: true, message: "The voice doesn't punch at people. Try a situation instead." };
    }
  }

  if (RELATIONSHIP_NAME_REGEX.test(prompt)) {
    return { blocked: true, message: "The voice doesn't punch at people. Try a situation instead." };
  }

  return { blocked: false, message: '' };
}

export async function checkDistress(
  prompt: string,
  client: Anthropic,
  safetyModel: string
): Promise<boolean> {
  const normalized = prompt.toLowerCase();
  const phraseHit = distressPhrases.some((phrase) => normalized.includes(phrase));
  if (phraseHit) return true;

  try {
    const response = await client.messages.create({
      model: safetyModel,
      max_tokens: 10,
      temperature: 0,
      system: DISTRESS_CHECK_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const verdict = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
      .toLowerCase();

    return verdict.startsWith('crisis');
  } catch (err) {
    console.error('Distress check failed, treating as safe:', err);
    return false;
  }
}
