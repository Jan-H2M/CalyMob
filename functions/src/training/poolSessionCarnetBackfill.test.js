jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_timestamp__' },
}));

const {
  BACKFILL_SOURCE,
  CARNET_PROCESSING_VERSION,
  isHistoricalCarnetBackfillCandidate,
  runHistoricalCarnetBackfill,
} = require('./poolSessionCarnetBackfill');

function sessionDoc(id, data, freshData = data) {
  const ref = { id, path: `clubs/calypso/piscine_sessions/${id}` };
  return {
    id,
    ref,
    data: () => data,
    freshSnapshot: {
      id,
      ref,
      exists: freshData !== null,
      data: () => freshData,
    },
  };
}

function setupDb(docs) {
  const transaction = {
    get: jest.fn(async (ref) =>
      docs.find((doc) => doc.id === ref.id).freshSnapshot),
    update: jest.fn(),
  };
  const sessionsRef = {
    where: jest.fn((field, operator, value) => {
      expect([field, operator, value]).toEqual(['status', '==', 'closed']);
      return { get: jest.fn().mockResolvedValue({ docs }) };
    }),
  };
  const db = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({ collection: jest.fn(() => sessionsRef) })),
    })),
    runTransaction: jest.fn((callback) => callback(transaction)),
  };
  return { db, sessionsRef, transaction };
}

describe('historical piscine carnet v2 backfill', () => {
  test.each([
    [{ status: 'closed' }, true],
    [{ status: 'closed', carnet_processing_version: 1 }, true],
    [{ status: 'closed', carnet_processing_version: 2 }, false],
    [{ status: 'open', carnet_processing_version: 0 }, false],
    [{ statut: 'termine' }, false],
  ])('selects only closed sessions below v2', (data, expected) => {
    expect(isHistoricalCarnetBackfillCandidate(data)).toBe(expected);
  });

  test('defaults to a read-only preview of every candidate', async () => {
    const staleA = sessionDoc('stale-a', {
      status: 'closed', date: new Date('2026-08-25T20:30:00Z'),
    });
    const staleB = sessionDoc('stale-b', {
      status: 'closed', carnet_processing_version: 1,
    });
    const current = sessionDoc('current', {
      status: 'closed', carnet_processing_version: 2,
    });
    const { db, transaction } = setupDb([staleA, staleB, current]);

    await expect(runHistoricalCarnetBackfill({
      db, clubId: 'calypso',
    })).resolves.toEqual(expect.objectContaining({
      mode: 'dry-run',
      candidateCount: 2,
      selectedCount: 2,
      appliedCount: 0,
      unknownIds: [],
    }));
    expect(db.runTransaction).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  test('refuses apply without an explicit session allowlist', async () => {
    const { db } = setupDb([]);
    await expect(runHistoricalCarnetBackfill({
      db, clubId: 'calypso', apply: true,
    })).rejects.toThrow('explicit --session allowlist');
    expect(db.runTransaction).not.toHaveBeenCalled();
  });

  test('refuses an outdated or unknown apply allowlist before writing', async () => {
    const stale = sessionDoc('stale-a', { status: 'closed' });
    const { db, transaction } = setupDb([stale]);
    await expect(runHistoricalCarnetBackfill({
      db,
      clubId: 'calypso',
      apply: true,
      allowlist: ['stale-a', 'not-in-preview'],
    })).rejects.toThrow('no longer candidates: not-in-preview');
    expect(db.runTransaction).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
  });

  test('updates only the exact allowlist in one guarded transaction', async () => {
    const selected = sessionDoc('stale-a', { status: 'closed' });
    const notSelected = sessionDoc('stale-b', { status: 'closed' });
    const { db, transaction } = setupDb([selected, notSelected]);

    await expect(runHistoricalCarnetBackfill({
      db,
      clubId: 'calypso',
      apply: true,
      allowlist: ['stale-a'],
    })).resolves.toEqual(expect.objectContaining({
      mode: 'apply', candidateCount: 2, selectedCount: 1, appliedCount: 1,
    }));
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.update).toHaveBeenCalledWith(selected.ref, {
      carnet_processing_version: CARNET_PROCESSING_VERSION,
      carnet_backfill_applied_at: '__server_timestamp__',
      carnet_backfill_source: BACKFILL_SOURCE,
    });
  });

  test('rechecks candidate state transactionally and refuses a preview/apply race', async () => {
    const changed = sessionDoc(
      'stale-a',
      { status: 'closed' },
      { status: 'closed', carnet_processing_version: 2 },
    );
    const { db, transaction } = setupDb([changed]);
    await expect(runHistoricalCarnetBackfill({
      db,
      clubId: 'calypso',
      apply: true,
      allowlist: ['stale-a'],
    })).rejects.toThrow('changed after preview: stale-a');
    expect(transaction.update).not.toHaveBeenCalled();
  });
});
