const admin = require('firebase-admin');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const {
  stampAnnouncementCreated,
  stampAnnouncementReplyCreated,
  stampUnreadCreatedAt,
} = require('./unreadTimestampAuthority');
const { advanceSenderUnreadCursor } = require('./advanceSenderUnreadCursor');
const { readStateSessionScopeId } = require('./canonicalUnreadBadge');

const OPTIONS = Object.freeze({ region: 'europe-west1', retry: true });

async function reconcileUnreadTimestampCreate({
  db,
  snapshot,
  eventTime,
  kind,
  announcementRef,
  senderCursor,
  advanceSender = advanceSenderUnreadCursor,
}) {
  if (!snapshot?.exists) return { skipped: 'missing' };
  let authoritative;
  if (kind === 'announcement') {
    authoritative = await stampAnnouncementCreated({ db, snapshot, eventTime });
  } else if (kind === 'announcement_reply') {
    authoritative = await stampAnnouncementReplyCreated({
      db,
      snapshot,
      eventTime,
      announcementRef,
    });
  } else {
    authoritative = await stampUnreadCreatedAt({ snapshot, eventTime });
  }
  const senderId = snapshot.data()?.sender_id;
  if (senderId && senderCursor) {
    await advanceSender({
      db,
      clubId: senderCursor.clubId,
      senderId,
      section: senderCursor.section,
      scopeId: senderCursor.scopeId,
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
      senderCursor: senderCursorFactory?.(event),
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
  event => {
    const message = event.data.data() || {};
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
