vi.mock('@/server/slur-list', () => ({
  slurList: ['retard', 'retarded', 'fag', 'faggot', 'camel jockey'],
}));

import { checkSlurFilter, checkRealPersonFilter } from '@/server/safety';

describe('checkSlurFilter', () => {
  it('returns true when input contains a slur as a whole word', () => {
    expect(checkSlurFilter('you are a retard')).toBe(true);
  });

  it('returns false for clean input', () => {
    expect(checkSlurFilter('my monday is terrible')).toBe(false);
  });

  it('returns false when a slur appears as a substring of another word', () => {
    // "fag" is in the mock list, but "fagin" should not trigger
    expect(checkSlurFilter('I read about fagin in class')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(checkSlurFilter('you are a RETARD')).toBe(true);
  });

  it('detects multi-word slurs', () => {
    expect(checkSlurFilter('he is a camel jockey')).toBe(true);
  });
});

describe('checkRealPersonFilter', () => {
  it('blocks known public figures', () => {
    const result = checkRealPersonFilter('I hate what trump did');
    expect(result.blocked).toBe(true);
  });

  it('returns a message when blocked', () => {
    const result = checkRealPersonFilter('my thoughts on musk');
    expect(result.blocked).toBe(true);
    expect(result.message).toBeTruthy();
    expect(result.message).toContain('situation');
  });

  it('blocks public figures case-insensitively', () => {
    const result = checkRealPersonFilter('Something about BEYONCE');
    expect(result.blocked).toBe(true);
  });

  it('passes clean input with no public figures', () => {
    const result = checkRealPersonFilter('my terrible monday morning');
    expect(result.blocked).toBe(false);
    expect(result.message).toBe('');
  });

  it('blocks possessive-relationship patterns with a capitalized name', () => {
    const result = checkRealPersonFilter('my sister Karen is driving me crazy');
    expect(result.blocked).toBe(true);
  });

  it('does not block relationship words without a capitalized name', () => {
    const result = checkRealPersonFilter('my sister is driving me crazy');
    expect(result.blocked).toBe(false);
  });
});
