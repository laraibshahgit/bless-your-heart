import { describe, it, expect } from 'vitest';
import { getHotlineForCountry } from '@/server/hotlines';

describe('getHotlineForCountry', () => {
  it('returns US 988 for "US"', () => {
    const h = getHotlineForCountry('US');
    expect(h.countryCode).toBe('US');
    expect(h.phone).toBe('988');
    expect(h.name).toMatch(/988|Lifeline/);
  });

  it('returns Samaritans for "GB"', () => {
    const h = getHotlineForCountry('GB');
    expect(h.countryCode).toBe('GB');
    expect(h.phone).toBe('116 123');
  });

  it('uppercases input — "us" matches "US"', () => {
    expect(getHotlineForCountry('us').countryCode).toBe('US');
    expect(getHotlineForCountry('gb').countryCode).toBe('GB');
  });

  it('returns the international fallback for unknown country codes', () => {
    const h = getHotlineForCountry('ZZ');
    expect(h.countryCode).toBe('INTL');
    expect(h.url).toBeTruthy();
  });

  it('returns the international fallback for empty string', () => {
    const h = getHotlineForCountry('');
    expect(h.countryCode).toBe('INTL');
  });

  it('returns the international fallback for whitespace-only input', () => {
    // toUpperCase() does not trim, so whitespace will not match a key
    const h = getHotlineForCountry('   ');
    expect(h.countryCode).toBe('INTL');
  });

  it('every supported country has a non-empty phone number', () => {
    for (const code of ['US', 'GB', 'CA', 'AU', 'IE', 'NZ', 'IN', 'DE', 'FR']) {
      const h = getHotlineForCountry(code);
      expect(h.phone, `${code} phone is empty`).toBeTruthy();
      expect(h.name, `${code} name is empty`).toBeTruthy();
    }
  });

  it('international fallback offers a URL even without a phone', () => {
    const h = getHotlineForCountry('XX');
    expect(h.url).toBeTruthy();
    // The fallback intentionally has no phone — the URL is the path forward
    expect(typeof h.phone).toBe('string');
  });
});
