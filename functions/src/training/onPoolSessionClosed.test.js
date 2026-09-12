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
  buildArtifactCreationPlan,
  buildGroupPeers,
  buildRosterKey,
  composeTaskTitle,
  onPoolSessionClosed,
  parseSessionDate,
  peersForAttendee,
  sameTimestamp,
  selectCanonicalTrainingAttendees,
  shouldProcessSessionUpdate,
} = require('./onPoolSessionClosed');
const admin = require('firebase-admin');

function attendeeDoc(id, data) {
  return { id, data: () => data };
}

const training = (overrides = {}) => ({
  outcome: 'training',
  groupAssignment: {
    level: '2*',
    groupNumber: 1,
    groupKey: '2star_groupe1',
    validatorId: 'validator-a',
    ...overrides.groupAssignment,
  },
  ...overrides,
});

function makeCloseDb(attendeeDocs) {
  const queries = [];
  const existingDoc = {
    id: 'existing-artifact',
    data: () => ({ date: new Date('2026-09-01T00:00:00.000Z') }),
    ref: { id: 'existing-artifact' },
  };

  function artifactQuery(collectionName) {
    const filters = [];
    const query = {
      where: (field, op, value) => {
        filters.push({ field, op, value });
        return query;
      },
      limit: () => query,
      get: async () => {
        queries.push({ collectionName, filters });
        return { empty: false, docs: [existingDoc] };
      },
    };
    return query;
  }

  const sessionRef = {
    collection: (name) => {
      if (name !== 'attendees') {
        throw new Error(`unexpected session collection ${name}`);
      }
      return { get: async () => ({ docs: attendeeDocs }) };
    },
  };
  const clubRef = {
    collection: (name) => {
      if (name === 'piscine_sessions') {
        return { doc: () => sessionRef };
      }
      if (name === 'members') {
        return {
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({ prenom: 'Val', nom: 'Idateur' }),
            }),
          }),
        };
      }
      if (name === 'student_logbook_entries' || name === 'formation_tasks') {
        return artifactQuery(name);
      }
      throw new Error(`unexpected club collection ${name}`);
    },
  };
  const db = {
    collection: (name) => {
      if (name !== 'clubs') {
        throw new Error(`unexpected root collection ${name}`);
      }
      return { doc: () => clubRef };
    },
    batch: () => ({ set: jest.fn(), commit: jest.fn() }),
  };
  return { db, queries };
}

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
    const attendee = attendeeDoc('student-a', {
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
    });
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
      get: jest.fn().mockResolvedValue({ docs: [attendee] }),
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

  test('collapses mixed legacy and canonical documents before processing', () => {
    const attendees = selectCanonicalTrainingAttendees([
      attendeeDoc('legacy-random', {
        memberId: 'member-a',
        memberName: 'Alice Exemple',
      }),
      attendeeDoc('member-a', training({
        membre_id: 'member-a',
        member_name: '',
      })),
    ]);

    expect(attendees).toHaveLength(1);
    expect(attendees[0]).toMatchObject({
      sourceId: 'member-a',
      memberId: 'member-a',
      memberName: 'Alice Exemple',
    });
    expect(attendees[0].data.groupAssignment.validatorId).toBe('validator-a');
  });

  test('prefers the duplicate carrying a usable validator assignment', () => {
    const attendees = selectCanonicalTrainingAttendees([
      attendeeDoc('legacy-random', training({
        memberId: 'member-a',
        memberName: 'Alice Exemple',
      })),
      attendeeDoc('member-a', training({
        memberId: 'member-a',
        groupAssignment: {
          level: '2*',
          groupNumber: 1,
          groupKey: '2star_groupe1',
          validatorId: null,
        },
      })),
    ]);

    expect(attendees).toHaveLength(1);
    expect(attendees[0].sourceId).toBe('legacy-random');
    expect(attendees[0].data.groupAssignment.validatorId).toBe('validator-a');
  });

  test('keeps separate members and creates each peer only once', () => {
    const attendees = selectCanonicalTrainingAttendees([
      attendeeDoc('legacy-a', training({
        memberId: 'member-a', memberName: 'Alice',
      })),
      attendeeDoc('member-a', training({
        memberId: 'member-a', memberName: 'Alice',
      })),
      attendeeDoc('member-b', training({
        membre_id: 'member-b', member_name: 'Bob',
      })),
    ]);
    const groupPeers = buildGroupPeers(attendees);
    const peers = groupPeers.get('2*#1');

    expect(attendees.map((a) => a.memberId)).toEqual(['member-a', 'member-b']);
    expect(peers).toEqual([
      { member_id: 'member-a', displayName: 'Alice' },
      { member_id: 'member-b', displayName: 'Bob' },
    ]);
    expect(peers.filter((peer) => peer.member_id === 'member-a')).toHaveLength(1);
    expect(
      peersForAttendee(
        groupPeers,
        attendees[0].data.groupAssignment,
        'member-a',
      ),
    ).toEqual([{ member_id: 'member-b', displayName: 'Bob' }]);
  });

  test('selects only valid member training and encadrant assignments', () => {
    const attendees = selectCanonicalTrainingAttendees([
      attendeeDoc('training', training({ memberName: 'Training' })),
      attendeeDoc('encadrant', training({
        outcome: 'encadrant', memberName: 'Encadrant',
      })),
      attendeeDoc('service', training({
        outcome: 'service_only', memberName: 'Service',
      })),
      attendeeDoc('no-group', { outcome: 'training', memberName: 'No group' }),
      attendeeDoc('guest', training({ isGuest: true, memberName: 'Guest' })),
    ]);

    expect(attendees.map((a) => a.memberId)).toEqual(['encadrant', 'training']);
  });

  test('preserves logbook and task idempotency decisions', () => {
    expect(buildArtifactCreationPlan(
      { empty: false, docs: [{ id: 'existing-logbook' }] },
      { empty: false, docs: [{ id: 'existing-task' }] },
    )).toEqual({
      createLogbook: false,
      createTask: false,
      existingLogbookEntryId: 'existing-logbook',
    });

    expect(buildArtifactCreationPlan(
      { empty: true, docs: [] },
      { empty: true, docs: [] },
    )).toEqual({
      createLogbook: true,
      createTask: true,
      existingLogbookEntryId: null,
    });

    expect(buildArtifactCreationPlan(
      { empty: true, docs: [] },
      null,
    )).toEqual({
      createLogbook: true,
      createTask: false,
      existingLogbookEntryId: null,
    });
  });

  test('a real close queries existing artifacts once for legacy duplicates', async () => {
    const attendeeDocs = [
      attendeeDoc('legacy-random', {
        memberId: 'member-a',
        memberName: 'Alice Exemple',
      }),
      attendeeDoc('member-a', training({
        memberId: 'member-a',
        memberName: 'Alice Exemple',
      })),
    ];
    const { db, queries } = makeCloseDb(attendeeDocs);
    admin.firestore.mockReturnValue(db);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const previousDryRun = process.env.DRY_RUN_POOL_CLOSE;
    process.env.DRY_RUN_POOL_CLOSE = 'true';

    try {
      await onPoolSessionClosed({
        params: { clubId: 'club', sessionId: '2026-09-01' },
        data: {
          before: { data: () => ({ status: 'open' }) },
          after: { data: () => ({ status: 'closed' }) },
        },
      });
    } finally {
      if (previousDryRun == null) delete process.env.DRY_RUN_POOL_CLOSE;
      else process.env.DRY_RUN_POOL_CLOSE = previousDryRun;
      logSpy.mockRestore();
    }

    expect(queries.filter((q) =>
      q.collectionName === 'student_logbook_entries')).toHaveLength(1);
    expect(queries.filter((q) =>
      q.collectionName === 'formation_tasks')).toHaveLength(1);
    expect(queries.every((q) => q.filters.some((filter) =>
      filter.field === 'member_id' && filter.value === 'member-a'))).toBe(true);
  });
});
