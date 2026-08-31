const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertPaymentMethod, assertActive } = require('./paymentConfirmationPolicy');

function isAdmin(member) {
  return ['admin', 'superadmin'].includes(member?.app_role);
}

function isOrganizer(member) {
  const roles = Array.isArray(member?.clubStatuten) ? member.clubStatuten : [];
  return roles.some((role) => ['O', 'organisateur', 'Organisateur'].includes(role));
}

/**
 * Records a payment communication event. It deliberately does not allow a
 * QR/email action to downgrade a settled payment; settlement remains owned by
 * the payment ledger. See docs/PAYMENT_LEDGER_ARCHITECTURE.md.
 */
exports.recordPaymentCommunication = onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 30, maxInstances: 10 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentification requise');
    const { clubId, operationId, participantId, status } = request.data || {};
    if (!clubId || !operationId || !participantId || !['qr_email_sent', 'qr_on_site'].includes(status)) {
      throw new HttpsError('invalid-argument', 'Paramètres de communication invalides');
    }

    const db = admin.firestore();
    const clubRef = db.collection('clubs').doc(clubId);
    const [callerSnap, operationSnap] = await Promise.all([
      clubRef.collection('members').doc(request.auth.uid).get(),
      clubRef.collection('operations').doc(operationId).get(),
    ]);
    const caller = callerSnap.exists ? callerSnap.data() : null;
    if (!operationSnap.exists) throw new HttpsError('not-found', 'Activité introuvable');

    const inscriptionRef = operationSnap.ref.collection('inscriptions').doc(participantId);
    const inscriptionForAuth = await inscriptionRef.get();
    const isOwner = inscriptionForAuth.exists
      && inscriptionForAuth.get('membre_id') === request.auth.uid;
    if (!caller || (!isAdmin(caller) && !isOrganizer(caller) && !isOwner)) {
      throw new HttpsError('permission-denied', 'Vous ne pouvez pas modifier ce statut');
    }
    await db.runTransaction(async (transaction) => {
      const liveCaller = await transaction.get(clubRef.collection('members').doc(request.auth.uid));
      const liveOperation = await transaction.get(operationSnap.ref);
      const snap = await transaction.get(inscriptionRef);
      if (!snap.exists) throw new HttpsError('not-found', 'Inscription introuvable');
      const current = snap.data();
      if (!liveCaller.exists || (!isAdmin(liveCaller.data()) && !isOrganizer(liveCaller.data())
        && current.membre_id !== request.auth.uid)) {
        throw new HttpsError('permission-denied', 'Vous ne pouvez pas modifier ce statut');
      }
      if (!liveOperation.exists) throw new HttpsError('not-found', 'Activité introuvable');
      assertPaymentMethod(liveOperation.data(), status === 'qr_email_sent' ? 'qr_email' : 'on_site');
      assertActive(current);
      const update = {
        payment_communication_status: status,
        payment_communication_status_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };
      // Keep the legacy UI field in sync only while the inscription is unpaid.
      // A paid/settled record must remain paid forever.
      if (current.paye !== true && !['paid', 'waived'].includes(current.payment_status)
        && !current.transaction_id && current.transaction_matched !== true) {
        update.payment_status = status;
        update.payment_status_at = admin.firestore.FieldValue.serverTimestamp();
      }
      transaction.update(inscriptionRef, update);
    });
    return { success: true, participantId, status };
  },
);
