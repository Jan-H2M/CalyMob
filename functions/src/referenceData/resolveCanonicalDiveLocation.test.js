const {
  normalizeLocationName,
  resolveLocationCandidates,
} = require('./resolveCanonicalDiveLocation');

const location = (id, name, extra = {}) => ({ id, name, country: 'BE', ...extra });

describe('canonical dive-location resolver', () => {
  test('normalizes accents and punctuation consistently', () => {
    expect(normalizeLocationName(' Carrière de Vodelée! ')).toBe('carriere de vodelee');
  });

  test('searches the complete catalog, including entries beyond old client limits', () => {
    const locations = Array.from({ length: 512 }, (_, i) => location(`loc-${i}`, `Site ${i}`));
    locations.push(location('deep', 'Vodelée'));
    const result = resolveLocationCandidates('Vodelée', locations);
    expect(result.status).toBe('exact');
    expect(result.canonical.id).toBe('deep');
  });

  test('returns ambiguous exact matches without silently choosing one', () => {
    const result = resolveLocationCandidates('La Fosse', [
      location('one', 'La Fosse'), location('two', 'La Fosse'),
    ]);
    expect(result.status).toBe('ambiguous');
    expect(result.canonical).toBeNull();
    expect(result.suggestions.map((item) => item.id)).toEqual(['one', 'two']);
  });

  test('returns suggestions and keeps an unknown spelling unlinked', () => {
    const result = resolveLocationCandidates('Vodele', [location('one', 'Vodelée')]);
    expect(result.status).toBe('ambiguous');
    expect(result.canonical).toBeNull();
    expect(result.suggestions[0].id).toBe('one');
    expect(resolveLocationCandidates('Atlantis', [location('one', 'Vodelée')]).status)
      .toBe('not_found');
  });

  test('requires an explicit selection to link a suggestion', () => {
    const result = resolveLocationCandidates('anything', [location('one', 'Vodelée')], 'one');
    expect(result.status).toBe('exact');
    expect(result.confirmation).toBe('selected');
    expect(result.canonical.id).toBe('one');
    expect(resolveLocationCandidates('anything', [location('one', 'Vodelée')], 'missing').status)
      .toBe('not_found');
  });
});
