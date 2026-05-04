import { describe, it, expect } from 'vitest';
import { presets } from '@/content/presets';
import { placeholders } from '@/content/placeholders';
import { loadingPhrases, errorCopy, downloadConfirmation } from '@/content/copy';

describe('presets', () => {
  it('is non-empty', () => {
    expect(presets.length).toBeGreaterThan(0);
  });

  it('every preset is a non-empty trimmed string', () => {
    for (const p of presets) {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
      expect(p).toBe(p.trim());
    }
  });

  it('all presets are unique', () => {
    expect(new Set(presets).size).toBe(presets.length);
  });

  it('every preset is short enough to fit a chip (≤30 chars)', () => {
    for (const p of presets) {
      expect(p.length, `preset "${p}" too long for a chip`).toBeLessThanOrEqual(30);
    }
  });
});

describe('placeholders', () => {
  it('is non-empty', () => {
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it('every placeholder is a non-empty trimmed string', () => {
    for (const p of placeholders) {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
      expect(p).toBe(p.trim());
    }
  });

  it('all placeholders are unique', () => {
    expect(new Set(placeholders).size).toBe(placeholders.length);
  });
});

describe('loadingPhrases', () => {
  it('is non-empty', () => {
    expect(loadingPhrases.length).toBeGreaterThan(0);
  });

  it('every phrase ends with a period (sincere voice)', () => {
    for (const p of loadingPhrases) {
      expect(p, `phrase "${p}" should end with .`).toMatch(/\.$/);
    }
  });

  it('contains no exclamation points (voice rule)', () => {
    for (const p of loadingPhrases) {
      expect(p).not.toContain('!');
    }
  });

  it('all loading phrases are unique', () => {
    expect(new Set(loadingPhrases).size).toBe(loadingPhrases.length);
  });
});

describe('errorCopy', () => {
  it('has all generation error keys non-empty', () => {
    expect(errorCopy.generation.anthropicError).toBeTruthy();
    expect(errorCopy.generation.timeout).toBeTruthy();
    expect(errorCopy.generation.networkOffline).toBeTruthy();
    expect(errorCopy.generation.unknown).toBeTruthy();
  });

  it('has all frontend error keys non-empty', () => {
    expect(errorCopy.frontend.canvasWriteFailed).toBeTruthy();
    expect(errorCopy.frontend.downloadFailed).toBeTruthy();
    expect(errorCopy.frontend.fontLoadTimeout).toBeTruthy();
  });

  it('has block messages non-empty', () => {
    expect(errorCopy.slurBlock).toBeTruthy();
    expect(errorCopy.realPersonBlock).toBeTruthy();
    expect(errorCopy.rateLimit).toBeTruthy();
  });

  it('has errorBoundary message non-empty', () => {
    expect(errorCopy.errorBoundary).toBeTruthy();
  });

  it('no error string contains an exclamation point (voice rule)', () => {
    const all = [
      errorCopy.generation.anthropicError,
      errorCopy.generation.timeout,
      errorCopy.generation.networkOffline,
      errorCopy.generation.unknown,
      errorCopy.frontend.canvasWriteFailed,
      errorCopy.frontend.downloadFailed,
      errorCopy.frontend.fontLoadTimeout,
      errorCopy.slurBlock,
      errorCopy.realPersonBlock,
      errorCopy.rateLimit,
      errorCopy.errorBoundary,
    ];
    for (const s of all) {
      expect(s).not.toContain('!');
    }
  });
});

describe('downloadConfirmation', () => {
  it('is a non-empty string', () => {
    expect(typeof downloadConfirmation).toBe('string');
    expect(downloadConfirmation.length).toBeGreaterThan(0);
  });
});
