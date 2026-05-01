/**
 * Cloud Function: Live refresh of payment_reminder draft when an inscription
 * is created, updated, or deleted.
 *
 * Trigger: any write to `clubs/{clubId}/operations/{operationId}/inscriptions/{inscriptionId}`.
 *
 * For the parent operation, recomputes the `payment_reminder` field based on
 * the current state of the inscriptions subcollection — but only if the
 * operation is within the reminder window (date_debut in [today, today+3d]).
 *
 * Skips work when:
 *   - The change can't possibly affect the unpaid set (paye field unchanged
 *     and no add/remove)
 *   - The reminder is already 'sent' (we don't overwrite history)
 *   - The operation is outside the reminder window
 *
 * Effect: the banner in CalyCompta updates live (within seconds) as members
 * pay or sign up. Combined with the daily backstop in `eventPaymentReminder`
 * and the send-time validation in `sendPaymentReminder`, this gives 3-layer
 * freshness for the payment reminder system.
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { recomputePaymentReminderDraft } = require('../payment/paymentReminderHelpers');

exports.onInscriptionPaymentChange = onDocumentWritten(
  {
    document: 'clubs/{clubId}/operations/{operationId}/inscriptions/{inscriptionId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, operationId, inscriptionId } = event.params;

    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    // Detect whether this change can possibly affect the unpaid set.
    // - Create / delete → always relevant
    // - Update → only if `paye` or `payment_status` actually changed
    let relevant = false;
    if (!beforeData && afterData) relevant = true; // created
    else if (beforeData && !afterData) relevant = true; // deleted
    else if (beforeData && afterData) {
      relevant = beforeData.paye !== afterData.paye
        || beforeData.payment_status !== afterData.payment_status
        || beforeData.membre_id !== afterData.membre_id;
    }

    if (!relevant) {
      console.log(
        `[onInscriptionPaymentChange] ${clubId}/${operationId}/${inscriptionId}: no relevant change, skipping`,
      );
      return;
    }

    try {
      const db = admin.firestore();
      const operationRef = db.collection('clubs').doc(clubId)
        .collection('operations').doc(operationId);
      const operationSnap = await operationRef.get();

      if (!operationSnap.exists) {
        console.warn(
          `[onInscriptionPaymentChange] Operation ${clubId}/${operationId} not found`,
        );
        return;
      }

      const result = await recomputePaymentReminderDraft(
        db, clubId, operationRef, operationSnap.data(),
      );

      console.log(
        `[onInscriptionPaymentChange] ${clubId}/${operationId} → ${result.reason}` +
        (result.qrCount !== undefined
          ? ` (${result.qrCount} QR, ${result.surPlaceCount} sur place)`
          : ''),
      );
    } catch (error) {
      console.error(
        `[onInscriptionPaymentChange] Failed for ${clubId}/${operationId}/${inscriptionId}:`,
        error,
      );
      // Don't throw — failing here would put the trigger in retry loop.
    }
  },
);
