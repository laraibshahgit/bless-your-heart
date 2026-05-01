import { describe, it, expect } from 'vitest';
import { parseGenerationOutput, checkSpecificity } from '@/server/validation';

describe('parseGenerationOutput (extended)', () => {
  it('strips trailing markdown fences correctly', () => {
    const result = parseGenerationOutput('{"line1":"a","line2":"b is long enough now"}\n```');
    expect(result).toEqual({ line1: 'a', line2: 'b is long enough now' });
  });

  it('strips both opening (without "json") and trailing fences', () => {
    const result = parseGenerationOutput('```\n{"line1":"a","line2":"b is long enough now"}\n```');
    expect(result).toEqual({ line1: 'a', line2: 'b is long enough now' });
  });

  it('trims surrounding whitespace and newlines', () => {
    const result = parseGenerationOutput('\n  {"line1":"a","line2":"b is long enough now"}  \n');
    expect(result).toEqual({ line1: 'a', line2: 'b is long enough now' });
  });

  it('returns null when line1 is missing', () => {
    expect(parseGenerationOutput('{"line2":"b is long enough now"}')).toBeNull();
  });

  it('returns null when line2 is missing', () => {
    expect(parseGenerationOutput('{"line1":"a"}')).toBeNull();
  });

  it('returns null when line1 is empty after trim', () => {
    expect(parseGenerationOutput('{"line1":"   ","line2":"valid line"}')).toBeNull();
  });

  it('returns null when line2 is empty after trim', () => {
    expect(parseGenerationOutput('{"line1":"valid","line2":"   "}')).toBeNull();
  });

  it('returns null for non-string fields', () => {
    expect(parseGenerationOutput('{"line1":123,"line2":"valid"}')).toBeNull();
    expect(parseGenerationOutput('{"line1":"valid","line2":null}')).toBeNull();
  });

  it('accepts exactly 60-char line1 (boundary)', () => {
    const exactly60 = 'a'.repeat(60);
    const result = parseGenerationOutput(`{"line1":"${exactly60}","line2":"valid line"}`);
    expect(result?.line1.length).toBe(60);
  });

  it('rejects 61-char line1', () => {
    const tooLong = 'a'.repeat(61);
    expect(parseGenerationOutput(`{"line1":"${tooLong}","line2":"valid line"}`)).toBeNull();
  });

  it('accepts exactly 100-char line2 (boundary)', () => {
    const exactly100 = 'a'.repeat(100);
    const result = parseGenerationOutput(`{"line1":"a","line2":"${exactly100}"}`);
    expect(result?.line2.length).toBe(100);
  });

  it('rejects 101-char line2', () => {
    const tooLong = 'a'.repeat(101);
    expect(parseGenerationOutput(`{"line1":"a","line2":"${tooLong}"}`)).toBeNull();
  });

  it('returns null for empty string input', () => {
    expect(parseGenerationOutput('')).toBeNull();
  });

  it('returns null for nested object input', () => {
    expect(parseGenerationOutput('{"line1":{"a":1},"line2":"valid line"}')).toBeNull();
  });

  it('returns null for array input', () => {
    expect(parseGenerationOutput('["a","b is long enough"]')).toBeNull();
  });

  it('trims whitespace inside line1/line2 (zod .trim())', () => {
    const result = parseGenerationOutput('{"line1":"  hello  ","line2":"  goodbye is long enough  "}');
    expect(result?.line1).toBe('hello');
    expect(result?.line2).toBe('goodbye is long enough');
  });
});

describe('checkSpecificity (extended)', () => {
  it('detects overlap with stemming (plural to singular)', () => {
    expect(checkSpecificity('my emails', 'The email pile grows by hour.')).toBe(true);
  });

  it('detects overlap via direct token match', () => {
    expect(checkSpecificity('I tried meditation', 'Meditation is mostly waiting.')).toBe(true);
  });

  it('detects overlap with stemming ("families" to "family")', () => {
    // "ies" → "y" rewrite
    expect(checkSpecificity('the families gather', 'Family dinner is a contact sport.')).toBe(true);
  });

  it('matches the symmetric-stem path (line2 stem === prompt stem)', () => {
    // "deadlines" stems to "deadline" via "s" strip; line2 has "deadline"
    expect(checkSpecificity('the deadlines pile up', 'Deadline math never adds up right.')).toBe(true);
  });

  it('falls through to synonym map when no direct overlap', () => {
    expect(checkSpecificity('my anxiety today', 'The spiral starts at dawn.')).toBe(true);
  });

  it('returns false when neither direct overlap nor synonyms hit', () => {
    expect(checkSpecificity('my dental appointment', 'The clouds turn purple sometimes.')).toBe(false);
  });

  it('returns true for very short prompts (<=1 token)', () => {
    expect(checkSpecificity('!!!', 'unrelated output here')).toBe(true);
  });

  it('returns true for prompts that are mostly punctuation (low letter ratio)', () => {
    expect(checkSpecificity('@#$%! @#$%! ?', 'completely unrelated')).toBe(true);
  });

  it('returns true when all prompt tokens are stopwords', () => {
    expect(checkSpecificity('the and of', 'unrelated stuff here')).toBe(true);
  });

  it('returns true for question prompts even when content does not overlap', () => {
    expect(checkSpecificity('what is the meaning of life?', 'Totally unrelated.')).toBe(true);
  });

  it('handles prompts with apostrophes ("haven\'t started")', () => {
    expect(checkSpecificity("haven't started yet", 'The starting line moved again.')).toBe(true);
  });

  it('case-insensitive overlap check', () => {
    expect(checkSpecificity('MONDAY again', 'monday is heavy')).toBe(true);
  });

  // Mutation kill: ensures the isOffTopic length>2 boundary is exact (catches > 3 mutation)
  it('rejects when a 3-char content word in the prompt has no overlap with line2', () => {
    // "ate" is exactly 3 chars and NOT a stopword. With the boundary at >2, it counts as a real
    // content word and the off-topic guard does NOT fire. line2 has no overlap and "ate" has no
    // synonym map entry, so specificity should fail.
    expect(checkSpecificity('I ate', 'Random unrelated lemons sometimes.')).toBe(false);
  });

  // Mutation kill: ensures the contentWords stopword/length filter (line 79) is enforced —
  // a single 3-char content word with no overlap should reject.
  it('rejects when a 3-char content word ("gym") in prompt has no synonym/overlap with line2', () => {
    expect(checkSpecificity('the gym membership', 'Random unrelated stuff today.')).toBe(false);
  });

  // Mutation kill: locks the off-topic letterRatio threshold to exactly 0.3 (catches < 0.4 mutation)
  it('does NOT treat a prompt as off-topic when letter ratio is between 0.3 and 0.4', () => {
    // "hello 123456 78" → 5 letters / 14 chars ≈ 0.357 — above the 0.3 cutoff,
    // so off-topic guard does not fire. With no overlap or synonym, specificity must reject.
    expect(checkSpecificity('hello 123456 78', 'totally unrelated stuff today')).toBe(false);
  });

  // Mutation kill: confirms the off-topic guard still fires for very low letter ratios
  it('treats prompts with very low letter ratio as off-topic (free pass)', () => {
    // "ab 12345 67890 12345" → ~2 letters / 21 chars ≈ 0.1
    expect(checkSpecificity('ab 12345 67890 12345', 'totally unrelated')).toBe(true);
  });
});
