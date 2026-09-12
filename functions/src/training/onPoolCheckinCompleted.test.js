jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_options, handler) => handler,
}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_timestamp__' },
  Timestamp: {},
}));

const {
  buildAttendeeIdentityPatch,
  resolveAttendeeRef,
  resolveGroupSupervision,
  selectedGroupContract,
} = require('./onPoolCheckinCompleted');

function makeDb({ memberIdDocs = [], legacyMemberIdDocs = [] } = {}) {
  const queries = [];
  const makeRef = (id) => ({
    id: String(id),
    path: `clubs/calypso/piscine_sessions/session-a/attendees/${id}`,
  });
  const docsFor = (field) => {
    const ids = field === 'memberId' ? memberIdDocs : legacyMemberIdDocs;
    return ids.map((id) => ({ id, ref: makeRef(id) }));
  };
  const attendeesRef = {
    doc: (id = 'generated') => makeRef(id),
    where: (field, op, value) => {
      queries.push({ field, op, value });
      return {
        limit: () => ({
          get: async () => {
            const docs = docsFor(field);
            return { empty: docs.length === 0, docs };
          },
        }),
      };
    },
  };
  const db = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({ collection: () => attendeesRef }),
        }),
      }),
    }),
  };
  return { db, queries };
}

describe('onPoolCheckinCompleted attendee identity', () => {
  test('writes identity fields without overwriting unknown names with null', () => {
    expect(buildAttendeeIdentityPatch({
      member_id: 'member-a',
      member_name: 'Alice Exemple',
    })).toEqual({ memberId: 'member-a', memberName: 'Alice Exemple' });
    expect(buildAttendeeIdentityPatch({ member_id: 'member-a' }))
      .toEqual({ memberId: 'member-a' });
  });

  test('uses context.attendee_id without running fallback queries', async () => {
    const { db, queries } = makeDb({ memberIdDocs: ['wrong-doc'] });
    const ref = await resolveAttendeeRef(db, 'calypso', 'session-a', {
      member_id: 'member-a',
      context: { attendee_id: 'scan-doc-123' },
    });
    expect(ref.id).toBe('scan-doc-123');
    expect(queries).toEqual([]);
  });

  test('falls back to an existing memberId attendee', async () => {
    const { db, queries } = makeDb({ memberIdDocs: ['legacy-random'] });
    const ref = await resolveAttendeeRef(db, 'calypso', 'session-a', {
      member_id: 'member-a', context: {},
    });
    expect(ref.id).toBe('legacy-random');
    expect(queries).toEqual([
      { field: 'memberId', op: '==', value: 'member-a' },
    ]);
  });

  test('falls back to a French legacy member identity', async () => {
    const { db, queries } = makeDb({ legacyMemberIdDocs: ['legacy-french'] });
    const ref = await resolveAttendeeRef(db, 'calypso', 'session-a', {
      member_id: 'member-a', context: {},
    });
    expect(ref.id).toBe('legacy-french');
    expect(queries).toEqual([
      { field: 'memberId', op: '==', value: 'member-a' },
      { field: 'membre_id', op: '==', value: 'member-a' },
    ]);
  });

  test('uses the canonical member document only as final fallback', async () => {
    const { db } = makeDb();
    const ref = await resolveAttendeeRef(db, 'calypso', 'session-a', {
      member_id: 'member-a', context: {},
    });
    expect(ref.id).toBe('member-a');
  });
});

function makeSupervisionDb(sessionData, groupData = null) {
  const sessionRef = {
    get: async () => ({ exists: true, data: () => sessionData }),
    collection: (name) => {
      if (name !== 'groups') throw new Error(`unexpected collection ${name}`);
      return {
        doc: () => ({
          get: async () => ({
            exists: groupData != null,
            data: () => groupData,
          }),
        }),
      };
    },
  };
  return {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => sessionRef,
        }),
      }),
    }),
  };
}

describe('onPoolCheckinCompleted selected group supervision', () => {
  const session = {
    niveaux: {
      '2*': {
        courses_by_hour: {
          '1ere_heure': [
            {
              order: 0,
              theme: 'Groupe un',
              encadrants: [{ membre_id: 'validator-group-1' }],
            },
            {
              order: 1,
              theme: 'Groupe deux',
              encadrants: [
                { membre_id: 'validator-group-2' },
                { membreId: 'monitor-group-2-b' },
              ],
            },
          ],
        },
      },
    },
  };

  test('normalizes current and production legacy completion contracts', () => {
    expect(selectedGroupContract({
      level: '2*',
      groupNumber: 2,
      groupKey: '2star_groupe2',
      moniteurIds: ['validator-group-2'],
    })).toMatchObject({
      level: '2*',
      groupNumber: 2,
      groupKey: '2star_groupe2',
      monitorIds: ['validator-group-2'],
    });

    expect(selectedGroupContract(null, {
      level: '2*',
      group_number: 2,
      group_key: '2*-2',
      moniteur_ids: ['validator-group-2'],
    })).toMatchObject({
      level: '2*',
      groupNumber: 2,
      groupKey: '2star_groupe2',
      monitorIds: ['validator-group-2'],
    });
  });

  test('resolves group 2 to group 2 monitors, never the first level course', async () => {
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb(session),
      'calypso',
      'session-a',
      selectedGroupContract({
        level: '2*',
        groupNumber: 2,
        groupKey: '2star_groupe2',
        // Stale client data must not override the authoritative planning.
        moniteurIds: ['validator-group-1'],
      }, {}, '1ere_heure'),
    );

    expect(resolved).toEqual({
      validatorId: 'validator-group-2',
      monitorIds: ['validator-group-2', 'monitor-group-2-b'],
      themeSnapshot: 'Groupe deux',
    });
  });

  test('retains the one-group production legacy level shape', async () => {
    const resolved = await resolveGroupSupervision(
      makeSupervisionDb({
        niveaux: {
          '1*': {
            theme: 'Legacy theme',
            encadrants: [{ membre_id: 'legacy-validator' }],
          },
        },
      }),
      'calypso',
      'session-a',
      selectedGroupContract(null, {
        level: '1*',
        group_number: 1,
        group_key: '1*-1',
      }),
    );

    expect(resolved).toEqual({
      validatorId: 'legacy-validator',
      monitorIds: ['legacy-validator'],
      themeSnapshot: 'Legacy theme',
    });
  });
});
