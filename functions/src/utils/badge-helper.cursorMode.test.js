const { MemoryFirestore, MemoryTimestamp } = require('../../test-utils/memoryFirestore');

let mockDb;
const mockSend = jest.fn();
const mockPersist = jest.fn(() => Promise.resolve());
const mockFirestore = jest.fn(() => mockDb);
mockFirestore.FieldValue = { arrayRemove: (token) => ({ remove: token }) };
jest.mock('firebase-admin', () => ({ firestore: mockFirestore, messaging: () => ({ sendEachForMulticast: mockSend }) }));
jest.mock('./notificationHistory', () => ({ persistNotificationHistory: mockPersist }));

const { sendNotificationsWithUnreadCursorMode } = require('./badge-helper');

const ts = (iso) => new MemoryTimestamp(iso);
const basePayload = { notification: { title: 'Hello', body: 'World' }, data: { type: 'event_message', operation_id: 'op' }, android: { priority: 'high' } };
const groups = (...ids) => new Map(ids.map((id) => [id, [`${id}-token`]]));

function seeded({ mode = 'off', pilots = [], members = ['m'], canonicalAnnouncement = false } = {}) {
  const docs = {
    'clubs/c/settings/feature_flags': { unreadCursorV1Enabled: mode !== 'off', unreadCursorV1Mode: mode, unreadCursorV1PilotMemberIds: pilots },
  };
  members.forEach((id) => {
    docs[`clubs/c/members/${id}`] = { fcm_tokens: [`${id}-token`], unread_counts: { announcements: 7 } };
    docs[`clubs/c/members/${id}/read_state/announcements`] = { last_seen_at: ts('2026-03-01T00:00:00Z') };
    docs[`clubs/c/members/${id}/read_state/events`] = { global_last_seen_at: ts('2026-03-01T00:00:00Z') };
    docs[`clubs/c/members/${id}/read_state/teams`] = { global_last_seen_at: ts('2026-03-01T00:00:00Z') };
    docs[`clubs/c/members/${id}/read_state/sessions`] = { global_last_seen_at: ts('2026-03-01T00:00:00Z') };
  });
  if (canonicalAnnouncement) docs['clubs/c/announcements/a'] = { visibility: 'published', last_activity_at: ts('2026-03-02T00:00:00Z') };
  return new MemoryFirestore(docs);
}

