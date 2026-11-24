const { HttpsError } = require('firebase-functions/v2/https');

function requireAuth(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise');
  return uid;
}

function validateClubId(value) {
  const clubId = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(clubId) || /^__.*__$/.test(clubId)) {
    throw new HttpsError('invalid-argument', 'clubId invalide');
  }
  return clubId;
}

module.exports = { requireAuth, validateClubId };
