const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

function allowed(member) {
  return ['admin', 'superadmin'].includes(member?.app_role)
    || (Array.isArray(member?.clubStatuten)
      && member.clubStatuten.some((role) => ['O', 'organisateur', 'Organisateur'].includes(role)));
}

exports.recordInstallmentPayment = onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 30, maxInstances: 10 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentification requise');
    const { clubId, operationId, participantId, installmentId } = request.data || {};
    if (!clubId || !operationId || !participantId || !installmentId) {
      throw new HttpsError('invalid-argument', 'Paramètres de tranche invalides');
    }
    const db = admin.firestore();
    const clubRef = db.collection('clubs').doc(clubId);
    const [memberSnap, operationSnap] = await Promise.all([
      clubRef.collection('members').doc(request.auth.uid).get(),
      clubRef.collection('operations').doc(operationId).get(),
    ]);
    if (!memberSnap.exists || !allowed(memberSnap.data())) {
      throw new HttpsError('permission-denied', 'Seul un organisateur peut confirmer une tranche');
    }
    if (!operationSnap.exists) throw new HttpsError('not-found', 'Activité introuvable');
    const ref = operationSnap.ref.collection('inscriptions').doc(participantId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Inscription introuvable');
      const data = snap.data();
      const current = data.installment_payments?.[installmentId];
      if (!current) throw new HttpsError('not-found', 'Tranche introuvable');
      if (current.status === 'paid' || current.status === 'waived') return;
      const payments = data.installment_payments || {};
      const allClosed = Object.entries(payments).every(([id, payment]) =>
        id === installmentId || payment?.status === 'paid' || payment?.status === 'waived');
      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.update(ref, {
        [`installment_payments.${installmentId}.status`]: 'paid',
        [`installment_payments.${installmentId}.amount_paid`]: Number(current.amount_due || 0),
        [`installment_payments.${installmentId}.paid_at`]: now,
        ...(allClosed ? { paye: true, payment_status: 'paid', paye_method: 'epc_qr_onsite', paye_at: now, date_paiement: now } : {}),
        payment_source: 'on_site_qr',
        payment_confirmed_by: request.auth.uid,
        payment_confirmed_at: now,
        updated_at: now,
      });
    });
    return { success: true, participantId, installmentId };
  },
);
