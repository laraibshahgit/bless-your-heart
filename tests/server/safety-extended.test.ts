import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/slur-list', () => ({
  slurList: ['retard', 'fag', 'camel jockey'],
}));

import {
  checkSlurFilter,
  checkRealPersonFilter,
  checkDistressPhraseList,
  checkDistressWithHaiku,
} from '@/server/safety';
import { ANTHROPIC_REQUEST_TIMEOUT_MS } from '@/server/anthropic';

describe('checkSlurFilter (extended)', () => {
  it('matches a slur as a whole word', () => {
    expect(checkSlurFilter('that retard over there')).toBe(true);
  });

  it('does not flag a slur substring inside an unrelated word', () => {
    // "retardant" / "faggotry" etc. — \b prevents substring matches
    expect(checkSlurFilter('this fire retardant blanket is heavy')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(checkSlurFilter('that RETARD over there')).toBe(true);
    expect(checkSlurFilter('that Retard over there')).toBe(true);
  });

  it('handles multi-word slurs', () => {
    expect(checkSlurFilter('called me a camel jockey')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(checkSlurFilter('')).toBe(false);
  });

  it('handles unicode and punctuation around slurs', () => {
    expect(checkSlurFilter('"retard"!')).toBe(true);
    expect(checkSlurFilter('that—retard—over there')).toBe(true);
  });
});

describe('checkRealPersonFilter (extended)', () => {
  it('detects all relationship words from the list', () => {
    const cases = [
      'my boss Linda is loud',
      'my sister Karen called',
      'my brother Mark',
      'my mom Susan',
      'my dad Robert',
      'my wife Sarah',
      'my husband John',
      'my partner Alex',
      'my ex Daniel',
      'my girlfriend Anna',
      'my boyfriend Mike',
      'my coworker Pat',
      'my teacher Smith',
      'my friend Lisa',
      'my neighbor Bob',
      'my landlord Tony',
      'my therapist Carol',
      'my roommate Sam',
    ];
    for (const c of cases) {
      expect(checkRealPersonFilter(c)).toBe(true);
    }
  });

  it('does not flag a relationship word when the next word is lowercase', () => {
    expect(checkRealPersonFilter('my boss linda is loud')).toBe(false);
  });

  it('does not flag relationship words alone (no following capitalized word)', () => {
    expect(checkRealPersonFilter('my boss')).toBe(false);
    expect(checkRealPersonFilter('my partner left')).toBe(false);
  });

  it('does not match unrelated possessives followed by a name', () => {
    // "my dog Rex" is not a relationship word in the list
    expect(checkRealPersonFilter('my dog Rex barks loudly')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(checkRealPersonFilter('')).toBe(false);
  });
});

describe('checkDistressPhraseList (extended)', () => {
  it('detects a distress phrase embedded in a longer sentence', () => {
    expect(checkDistressPhraseList('honestly i want to die today')).toBe(true);
  });

  it('handles mixed case', () => {
    expect(checkDistressPhraseList('I Want To Die today')).toBe(true);
  });

  it('returns false for hyperbolic complaints that are not on the phrase list', () => {
    expect(checkDistressPhraseList('this meeting is killing me')).toBe(false);
    expect(checkDistressPhraseList("I'm dying of boredom")).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(checkDistressPhraseList('')).toBe(false);
  });
});

describe('checkDistressWithHaiku', () => {
  function makeAnthropic(text: string | (() => never)) {
    return {
      messages: {
        create: vi.fn().mockImplementation(async () => {
          if (typeof text === 'function') return text();
          return { content: [{ type: 'text', text }] };
        }),
      },
    } as any;
  }

  it('returns true when verdict starts with "crisis"', async () => {
    const anthropic = makeAnthropic('crisis');
    expect(await checkDistressWithHaiku(anthropic, 'I want to end it')).toBe(true);
  });

  it('returns false when verdict starts with "ok"', async () => {
    const anthropic = makeAnthropic('ok');
    expect(await checkDistressWithHaiku(anthropic, 'rough day')).toBe(false);
  });

  it('is case-insensitive on the verdict', async () => {
    const anthropic = makeAnthropic('CRISIS');
    expect(await checkDistressWithHaiku(anthropic, 'x')).toBe(true);
  });

  it('trims whitespace before comparing verdict', async () => {
    const anthropic = makeAnthropic('  crisis \n');
    expect(await checkDistressWithHaiku(anthropic, 'x')).toBe(true);
  });

  it('returns false on SDK error (fails open — never block on a Haiku infra failure)', async () => {
    const anthropic = makeAnthropic(() => {
      throw new Error('haiku down');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = await checkDistressWithHaiku(anthropic, 'rough day');
      expect(result).toBe(false);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('returns false (defensive default) when content is not text', async () => {
    const anthropic = {
      messages: {
        create: vi
          .fn()
          .mockResolvedValue({ content: [{ type: 'tool_use' }] }),
      },
    } as any;
    expect(await checkDistressWithHaiku(anthropic, 'x')).toBe(false);
  });

  it('returns false (defensive default) when content array is empty', async () => {
    const anthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [] }),
      },
    } as any;
    expect(await checkDistressWithHaiku(anthropic, 'x')).toBe(false);
  });

  it('uses safety model env var when set', async () => {
    const original = process.env.ANTHROPIC_MODEL_SAFETY;
    process.env.ANTHROPIC_MODEL_SAFETY = 'claude-haiku-distress-test';
    try {
      const anthropic = makeAnthropic('ok');
      await checkDistressWithHaiku(anthropic, 'x');
      expect(anthropic.messages.create.mock.calls[0][0].model).toBe('claude-haiku-distress-test');
    } finally {
      if (original === undefined) delete process.env.ANTHROPIC_MODEL_SAFETY;
      else process.env.ANTHROPIC_MODEL_SAFETY = original;
    }
  });

  it('uses temperature 0 for deterministic safety classification', async () => {
    const anthropic = makeAnthropic('ok');
    await checkDistressWithHaiku(anthropic, 'x');
    expect(anthropic.messages.create.mock.calls[0][0].temperature).toBe(0);
  });

  // Per-request timeout contract — see anthropic.test.ts for rationale.
  // The distress check is the riskiest path to leave SDK-default-timeout: it
  // runs BEFORE generation, so a hung Haiku call would block every request
  // (incl. the safe ones) for the full 10-minute SDK default if not bounded.
  it('passes ANTHROPIC_REQUEST_TIMEOUT_MS as the per-request timeout', async () => {
    const anthropic = makeAnthropic('ok');
    await checkDistressWithHaiku(anthropic, 'x');
    const opts = anthropic.messages.create.mock.calls[0][1];
    expect(opts).toEqual({ timeout: ANTHROPIC_REQUEST_TIMEOUT_MS });
  });
});
