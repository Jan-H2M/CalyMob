const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { sessionChatAcl, sameSessionChatAcl } = require('./sessionChatAccess');

const REGION = 'europe-west1';

function validId(value) {
  return typeof value === 'string' && value.length > 0
    && value.length <= 500 && value !== '.' && value !== '..'
    && !value.includes('/');
}

async function ensurePiscineSessionChatAclCore({ db, uid, clubId, sessionId }) {
  if (!validId(uid)) {
    throw new HttpsError('unauthenticated', 'Authentification requise.');
  }
  if (!validId(clubId) || !validId(sessionId)) {
    throw new HttpsError('invalid-argument', 'Séance invalide.');
  }
  const memberRef = db.doc(`clubs/${clubId}/members/${uid}`);
  const sessionRef = db.doc(`clubs/${clubId}/piscine_sessions/${sessionId}`);
  return db.runTransaction(async transaction => {
    const [member, session] = await Promise.all([
      transaction.get(memberRef),
      transaction.get(sessionRef),
    ]);
    if (!member.exists) {
      throw new HttpsError('permission-denied', 'Membre du club requis.');
    }
    if (!session.exists) {
      throw new HttpsError('not-found', 'Séance introuvable.');
    }
    const data = session.data() || {};
    const expected = sessionChatAcl(data);
    if (sameSessionChatAcl(data.chat_acl, expected)) {
      return { status: 'ready' };
    }
    transaction.update(sessionRef, { chat_acl: expected });
    return { status: 'repaired' };
  });
}

const ensurePiscineSessionChatAcl = onCall(
  { region: REGION },
  async request => ensurePiscineSessionChatAclCore({
    db: admin.firestore(),
    uid: request.auth?.uid,
    clubId: request.data?.clubId,
    sessionId: request.data?.sessionId,
  }),
);

module.exports = {
  ensurePiscineSessionChatAcl,
  ensurePiscineSessionChatAclCore,
};
