const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { buildMemberDirectoryProjection } = require('./syncMemberProjections');

const FUNCTION_REGION = 'europe-west1';

function validClubId(value) {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= 100 &&
    !value.includes('/');
}

async function updateBirthdaySharingHandler(request, { db = admin.firestore() } = {}) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentification requise.');
  }

  const clubId = request.data?.clubId;
  const requestedMemberId = request.data?.memberId;
  const shareBirthday = request.data?.shareBirthday;
  if (!validClubId(clubId) || typeof shareBirthday !== 'boolean') {
    throw new HttpsError(
      'invalid-argument',
      'clubId et shareBirthday sont requis.',
    );
  }
  if (requestedMemberId != null && requestedMemberId !== uid) {
    throw new HttpsError(
      'permission-denied',
      'Vous ne pouvez modifier que votre propre préférence.',
    );
  }

  const clubRef = db.collection('clubs').doc(clubId.trim());
  const memberRef = clubRef.collection('members').doc(uid);
  const directoryRef = clubRef.collection('member_directory').doc(uid);

  return db.runTransaction(async transaction => {
    const memberSnap = await transaction.get(memberRef);
    if (!memberSnap.exists) {
      throw new HttpsError('not-found', 'Profil membre introuvable.');
    }

    const memberData = memberSnap.data() || {};
    const nextMemberData = {
      ...memberData,
      share_birthday: shareBirthday,
    };
    const directoryProjection = buildMemberDirectoryProjection(nextMemberData);

    transaction.update(memberRef, {
      share_birthday: shareBirthday,
      updated_at: FieldValue.serverTimestamp(),
    });
    // Replace the public projection in the same transaction. In particular,
    // an opt-out cannot leave a stale true/missing flag with old birthday
    // parts visible while the asynchronous projector is catching up.
    transaction.set(directoryRef, directoryProjection);

    return {
      shareBirthday,
      birthMonth: directoryProjection.birth_month,
      birthDay: directoryProjection.birth_day,
    };
  });
}

const updateBirthdaySharing = onCall(
  { region: FUNCTION_REGION },
  request => updateBirthdaySharingHandler(request),
);

module.exports = {
  updateBirthdaySharing,
  updateBirthdaySharingHandler,
  validClubId,
};
