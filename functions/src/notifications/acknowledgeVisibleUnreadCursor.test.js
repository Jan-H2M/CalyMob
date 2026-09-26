const { MemoryFirestore } = require('../../test-utils/memoryFirestore');
const {
  acknowledgeVisibleUnreadCursor,
  visibleSourcePath,
} = require('./acknowledgeVisibleUnreadCursor');

const clubId = 'calypso';
const uid = 'member-a';
const memberPath = `clubs/${clubId}/members/${uid}`;
const timestamp = millis => ({ millis, toMillis: () => millis });

function run(db, input) {
  return acknowledgeVisibleUnreadCursor({
    db,
    uid,
    input: { clubId, memberId: uid, ...input },
    timestampFromMillis: timestamp,
    serverTimestamp: () => ({ serverTimestamp: true }),
  });
}

describe('acknowledgeVisibleUnreadCursorV1', () => {
  test('advances only through the exact visible server document', async () => {
    const db = new MemoryFirestore({
      [memberPath]: { member_status: 'active' },
      [`clubs/${clubId}/team_channels/general/messages/visible`]: {
        __test_create_time: timestamp(1_000),
      },
      [`clubs/${clubId}/team_channels/general/messages/arrived-later`]: {
        __test_create_time: timestamp(2_000),
      },
    });

    await expect(run(db, {
      section: 'teams',
      scopeId: 'general',
      visibleMessageId: 'visible',
    })).resolves.toEqual({
      status: 'acknowledged',
      visibleThroughMs: 1_000,
    });
    expect(db.docs.get(
      `${memberPath}/read_state/teams/channels/general`,
    ).last_seen_at.toMillis()).toBe(1_000);
  });

  test('never rewinds an existing cursor', async () => {
    const cursorPath = `${memberPath}/read_state/events/conversations/op`;
    const db = new MemoryFirestore({
      [memberPath]: { member_status: 'active' },
      [`clubs/${clubId}/operations/op/messages/old`]: {
        __test_create_time: timestamp(1_000),
      },
      [`clubs/${clubId}/operations/op`]: { statut: 'ouvert' },
      [`clubs/${clubId}/operations/op/inscriptions/own`]: {
        membre_id: uid,
        registration_status: 'confirmed',
      },
      [cursorPath]: { last_seen_at: timestamp(2_000) },
    });
    await expect(run(db, {
      section: 'events',
      scopeId: 'op',
      visibleMessageId: 'old',
    })).resolves.toEqual({
      status: 'already-seen',
      visibleThroughMs: 2_000,
    });
    expect(db.docs.get(cursorPath).last_seen_at.toMillis()).toBe(2_000);
  });

  test('preserves nanoseconds when two visible documents share one millisecond', async () => {
    const cursorPath = `${memberPath}/read_state/teams/channels/general`;
    const earlier = { seconds: 10, nanoseconds: 123_000_100, toMillis: () => 10_123 };
    const visible = { seconds: 10, nanoseconds: 123_000_900, toMillis: () => 10_123 };
    const db = new MemoryFirestore({
      [memberPath]: { member_status: 'active' },
      [`clubs/${clubId}/team_channels/general/messages/visible`]: {
        __test_create_time: visible,
      },
      [cursorPath]: { last_seen_at: earlier },
    });

    await expect(run(db, {
      section: 'teams',
      scopeId: 'general',
      visibleMessageId: 'visible',
    })).resolves.toEqual({
      status: 'acknowledged',
      visibleThroughMs: 10_123,
    });
    expect(db.docs.get(cursorPath).last_seen_at).toBe(visible);
    expect(db.docs.get(cursorPath).last_seen_at.nanoseconds).toBe(123_000_900);
  });

  test('session scope and message audience must agree', async () => {
    const db = new MemoryFirestore({
      [memberPath]: { member_status: 'active' },
      [`clubs/${clubId}/piscine_sessions/s/messages/m`]: {
        group_type: 'accueil',
        __test_create_time: timestamp(1_000),
      },
      [`clubs/${clubId}/piscine_sessions/s`]: {
        baptemes: [{ membre_id: uid }],
      },
    });
    await expect(run(db, {
      section: 'sessions',
      scopeId: 's__encadrants',
      sessionId: 's',
      groupType: 'encadrants',
      visibleMessageId: 'm',
    })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('rejects team, event and session content outside the member audience', async () => {
    const db = new MemoryFirestore({
      [memberPath]: { member_status: 'active' },
      [`clubs/${clubId}/team_channels/equipe_ca`]: { type: 'ca' },
      [`clubs/${clubId}/team_channels/equipe_ca/messages/team`]: {
        __test_create_time: timestamp(1_000),
      },
      [`clubs/${clubId}/operations/op`]: { statut: 'ouvert' },
      [`clubs/${clubId}/operations/op/messages/event`]: {
        __test_create_time: timestamp(1_000),
      },
      [`clubs/${clubId}/piscine_sessions/s`]: {
        accueil: [{ membre_id: 'someone-else' }],
      },
      [`clubs/${clubId}/piscine_sessions/s/messages/session`]: {
        group_type: 'accueil',
        __test_create_time: timestamp(1_000),
      },
    });
    await expect(run(db, {
      section: 'teams', scopeId: 'equipe_ca', visibleMessageId: 'team',
    })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(run(db, {
      section: 'events', scopeId: 'op', visibleMessageId: 'event',
    })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(run(db, {
      section: 'sessions', scopeId: 's__accueil', sessionId: 's',
      groupType: 'accueil', visibleMessageId: 'session',
    })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('rejects cross-club and malformed paths', () => {
    expect(() => visibleSourcePath({
      clubId: '../other',
      section: 'teams',
      scopeId: 'general',
      visibleMessageId: 'm',
    })).toThrow();
  });

  test('rejects a delayed acknowledgement captured for another account', async () => {
    const db = new MemoryFirestore({
      [memberPath]: { member_status: 'active' },
      [`clubs/${clubId}/team_channels/general/messages/visible`]: {
        __test_create_time: timestamp(1_000),
      },
    });
    await expect(run(db, {
      memberId: 'member-b',
      section: 'teams',
      scopeId: 'general',
      visibleMessageId: 'visible',
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(db.docs.has(
      `${memberPath}/read_state/teams/channels/general`,
    )).toBe(false);
  });
});
