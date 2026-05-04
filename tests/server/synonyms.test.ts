import { describe, it, expect } from 'vitest';
import { checkSynonymMap } from '@/server/synonyms';

describe('checkSynonymMap', () => {
  it('returns true when a content word maps to a token in line2', () => {
    expect(checkSynonymMap(['monday'], ['the', 'week', 'loops'])).toBe(true);
  });

  it('returns false when no content word matches anything', () => {
    expect(checkSynonymMap(['monday'], ['rabbit', 'fence'])).toBe(false);
  });

  it('returns false when content word has no synonym entry', () => {
    expect(checkSynonymMap(['quokka'], ['anything', 'here'])).toBe(false);
  });

  it('matches if any of multiple content words connects', () => {
    expect(checkSynonymMap(['quokka', 'coffee'], ['my', 'mug', 'is', 'cold'])).toBe(true);
  });

  it('returns false for empty content words array', () => {
    expect(checkSynonymMap([], ['anything'])).toBe(false);
  });

  it('returns false when line2 tokens are empty', () => {
    expect(checkSynonymMap(['monday'], [])).toBe(false);
  });

  it('matches "work" to job-related tokens', () => {
    expect(checkSynonymMap(['work'], ['the', 'meeting', 'never', 'ends'])).toBe(true);
    expect(checkSynonymMap(['work'], ['my', 'boss', 'again'])).toBe(true);
    expect(checkSynonymMap(['work'], ['email', 'inbox'])).toBe(true);
  });

  it('matches "anxiety" to emotional vocabulary', () => {
    expect(checkSynonymMap(['anxiety'], ['the', 'spiral', 'continues'])).toBe(true);
    expect(checkSynonymMap(['anxiety'], ['nervous', 'energy'])).toBe(true);
  });

  it('matches "money" to financial vocabulary', () => {
    expect(checkSynonymMap(['money'], ['rent', 'is', 'late'])).toBe(true);
    expect(checkSynonymMap(['money'], ['the', 'paycheck', 'evaporates'])).toBe(true);
  });

  it('matches "family" to relatives vocabulary', () => {
    expect(checkSynonymMap(['family'], ['the', 'holidays', 'arrive'])).toBe(true);
  });

  it('handles "ex" with romance synonyms', () => {
    expect(checkSynonymMap(['ex'], ['the', 'past', 'lingers'])).toBe(true);
  });

  it('treats unknown synonym lookups silently (continues to next word)', () => {
    // The first word has no entry, the second does
    expect(checkSynonymMap(['xyz', 'sleep'], ['my', 'bed', 'beckons'])).toBe(true);
  });
});
