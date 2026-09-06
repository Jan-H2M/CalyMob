jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_options, handler) => handler,
}));
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_timestamp__' },
}));

const {
  positiveDiveNumber,
  shouldSkipDiveNumberAssignment,
  highestDiveNumberFromDocs,
  nextDiveNumber,
  diveNumberAllocationPatch,
  planBackfillDiveNumbers,
} = require('./assignDiveNumber');

const doc = (id, data) => ({ id, data: () => data });

describe('COM-085 dive number allocation policy', () => {
  test('skips piscine entries and entries that already have a number', () => {
    expect(shouldSkipDiveNumberAssignment({ source: 'piscine' })).toBe(true);
    expect(shouldSkipDiveNumberAssignment({ dive_number: 42 })).toBe(true);
    expect(shouldSkipDiveNumberAssignment({ source: 'manual', member_id: 'm1' })).toBe(false);
  });

  test('uses only positive finite dive numbers', () => {
    expect(positiveDiveNumber(12)).toBe(12);
    expect(positiveDiveNumber(0)).toBeNull();
    expect(positiveDiveNumber(-1)).toBeNull();
    expect(positiveDiveNumber('12')).toBeNull();
    expect(positiveDiveNumber(Number.NaN)).toBeNull();
  });

  test('highest existing number ignores the current create event and piscine artefacts', () => {
    const docs = [
      doc('new-entry', { dive_number: 99 }),
      doc('pool-entry', { source: 'piscine', dive_number: 200 }),
      doc('old-entry', { source: 'manual', dive_number: 12 }),
      doc('empty-entry', { source: 'manual' }),
    ];

    expect(highestDiveNumberFromDocs(docs, 'new-entry')).toBe(12);
  });

  test('backfill plans only unnumbered non-piscine entries', () => {
    const docs = [
      doc('pool-with-number', { source: 'piscine', dive_number: 200 }),
      doc('numbered-dive', { source: 'manual', dive_number: 12 }),
      doc('legacy-dive', { source: 'manual' }),
      doc('shared-copy', { source: 'shared_logbook' }),
    ];

    const plan = planBackfillDiveNumbers(docs);

    expect(plan.highest).toBe(12);
    expect(plan.pending.map((entry) => entry.id)).toEqual(['legacy-dive', 'shared-copy']);
  });

  test('recovers stale counters without lowering a valid future counter', () => {
    expect(nextDiveNumber(5, 12)).toBe(13);
    expect(nextDiveNumber(20, 12)).toBe(20);
    expect(nextDiveNumber(undefined, 0)).toBe(1);
  });

  test('server-created numbers carry explicit allocation metadata', () => {
    expect(diveNumberAllocationPatch(13, 'assignDiveNumber')).toEqual({
      dive_number: 13,
      dive_number_source: 'assignDiveNumber',
      dive_number_allocated_at: '__server_timestamp__',
      updated_at: '__server_timestamp__',
    });
  });
});
