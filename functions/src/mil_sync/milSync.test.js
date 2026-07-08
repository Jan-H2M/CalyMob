/**
 * WP-26 MS-A — tests des fonctions pures (hash + extraction de version).
 */
jest.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: () => () => {} }));
jest.mock('firebase-functions/v2/https', () => ({ onCall: () => () => {}, HttpsError: class {} }));
jest.mock('firebase-admin', () => ({ firestore: () => ({}), storage: () => ({}) }));
jest.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'ts' } }));
jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../utils/emailDelivery', () => ({ sendEmailWithConfig: jest.fn() }));

const { sha256, extractVersion } = require('./milSync');

describe('WP-26 MS-A helpers', () => {
  test('sha256 déterministe et sensible au contenu', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).not.toBe(sha256('abd'));
    expect(sha256('abc')).toHaveLength(64);
  });

  test('extractVersion trouve le marqueur v2026-7', () => {
    expect(extractVersion('... MIL v2026-7 ...')).toBe('v2026-7');
    expect(extractVersion('version v2025.3 ok')).toBe('v2025.3');
    expect(extractVersion('aucun marqueur')).toBeNull();
  });
});
