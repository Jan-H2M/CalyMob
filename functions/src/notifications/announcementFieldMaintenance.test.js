const { desiredAnnouncementFields, advanceAnnouncementActivity, maintainAnnouncementFields } = require('./announcementFieldMaintenance');
const ts = (millis) => ({ toMillis: () => millis });

describe('announcement cursor-v1 field maintenance', () => {
  test('create sets published visibility and creation activity', () => {
    const changes = desiredAnnouncementFields({}, { created_at: ts(10) });
    expect(changes.visibility).toBe('published');
    expect(changes.last_activity_at.toMillis()).toBe(10);
  });
  test('soft delete sets deleted visibility', () => expect(desiredAnnouncementFields({}, { created_at: ts(10), deleted_at: ts(12) })).toEqual({ visibility: 'deleted' }));
  test('restore returns to published visibility', () => {
    const changes = desiredAnnouncementFields({}, { visibility: 'deleted', created_at: ts(10) });
    expect(changes.visibility).toBe('published'); expect(changes.last_activity_at.toMillis()).toBe(10);
  });
  test('reply advances activity but an older reply does not regress it', async () => {
    const updates = []; const ref = { id: 'a' };
    const db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ref }) }) }), runTransaction: async (work) => work({ get: async () => ({ exists: true, data: () => ({ visibility: 'published', last_activity_at: ts(20) }) }), update: (_ref, data) => updates.push(data) }) };
    await advanceAnnouncementActivity({ db, clubId: 'c', announcementId: 'a', reply: { created_at: ts(10) } });
    await advanceAnnouncementActivity({ db, clubId: 'c', announcementId: 'a', reply: { created_at: ts(30) } });
    expect(updates).toHaveLength(1); expect(updates[0].last_activity_at.toMillis()).toBe(30);
  });
  test('already-normalized document performs no write', async () => {
    const update = jest.fn(); const db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ update }) }) }) }) };
    await expect(maintainAnnouncementFields({ db, clubId: 'c', announcementId: 'a', before: {}, after: { visibility: 'published', created_at: ts(10), last_activity_at: ts(10) } })).resolves.toEqual({ skipped: 'already_normalized' });
    expect(update).not.toHaveBeenCalled();
  });
  test('hard delete and missing announcement are safe no-ops', async () => {
    const update = jest.fn();
    const db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ update }) }) }) }) };
    await expect(maintainAnnouncementFields({ db, clubId: 'c', announcementId: 'gone', before: { created_at: ts(10) }, after: null })).resolves.toEqual({ skipped: 'announcement_deleted' });
    expect(update).not.toHaveBeenCalled();
  });
});
