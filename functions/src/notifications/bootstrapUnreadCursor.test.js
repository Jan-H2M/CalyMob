const { MemoryFirestore } = require('../../test-utils/memoryFirestore');
const {
  bootstrapUnreadCursor,
  normalizeInput,
  MIN_TIMESTAMP_MS,
} = require('./bootstrapUnreadCursor');

const uid = 'member-a';
const clubId = 'calypso';
const memberPath = `clubs/${clubId}/members/${uid}`;
const rolloutBaselineMs = Date.parse('2026-09-25T08:26:55.038Z');

function input(overrides = {}) {
  return {
    clubId,
    schemaVersion: 1,
    fallbackLastSeenAtMs: Date.parse('2024-01-01T00:00:00Z'),
    announcementsLastSeenAtMs: Date.parse('2026-09-20T10:00:00Z'),
    eventConversations: { 'event-1': Date.parse('2026-09-21T10:00:00Z') },
    teamChannels: { general: Date.parse('2026-09-22T10:00:00Z') },
    sessionChats: { 'session-1__accueil': Date.parse('2026-09-23T10:00:00Z') },
    ...overrides,
  };
}

function database({ active = true, pilot = true } = {}) {
  return new MemoryFirestore({
    [memberPath]: { member_status: active ? 'active' : 'inactive' },
    [`clubs/${clubId}/settings/feature_flags`]: {
      unreadCursorV1Enabled: true,
      unreadCursorV1Mode: 'shadow',
      unreadCursorV1PilotMemberIds: pilot ? [uid] : [],
    },
    [`clubs/${clubId}/settings/unread_cursor_v1_migration`]: {
      schema_version: 1,
      status: 'roots-seeded',
      baseline_at: { millis: rolloutBaselineMs },
    },
    [`${memberPath}/read_state/announcements`]: {
      schema_version: 1,
      last_seen_at: { millis: rolloutBaselineMs },
      updated_at: { millis: rolloutBaselineMs },
    },
    [`${memberPath}/read_state/events`]: {
      schema_version: 1,
      global_last_seen_at: { millis: rolloutBaselineMs },
      updated_at: { millis: rolloutBaselineMs },
    },
    [`${memberPath}/read_state/teams`]: {
      schema_version: 1,
      global_last_seen_at: { millis: rolloutBaselineMs },
      updated_at: { millis: rolloutBaselineMs },
    },
    [`${memberPath}/read_state/sessions`]: {
      schema_version: 1,
      global_last_seen_at: { millis: rolloutBaselineMs },
      updated_at: { millis: rolloutBaselineMs },
    },
  });
}

const timestampFromMillis = value => ({ millis: value });
const serverTimestamp = () => ({ serverTimestamp: true });
const nowMs = Date.parse('2026-09-26T12:00:00Z');

function run(db, payload = input(), overrides = {}) {
  return bootstrapUnreadCursor({
    db,
    uid,
    input: payload,
    nowMs,
    timestampFromMillis,
    serverTimestamp,
    ...overrides,
  });
}

