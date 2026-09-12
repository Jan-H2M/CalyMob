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
