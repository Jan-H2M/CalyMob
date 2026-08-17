const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

function isAdmin(member) {
  return ['admin', 'superadmin'].includes(member?.app_role);
}

function isOrganizer(member) {
  const roles = Array.isArray(member?.clubStatuten) ? member.clubStatuten : [];
  return roles.some((role) => ['O', 'organisateur', 'Organisateur'].includes(role));
}

exports.recordOnSitePayment = onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 30, maxInstances: 10 },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }
    const { clubId, operationId, participantId } = request.data || {};
    if (!clubId || !operationId || !participantId) {
      throw new HttpsError('invalid-argument', 'clubId, operationId et participantId sont requis');
    }

    const db = admin.firestore();
    const clubRef = db.collection('clubs').doc(clubId);
    const [callerSnap, operationSnap] = await Promise.all([
      clubRef.collection('members').doc(request.auth.uid).get(),
      clubRef.collection('operations').doc(operationId).get(),
    ]);
    const caller = callerSnap.exists ? callerSnap.data() : null;
    if (!caller || (!isAdmin(caller) && !isOrganizer(caller))) {
      throw new HttpsError('permission-denied', 'Seul un organisateur autorisé peut confirmer un paiement sur place');
    }
    if (!operationSnap.exists) throw new HttpsError('not-found', 'Activité introuvable');

    const inscriptionRef = operationSnap.ref.collection('inscriptions').doc(participantId);
    const now = admin.firestore.Timestamp.now();
    await db.runTransaction(async (transaction) => {
      const inscriptionSnap = await transaction.get(inscriptionRef);
      if (!inscriptionSnap.exists) throw new HttpsError('not-found', 'Inscription introuvable');
      const inscription = inscriptionSnap.data();
      if (inscription.registration_status === 'canceled') {
        throw new HttpsError('failed-precondition', 'Une inscription annulée ne peut pas être payée');
      }
      if (inscription.paye === true) return;
      const installmentPayments = inscription.installment_payments || {};
      const openDue = Object.keys(installmentPayments).length > 0
        ? Object.values(installmentPayments).reduce((sum, payment) => (
          payment?.status === 'paid' || payment?.status === 'waived'
            ? sum
            : sum + Number(payment?.amount_due || 0)
        ), 0)
        : Number(inscription.prix || 0) + Number(inscription.supplement_total || 0);
      if (openDue <= 0) throw new HttpsError('failed-precondition', 'Aucun openstaand bedrag gevonden');
      transaction.update(inscriptionRef, {
        paye: true,
        payment_status: 'paid',
        payment_source: 'on_site_qr',
        paye_method: 'epc_qr_onsite',
        transaction_matched: false,
        payment_confirmed_by: request.auth.uid,
        payment_confirmed_at: now,
        date_paiement: now,
        updated_at: now,
      });
    });

    return { success: true, participantId, settlementState: 'paid_pending_bank' };
  },
);
