import { z } from 'zod';
import type { GenerationOutput } from '@/types';
import { checkSynonymMap } from './synonyms';

const GenerationSchema = z.object({
  line1: z.string().trim().min(1).max(60),
  line2: z.string().trim().min(1).max(100),
}).strict();

export function parseGenerationOutput(raw: string): GenerationOutput | null {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const result = GenerationSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}

const STOPWORDS = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
  'the', 'a', 'an', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither',
  'that', 'which', 'who', 'whom', 'this', 'these', 'those', 'what', 'when',
  'where', 'how', 'all', 'each', 'every', 'no', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'than', 'too', 'very', 'just', 'about', 'again',
  'also', 'back', 'even', 'still', 'then', 'there', 'here', 'now', 'up',
  'going', 'really', 'much', 'one', 'two', 'get', 'got', 'like', 'know',
  'think', 'make', 'go', 'see', 'come', 'take', 'want', 'look', 'give',
  'been', "don't", "can't", "won't", "didn't", "isn't", "it's", "i'm",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s'-]/g, '').split(/\s+/).filter(Boolean);
}

function stem(word: string): string {
  let prev = word;
  for (let i = 0; i < 3; i++) {
    const next = prev
      .replace(/ies$/, 'y')
      .replace(/ing$/, '')
      .replace(/ed$/, '')
      .replace(/ly$/, '')
      .replace(/s$/, '');
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

function isOffTopic(prompt: string): boolean {
  if (prompt.includes('?')) return true;
  const allTokens = tokenize(prompt);
  if (allTokens.length <= 1) return true;
  const tokens = allTokens.filter((t) => !STOPWORDS.has(t) && t.length > 2);
  if (tokens.length === 0) return true;
  const letterRatio = (prompt.replace(/[^a-zA-Z]/g, '').length) / Math.max(prompt.length, 1);
  if (letterRatio < 0.3) return true;
  return false;
}

export function checkSpecificity(prompt: string, line2: string): boolean {
  if (isOffTopic(prompt)) return true;

  const promptTokens = tokenize(prompt);
  const line2Tokens = tokenize(line2);
  const contentWords = promptTokens.filter((t) => !STOPWORDS.has(t) && t.length > 2);

  if (contentWords.length === 0) return true;

  const directOverlap = contentWords.some(
    (w) => line2Tokens.includes(w) || line2Tokens.includes(stem(w)) ||
           line2Tokens.some((lt) => stem(lt) === stem(w))
  );

  if (directOverlap) return true;

  return checkSynonymMap(contentWords, line2Tokens);
}
