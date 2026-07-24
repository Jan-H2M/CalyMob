jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_timestamp__' },
  Timestamp: {
    fromDate: (date) => date.toISOString(),
    now: () => '__now__',
  },
}));

const {
  buildRosterKey,
  composeTaskTitle,
  parseSessionDate,
} = require('./onPoolSessionClosed');

describe('pool session roster construction helpers', () => {
  test('builds a deterministic session/group/validator roster key', () => {
    expect(buildRosterKey('2026-07-21', '2star_groupe1', 'validator-a')).toBe(
      '2026-07-21::2star_groupe1::validator-a',
    );
    expect(buildRosterKey('2026-07-21', null, 'validator-a')).toBe(
      '2026-07-21::unknown-group::validator-a',
    );
  });

  test('keeps readable legacy task titles', () => {
    expect(
      composeTaskTitle('Alice', {
        level: '2*',
        themeSnapshot: 'Apnée',
      }),
    ).toBe('Évaluer Alice (2* Apnée)');
  });

  test('parses date-key sessions deterministically', () => {
    expect(parseSessionDate('2026-07-21')).toBe(
      '2026-07-21T00:00:00.000Z',
    );
  });
});
