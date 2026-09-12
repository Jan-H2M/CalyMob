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
  diveNumberAllocationPatch,
  highestDiveNumberFromDocs,
  incrementDiveNumber,
  monotonicCounterNext,
  nextDiveNumber,
  planBackfillDiveNumbers,
  positiveDiveNumber,
  shouldSkipDiveNumberAssignment,
} = require('./assignDiveNumber');

const doc = (id, data) => ({ id, data: () => data });

describe('COM-085 dive number allocation policy', () => {
  test('skips piscine entries and entries that already have a number', () => {
    expect(shouldSkipDiveNumberAssignment({ source: 'piscine' })).toBe(true);
    expect(shouldSkipDiveNumberAssignment({ dive_number: 42 })).toBe(true);
    expect(shouldSkipDiveNumberAssignment({ source: 'manual', member_id: 'm1' })).toBe(false);
  });

  test('accepts only positive safe integers', () => {
    expect(positiveDiveNumber(12)).toBe(12);
    expect(positiveDiveNumber(0)).toBeNull();
    expect(positiveDiveNumber(-1)).toBeNull();
    expect(positiveDiveNumber('12')).toBeNull();
    expect(positiveDiveNumber(12.5)).toBeNull();
    expect(positiveDiveNumber(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });

  test('ignores the current create event and piscine artefacts for the high-water mark', () => {
    const docs = [
      doc('new-entry', { dive_number: 99 }),
      doc('pool-entry', { source: 'piscine', dive_number: 200 }),
      doc('old-entry', { source: 'manual', dive_number: 12 }),
      doc('empty-entry', { source: 'manual' }),
    ];

    expect(highestDiveNumberFromDocs(docs, 'new-entry')).toBe(12);
  });

  test('backfill selects only unnumbered non-piscine entries', () => {
    const docs = [
      doc('pool-with-number', { source: 'piscine', dive_number: 200 }),
      doc('pool-without-number', { source: 'piscine' }),
      doc('numbered-dive', { source: 'manual', dive_number: 12 }),
      doc('legacy-dive', { source: 'manual' }),
      doc('shared-copy', { source: 'shared_logbook' }),
    ];

    const plan = planBackfillDiveNumbers(docs);
    expect(plan.highest).toBe(12);
    expect(plan.pending.map((entry) => entry.id)).toEqual([
      'legacy-dive',
      'shared-copy',
    ]);
  });

  test('recovers stale counters without lowering a valid future counter', () => {
    expect(nextDiveNumber(5, 12)).toBe(13);
    expect(nextDiveNumber(20, 12)).toBe(20);
    expect(nextDiveNumber(undefined, 0)).toBe(1);
    expect(monotonicCounterNext(50, 14)).toBe(50);
    expect(monotonicCounterNext(10, 14)).toBe(14);
  });

  test('refuses unsafe rollover', () => {
    expect(() => incrementDiveNumber(Number.MAX_SAFE_INTEGER)).toThrow(
      'No safe positive dive number remains'
    );
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
