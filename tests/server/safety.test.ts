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
  // 'detects possessive + name pattern' is covered (with all 18 relationship words)
  // by 'detects all relationship words from the list' in safety-extended.test.ts.

  it('returns false for generic input', () => {
    expect(checkRealPersonFilter('my boss is terrible')).toBe(false);
  });

  it('allows relationship words without names', () => {
    expect(checkRealPersonFilter('my sister drives me crazy')).toBe(false);
  });
});

describe('checkDistressPhraseList', () => {
  // 'detects crisis phrases' and 'is case-insensitive' are both covered by
  // 'detects a distress phrase embedded in a longer sentence' and 'handles mixed case'
  // in safety-extended.test.ts.

  it('returns false for casual input', () => {
    expect(checkDistressPhraseList('everything is fine')).toBe(false);
  });
});
