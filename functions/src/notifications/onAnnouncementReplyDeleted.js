const admin = require('firebase-admin');
const { onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { recomputeAnnouncementAuthority } = require('./unreadTimestampAuthority');

const onAnnouncementReplyDeleted = onDocumentDeleted(
  {
    document: 'clubs/{clubId}/announcements/{announcementId}/replies/{replyId}',
    region: 'europe-west1',
    retry: true,
  },
  async event => {
    const announcementRef = admin.firestore()
      .collection('clubs')
      .doc(event.params.clubId)
      .collection('announcements')
      .doc(event.params.announcementId);
    return recomputeAnnouncementAuthority({
      db: admin.firestore(),
      announcementRef,
    });
  },
);

module.exports = {
  onAnnouncementReplyDeleted,
};
