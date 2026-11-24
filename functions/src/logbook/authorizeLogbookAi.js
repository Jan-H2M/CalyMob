const { HttpsError } = require('firebase-functions/v2/https');
const { isActiveMember } = require('../utils/memberStatus');

const DAILY_LIMIT = 30;

async function authorizeLogbookAi(db, clubId, uid, now = new Date()) {
  // Both AI entry points share the same club/user counter for a UTC day.
  const day = now.toISOString().slice(0, 10);
  const club = db.collection('clubs').doc(clubId);
  const memberRef = club.collection('members').doc(uid);
  const usageRef = club.collection('ai_usage').doc(`${day}_${uid}`);

  await db.runTransaction(async (tx) => {
    const member = await tx.get(memberRef);
    if (!member.exists || !isActiveMember(member.data())) {
      throw new HttpsError('permission-denied', 'Membre actif requis');
    }
    const usage = await tx.get(usageRef);
    const count = usage.exists ? usage.get('count') : 0;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new HttpsError('failed-precondition', 'Compteur d’analyses invalide');
    }
    if (count >= DAILY_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Limite quotidienne d’analyses du carnet atteinte');
    }
    tx.set(usageRef, { count: count + 1 });
  });
}

module.exports = { authorizeLogbookAi };
