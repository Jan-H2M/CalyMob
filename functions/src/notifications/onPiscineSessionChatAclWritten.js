const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { sessionChatAcl, sameSessionChatAcl } = require('./sessionChatAccess');

async function maintainSessionChatAcl(snapshot) {
  if (!snapshot?.exists) return { skipped: 'deleted' };
  const data = snapshot.data() || {};
  const next = sessionChatAcl(data);
  if (sameSessionChatAcl(data.chat_acl, next)) {
    return { skipped: 'unchanged' };
  }
  await snapshot.ref.update({ chat_acl: next });
  return { updated: true, chatAcl: next };
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
