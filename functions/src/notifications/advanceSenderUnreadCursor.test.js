const {
  advanceSenderUnreadCursor,
  advanceSenderUnreadCursorIsolated,
} = require('./advanceSenderUnreadCursor');
const { MemoryFirestore, MemoryTimestamp } = require('../../test-utils/memoryFirestore');

const clubId = 'club';
const flagsPath = `clubs/${clubId}/settings/feature_flags`;
const memberPath = memberId => `clubs/${clubId}/members/${memberId}`;
const bootstrapPath = memberId =>
  `${memberPath(memberId)}/read_state_bootstraps/unread_cursor_v1`;
const cursorPath = (memberId, section, collection, scopeId) =>
  `${memberPath(memberId)}/read_state/${section}/${collection}/${scopeId}`;
const ts = iso => new MemoryTimestamp(iso);

function dependencies(documents) {
  return {
    db: new MemoryFirestore(documents),
    timestampFromMillis: value => new MemoryTimestamp(value),
    serverTimestamp: () => ts('2026-09-26T12:00:00Z'),
  };
}

test.each([
  ['announcements', 'items'],
  ['events', 'conversations'],
  ['teams', 'channels'],
  ['sessions', 'chats'],
])('ON sender advances exact %s cursor monotonically', async (section, collection) => {
  const senderId = `sender-${section}`;
  const scopeId = 'scope';
  const deps = dependencies({
    [flagsPath]: { unreadCursorV1Enabled: true, unreadCursorV1Mode: 'on' },
    [bootstrapPath(senderId)]: { status: 'complete', schema_version: 1 },
  });
  const first = await advanceSenderUnreadCursor({
    ...deps,
    clubId,
    senderId,
    section,
    scopeId,
    visibleAt: ts('2026-09-26T10:00:00.123Z'),
  });
  expect(first).toEqual({
    status: 'acknowledged',
    visibleThroughMs: Date.parse('2026-09-26T10:00:00.123Z'),
  });
  expect(
    deps.db.docs.get(cursorPath(senderId, section, collection, scopeId))
      .last_seen_at.toMillis(),
  ).toBe(Date.parse('2026-09-26T10:00:00.123Z'));

  const older = await advanceSenderUnreadCursor({
    ...deps,
    clubId,
    senderId,
    section,
    scopeId,
    visibleAt: ts('2026-09-26T09:00:00Z'),
  });
  expect(older.status).toBe('already-seen');
  expect(
    deps.db.docs.get(cursorPath(senderId, section, collection, scopeId))
      .last_seen_at.toMillis(),
  ).toBe(Date.parse('2026-09-26T10:00:00.123Z'));
});

test('sender cursor failure is isolated from recipient delivery domain', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const result = await advanceSenderUnreadCursorIsolated(
    {
      clubId,
      senderId: 'sender',
      section: 'events',
      scopeId: 'event',
      visibleAt: ts('2026-09-26T10:00:00Z'),
    },
    async () => {
      throw new Error('temporary transaction failure');
    },
  );
  expect(result).toEqual({ status: 'failed' });
  expect(log).toHaveBeenCalledWith(
    expect.stringContaining('sender_unread_cursor_advance_failed'),
  );
  log.mockRestore();
});

test('sender cursor preserves ordering inside one millisecond', async () => {
  const senderId = 'sender-nanos';
  const path = cursorPath(senderId, 'teams', 'channels', 'general');
  const earlier = new MemoryTimestamp(10, 123_000_100);
  const visibleAt = new MemoryTimestamp(10, 123_000_900);
  const deps = dependencies({
    [flagsPath]: { unreadCursorV1Enabled: true, unreadCursorV1Mode: 'on' },
    [bootstrapPath(senderId)]: { status: 'complete', schema_version: 1 },
    [path]: { last_seen_at: earlier },
  });

  const result = await advanceSenderUnreadCursor({
    ...deps,
    clubId,
    senderId,
    section: 'teams',
    scopeId: 'general',
    visibleAt,
  });

  expect(result).toEqual({ status: 'acknowledged', visibleThroughMs: 10_123 });
  expect(deps.db.docs.get(path).last_seen_at).toBe(visibleAt);
  expect(deps.db.docs.get(path).last_seen_at.nanoseconds).toBe(123_000_900);
});

test('shadow advances only a pilot and never another sender', async () => {
  const deps = dependencies({
    [flagsPath]: {
      unreadCursorV1Enabled: true,
      unreadCursorV1Mode: 'shadow',
      unreadCursorV1PilotMemberIds: ['pilot'],
    },
    [bootstrapPath('pilot')]: { status: 'complete', schema_version: 1 },
    [bootstrapPath('other')]: { status: 'complete', schema_version: 1 },
  });
  await advanceSenderUnreadCursor({
    ...deps,
    clubId,
    senderId: 'pilot',
    section: 'events',
    scopeId: 'event',
    visibleAt: ts('2026-09-26T10:00:00Z'),
  });
  const skipped = await advanceSenderUnreadCursor({
    ...deps,
    clubId,
    senderId: 'other',
    section: 'events',
    scopeId: 'event',
    visibleAt: ts('2026-09-26T11:00:00Z'),
  });
  expect(skipped.status).toBe('not-enabled');
  expect(deps.db.docs.has(cursorPath('pilot', 'events', 'conversations', 'event'))).toBe(true);
  expect(deps.db.docs.has(cursorPath('other', 'events', 'conversations', 'event'))).toBe(false);
});

test('OFF never creates a sender cursor', async () => {
  const flags = { unreadCursorV1Enabled: false, unreadCursorV1Mode: 'off' };
  const documents = { [flagsPath]: flags };
  const deps = dependencies(documents);
  const result = await advanceSenderUnreadCursor({
    ...deps,
    clubId,
    senderId: 'sender',
    section: 'teams',
    scopeId: 'general',
    visibleAt: ts('2026-09-26T10:00:00Z'),
  });
  expect(result.status).toBe('not-enabled');
  expect(deps.db.docs.has(cursorPath('sender', 'teams', 'channels', 'general'))).toBe(false);
});

test('ON sender advances before bootstrap so web self-send is never resurrected', async () => {
  const path = cursorPath('sender', 'teams', 'channels', 'general');
  const deps = dependencies({
    [flagsPath]: { unreadCursorV1Enabled: true, unreadCursorV1Mode: 'on' },
  });
  const visibleAt = ts('2026-09-26T10:00:00Z');
  const result = await advanceSenderUnreadCursor({
    ...deps,
    clubId,
    senderId: 'sender',
    section: 'teams',
    scopeId: 'general',
    visibleAt,
  });
  expect(result.status).toBe('acknowledged');
  expect(deps.db.docs.get(path).last_seen_at).toBe(visibleAt);
});
