jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_options, handler) => handler,
}));

const { buildOperationLocationContext } = require('./onOperationFinished');

describe('operation logbook location context', () => {
  test('uses the exact canonical dive location instead of the operation title', () => {
    expect(buildOperationLocationContext(
      { titre: 'Sortie Zélande', lieu: 'Zélande' },
      { name: 'Strijenham', country: 'NL', water_type: 'sea', region: 'Zélande' },
    )).toEqual({
      location_name: 'Strijenham',
      location_country: 'NL',
      location_is_sea: true,
      location_zone: 'Zélande',
    });
  });

  test('falls back to the operation location, never its title', () => {
    expect(buildOperationLocationContext(
      { titre: 'Week-end club', lieu: 'La Gombe' },
      null,
    ).location_name).toBe('La Gombe');
  });
});
