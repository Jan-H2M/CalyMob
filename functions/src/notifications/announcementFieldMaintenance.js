const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { advanceAnnouncementAuthority } = require('./unreadTimestampAuthority');

function asMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return value instanceof Date ? value.getTime() : 0;
}

function desiredAnnouncementFields(before = {}, after = {}) {
  const deleted = after.deleted_at != null;
  const desired = { visibility: deleted ? 'deleted' : 'published' };
  const changed = Object.entries(desired).some(([key, value]) => {
    return after[key] !== value;
  });
  return changed ? desired : null;
}

async function maintainAnnouncementFields({ db, clubId, announcementId, before, after }) {
  if (!after) return { skipped: 'announcement_deleted' };
  const updates = desiredAnnouncementFields(before, after);
  if (!updates) return { skipped: 'already_normalized' };
  await db.collection('clubs').doc(clubId).collection('announcements').doc(announcementId).update(updates);
  return { updated: Object.keys(updates) };
}

async function advanceAnnouncementActivity({ db, clubId, announcementId, reply }) {
  const ref = db.collection('clubs').doc(clubId).collection('announcements').doc(announcementId);
  const activity = reply.unread_created_at;
  if (!activity) throw new Error('Server-authoritative reply timestamp required');
  return advanceAnnouncementAuthority({
    db,
    announcementRef: ref,
    activityAt: activity,
    isReply: true,
  });
}

const onAnnouncementWritten = onDocumentWritten(
  { document: 'clubs/{clubId}/announcements/{announcementId}', region: 'europe-west1' },
  async (event) => maintainAnnouncementFields({
    db: admin.firestore(), clubId: event.params.clubId, announcementId: event.params.announcementId,
    before: event.data.before.data() || {}, after: event.data.after.exists ? event.data.after.data() || {} : null,
  }),
);

module.exports = { onAnnouncementWritten, maintainAnnouncementFields, advanceAnnouncementActivity, desiredAnnouncementFields, asMillis };
