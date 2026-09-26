const admin = require('firebase-admin');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const {
  stampAnnouncementCreated,
  stampAnnouncementReplyCreated,
  stampUnreadCreatedAt,
} = require('./unreadTimestampAuthority');
const { advanceSenderUnreadCursor } = require('./advanceSenderUnreadCursor');
const { readStateSessionScopeId } = require('./canonicalUnreadBadge');
const { isFirestoreNotFound } = require('./firestoreErrors');

const OPTIONS = Object.freeze({ region: 'europe-west1', retry: true });

async function reconcileUnreadTimestampCreate({
  db,
  snapshot,
  eventTime,
  kind,
  announcementRef,
  senderCursor,
  senderCursorFactory,
  advanceSender = advanceSenderUnreadCursor,
}) {
  if (!snapshot?.exists) return { skipped: 'missing' };
  let currentSnapshot;
  let authoritative;
  try {
    // A create event snapshot remains "existing" on every Eventarc retry even
    // when the document has since been deleted or replaced. Always reconcile
    // the current document so a late retry cannot write stale state.
    currentSnapshot = await snapshot.ref.get();
    if (!currentSnapshot?.exists) return { skipped: 'deleted' };

    if (kind === 'announcement') {
      authoritative = await stampAnnouncementCreated({
        db,
        snapshot: currentSnapshot,
        eventTime,
      });
    } else if (kind === 'announcement_reply') {
      authoritative = await stampAnnouncementReplyCreated({
        db,
        snapshot: currentSnapshot,
        eventTime,
        announcementRef,
      });
    } else {
      authoritative = await stampUnreadCreatedAt({
        snapshot: currentSnapshot,
        eventTime,
      });
    }
  } catch (error) {
    // Deletion between the current read and update is a terminal outcome for
    // this create event, not a transient failure to retry for seven days.
    if (isFirestoreNotFound(error)) return { skipped: 'deleted' };
    throw error;
  }

  const senderId = currentSnapshot.data()?.sender_id;
  const currentSenderCursor = senderCursorFactory?.(currentSnapshot)
    || senderCursor;
  if (senderId && currentSenderCursor) {
    await advanceSender({
      db,
      clubId: currentSenderCursor.clubId,
      senderId,
      section: currentSenderCursor.section,
      scopeId: currentSenderCursor.scopeId,
      visibleAt: authoritative,
    });
  }
  return { status: 'reconciled' };
}

function createTrigger(document, kind, parentFactory, senderCursorFactory) {
  return onDocumentCreated(
    { ...OPTIONS, document },
    async event => reconcileUnreadTimestampCreate({
      db: admin.firestore(),
      snapshot: event.data,
      eventTime: event.time,
      kind,
      announcementRef: parentFactory?.(event),
      senderCursorFactory: senderCursorFactory
        ? snapshot => senderCursorFactory(event, snapshot)
        : null,
    }),
  );
}

const onAnnouncementUnreadTimestampCreated = createTrigger(
  'clubs/{clubId}/announcements/{announcementId}',
  'announcement',
  null,
  event => ({
    clubId: event.params.clubId,
    section: 'announcements',
    scopeId: event.params.announcementId,
  }),
);
const onAnnouncementReplyUnreadTimestampCreated = createTrigger(
  'clubs/{clubId}/announcements/{announcementId}/replies/{replyId}',
  'announcement_reply',
  event => admin.firestore()
    .doc(`clubs/${event.params.clubId}/announcements/${event.params.announcementId}`),
  event => ({
    clubId: event.params.clubId,
    section: 'announcements',
    scopeId: event.params.announcementId,
  }),
);
const onEventMessageUnreadTimestampCreated = createTrigger(
  'clubs/{clubId}/operations/{operationId}/messages/{messageId}',
  'message',
  null,
  event => ({
    clubId: event.params.clubId,
    section: 'events',
    scopeId: event.params.operationId,
  }),
);
const onTeamMessageUnreadTimestampCreated = createTrigger(
  'clubs/{clubId}/team_channels/{channelId}/messages/{messageId}',
  'message',
  null,
  event => ({
    clubId: event.params.clubId,
    section: 'teams',
    scopeId: event.params.channelId,
  }),
);
const onSessionMessageUnreadTimestampCreated = createTrigger(
  'clubs/{clubId}/piscine_sessions/{sessionId}/messages/{messageId}',
  'message',
  null,
  (event, snapshot) => {
    const message = snapshot.data() || {};
    return {
      clubId: event.params.clubId,
      section: 'sessions',
      scopeId: readStateSessionScopeId(
        event.params.sessionId,
        message.group_type,
        message.group_level,
      ),
    };
  },
);

module.exports = {
  reconcileUnreadTimestampCreate,
  onAnnouncementUnreadTimestampCreated,
  onAnnouncementReplyUnreadTimestampCreated,
  onEventMessageUnreadTimestampCreated,
  onTeamMessageUnreadTimestampCreated,
  onSessionMessageUnreadTimestampCreated,
};
