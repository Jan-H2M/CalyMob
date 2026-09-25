const { MemoryFirestore, MemoryTimestamp } = require('../../test-utils/memoryFirestore');

let mockDb;
const mockSend = jest.fn();
const mockPersist = jest.fn(() => Promise.resolve());
const mockFirestore = jest.fn(() => mockDb);
mockFirestore.FieldValue = { arrayRemove: (token) => ({ remove: token }) };
jest.mock('firebase-admin', () => ({ firestore: mockFirestore, messaging: () => ({ sendEachForMulticast: mockSend }) }));
jest.mock('./notificationHistory', () => ({ persistNotificationHistory: mockPersist }));

const { sendNotificationsWithUnreadCursorMode } = require('./badge-helper');
const { clearUnreadCursorV1FlagCache } = require('../notifications/unreadCursorFeatureFlag');

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
    clearUnreadCursorV1FlagCache(); mockSend.mockReset(); mockPersist.mockClear();
    mockSend.mockResolvedValue({ successCount: 1, failureCount: 0, responses: [{ success: true }] });
  });

  test('OFF sends the identical legacy APNs payload for the same inputs', async () => {
    mockDb = seeded();
    await sendNotificationsWithUnreadCursorMode('c', groups('m'), basePayload, 'event_messages');
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['m-token'], ...basePayload, apns: expect.objectContaining({ payload: { aps: { badge: 7 } } }) }));
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

  test('ON preserves Android payload fields from legacy input', async () => {
    mockDb = seeded({ mode: 'on' });
    await sendNotificationsWithUnreadCursorMode('c', groups('m'), basePayload, 'event_messages');
    expect(mockSend.mock.calls[0][0].android).toEqual(basePayload.android);
    expect(mockSend.mock.calls[0][0].data).toEqual(basePayload.data);
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
});
