const {
  memberDisplayName,
  memberFirstName,
  memberLastName,
} = require('./memberName');

describe('memberName', () => {
  test('prefers canonical snake_case fields', () => {
    const member = {
      first_name: 'Canonical First',
      last_name: 'Canonical Last',
      firstName: 'Camel First',
      lastName: 'Camel Last',
      prenom: 'Legacy First',
      nom: 'Legacy Last',
    };

    expect(memberFirstName(member)).toBe('Canonical First');
    expect(memberLastName(member)).toBe('Canonical Last');
    expect(memberDisplayName(member)).toBe('Canonical First Canonical Last');
  });

  test('supports camelCase-only members', () => {
    const member = {
      firstName: 'Raffaele',
      lastName: 'Gradini',
      displayName: 'Raffaele Gradini',
    };

    expect(memberDisplayName(member)).toBe('Raffaele Gradini');
  });
});
