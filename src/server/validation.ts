import { z } from 'zod';
import { checkSynonymMap } from './synonyms';
import { checkTone } from './anthropic';
import type { GenerationOutput } from '@/types';

const GenerationSchema = z.object({
  line1: z.string().trim().min(1).max(60),
  line2: z.string().trim().min(1).max(100),
}).strict();

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'of', 'for',
  'and', 'or', 'but', 'not', 'no', 'my', 'me', 'i', 'am', 'was',
  'has', 'had', 'have', 'been', 'be', 'do', 'does', 'did', 'will',
  'just', 'so', 'up', 'out', 'all', 'its', 'this', 'that', 'with',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function stem(word: string): string {
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

function isOffTopic(prompt: string): boolean {
  if (prompt.includes('?')) return true;
  const tokens = tokenize(prompt);
  if (tokens.length === 1) return true;
  const letterRatio = (prompt.replace(/[^a-zA-Z]/g, '').length) / Math.max(prompt.length, 1);
  if (letterRatio < 0.3) return true;
  return false;
}

function checkSpecificity(prompt: string, line2: string): boolean {
  if (isOffTopic(prompt)) return true;

  const promptTokens = tokenize(prompt);
  const line2Tokens = tokenize(line2);
  const contentWords = promptTokens.filter((t) => !STOPWORDS.has(t) && t.length > 2);

  if (contentWords.length === 0) return true;

  const directOverlap = contentWords.some(
    (w) => line2Tokens.includes(w) || line2Tokens.includes(stem(w))
  );
  if (directOverlap) return true;

  if (checkSynonymMap(contentWords, line2Tokens)) return true;

  return false;
}

export function validateFormat(output: unknown): { valid: true; data: GenerationOutput } | { valid: false; reason: string } {
  const result = GenerationSchema.safeParse(output);
  if (!result.success) {
    return { valid: false, reason: 'format' };
  }
  return { valid: true, data: result.data };
}

export async function validateGeneration(
  output: GenerationOutput,
  prompt: string,
): Promise<{ valid: boolean; reason?: string }> {
  if (!checkSpecificity(prompt, output.line2)) {
    return { valid: false, reason: 'specificity' };
  }

  const toneOk = await checkTone(prompt, output.line2);
  if (!toneOk) {
    return { valid: false, reason: 'tone' };
  }

  return { valid: true };
}
