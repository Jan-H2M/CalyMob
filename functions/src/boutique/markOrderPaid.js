const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const {
  REGION,
  extractOgmFromRemittance,
  isMigrationBackfill,
} = require('./shared');

function resolveTransactionCommunication(txn) {
  const candidates = [
    txn.communication,
    txn.remittanceInformation,
    txn.remittance_information,
    txn.libelle,
    txn.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

exports.markOrderPaidFromBankTx = onDocumentWritten(
  {
    document: 'clubs/{clubId}/bank_transactions/{txId}',
    region: REGION,
  },
  async (event) => {
    const afterSnap = event.data.after;
    if (!afterSnap || !afterSnap.exists) {
      return null;
    }

    const txn = afterSnap.data();
    if (isMigrationBackfill(txn)) {
      console.log(`[markOrderPaidFromBankTx] Skip backfill ${event.params.clubId}/${event.params.txId}`);
      return null;
    }

    const db = admin.firestore();
    const { clubId, txId } = event.params;
    const communication = resolveTransactionCommunication(txn);
    const { ogm } = extractOgmFromRemittance(communication);

    if (!ogm) {
      console.log(`[markOrderPaidFromBankTx] No OGM found in ${clubId}/${txId}`);
      return null;
    }

    const paymentReferenceRef = db.collection('clubs').doc(clubId)
      .collection('payment_references').doc(ogm);
    const paymentReferenceSnap = await paymentReferenceRef.get();

    if (!paymentReferenceSnap.exists) {
      console.log(`[markOrderPaidFromBankTx] Unknown OGM ${ogm} for ${clubId}/${txId}`);
      return null;
    }

    const reference = paymentReferenceSnap.data();
    if (reference.context_type !== 'BOUTIQUE_ORDER' || reference.status !== 'NEW') {
      console.log(
        `[markOrderPaidFromBankTx] Skip ${ogm}: context=${reference.context_type} status=${reference.status}`,
      );
      return null;
    }

    const orderId = reference.context_id;
    if (!orderId) {
      console.warn(`[markOrderPaidFromBankTx] Missing context_id on payment reference ${clubId}/${ogm}`);
      return null;
    }

    const orderRef = db.collection('clubs').doc(clubId).collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      console.warn(`[markOrderPaidFromBankTx] Missing order ${clubId}/${orderId} for ${ogm}`);
      return null;
    }

    const batch = db.batch();
    batch.update(orderRef, {
      status: 'paid',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      'payment.status': 'paid',
      'payment.paidAt': admin.firestore.FieldValue.serverTimestamp(),
      'payment.bankRef': txId,
    });
    batch.update(paymentReferenceRef, {
      status: 'MATCHED',
      matched_transaction_id: txId,
      matched_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // TODO Phase 3: flip inventory reservation mutation status instead of only logging.
    // TODO Phase 3: queue receipt PDF generation for digital items.
    // TODO Phase 3: batch supplier notifications.
    // TODO Phase 3: send buyer confirmation push + email.
    await batch.commit();

    console.log(`[markOrderPaidFromBankTx] Marked order ${clubId}/${orderId} paid from tx ${txId}`);
    return null;
  },
);
