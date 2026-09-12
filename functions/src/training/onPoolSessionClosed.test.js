jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_options, handler) => handler,
}));
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
  onPoolSessionClosed,
  parseSessionDate,
  sameTimestamp,
  shouldProcessSessionUpdate,
} = require('./onPoolSessionClosed');
const admin = require('firebase-admin');

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

  test('prefers the actual session date when document IDs are random', () => {
    const date = { toDate: () => new Date('2026-08-25T20:30:00Z') };
    expect(parseSessionDate('random-id', date)).toBe(date);
  });

  test('compares Firestore and Date timestamps by their instant', () => {
    expect(
      sameTimestamp(
        { toDate: () => new Date('2026-08-25T20:30:00Z') },
        new Date('2026-08-25T20:30:00Z'),
      ),
    ).toBe(true);
  });

  test('allows one versioned reprocessing update for an already closed session', () => {
    expect(
      shouldProcessSessionUpdate(
        { status: 'closed' },
        { status: 'closed', carnet_processing_version: 2 },
      ),
    ).toBe(true);
    expect(
      shouldProcessSessionUpdate(
        { status: 'closed', carnet_processing_version: 2 },
        { status: 'closed', carnet_processing_version: 2 },
      ),
    ).toBe(false);
  });

  test('creates a personal logbook entry without creating an observation task when no validator exists', async () => {
    const sessionDate = { toDate: () => new Date('2026-08-25T20:30:00Z') };
    const attendeeDoc = {
      id: 'student-a',
      data: () => ({
        memberId: 'student-a',
        memberName: 'Student A',
        outcome: 'training',
        groupAssignment: {
          level: '2*',
          groupNumber: 1,
          groupKey: '2star_groupe1',
          validatorId: null,
          moniteurIds: [],
        },
      }),
    };
    const logbookRef = { id: 'logbook-a' };
    const logbookCollection = {
      where: jest.fn(),
      limit: jest.fn(),
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      doc: jest.fn(() => logbookRef),
    };
    logbookCollection.where.mockReturnValue(logbookCollection);
    logbookCollection.limit.mockReturnValue(logbookCollection);
    const attendeesCollection = {
      get: jest.fn().mockResolvedValue({ docs: [attendeeDoc] }),
    };
    const sessionRef = {
      collection: jest.fn((name) => {
        expect(name).toBe('attendees');
        return attendeesCollection;
      }),
    };
    const sessionsCollection = { doc: jest.fn(() => sessionRef) };
    const clubRef = {
      collection: jest.fn((name) => {
        if (name === 'piscine_sessions') return sessionsCollection;
        if (name === 'student_logbook_entries') return logbookCollection;
        throw new Error(`Unexpected collection ${name}`);
      }),
    };
    const batch = {
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    const db = {
      collection: jest.fn((name) => {
        expect(name).toBe('clubs');
        return { doc: jest.fn(() => clubRef) };
      }),
      batch: jest.fn(() => batch),
    };
    admin.firestore.mockReturnValue(db);

    await onPoolSessionClosed({
      params: { clubId: 'calypso', sessionId: 'random-session-id' },
      data: {
        before: { data: () => ({ status: 'closed' }) },
        after: {
          data: () => ({
            status: 'closed',
            carnet_processing_version: 2,
            date: sessionDate,
            lieu: 'Piscine de test',
          }),
        },
      },
    });

    expect(batch.set).toHaveBeenCalledTimes(1);
    expect(batch.set).toHaveBeenCalledWith(
      logbookRef,
      expect.objectContaining({
        member_id: 'student-a',
        source: 'piscine',
        date: sessionDate,
        validator_id: null,
        validator_name: null,
        validation_status: 'personal',
      }),
    );
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(clubRef.collection).not.toHaveBeenCalledWith('formation_tasks');
  });
});
