import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/cn';

describe('cn', () => {
  it('joins multiple class strings', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', null, undefined, false, '', 'b')).toBe('a b');
  });

  it('flattens nested arrays', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });

  it('applies tailwind-merge — later utility wins', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('preserves non-conflicting tailwind utilities', () => {
    const result = cn('px-2', 'py-4', 'text-sm');
    expect(result).toContain('px-2');
    expect(result).toContain('py-4');
    expect(result).toContain('text-sm');
  });

  it('supports object syntax (clsx)', () => {
    expect(cn({ a: true, b: false, c: true })).toBe('a c');
  });

  it('returns empty string for no input', () => {
    expect(cn()).toBe('');
  });

  it('handles all-falsy input', () => {
    expect(cn(null, undefined, false)).toBe('');
  });
});
