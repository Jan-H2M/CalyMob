const {
  normalizeLocationName,
  similarity,
  suggestionScore,
  selectExactMatch,
  referenceDescription,
} = require('./resolveReferenceDiveSiteLocation');

describe('reference dive-site name matching', () => {
  test('normalizes accents and punctuation for deterministic exact lookup', () => {
    expect(normalizeLocationName(' Carrière de Vodelée! ')).toBe('carriere de vodelee');
  });

  test('only a single exact candidate is eligible for automatic GPS', () => {
    expect(selectExactMatch([{ id: 'one' }])).toEqual({ id: 'one' });
    expect(selectExactMatch([])).toBeNull();
    expect(selectExactMatch([{ id: 'one' }, { id: 'two' }])).toBeNull();
  });

  test('scores approved aliases for review without treating them as coordinates', () => {
    const site = {
      display_name: 'Carrière de Vodelée',
      match_keys: ['carriere de vodelee', 'vodelee'],
    };
    expect(similarity('vodelee', 'vodelee')).toBe(1);
    expect(suggestionScore('carriere de vodele', site)).toBeGreaterThan(0.9);
  });

  test('uses a French reference description first and falls back to the source text', () => {
    expect(referenceDescription({
      descriptions: { fr: 'Description française', en: 'English description' },
    })).toBe('Description française');
    expect(referenceDescription({ descriptions: { en: 'English description' } }))
      .toBe('English description');
    expect(referenceDescription({ descriptions: { fr: '   ' } })).toBeNull();
  });
});
