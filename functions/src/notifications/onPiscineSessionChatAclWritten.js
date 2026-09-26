const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { sessionChatAcl, sameSessionChatAcl } = require('./sessionChatAccess');
const { isFirestoreNotFound } = require('./firestoreErrors');

async function maintainSessionChatAcl(snapshot, db = snapshot?.ref?.firestore) {
  if (!snapshot?.ref) return { skipped: 'missing' };
  if (!snapshot.exists) return { skipped: 'deleted' };
  if (!db?.runTransaction) {
    throw new Error('Firestore transaction support is required');
  }
  try {
    return await db.runTransaction(async transaction => {
      // Eventarc retries retain the old after snapshot. Reading inside a
      // transaction makes every attempt derive and write the ACL for the
      // current session document instead.
      const current = await transaction.get(snapshot.ref);
      if (!current.exists) return { skipped: 'deleted' };
      const data = current.data() || {};
      const next = sessionChatAcl(data);
      if (sameSessionChatAcl(data.chat_acl, next)) {
        return { skipped: 'unchanged' };
      }
      transaction.update(snapshot.ref, { chat_acl: next });
      return { updated: true, chatAcl: next };
    });
  } catch (error) {
    // A delete racing the transaction is terminal for this write event. A
    // re-created session produces its own event and will reconcile itself.
    if (isFirestoreNotFound(error)) return { skipped: 'deleted' };
    throw error;
  }
}

const onPiscineSessionChatAclWritten = onDocumentWritten(
  {
    document: 'clubs/{clubId}/piscine_sessions/{sessionId}',
    region: 'europe-west1',
    retry: true,
  },
  async event => maintainSessionChatAcl(event.data?.after),
);

module.exports = {
  maintainSessionChatAcl,
  onPiscineSessionChatAclWritten,
};
