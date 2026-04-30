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

  it('returns null when line1 exceeds 60 chars', () => {
    const long = 'a'.repeat(61);
    expect(parseGenerationOutput(`{"line1":"${long}","line2":"short enough for line two easily"}`)).toBeNull();
  });

  it('returns null when line2 exceeds 100 chars', () => {
    const long = 'a'.repeat(101);
    expect(parseGenerationOutput(`{"line1":"short","line2":"${long}"}`)).toBeNull();
  });

  it('returns null for extra fields', () => {
    expect(parseGenerationOutput('{"line1":"a","line2":"b is long enough now","extra":"field"}')).toBeNull();
  });
});

describe('checkSpecificity', () => {
  it('passes when prompt words appear in line2', () => {
    expect(checkSpecificity("haven't started yet", 'The starting line moved again.')).toBe(true);
  });

  it('fails when line2 is completely generic', () => {
    expect(checkSpecificity("haven't started yet", 'Life is hard and then you die.')).toBe(false);
  });

  it('gives free pass to single-word prompts', () => {
    expect(checkSpecificity('work', 'Life is hard and then you die.')).toBe(true);
  });

  it('passes via synonym map', () => {
    expect(checkSpecificity('Monday again', 'The week loops without consent.')).toBe(true);
  });

  it('bypasses for question-mark prompts', () => {
    expect(checkSpecificity('what is love?', 'Totally unrelated output here.')).toBe(true);
  });
});
