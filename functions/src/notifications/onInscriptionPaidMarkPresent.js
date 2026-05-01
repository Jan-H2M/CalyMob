/**
 * Cloud Function: Auto-mark a member as "present" on an event when their
 * inscription becomes paid — limited to dive events (event_category === 'plongee').
 *
 * Trigger: any write to `clubs/{clubId}/operations/{operationId}/inscriptions/{inscriptionId}`.
 *
 * Rules:
 *   - Only fires when `paye` flips from falsy → true (or new doc created with paye=true).
 *   - Only fires for operations of type 'evenement' and event_category 'plongee'.
 *   - Idempotent: skips when `present === true` already, which also prevents
 *     a recursion loop (the write below re-fires this trigger; the second run
 *     sees paye unchanged → skip at step 1).
 *   - Refunds (paye flipping back to false) are intentionally NOT acted on —
 *     an admin keeps full control over reverting attendance manually.
 *
 * Side effect: writes to the same inscription doc:
 *   present: true
 *   present_at: serverTimestamp()
 *   present_by: 'system-auto-payment'
 *   present_by_name: 'Paiement confirmé (auto)'
 *
 * Errors are logged but never re-thrown — re-throwing would put this trigger
 * into an automatic retry loop.
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

exports.onInscriptionPaidMarkPresent = onDocumentWritten(
  {
    document: 'clubs/{clubId}/operations/{operationId}/inscriptions/{inscriptionId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, operationId, inscriptionId } = event.params;

    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    // Deletions: nothing to do.
    if (!afterData) return;

    // Did `paye` just flip from falsy → true?
    const wasPaid = beforeData?.paye === true;
    const isPaid = afterData.paye === true;
    if (!isPaid || wasPaid) {
      return; // not a new "just paid" transition
    }

    // Already marked present? Skip (idempotent + recursion guard).
    if (afterData.present === true) {
      return;
    }

    try {
      const db = admin.firestore();
      const operationRef = db
        .collection('clubs').doc(clubId)
        .collection('operations').doc(operationId);
      const operationSnap = await operationRef.get();

      if (!operationSnap.exists) {
        console.warn(
          `[onInscriptionPaidMarkPresent] Operation ${clubId}/${operationId} not found`,
        );
        return;
      }

      const operationData = operationSnap.data() || {};
      const opType = operationData.type;
      const opCategory = operationData.event_category;

      // Only dive events qualify for auto-presence.
      if (opType !== 'evenement' || opCategory !== 'plongee') {
        console.log(
          `[onInscriptionPaidMarkPresent] ${clubId}/${operationId}/${inscriptionId}: ` +
          `skip (type=${opType}, event_category=${opCategory})`,
        );
        return;
      }

      const inscriptionRef = operationRef
        .collection('inscriptions').doc(inscriptionId);

      await inscriptionRef.update({
        present: true,
        present_at: admin.firestore.FieldValue.serverTimestamp(),
        present_by: 'system-auto-payment',
        present_by_name: 'Paiement confirmé (auto)',
      });

      console.log(
        `[onInscriptionPaidMarkPresent] ${clubId}/${operationId}/${inscriptionId}: ` +
        `marked present (paid dive event)`,
      );
    } catch (error) {
      console.error(
        `[onInscriptionPaidMarkPresent] Failed for ${clubId}/${operationId}/${inscriptionId}:`,
        error,
      );
      // Do NOT re-throw — would trigger automatic retries.
    }
  },
);
