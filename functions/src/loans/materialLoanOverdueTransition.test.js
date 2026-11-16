// Stub firebase modules before loading the function under test.
jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: jest.fn((opts, handler) => handler),
}), { virtual: true });
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({})),
  initializeApp: jest.fn(),
}), { virtual: true });
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'TIMESTAMP' },
}), { virtual: true });

const {
  todayMidnightBrussels,
} = require('./materialLoanOverdueTransition');

describe('todayMidnightBrussels', () => {
  it('returns a Date at midnight', () => {
    const midnight = todayMidnightBrussels();
    expect(midnight).toBeInstanceOf(Date);
    expect(midnight.getUTCMinutes()).toBe(0);
    expect(midnight.getUTCSeconds()).toBe(0);
  });

  it('is never in the future', () => {
    const midnight = todayMidnightBrussels();
    expect(midnight.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