describe('sendNotificationsWithUnreadCursorMode', () => {
  beforeEach(() => {
    mockSend.mockReset(); mockPersist.mockReset();
    mockPersist.mockResolvedValue();
    mockSend.mockResolvedValue({ successCount: 1, failureCount: 0, responses: [{ success: true }] });
  });

  test('OFF sends the identical legacy APNs payload for the same inputs', async () => {
    mockDb = seeded();
    await sendNotificationsWithUnreadCursorMode('c', groups('m'), basePayload, 'event_messages');
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      tokens: ['m-token'],
      notification: basePayload.notification,
      android: basePayload.android,
      data: { ...basePayload.data, recipient_id: 'm' },
      apns: expect.objectContaining({ payload: { aps: { badge: 7 } } }),
    }));
  });

  test('shadow preserves legacy payload and logs the canonical difference', async () => {
    mockDb = seeded({ mode: 'shadow', canonicalAnnouncement: true });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await sendNotificationsWithUnreadCursorMode('c', groups('m'), basePayload, 'event_messages');
    expect(mockSend.mock.calls[0][0].apns.payload.aps.badge).toBe(7);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('unread_cursor_shadow_diff'));
    log.mockRestore();
  });

  test('ON sets iOS badge to the canonical total from seeded documents', async () => {
    mockDb = seeded({ mode: 'on', canonicalAnnouncement: true });
    await sendNotificationsWithUnreadCursorMode('c', groups('m'), basePayload, 'event_messages');
    expect(mockSend.mock.calls[0][0].apns.payload.aps.badge).toBe(1);
  });

  test('ON sends canonical zero rather than omitting the iOS badge', async () => {
    mockDb = seeded({ mode: 'on' });
    await sendNotificationsWithUnreadCursorMode('c', groups('m'), basePayload, 'event_messages');
    expect(mockSend.mock.calls[0][0].apns.payload.aps.badge).toBe(0);
  });

  test('warm instance observes shadow to ON cutover on the next send', async () => {
    mockDb = seeded({ mode: 'shadow' });
    await sendNotificationsWithUnreadCursorMode('c', groups('m'), basePayload, 'event_messages');
    expect(mockSend.mock.calls[0][0].apns.payload.aps.badge).toBe(7);

    await mockDb.doc('clubs/c/settings/feature_flags').set({
      unreadCursorV1Enabled: true,
      unreadCursorV1Mode: 'on',
      unreadCursorV1PilotMemberIds: [],
    });
    await sendNotificationsWithUnreadCursorMode('c', groups('m'), basePayload, 'event_messages');
    expect(mockSend.mock.calls[1][0].apns.payload.aps.badge).toBe(0);
  });

  test('ON preserves Android payload fields from legacy input', async () => {
    mockDb = seeded({ mode: 'on' });
    await sendNotificationsWithUnreadCursorMode('c', groups('m'), basePayload, 'event_messages');
    expect(mockSend.mock.calls[0][0].android).toEqual(basePayload.android);
    expect(mockSend.mock.calls[0][0].data).toEqual({
      ...basePayload.data,
      recipient_id: 'm',
    });
  });

  test('ON removes an invalid recipient token from its member document', async () => {
    mockDb = seeded({ mode: 'on' });
    mockSend.mockResolvedValue({ successCount: 0, failureCount: 1, responses: [{ success: false, error: { code: 'messaging/registration-token-not-registered' } }] });
    await sendNotificationsWithUnreadCursorMode('c', groups('m'), basePayload, 'event_messages');
    expect((await mockDb.doc('clubs/c/members/m').get()).data().fcm_tokens).toEqual([]);
  });

  test('shadow pilot gets canonical badge while non-pilot keeps legacy badge', async () => {
    mockDb = seeded({ mode: 'shadow', pilots: ['pilot'], members: ['pilot', 'legacy'], canonicalAnnouncement: true });
    await sendNotificationsWithUnreadCursorMode('c', groups('pilot', 'legacy'), basePayload, 'event_messages');
    const sent = Object.fromEntries(mockSend.mock.calls.map(([payload]) => [payload.tokens[0], payload.apns.payload.aps.badge]));
    expect(sent).toEqual({ 'pilot-token': 1, 'legacy-token': 7 });
  });

  test('one canonical count failure is badge-neutral and does not abort another recipient', async () => {
    mockDb = seeded({ mode: 'on', members: ['broken', 'good'], canonicalAnnouncement: true });
    mockDb.docs.delete('clubs/c/members/broken/read_state/events');
    const result = await sendNotificationsWithUnreadCursorMode(
      'c', groups('broken', 'good'), basePayload, 'event_messages',
    );
    expect(result).toEqual({ successCount: 2, failureCount: 0 });
    const sent = Object.fromEntries(mockSend.mock.calls.map(([payload]) => [payload.tokens[0], payload]));
    expect(sent['broken-token'].apns.payload.aps).not.toHaveProperty('badge');
    expect(sent['broken-token'].data.recipient_id).toBe('broken');
    expect(sent['good-token'].apns.payload.aps.badge).toBe(1);
    expect(sent['good-token'].data.recipient_id).toBe('good');
  });

  test('one FCM rejection does not retry or abort a successful recipient', async () => {
    mockDb = seeded({ mode: 'on', members: ['broken', 'good'] });
    mockSend.mockImplementation(async ({ tokens }) => {
      if (tokens[0] === 'broken-token') throw new Error('FCM unavailable');
      return { successCount: 1, failureCount: 0, responses: [{ success: true }] };
    });
    const result = await sendNotificationsWithUnreadCursorMode(
      'c', groups('broken', 'good'), basePayload, 'event_messages',
    );
    expect(result).toEqual({ successCount: 1, failureCount: 1 });
    expect(mockSend.mock.calls.filter(([payload]) => payload.tokens[0] === 'broken-token')).toHaveLength(1);
    expect(mockSend.mock.calls.filter(([payload]) => payload.tokens[0] === 'good-token')).toHaveLength(1);
  });

  test('history failure after delivery never retries or fails another recipient', async () => {
    mockDb = seeded({ mode: 'on', members: ['history-fails', 'good'] });
    mockPersist.mockImplementation(async (_club, memberId) => {
      if (memberId === 'history-fails') throw new Error('history unavailable');
    });
    const result = await sendNotificationsWithUnreadCursorMode(
      'c', groups('history-fails', 'good'), basePayload, 'event_messages',
    );
    expect(result).toEqual({ successCount: 2, failureCount: 0 });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test('shadow diagnostic failure cannot abort already independent legacy sends', async () => {
    mockDb = seeded({ mode: 'shadow', members: ['broken', 'good'] });
    mockDb.docs.delete('clubs/c/members/broken/read_state/announcements');
    await expect(sendNotificationsWithUnreadCursorMode(
      'c', groups('broken', 'good'), basePayload, 'event_messages',
    )).resolves.toEqual({ successCount: 2, failureCount: 0 });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
