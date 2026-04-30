import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/slur-list', () => ({
  slurList: ['retard', 'retarded', 'fag', 'faggot', 'camel jockey'],
}));

import { checkSlurFilter, checkRealPersonFilter, checkDistressPhraseList } from '@/server/safety';

describe('checkSlurFilter', () => {
  it('returns false for clean input', () => {
    expect(checkSlurFilter('Monday again')).toBe(false);
  });

  it('allows common profanity', () => {
    expect(checkSlurFilter('this fucking Monday')).toBe(false);
  });
});

describe('checkRealPersonFilter', () => {
  it('returns false for generic input', () => {
    expect(checkRealPersonFilter('my boss is terrible')).toBe(false);
  });

  it('detects possessive + name pattern', () => {
    expect(checkRealPersonFilter('my boss Linda is terrible')).toBe(true);
  });

  it('allows relationship words without names', () => {
    expect(checkRealPersonFilter('my sister drives me crazy')).toBe(false);
  });
});

describe('checkDistressPhraseList', () => {
  it('returns false for casual input', () => {
    expect(checkDistressPhraseList('everything is fine')).toBe(false);
  });

  it('detects crisis phrases', () => {
    expect(checkDistressPhraseList('I want to end it all')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(checkDistressPhraseList('I WANT TO END IT ALL')).toBe(true);
  });
});
