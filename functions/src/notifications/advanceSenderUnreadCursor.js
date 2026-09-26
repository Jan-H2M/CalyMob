const admin = require('firebase-admin');
const { cursorEnabledForMember } = require('./bootstrapUnreadCursor');
const {
  compareTimestamps,
  timestampParts,
  timestampToMillis,
} = require('./unreadTimestampAuthority');

const SCOPE_COLLECTION = Object.freeze({
  announcements: 'items',
  events: 'conversations',
  teams: 'channels',
  sessions: 'chats',
});

function validId(value) {
  return typeof value === 'string' && value.length > 0
    && value.length <= 500 && value !== '.' && value !== '..'
    && !value.includes('/');
}

/**
 * Monotonically mirrors a successfully-created sender message into the
 * sender's cursor. The exact Firestore createTime is supplied by the timestamp
 * authority helper, so a device clock can never consume a later message.
 *
 * OFF/shadow non-pilots are deliberately untouched. Enabled senders may
 * advance before bootstrap: the bootstrap transaction preserves newer scope
 * documents, which makes web/self-send acknowledgement durable across the
 * handover race.
 */
async function advanceSenderUnreadCursor({
  db,
  clubId,
  senderId,
  section,
  scopeId,
  visibleAt,
  serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp(),
}) {
  if (!validId(clubId) || !validId(senderId) || !validId(scopeId)
    || !SCOPE_COLLECTION[section]) {
    throw new Error('Invalid sender unread cursor target.');
  }
  if (!timestampParts(visibleAt)) {
    throw new Error('Authoritative sender unread timestamp is unavailable.');
  }

  const memberPath = `clubs/${clubId}/members/${senderId}`;
  const flagsRef = db.doc(`clubs/${clubId}/settings/feature_flags`);
  const cursorRef = db.doc(
    `${memberPath}/read_state/${section}/${SCOPE_COLLECTION[section]}/${scopeId}`,
  );

  return db.runTransaction(async transaction => {
    const [flags, cursor] = await Promise.all([
      transaction.get(flagsRef),
      transaction.get(cursorRef),
    ]);
    if (!cursorEnabledForMember(flags.data() || {}, senderId)) {
      return { status: 'not-enabled' };
    }
    const existing = cursor.data()?.last_seen_at;
    if (timestampParts(existing)
      && compareTimestamps(existing, visibleAt) >= 0) {
      return {
        status: 'already-seen',
        visibleThroughMs: timestampToMillis(existing),
      };
    }
    transaction.set(cursorRef, {
      last_seen_at: visibleAt,
      updated_at: serverTimestamp(),
    });
    return {
      status: 'acknowledged',
      visibleThroughMs: timestampToMillis(visibleAt),
    };
  });
}

/// Sender reconciliation is useful but must never sit in the recipient push
/// failure domain. The visible client screen can retry the same monotonic ack;
/// recipient delivery must continue exactly once when this best-effort mirror
/// encounters a transient flag/query/transaction failure.
async function advanceSenderUnreadCursorIsolated(
  args,
  advance = advanceSenderUnreadCursor,
) {
  try {
    return await advance(args);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'sender_unread_cursor_advance_failed',
      clubId: args.clubId,
      senderId: args.senderId,
      section: args.section,
      scopeId: args.scopeId,
      error: error.message,
    }));
    return { status: 'failed' };
  }
}

module.exports = {
  advanceSenderUnreadCursor,
  advanceSenderUnreadCursorIsolated,
  SCOPE_COLLECTION,
};
