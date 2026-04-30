vi.mock('@/server/anthropic', () => ({
  checkTone: vi.fn().mockResolvedValue(true),
  getAnthropicClient: vi.fn(),
  generatePoster: vi.fn(),
}));

import { validateFormat, validateGeneration } from '@/server/validation';

describe('validateFormat', () => {
  it('accepts a valid two-line object', () => {
    const result = validateFormat({ line1: 'The sun rises again.', line2: 'Your alarm does not care about your feelings.' });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.line1).toBe('The sun rises again.');
      expect(result.data.line2).toBe('Your alarm does not care about your feelings.');
    }
  });

  it('rejects when line1 is missing', () => {
    const result = validateFormat({ line2: 'Just line two here.' });
    expect(result.valid).toBe(false);
  });

  it('rejects when line2 is missing', () => {
    const result = validateFormat({ line1: 'Just line one here.' });
    expect(result.valid).toBe(false);
  });

  it('rejects when line1 exceeds 60 characters', () => {
    const result = validateFormat({
      line1: 'A'.repeat(61),
      line2: 'Short line two.',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects when line2 exceeds 100 characters', () => {
    const result = validateFormat({
      line1: 'Short line one.',
      line2: 'B'.repeat(101),
    });
    expect(result.valid).toBe(false);
  });

  it('rejects extra fields due to strict mode', () => {
    const result = validateFormat({
      line1: 'Valid line one.',
      line2: 'Valid line two.',
      line3: 'This should not be here.',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects empty line1', () => {
    const result = validateFormat({ line1: '', line2: 'Valid line two.' });
    expect(result.valid).toBe(false);
  });

  it('rejects empty line2', () => {
    const result = validateFormat({ line1: 'Valid line one.', line2: '' });
    expect(result.valid).toBe(false);
  });
});

describe('validateGeneration', () => {
  it('passes when prompt words appear in line2', async () => {
    const result = await validateGeneration(
      { line1: 'Every day is a gift.', line2: 'Your coffee has been judging you since dawn.' },
      'my third coffee this morning',
    );
    expect(result.valid).toBe(true);
  });

  it('fails specificity when line2 is completely unrelated to prompt', async () => {
    const result = await validateGeneration(
      { line1: 'The light will find you.', line2: 'The ocean does not negotiate with the tide.' },
      'my coworker microwaved fish in the office',
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('specificity');
  });
});
