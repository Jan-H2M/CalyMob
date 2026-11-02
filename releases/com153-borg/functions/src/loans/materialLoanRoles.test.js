const { hasGonflageRole, normalizeClubRole } = require('./materialLoanRoles');

describe('material loan role normalization', () => {
  test.each(['G', 'g', 'Gonflage', 'gOnFlAgE', ' G '])(
    'recognizes %s as Gonflage',
    (role) => {
      expect(hasGonflageRole({ clubStatuten: [role] })).toBe(true);
    },
  );

  test('rejects malformed and unrelated role values', () => {
    expect(hasGonflageRole({ clubStatuten: ['Encadrant'] })).toBe(false);
    expect(hasGonflageRole({ clubStatuten: 'G' })).toBe(false);
    expect(hasGonflageRole()).toBe(false);
  });

  test('normalization is trimmed and case-insensitive', () => {
    expect(normalizeClubRole(' GoNfLaGe ')).toBe('gonflage');
  });
});
