const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { requireAuth, validateClubId } = require('../utils/clubCallableInput');

const SIGNED_URL_LIFETIME_MS = 10 * 60 * 1000;

function documentId(value, field) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)
    || /^__.*__$/.test(value)) {
    throw new HttpsError('invalid-argument', `${field} invalide`);
  }
  return value;
}

const options = {
  region: 'europe-west1',
  serviceAccount: 'calymob-medical-url@calycompta.iam.gserviceaccount.com',
};

exports.getMedicalCertificateUrl = onCall(options, async (request) => {
  const uid = requireAuth(request);
  const { clubId, memberId, certificateId } = request.data || {};
  const club = admin.firestore().collection('clubs').doc(validateClubId(clubId));
  const ownerId = documentId(memberId, 'memberId');
  const certId = documentId(certificateId, 'certificateId');

  if (uid !== ownerId) {
    // Match the CalyCompta Firestore certificate reviewer rule. The token role
    // applies only to its own club and app_role takes precedence over role.
    const token = request.auth.token || {};
    const claimedRole = Object.hasOwn(token, 'app_role') ? token.app_role : token.role;
    const isClubAdmin = token.clubId === club.id && claimedRole === 'admin';
    if (!isClubAdmin) {
      const actor = await club.collection('members').doc(uid).get();
      if (!actor.exists || actor.get('app_role') !== 'admin') {
        throw new HttpsError('permission-denied', 'Accès au certificat refusé');
      }
    }
  }

  const cert = await club.collection('members').doc(ownerId)
    .collection('medical_certificates').doc(certId).get();
  if (!cert.exists) throw new HttpsError('not-found', 'Certificat introuvable');

  // Members can create their own certificate documents. A stored path is
  // untrusted and may refer only to a file in this member's certificate folder.
  const path = cert.get('document_path');
  if (path == null || path === '') {
    throw new HttpsError('failed-precondition', 'Chemin du certificat indisponible');
  }
  const prefix = `clubs/${club.id}/members/${ownerId}/medical_certificates/`;
  const fileName = typeof path === 'string' && path.startsWith(prefix)
    ? path.slice(prefix.length)
    : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/.test(fileName)) {
    throw new HttpsError('failed-precondition', 'Chemin du certificat invalide');
  }

  try {
    const [url] = await admin.storage().bucket().file(path).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + SIGNED_URL_LIFETIME_MS,
    });
    return { url };
  } catch (err) {
    console.error('Medical certificate URL signing failed', { code: err.code });
    throw new HttpsError('internal', 'Impossible d’ouvrir le certificat');
  }
});
