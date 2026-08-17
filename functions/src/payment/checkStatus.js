/**
 * Legacy Noda event-payment status endpoint.
 *
 * The old implementation updated `operation_participants` directly. It is
 * intentionally fail-closed so an old client cannot create or settle a
 * payment outside the canonical payment ledger.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');

exports.checkNodaPaymentStatus = onCall(
  { region: 'europe-west1' },
  async () => {
    throw new HttpsError(
      'failed-precondition',
      'Noda is niet meer beschikbaar voor evenementbetalingen. Werk CalyMob bij en gebruik EPC/SEPA.',
    );
  },
);
