/**
 * Audit trail voor betaalstatus van inschrijvingen.
 *
 * Triggert op elke write van een inschrijving
 * (clubs/{clubId}/operations/{operationId}/inscriptions/{inscriptionId}) en logt
 * — per tranche die van status of transactie wijzigt — een regel in
 * clubs/{clubId}/payment_audit. Zo zien we exact WAT een tranche op 'paid' (of
 * terug op 'unpaid') zette, met welke transactie en wanneer. Bedoeld om
 * over-afsluit-regressies meteen zichtbaar te maken en te bevestigen dat fixes
 * houden.
 *
 * Schrijft enkel naar payment_audit (andere collectie) → geen self-trigger.
 * Uses Firebase Functions v2 (Gen2).
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

exports.onInscriptionPaymentAudit = onDocumentWritten(
  {
    document: 'clubs/{clubId}/operations/{operationId}/inscriptions/{inscriptionId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, operationId, inscriptionId } = event.params;
    const beforeSnap = event.data && event.data.before;
    const afterSnap = event.data && event.data.after;
    const before = beforeSnap && beforeSnap.exists ? beforeSnap.data() : null;
    const after = afterSnap && afterSnap.exists ? afterSnap.data() : null;

    // Verwijdering: log één regel en stop.
    if (!after) {
      try {
        await admin.firestore().collection('clubs').doc(clubId).collection('payment_audit').add({
          operation_id: operationId,
          inscription_id: inscriptionId,
          event: 'inscription_deleted',
          person: before ? `${before.membre_prenom || ''} ${before.membre_nom || ''}`.trim() : '',
          at: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) { console.warn('[paymentAudit] delete-log faalde', e); }
      return null;
    }

    const bIp = (before && before.installment_payments) || {};
    const aIp = after.installment_payments || {};

    const changes = [];
    for (const [installmentId, av] of Object.entries(aIp)) {
      const bv = bIp[installmentId] || {};
      const bStatus = bv.status || (before ? 'unpaid' : '(nouveau)');
      const aStatus = av.status || 'unpaid';
      const bTx = bv.transaction_id || null;
      const aTx = av.transaction_id || null;
      const bDue = bv.amount_due ?? null;
      const aDue = av.amount_due ?? null;
      const bPaid = bv.amount_paid ?? null;
      const aPaid = av.amount_paid ?? null;
      if (bStatus !== aStatus || bTx !== aTx || bDue !== aDue || bPaid !== aPaid) {
        changes.push({
          installment_id: installmentId,
          from_status: bStatus,
          to_status: aStatus,
          amount_due_before: bDue,
          amount_due: aDue,
          amount_paid_before: bPaid,
          amount_paid: aPaid,
          transaction_id: aTx,
        });
      }
    }

    const payeBefore = before ? (before.paye ?? null) : null;
    const payeAfter = after.paye ?? null;
    const payeChanged = payeBefore !== payeAfter;

    if (changes.length === 0 && !payeChanged) return null;

    try {
      await admin.firestore().collection('clubs').doc(clubId).collection('payment_audit').add({
        operation_id: operationId,
        inscription_id: inscriptionId,
        person: `${after.membre_prenom || ''} ${after.membre_nom || ''}`.trim(),
        is_guest: after.is_guest ?? null,
        parent_inscription_id: after.parent_inscription_id ?? null,
        paye_before: payeBefore,
        paye_after: payeAfter,
        tranche_changes: changes,
        transaction_id: after.transaction_id ?? null,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`🧾 [paymentAudit] ${after.membre_prenom || ''} ${after.membre_nom || ''}: ${changes.length} tranche-wijziging(en), paye ${payeBefore}→${payeAfter}`);
    } catch (e) {
      console.warn('[paymentAudit] log faalde', e);
    }
    return null;
  }
);
