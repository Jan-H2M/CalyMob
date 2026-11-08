const admin = require('firebase-admin');

/** Never overwrite a payment or a cancellation that happened during delivery. */
async function markInstallmentQrSent(db, ref, installmentId, expectedAmount, messageId) {
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return false;
    const registration = snapshot.data();
    const state = String(registration.registration_status || '').toLowerCase();
    const payment = registration.installment_payments?.[installmentId];
    if (['canceled', 'cancelled', 'annulé', 'annule', 'waitlisted'].includes(state)
      || registration.paye === true || ['paid', 'waived'].includes(registration.payment_status)
      || !payment || ['paid', 'waived'].includes(payment.status)
      || payment.transaction_id || payment.transaction_matched === true
      || !Number.isFinite(Number(payment.amount_due))
      || Math.round(Number(payment.amount_due) * 100) !== Math.round(Number(expectedAmount) * 100)) return false;
    tx.update(ref, {
      [`installment_payments.${installmentId}.status`]: 'qr_sent',
      [`installment_payments.${installmentId}.qr_sent_at`]: admin.firestore.FieldValue.serverTimestamp(),
      [`installment_payments.${installmentId}.payment_email_id`]: messageId || null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
}

module.exports = { markInstallmentQrSent };
