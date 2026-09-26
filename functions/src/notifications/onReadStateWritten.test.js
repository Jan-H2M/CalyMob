const { MemoryFirestore, MemoryTimestamp } = require('../../test-utils/memoryFirestore');

let mockDb;
const mockSend = jest.fn();
const mockFirestore = jest.fn(() => mockDb);
mockFirestore.FieldValue = { arrayRemove: (token) => ({ remove: token }) };
jest.mock('firebase-admin', () => ({ firestore: mockFirestore, messaging: () => ({ sendEachForMulticast: mockSend }) }));
jest.mock('../utils/notificationHistory', () => ({ persistNotificationHistory: jest.fn() }));

const { reconcileReadStateBadge, recentlySynced, cursorAdvanced } = require('./onReadStateWritten');
const { clearUnreadCursorV1FlagCache } = require('./unreadCursorFeatureFlag');
const ts = (iso) => new MemoryTimestamp(iso);
const before = { last_seen_at: ts('2026-03-01T00:00:00Z') };
const after = { last_seen_at: ts('2026-03-02T00:00:00Z') };

function seeded({ mode = 'on', pilots = [], memberId = 'm', message = false, tokens = ['token'] } = {}) {
  const docs = {
    'clubs/c/settings/feature_flags': { unreadCursorV1Enabled: mode !== 'off', unreadCursorV1Mode: mode, unreadCursorV1PilotMemberIds: pilots },
    [`clubs/c/members/${memberId}`]: { fcm_tokens: tokens },
    [`clubs/c/members/${memberId}/read_state/announcements`]: { last_seen_at: ts('2026-03-01T00:00:00Z') },
    [`clubs/c/members/${memberId}/read_state/events`]: { global_last_seen_at: ts('2026-03-01T00:00:00Z') },
    [`clubs/c/members/${memberId}/read_state/teams`]: { global_last_seen_at: ts('2026-03-01T00:00:00Z') },
    [`clubs/c/members/${memberId}/read_state/sessions`]: { global_last_seen_at: ts('2026-03-01T00:00:00Z') },
  };
  if (message) docs['clubs/c/announcements/a'] = { visibility: 'published', last_activity_at: ts('2026-03-03T00:00:00Z') };
  return new MemoryFirestore(docs);
}

describe('read-state badge reconciliation', () => {
  beforeEach(() => {
    clearUnreadCursorV1FlagCache(); recentlySynced.clear(); mockSend.mockReset();
    mockSend.mockResolvedValue({ successCount: 1, failureCount: 0, responses: [{ success: true }] });
  });
  afterEach(() => jest.useRealTimers());

  test('flag OFF sends nothing', async () => {
    mockDb = seeded({ mode: 'off' });
    await expect(reconcileReadStateBadge({ db: mockDb, clubId: 'c', memberId: 'm', before, after })).resolves.toEqual({ skipped: 'flag_off' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('unchanged cursor sends nothing', async () => {
    mockDb = seeded();
    await expect(reconcileReadStateBadge({ db: mockDb, clubId: 'c', memberId: 'm', before, after: before })).resolves.toEqual({ skipped: 'not_advanced' });
    expect(mockSend).not.toHaveBeenCalled();
    expect(cursorAdvanced(before, before)).toBe(false);
  });

  test('bootstrap scope burst is suppressed and sends no transient zero badge', async () => {
    mockDb = seeded();
    const committedAt = ts('2026-03-02T00:00:00Z');
    await mockDb.doc(
      'clubs/c/members/m/read_state_bootstraps/unread_cursor_v1',
    ).set({
      schema_version: 1,
      status: 'complete',
      bootstrapped_at: committedAt,
    });
    const writes = Array.from({ length: 25 }, () => reconcileReadStateBadge({
      db: mockDb,
      clubId: 'c',
      memberId: 'm',
      before: {},
      after: { last_seen_at: committedAt, updated_at: committedAt },
    }));

    await expect(Promise.all(writes)).resolves.toEqual(
      Array.from({ length: 25 }, () => ({ skipped: 'bootstrap_managed' })),
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('ON advanced cursor sends canonical total from seeded documents', async () => {
    mockDb = seeded({ message: true });
    const task = reconcileReadStateBadge({ db: mockDb, clubId: 'c', memberId: 'm', before, after });
    await new Promise((resolve) => setTimeout(resolve, 4050)); await task;
    expect(mockSend.mock.calls[0][0].apns.payload.aps.badge).toBe(1);
  });

  test('canonical zero is sent explicitly with silent background headers', async () => {
    mockDb = seeded();
    const task = reconcileReadStateBadge({ db: mockDb, clubId: 'c', memberId: 'm', before, after });
    await new Promise((resolve) => setTimeout(resolve, 4050)); await task;
    const payload = mockSend.mock.calls[0][0];
    expect(payload.apns).toEqual({ headers: { 'apns-push-type': 'background', 'apns-priority': '5' }, payload: { aps: { badge: 0, 'content-available': 1 } } });
  });

  test('three cursor writes in one coalesce window result in one final recomputation', async () => {
    jest.useFakeTimers(); mockDb = seeded();
    const one = reconcileReadStateBadge({ db: mockDb, clubId: 'c', memberId: 'm', before, after });
    const two = reconcileReadStateBadge({ db: mockDb, clubId: 'c', memberId: 'm', before, after: { last_seen_at: ts('2026-03-03T00:00:00Z') } });
    await mockDb.doc('clubs/c/announcements/later').set({ visibility: 'published', last_activity_at: ts('2026-03-04T00:00:00Z') });
    const three = reconcileReadStateBadge({ db: mockDb, clubId: 'c', memberId: 'm', before, after: { last_seen_at: ts('2026-03-04T00:00:00Z') } });
    await jest.advanceTimersByTimeAsync(4000); await Promise.all([one, two, three]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].apns.payload.aps.badge).toBe(1);
  });

  test('invalid token is removed from the member document', async () => {
    mockDb = seeded(); mockSend.mockResolvedValue({ successCount: 0, failureCount: 1, responses: [{ success: false, error: { code: 'messaging/invalid-registration-token' } }] });
    const task = reconcileReadStateBadge({ db: mockDb, clubId: 'c', memberId: 'm', before, after });
    await new Promise((resolve) => setTimeout(resolve, 4050)); await task;
    expect((await mockDb.doc('clubs/c/members/m').get()).data().fcm_tokens).toEqual([]);
  });

  test('shadow sends only for a listed pilot', async () => {
    mockDb = seeded({ mode: 'shadow', pilots: ['pilot'], memberId: 'pilot' });
    const pilot = reconcileReadStateBadge({ db: mockDb, clubId: 'c', memberId: 'pilot', before, after });
    await new Promise((resolve) => setTimeout(resolve, 4050)); await pilot;
    expect(mockSend).toHaveBeenCalledTimes(1);
    clearUnreadCursorV1FlagCache(); recentlySynced.clear(); mockSend.mockClear();
    mockDb = seeded({ mode: 'shadow', pilots: ['pilot'], memberId: 'other' });
    await expect(reconcileReadStateBadge({ db: mockDb, clubId: 'c', memberId: 'other', before, after })).resolves.toEqual({ skipped: 'flag_off' });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
