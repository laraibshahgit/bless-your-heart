import { z } from 'zod';
import type { GenerationOutput } from '@/types';
import { checkSynonymMap } from './synonyms';

// Hard caps on Sonnet output, mirrored on the wire format. Line 1 holds at 60
// chars and line 2 at 100 chars at LINE1_FONT_PX/LINE2_FONT_PX before the
// MIN_FIT_SCALE shrink budget would push the typography below 0.6 of base.
// Keep aligned with PRD/02_Voice_and_Format.md and src/lib/poster-layout.ts.
const LINE1_MAX_CHARS = 60;
const LINE2_MAX_CHARS = 100;

// Specificity / off-topic detection knobs.
// MIN_CONTENT_WORD_LENGTH = 2 means "filter out 1- and 2-letter tokens" (so
// "I", "to", "is" don't drag the overlap check). Three-letter words like
// "dad", "mom", "ex" remain eligible — those carry real situation signal.
const MIN_CONTENT_WORD_LENGTH = 2;

// LETTER_RATIO_OFFTOPIC_THRESHOLD: prompts where less than 30% of characters
// are A-Z letters are treated as gibberish/symbols and skip the specificity
// check (the Sonnet "off-topic" branch handles them with meta-absurdity copy).
// 0.3 was tuned by sampling: "asdf" = 1.0 letters, "lol :)" = 0.5, "$$$ 😭" = 0.0.
const LETTER_RATIO_OFFTOPIC_THRESHOLD = 0.3;

// Cap on stem-suffix-strip iterations. Three passes is enough to handle
// "running" -> "runn" -> "ru" -> stable, and bounds worst-case work per token.
const MAX_STEM_ITERATIONS = 3;

const GenerationSchema = z.object({
  line1: z.string().trim().min(1).max(LINE1_MAX_CHARS),
  line2: z.string().trim().min(1).max(LINE2_MAX_CHARS),
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
  for (let i = 0; i < MAX_STEM_ITERATIONS; i++) {
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
  const tokens = allTokens.filter((t) => !STOPWORDS.has(t) && t.length > MIN_CONTENT_WORD_LENGTH);
  if (tokens.length === 0) return true;
  const letterRatio = (prompt.replace(/[^a-zA-Z]/g, '').length) / Math.max(prompt.length, 1);
  if (letterRatio < LETTER_RATIO_OFFTOPIC_THRESHOLD) return true;
  return false;
}

export function checkSpecificity(prompt: string, line2: string): boolean {
  if (isOffTopic(prompt)) return true;

  const promptTokens = tokenize(prompt);
  const line2Tokens = tokenize(line2);
  const contentWords = promptTokens.filter((t) => !STOPWORDS.has(t) && t.length > MIN_CONTENT_WORD_LENGTH);

  if (contentWords.length === 0) return true;

  const directOverlap = contentWords.some(
    (w) => line2Tokens.includes(w) || line2Tokens.includes(stem(w)) ||
           line2Tokens.some((lt) => stem(lt) === stem(w))
  );

  if (directOverlap) return true;

  return checkSynonymMap(contentWords, line2Tokens);
}
