const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const {
  REGION,
  isMigrationBackfill,
} = require('./shared');
const { extractOgmFromRemittance } = require('../shared/ogm');
const {
  getPaymentReference,
  markOgmAsMatched,
} = require('../shared/ogmService');

const AMOUNT_TOLERANCE_CENTS = 1;
const MANUAL_REVIEW_QUEUE_COLLECTION = 'manual_review_queue';

function toCents(amount) {
  return Math.round(Number(amount || 0) * 100);
}

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

    const reference = await getPaymentReference(db, clubId, ogm);
    if (!reference) {
      console.log(`[markOrderPaidFromBankTx] Unknown OGM ${ogm} for ${clubId}/${txId}`);
      return null;
    }

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
    if (typeof reference.amount_cents === 'number') {
      const actualCents = toCents(txn.montant);
      if (Math.abs(reference.amount_cents - actualCents) > AMOUNT_TOLERANCE_CENTS) {
        console.warn(`[markOrderPaidFromBankTx] Amount mismatch for ${clubId}/${orderId}: expected=${reference.amount_cents} actual=${actualCents}`);
        await db.collection('clubs').doc(clubId)
          .collection(MANUAL_REVIEW_QUEUE_COLLECTION)
          .doc(`${txId}_${ogm}`)
          .set({
          reason: 'amount_mismatch',
          source: 'markOrderPaidFromBankTx',
          ogm,
          orderId,
          transactionId: txId,
          payment_reference_id: ogm,
          expected_amount_cents: reference.amount_cents,
          actual_amount_cents: actualCents,
          status: 'NEW',
          created_at: admin.firestore.Timestamp.now(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return null;
      }
    }

    const paymentReferenceRef = db.collection('clubs').doc(clubId).collection('payment_references').doc(ogm);
    const inventoryMutationsRef = db.collection('clubs').doc(clubId).collection('inventoryMutations');
    await db.runTransaction(async (transaction) => {
      const freshOrderSnap = await transaction.get(orderRef);
      const freshReferenceSnap = await transaction.get(paymentReferenceRef);
      if (!freshOrderSnap.exists) {
        return;
      }
      if (!freshReferenceSnap.exists) {
        return;
      }

      const freshReference = freshReferenceSnap.data();
      if (freshReference.status !== 'NEW') {
        return;
      }

      const freshOrder = freshOrderSnap.data();
      if (freshOrder.status === 'paid' || freshOrder?.payment?.status === 'paid') {
        return;
      }

      transaction.update(orderRef, {
        status: 'paid',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        'payment.status': 'paid',
        'payment.paidAt': admin.firestore.Timestamp.now(),
        'payment.bankRef': txId,
      });

      await markOgmAsMatched(db, clubId, ogm, txId, transaction);

      const items = Array.isArray(freshOrder.items) ? freshOrder.items : [];
      items.forEach((item) => {
        const qty = Number(item.qty || 0);
        if (qty <= 0) return;
        transaction.set(inventoryMutationsRef.doc(), {
          productId: item.productId || '',
          variantId: item.variantId || '',
          change: -qty,
          reason: 'sale',
          orderId,
          byUserId: freshOrder?.buyer?.userId || 'system',
          timestamp: admin.firestore.Timestamp.now(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    });

    // TODO Phase 3: queue receipt PDF generation for digital items.
    // TODO Phase 3: batch supplier notifications.
    // TODO Phase 3: send buyer confirmation push + email.

    console.log(`[markOrderPaidFromBankTx] Marked order ${clubId}/${orderId} paid from tx ${txId}`);
    return null;
  },
);
