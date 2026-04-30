import { selectPhoto } from '@/server/photoSelection';

// IDs from photos.json for reference:
// Standard (capacity ~32/52): misty-fjord-01, sunrise-meadow-02, golden-field-03,
//   calm-lake-04, forest-fog-05, desert-dusk-06, ocean-horizon-07
// High-capacity (60/100): wide-sky-08, open-plain-09, empty-road-10

const STANDARD_IDS = [
  'misty-fjord-01', 'sunrise-meadow-02', 'golden-field-03',
  'calm-lake-04', 'forest-fog-05', 'desert-dusk-06', 'ocean-horizon-07',
];
const HIGH_CAPACITY_IDS = ['wide-sky-08', 'open-plain-09', 'empty-road-10'];
const ALL_IDS = [...STANDARD_IDS, ...HIGH_CAPACITY_IDS];

describe('selectPhoto', () => {
  it('returns a rung 1 result for short text that fits standard photos', () => {
    const result = selectPhoto('Short line.', 'Also short.', []);
    expect(result).not.toBeNull();
    expect(result!.fittingRung).toBe(1);
    expect(result!.photoId).toBeTruthy();
    expect(result!.credit).toBeTruthy();
  });

  it('returns rung 2 when text is too long for standard but high-capacity exists', () => {
    // line2 at 55 chars exceeds standard capacity (~52) but fits high-capacity (100)
    const longLine2 = 'A'.repeat(55);
    const result = selectPhoto('Short.', longLine2, []);
    expect(result).not.toBeNull();
    expect(result!.fittingRung).toBeLessThanOrEqual(2);
    expect(HIGH_CAPACITY_IDS).toContain(result!.photoId);
  });

  it('still returns a result when all standard IDs are excluded', () => {
    const result = selectPhoto('Short.', 'Short too.', STANDARD_IDS);
    expect(result).not.toBeNull();
    expect(HIGH_CAPACITY_IDS).toContain(result!.photoId);
  });

  it('returns rung 3 (allows repeats) when all IDs are excluded', () => {
    const result = selectPhoto('Short.', 'Short too.', ALL_IDS);
    expect(result).not.toBeNull();
    expect(result!.fittingRung).toBe(3);
    expect(HIGH_CAPACITY_IDS).toContain(result!.photoId);
  });

  it('result always contains photoId, fittingRung, and credit', () => {
    const result = selectPhoto('Hello.', 'World.', []);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('photoId');
    expect(result).toHaveProperty('fittingRung');
    expect(result).toHaveProperty('credit');
    expect(typeof result!.photoId).toBe('string');
    expect(typeof result!.fittingRung).toBe('number');
    expect(typeof result!.credit).toBe('string');
  });
});