describe('bootstrapUnreadCursorV1', () => {
  test('atomically maps legacy roots and all scope types', async () => {
    const db = database();
    await expect(run(db)).resolves.toEqual({
      status: 'bootstrapped',
      schemaVersion: 1,
    });

    expect(db.docs.get(`${memberPath}/read_state/announcements`).last_seen_at)
      .toEqual({ millis: Date.parse('2026-09-20T10:00:00Z') });
    expect(db.docs.get(`${memberPath}/read_state/events`).global_last_seen_at)
      .toEqual({ millis: Date.parse('2024-01-01T00:00:00Z') });
    expect(db.docs.get(
      `${memberPath}/read_state/events/conversations/event-1`,
    ).last_seen_at).toEqual({ millis: Date.parse('2026-09-21T10:00:00Z') });
    expect(db.docs.get(
      `${memberPath}/read_state/teams/channels/general`,
    ).last_seen_at).toEqual({ millis: Date.parse('2026-09-22T10:00:00Z') });
    expect(db.docs.get(
      `${memberPath}/read_state/sessions/chats/session-1__accueil`,
    ).last_seen_at).toEqual({ millis: Date.parse('2026-09-23T10:00:00Z') });
    expect(db.docs.get(
      `${memberPath}/read_state_bootstraps/unread_cursor_v1`,
    )).toMatchObject({ status: 'complete', schema_version: 1, scope_count: 3 });
  });

  test('clamps future and implausibly old device timestamps to server bounds', () => {
    const normalized = normalizeInput(input({
      fallbackLastSeenAtMs: 0,
      announcementsLastSeenAtMs: nowMs + 999999,
      eventConversations: { future: nowMs + 5000 },
    }), nowMs);
    expect(normalized.fallbackMs).toBe(MIN_TIMESTAMP_MS);
    expect(normalized.announcementsMs).toBe(nowMs);
    expect(normalized.events.get('future')).toBe(nowMs);
    expect(normalized.timestampsClamped).toBe(true);
  });

  test('is idempotent and never rewinds a completed handover', async () => {
    const db = database();
    await run(db);
    const first = db.docs.get(`${memberPath}/read_state/announcements`);
    await expect(run(db, input({ announcementsLastSeenAtMs: MIN_TIMESTAMP_MS })))
      .resolves.toEqual({ status: 'already-complete', schemaVersion: 1 });
    expect(db.docs.get(`${memberPath}/read_state/announcements`)).toEqual(first);
  });

  test('a second device monotonically merges newer legacy reads', async () => {
    const db = database();
    await run(db);
    const newer = Date.parse('2026-09-26T11:00:00Z');
    const reconcileBadge = jest.fn().mockResolvedValue({ total: 0 });

    await expect(run(db, input({
      fallbackLastSeenAtMs: newer,
      announcementsLastSeenAtMs: newer,
      eventConversations: { 'event-1': newer },
      teamChannels: { general: newer },
      sessionChats: { 'session-1__accueil': newer },
    }), { reconcileBadge })).resolves.toEqual({
      status: 'merged',
      schemaVersion: 1,
    });

    expect(db.docs.get(`${memberPath}/read_state/events`).global_last_seen_at)
      .toEqual({ millis: newer });
    expect(db.docs.get(
      `${memberPath}/read_state/events/conversations/event-1`,
    ).last_seen_at).toEqual({ millis: newer });
    expect(db.docs.get(
      `${memberPath}/read_state_bootstraps/unread_cursor_v1`,
    ).last_merged_at).toEqual({ serverTimestamp: true });
    expect(reconcileBadge).toHaveBeenCalledTimes(1);
  });

  test('an older completed snapshot performs no writes and no reconciliation',
      async () => {
    const db = database();
    await run(db);
    const originalRunTransaction = db.runTransaction.bind(db);
    let writes = 0;
    db.runTransaction = work => originalRunTransaction(transaction => work({
      ...transaction,
      set: (...args) => {
        writes += 1;
        return transaction.set(...args);
      },
      update: (...args) => {
        writes += 1;
        return transaction.update(...args);
      },
    }));
    const reconcileBadge = jest.fn();

    await expect(run(db, input({
      fallbackLastSeenAtMs: MIN_TIMESTAMP_MS,
      announcementsLastSeenAtMs: MIN_TIMESTAMP_MS,
      eventConversations: {},
      teamChannels: {},
      sessionChats: {},
    }), { reconcileBadge })).resolves.toEqual({
      status: 'already-complete',
      schemaVersion: 1,
    });
    expect(writes).toBe(0);
    expect(reconcileBadge).not.toHaveBeenCalled();
  });

  test('legacy reads made while rollout is OFF merge after ON is restored',
      async () => {
    const db = database();
    await run(db);
    db.docs.set(`clubs/${clubId}/settings/feature_flags`, {
      unreadCursorV1Enabled: false,
      unreadCursorV1Mode: 'off',
      unreadCursorV1PilotMemberIds: [],
    });
    const readWhileOff = Date.parse('2026-09-26T10:30:00Z');
    await expect(run(db, input({
      announcementsLastSeenAtMs: readWhileOff,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });

    db.docs.set(`clubs/${clubId}/settings/feature_flags`, {
      unreadCursorV1Enabled: true,
      unreadCursorV1Mode: 'on',
      unreadCursorV1PilotMemberIds: [],
    });
    await expect(run(db, input({
      announcementsLastSeenAtMs: readWhileOff,
    }))).resolves.toEqual({ status: 'merged', schemaVersion: 1 });
    expect(db.docs.get(`${memberPath}/read_state/announcements`).last_seen_at)
      .toEqual({ millis: readWhileOff });
  });

  test('one callable reconciliation covers a multi-scope bootstrap', async () => {
    const db = database();
    const reconcileBadge = jest.fn().mockResolvedValue({ total: 5 });

    await run(db, input({
      eventConversations: {
        one: Date.parse('2026-09-20T10:00:00Z'),
        two: Date.parse('2026-09-21T10:00:00Z'),
      },
      teamChannels: {
        general: Date.parse('2026-09-22T10:00:00Z'),
      },
    }), { reconcileBadge });

    expect(reconcileBadge).toHaveBeenCalledTimes(1);
  });

  test('backdates only trusted rollout seeds and preserves later acknowledgements',
      async () => {
    const db = database();
    const laterRoot = Date.parse('2026-09-25T11:00:00Z');
    const laterScope = Date.parse('2026-09-25T11:30:00Z');
    db.docs.set(`${memberPath}/read_state/announcements`, {
      schema_version: 1,
      last_seen_at: { millis: laterRoot },
      updated_at: { millis: laterRoot },
    });
    db.docs.set(`${memberPath}/read_state/events/conversations/event-1`, {
      last_seen_at: { millis: laterScope },
      updated_at: { millis: laterScope },
    });

    await run(db);

    // Announcements diverged from the trusted seed and must never rewind.
    expect(db.docs.get(`${memberPath}/read_state/announcements`).last_seen_at)
      .toEqual({ millis: laterRoot });
    // The untouched events root was exactly the rollout seed and is safely
    // replaced by the older legacy fallback.
    expect(db.docs.get(`${memberPath}/read_state/events`).global_last_seen_at)
      .toEqual({ millis: Date.parse('2024-01-01T00:00:00Z') });
    // Existing scoped acknowledgements are always monotonic.
    expect(db.docs.get(
      `${memberPath}/read_state/events/conversations/event-1`,
    ).last_seen_at).toEqual({ millis: laterScope });
  });

  test('refuses to backdate without a trusted server migration marker', async () => {
    const db = database();
    db.docs.delete(`clubs/${clubId}/settings/unread_cursor_v1_migration`);
    await expect(run(db)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(db.docs.has(
      `${memberPath}/read_state_bootstraps/unread_cursor_v1`,
    )).toBe(false);
  });

  test('serializes concurrent attempts through the marker transaction', async () => {
    const db = database();
    const originalRunTransaction = db.runTransaction.bind(db);
    let tail = Promise.resolve();
    db.runTransaction = work => {
      const result = tail.then(() => originalRunTransaction(work));
      tail = result.catch(() => undefined);
      return result;
    };
    const results = await Promise.all([run(db), run(db)]);
    expect(results.map(result => result.status).sort()).toEqual([
      'already-complete',
      'bootstrapped',
    ]);
  });

  test('requires an active selected member without broadening access', async () => {
    await expect(run(database({ active: false }))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(run(database({ pilot: false }))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
