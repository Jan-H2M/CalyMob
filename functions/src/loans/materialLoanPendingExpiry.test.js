// Stub firebase modules before loading the function under test.
jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: jest.fn((opts, handler) => handler),
}), { virtual: true });
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({})),
  initializeApp: jest.fn(),
}), { virtual: true });
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'TIMESTAMP', delete: () => 'DELETE' },
}), { virtual: true });

const { DEFAULT_TIMEOUT_HOURS } = require('./materialLoanPendingExpiry');

describe('materialLoanPendingExpiry constants', () => {
  it('uses 48 hours as default timeout', () => {
    expect(DEFAULT_TIMEOUT_HOURS).toBe(48);
  });
});
