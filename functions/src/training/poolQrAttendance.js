'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { Timestamp, Filter } = require('firebase-admin/firestore');
const { isActiveMember } = require('../utils/memberStatus');
const scannerRoles = ['admin', 'administrateur', 'ca', 'accueil', 'encadrant', 'encadrants',
  'encadrant carrière', 'piscine', 'encadrant piscine', 'encadrants et assistants',
  'president', 'président', 'secretaire', 'secrétaire', 'tresorier', 'trésorier', 'board', 'comite', 'comité'];
function mayScan(member) {
  if (!isActiveMember(member)) return false;
  if (['admin', 'superadmin'].includes(member.app_role)) return true;
  const roles = Array.isArray(member.clubStatuten) && member.clubStatuten.length
    ? member.clubStatuten : [member.fonctionDefaut];
  return roles.some(role => scannerRoles.includes(String(role || '').trim().toLowerCase()));
}
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

// Only the authorized scanner can create this receipt. Ordinary members cannot
// manufacture attendance; historic unverified records remain monitor-correctable.
async function executeQrAttendance(db, uid, data, now = Date.now()) {
  const { clubId, sessionId, memberId } = data || {};
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  if (![clubId, sessionId, memberId].every(validId))
    throw new HttpsError('invalid-argument', 'Séance et membre requis.');
  const club = db.collection('clubs').doc(clubId);
  const sessionRef = club.collection('piscine_sessions').doc(sessionId);
  const attendees = sessionRef.collection('attendees');
  return db.runTransaction(async tx => {
    const scanner = await tx.get(club.collection('members').doc(uid));
    if (!scanner.exists || !mayScan(scanner.data()))
      throw new HttpsError('permission-denied', 'Fonction scanner autorisée requise.');
    const session = await tx.get(sessionRef);
    const date = session.exists && session.data().date;
    if (session.data()?.type === 'theorie' || !date?.toMillis ||
        !Number.isFinite(date.toMillis()) || Math.abs(date.toMillis() - now) > 36 * 60 * 60 * 1000)
      throw new HttpsError('failed-precondition', 'Scan uniquement pour une séance piscine actuelle.');
    const member = await tx.get(club.collection('members').doc(memberId));
    if (!member.exists) throw new HttpsError('not-found', 'Membre introuvable.');
    const duplicate = await tx.get(attendees.where(Filter.or(
      Filter.where('memberId', '==', memberId), Filter.where('membre_id', '==', memberId))));
    const canonical = await tx.get(attendees.doc(memberId));
    if (canonical.exists || !duplicate.empty)
      throw new HttpsError('already-exists', 'Ce membre est déjà marqué présent.');
    const scan = Timestamp.fromMillis(now);
    const receipt = { version: 1, scannerUid: uid, memberId, sessionId, scannedAt: scan };
    tx.set(sessionRef.collection('qr_scan_receipts').doc(memberId), receipt);
    tx.create(attendees.doc(memberId), { memberId,
      memberName: [member.data().prenom, member.data().nom].filter(Boolean).join(' ') || memberId,
      scannedAt: scan, scannedBy: uid, isGuest: false,
      qrVerified: receipt });
    return { registered: true };
  });
}
exports.recordPoolQrAttendance = onCall({ region: 'europe-west1' }, request =>
  executeQrAttendance(admin.firestore(), request.auth?.uid, request.data));
exports.executeQrAttendance = executeQrAttendance;
exports.mayScan = mayScan;
