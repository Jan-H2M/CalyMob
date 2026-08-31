const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertPaymentMethod, assertActive, positiveAmount } = require('./paymentConfirmationPolicy');

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
    if (!clubId || !operationId || !participantId || typeof installmentId !== 'string'
      || !installmentId || /[.\/[\]`*]/.test(installmentId)) {
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
      const liveMember = await tx.get(clubRef.collection('members').doc(request.auth.uid));
      const liveOperation = await tx.get(operationSnap.ref);
      if (!liveMember.exists || !allowed(liveMember.data())) {
        throw new HttpsError('permission-denied', 'Autorisation de paiement retirée');
      }
      if (!liveOperation.exists) throw new HttpsError('not-found', 'Activité introuvable');
      assertPaymentMethod(liveOperation.data(), 'on_site');
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Inscription introuvable');
      const data = snap.data();
      assertActive(data);
      const current = data.installment_payments?.[installmentId];
      if (!current) throw new HttpsError('not-found', 'Tranche introuvable');
      if (current.status === 'paid' || current.status === 'waived' || current.transaction_id) return;
      if (data.paye === true || ['paid', 'waived'].includes(data.payment_status)
        || data.transaction_id || data.transaction_matched === true) {
        throw new HttpsError('failed-precondition', 'Le paiement global est déjà clôturé');
      }
      const amount = positiveAmount(current.amount_due);
      const payments = data.installment_payments || {};
      const allClosed = Object.entries(payments).every(([id, payment]) =>
        id === installmentId || payment?.status === 'paid' || payment?.status === 'waived');
      const now = admin.firestore.Timestamp.now();
      tx.update(ref, {
        [`installment_payments.${installmentId}.status`]: 'paid',
        [`installment_payments.${installmentId}.amount_paid`]: amount,
        [`installment_payments.${installmentId}.paid_at`]: now,
        [`installment_payments.${installmentId}.payment_source`]: 'on_site_qr',
        [`installment_payments.${installmentId}.payment_confirmed_by`]: request.auth.uid,
        [`installment_payments.${installmentId}.payment_confirmed_at`]: now,
        ...(allClosed ? { paye: true, payment_status: 'paid', paye_method: 'epc_qr_onsite', paye_at: now, date_paiement: now } : {}),
        payment_source: 'on_site_qr',
        transaction_matched: false,
        payment_confirmed_by: request.auth.uid,
        payment_confirmed_at: now,
        updated_at: now,
      });
    });
    return { success: true, participantId, installmentId };
  },
);
