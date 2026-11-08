const { HttpsError } = require('firebase-functions/v2/https');

const closed = new Set(['paid', 'settled', 'waived', 'canceled', 'cancelled']);

/** Canonical open amount in cents; ambiguous banking states fail closed. */
function amountForRegistration(registration, installmentId) {
  const paymentStatus = String(registration.payment_status || '').trim().toLowerCase();
  if (registration.paye === true || registration.transaction_matched === true || ['paid', 'settled'].includes(paymentStatus)) return 0;
  if (paymentStatus === 'manual_review' || paymentStatus === 'pending_bank') {
    throw new HttpsError('failed-precondition', 'Ce paiement doit être vérifié avant de créer un QR.');
  }
  const installments = registration.installment_payments || {};
  const open = item => {
    if (!item || closed.has(item.status)) return 0;
    if (item.transaction_id || item.transaction_matched === true || Number(item.amount_paid || 0) > 0 || ['partial', 'manual_review', 'pending_bank'].includes(item.status)) throw new HttpsError('failed-precondition', 'Paiement en cours de vérification.');
    const amount = Number(item.amount_due);
    if (!Number.isFinite(amount) || amount < 0) throw new HttpsError('failed-precondition', 'Montant invalide.');
    return Math.round(amount * 100);
  };
  if (installmentId) {
    if (!installments[installmentId]) throw new HttpsError('failed-precondition', 'Tranche introuvable.');
    return open(installments[installmentId]);
  }
  if (Object.keys(installments).length) return Object.values(installments).reduce((sum, item) => sum + open(item), 0);
  if (closed.has(paymentStatus)) return 0;
  if (registration.transaction_id || Number(registration.amount_paid || 0) > 0 || paymentStatus === 'partial') throw new HttpsError('failed-precondition', 'Paiement en cours de vérification.');
  const amount = Number(registration.prix || 0) + Number(registration.supplement_total || 0);
  if (!Number.isFinite(amount) || amount < 0) throw new HttpsError('failed-precondition', 'Montant invalide.');
  return Math.round(amount * 100);
}

module.exports = { amountForRegistration };
