jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_options, handler) => handler,
}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_timestamp__' },
}));

const {
  CARNET_PROCESSING_VERSION,
  closeEligiblePoolSessions,
  isAutoCloseCandidate,
  loadPendingSessionDocs,
  sessionDateFrom,
} = require('./autoClosePoolSessions');

const cutoff = new Date('2026-09-12T00:00:00.000Z');

function sessionDoc(id, data) {
  return {
    id,
    data: () => data,
    ref: { update: jest.fn().mockResolvedValue(undefined) },
  };
}

function sessionsRef({ legacy = [], current = [] }) {
  return {
    where: jest.fn((field, operator, value) => {
      expect(operator).toBe('==');
      let docs = current;
      if (field === 'status' && value === 'open') docs = legacy;
      return { get: jest.fn().mockResolvedValue({ docs }) };
    }),
  };
}

describe('autoClosePoolSessions schema compatibility', () => {
  test('accepts finished current-schema sessions with no legacy status', () => {
    expect(
      isAutoCloseCandidate(
        { statut: 'termine', date: new Date('2026-08-25T20:00:00Z') },
        '2026-08-25',
        cutoff,
      ),
    ).toBe(true);
  });

  test('keeps the legacy open-session path', () => {
    expect(
      isAutoCloseCandidate(
        { status: 'open' },
        '2026-08-25',
        cutoff,
      ),
    ).toBe(true);
  });

  test.each([
    [{ statut: 'termine', status: 'closed', carnet_processing_version: 2 }, '2026-08-25'],
    [{ statut: 'publie' }, '2026-08-25'],
    [{ statut: 'termine' }, '2026-09-12'],
    [{ statut: 'termine' }, 'not-a-date'],
  ])('rejects closed, unfinished, recent or undated sessions', (data, id) => {
    expect(isAutoCloseCandidate(data, id, cutoff)).toBe(false);
  });

  test('never accepts a finished closed session as an implicit backfill', () => {
    expect(
      isAutoCloseCandidate(
        { statut: 'termine', status: 'closed' },
        '2026-08-25',
        cutoff,
      ),
    ).toBe(false);
  });

  test('never accepts a legacy closed session with a stale processing version', () => {
    expect(
      isAutoCloseCandidate(
        { status: 'closed' },
        '2026-08-25',
        cutoff,
      ),
    ).toBe(false);
  });

  test('uses a Firestore timestamp before falling back to the session ID', () => {
    const timestampDate = new Date('2026-08-25T20:30:00Z');
    expect(
      sessionDateFrom({ date: { toDate: () => timestampDate } }, 'invalid'),
    ).toBe(timestampDate);
    expect(sessionDateFrom({}, '2026-08-25')).toEqual(
      new Date('2026-08-25T00:00:00.000Z'),
    );
  });

  test('queries only open/finished schemas and de-duplicates sessions returned twice', async () => {
    const duplicate = sessionDoc('2026-08-25', {
      statut: 'termine',
      status: 'open',
    });
    const legacyOnly = sessionDoc('2026-08-18', { status: 'open' });
    const ref = sessionsRef({
      legacy: [duplicate, legacyOnly],
      current: [duplicate],
    });

    await expect(loadPendingSessionDocs(ref)).resolves.toEqual([
      duplicate,
      legacyOnly,
    ]);
    expect(ref.where).toHaveBeenCalledWith('status', '==', 'open');
    expect(ref.where).not.toHaveBeenCalledWith('status', '==', 'closed');
    expect(ref.where).toHaveBeenCalledWith('statut', '==', 'termine');
  });

  test('writes one closed transition for an eligible current session', async () => {
    const eligible = sessionDoc('2026-08-25', { statut: 'termine' });
    const alreadyClosed = sessionDoc('2026-08-18', {
      statut: 'termine', status: 'closed', carnet_processing_version: 1,
    });
    const ref = sessionsRef({ current: [eligible, alreadyClosed] });

    await expect(
      closeEligiblePoolSessions(ref, 'calypso', cutoff),
    ).resolves.toEqual({ scanned: 2, closed: 1 });
    expect(eligible.ref.update).toHaveBeenCalledTimes(1);
    expect(eligible.ref.update).toHaveBeenCalledWith({
      status: 'closed',
      carnet_processing_version: CARNET_PROCESSING_VERSION,
      closedBy: 'auto',
      closedAt: '__server_timestamp__',
      auto_closed_at: '__server_timestamp__',
    });
    expect(alreadyClosed.ref.update).not.toHaveBeenCalled();
  });
});
