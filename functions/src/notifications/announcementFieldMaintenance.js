const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

function asMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return value instanceof Date ? value.getTime() : 0;
}

function desiredAnnouncementFields(before = {}, after = {}) {
  const deleted = after.deleted_at != null;
  const desired = { visibility: deleted ? 'deleted' : 'published' };
  if (!deleted && !after.last_activity_at && after.created_at) {
    desired.last_activity_at = after.created_at;
  }
  const changed = Object.entries(desired).some(([key, value]) => {
    return key === 'last_activity_at'
      ? asMillis(after[key]) !== asMillis(value)
      : after[key] !== value;
  });
  return changed ? desired : null;
}

async function maintainAnnouncementFields({ db, clubId, announcementId, before, after }) {
  const updates = desiredAnnouncementFields(before, after);
  if (!updates) return { skipped: 'already_normalized' };
  await db.collection('clubs').doc(clubId).collection('announcements').doc(announcementId).update(updates);
  return { updated: Object.keys(updates) };
}

async function advanceAnnouncementActivity({ db, clubId, announcementId, reply }) {
  const ref = db.collection('clubs').doc(clubId).collection('announcements').doc(announcementId);
  const activity = reply.created_at || admin.firestore.Timestamp.now();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return { skipped: 'announcement_missing' };
    const current = snapshot.data() || {};
    const updates = {};
    if (current.deleted_at == null && current.visibility !== 'published') updates.visibility = 'published';
    if (asMillis(activity) > asMillis(current.last_activity_at)) updates.last_activity_at = activity;
    if (!Object.keys(updates).length) return { skipped: 'not_newer' };
    transaction.update(ref, updates);
    return { updated: Object.keys(updates) };
  });
}

const onAnnouncementWritten = onDocumentWritten(
  { document: 'clubs/{clubId}/announcements/{announcementId}', region: 'europe-west1' },
  async (event) => maintainAnnouncementFields({
    db: admin.firestore(), clubId: event.params.clubId, announcementId: event.params.announcementId,
    before: event.data.before.data() || {}, after: event.data.after.data() || {},
  }),
);

module.exports = { onAnnouncementWritten, maintainAnnouncementFields, advanceAnnouncementActivity, desiredAnnouncementFields, asMillis };
