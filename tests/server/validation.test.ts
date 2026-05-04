import { describe, it, expect } from 'vitest';
import { parseGenerationOutput, checkSpecificity } from '@/server/validation';

describe('parseGenerationOutput', () => {
  it('parses valid JSON output', () => {
    const result = parseGenerationOutput('{"line1":"Hello world","line2":"Goodbye cruel world and everything in it"}');
    expect(result).toEqual({ line1: 'Hello world', line2: 'Goodbye cruel world and everything in it' });
  });

  it('strips markdown code fences', () => {
    const result = parseGenerationOutput('```json\n{"line1":"A","line2":"B is longer than you think it would be"}\n```');
    expect(result).toEqual({ line1: 'A', line2: 'B is longer than you think it would be' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseGenerationOutput('not json')).toBeNull();
  });

  // Length-cap rejection (line1 > 60, line2 > 100) is exhaustively covered with
  // boundary tests (60, 61, 100, 101) in validation-extended.test.ts.

  it('returns null for extra fields', () => {
    expect(parseGenerationOutput('{"line1":"a","line2":"b is long enough now","extra":"field"}')).toBeNull();
  });
});

describe('checkSpecificity', () => {
  // The "haven't started" overlap and the question-mark bypass are covered as
  // 'handles prompts with apostrophes' and 'returns true for question prompts...'
  // in validation-extended.test.ts.

  it('fails when line2 is completely generic', () => {
    expect(checkSpecificity("haven't started yet", 'Life is hard and then you die.')).toBe(false);
  });

  it('gives free pass to single-word prompts', () => {
    expect(checkSpecificity('work', 'Life is hard and then you die.')).toBe(true);
  });

  it('passes via synonym map', () => {
    expect(checkSpecificity('Monday again', 'The week loops without consent.')).toBe(true);
  });
});
