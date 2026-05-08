import { describe, it, expect } from 'vitest';
import { getCuratedOutput, matchesCuratedTrigger } from '@/server/curated-outputs';

describe('matchesCuratedTrigger', () => {
  it('returns true for known triggers (case-insensitive)', () => {
    expect(matchesCuratedTrigger('Monday again')).toBe(true);
    expect(matchesCuratedTrigger('MONDAY AGAIN')).toBe(true);
    expect(matchesCuratedTrigger('just got dumped')).toBe(true);
    expect(matchesCuratedTrigger('feeling good')).toBe(true);
  });

  it('returns false for unknown prompts', () => {
    expect(matchesCuratedTrigger('random text')).toBe(false);
    expect(matchesCuratedTrigger('tell me a joke')).toBe(false);
    expect(matchesCuratedTrigger('')).toBe(false);
  });

  it('trims whitespace before matching', () => {
    expect(matchesCuratedTrigger('  Monday again  ')).toBe(true);
  });
});

describe('getCuratedOutput', () => {
  it('returns a pair with index for a matching trigger', () => {
    const result = getCuratedOutput('Monday again');
    expect(result).not.toBeNull();
    expect(result!.line1).toBeTruthy();
    expect(result!.line2).toBeTruthy();
    expect(result!.index).toBeGreaterThanOrEqual(0);
    expect(result!.index).toBeLessThanOrEqual(3);
  });

  it('returns null for unrecognized prompts', () => {
    expect(getCuratedOutput('random gibberish')).toBeNull();
  });

  it('excludes specified indices', () => {
    const result = getCuratedOutput('Monday again', [0, 1, 2]);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(3);
  });

  it('returns null when all indices are excluded (pool exhausted)', () => {
    expect(getCuratedOutput('Monday again', [0, 1, 2, 3])).toBeNull();
  });

  it('is case-insensitive on the prompt', () => {
    const result = getCuratedOutput('MONDAY AGAIN');
    expect(result).not.toBeNull();
  });
});
