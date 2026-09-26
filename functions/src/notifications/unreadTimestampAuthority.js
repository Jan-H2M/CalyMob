const admin = require('firebase-admin');

function timestampParts(value) {
  if (!value) return null;
  if (Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (typeof value.toMillis === 'function') {
    const millis = value.toMillis();
    return {
      seconds: Math.floor(millis / 1000),
      nanoseconds: (millis % 1000) * 1e6,
    };
  }
  return null;
}

function compareTimestamps(left, right) {
  const a = timestampParts(left);
  const b = timestampParts(right);
  if (!a || !b) throw new Error('A valid Firestore timestamp is required');
  if (a.seconds !== b.seconds) return a.seconds - b.seconds;
  return a.nanoseconds - b.nanoseconds;
}

function timestampToMillis(value) {
  const parts = timestampParts(value);
  if (!parts) return null;
  return parts.seconds * 1000 + Math.floor(parts.nanoseconds / 1e6);
}

function newestTimestamp(...values) {
  return values.filter(value => timestampParts(value)).reduce(
    (latest, value) => (!latest || compareTimestamps(value, latest) > 0 ? value : latest),
    null,
  );
}

function authoritativeCreateTime(snapshot, eventTime, timestampFromDate = date => admin.firestore.Timestamp.fromDate(date)) {
  if (timestampParts(snapshot?.createTime)) return snapshot.createTime;
  const fallback = eventTime ? new Date(eventTime) : null;
  if (!fallback || Number.isNaN(fallback.getTime())) {
    throw new Error('Missing server-authoritative document createTime');
  }
  console.warn('DocumentSnapshot.createTime unavailable; using CloudEvent time');
  return timestampFromDate(fallback);
}

async function stampUnreadCreatedAt({ snapshot, eventTime }) {
  const timestamp = authoritativeCreateTime(snapshot, eventTime);
  const data = snapshot.data() || {};
  const unreadMatches = timestampParts(data.unread_created_at)
    && compareTimestamps(data.unread_created_at, timestamp) === 0;
  const legacyMatches = timestampParts(data.created_at)
    && compareTimestamps(data.created_at, timestamp) === 0;
  if (!unreadMatches || !legacyMatches) {
    await snapshot.ref.update({
      unread_created_at: timestamp,
      // Legacy 1.22.4 continues to query created_at. Mirroring the trusted
      // value removes future/past device-clock poison without rejecting its
      // create request during the staged rollout.
      created_at: timestamp,
    });
  }
  return timestamp;
}

async function advanceAnnouncementAuthority({
  db,
  announcementRef,
  activityAt,
  isReply = false,
  activityRef,
}) {
  return db.runTransaction(async transaction => {
    const [snapshot, activitySnapshot] = await Promise.all([
      transaction.get(announcementRef),
      activityRef ? transaction.get(activityRef) : Promise.resolve(null),
    ]);
    if (!snapshot.exists) return { skipped: 'announcement_missing' };
    if (activityRef && !activitySnapshot.exists) {
      return { skipped: 'activity_missing' };
    }
    const data = snapshot.data() || {};
    const rootCreated = newestTimestamp(data.unread_created_at);
    const currentActivity = newestTimestamp(data.unread_activity_at, rootCreated);
    const nextActivity = newestTimestamp(currentActivity, activityAt);
    const updates = {};
    if (!timestampParts(data.unread_activity_at)
      || !currentActivity || compareTimestamps(nextActivity, currentActivity) > 0
      || !timestampParts(data.last_activity_at)) {
      updates.unread_activity_at = nextActivity;
      updates.last_activity_at = nextActivity;
    }
    if (isReply) {
      const currentReply = newestTimestamp(data.unread_last_reply_at);
      const nextReply = newestTimestamp(currentReply, activityAt);
      if (!timestampParts(data.unread_last_reply_at)
        || !currentReply || compareTimestamps(nextReply, currentReply) > 0
        || !timestampParts(data.last_reply_at)) {
        updates.unread_last_reply_at = nextReply;
        updates.last_reply_at = nextReply;
      }
    }
    if (data.deleted_at == null && data.visibility !== 'published') {
      updates.visibility = 'published';
    }
    if (!Object.keys(updates).length) return { skipped: 'not_newer' };
    transaction.update(announcementRef, updates);
    return { updated: Object.keys(updates) };
  });
}

async function stampAnnouncementCreated({ db, snapshot, eventTime }) {
  const createdAt = await stampUnreadCreatedAt({ snapshot, eventTime });
  await advanceAnnouncementAuthority({
    db,
    announcementRef: snapshot.ref,
    activityAt: createdAt,
  });
  return createdAt;
}

async function stampAnnouncementReplyCreated({
  db,
  snapshot,
  eventTime,
  announcementRef,
}) {
  const createdAt = await stampUnreadCreatedAt({ snapshot, eventTime });
  await advanceAnnouncementAuthority({
    db,
    announcementRef,
    activityAt: createdAt,
    isReply: true,
    activityRef: snapshot.ref,
  });
  return createdAt;
}

// Deleting the newest reply is the one legitimate case where visible thread
// activity may move backwards. Recompute from immutable Firestore createTime
// values in one transaction so out-of-order create/delete triggers cannot
// leave a cursor pointing at content that no longer exists.
async function recomputeAnnouncementAuthority({
  db,
  announcementRef,
  deleteField = () => admin.firestore.FieldValue.delete(),
}) {
  return db.runTransaction(async transaction => {
    const [announcement, replies] = await Promise.all([
      transaction.get(announcementRef),
      transaction.get(announcementRef.collection('replies')),
    ]);
    if (!announcement.exists) return { skipped: 'announcement_missing' };

    const rootCreated = authoritativeCreateTime(announcement);
    let latestReply = null;
    for (const reply of replies.docs) {
      const created = authoritativeCreateTime(reply);
      latestReply = newestTimestamp(latestReply, created);
    }
    const activity = newestTimestamp(rootCreated, latestReply);
    const updates = {
      unread_created_at: rootCreated,
      created_at: rootCreated,
      unread_activity_at: activity,
      last_activity_at: activity,
      unread_last_reply_at: latestReply || deleteField(),
      last_reply_at: latestReply || deleteField(),
    };
    transaction.update(announcementRef, updates);
    return {
      updated: Object.keys(updates),
      remainingReplies: replies.docs.length,
    };
  });
}

module.exports = {
  timestampParts,
  compareTimestamps,
  timestampToMillis,
  newestTimestamp,
  authoritativeCreateTime,
  stampUnreadCreatedAt,
  advanceAnnouncementAuthority,
  stampAnnouncementCreated,
  stampAnnouncementReplyCreated,
  recomputeAnnouncementAuthority,
};
