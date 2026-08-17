/**
 * Legacy Noda event-payment endpoint.
 *
 * Noda used the retired `operation_participants` model and could therefore
 * bypass the canonical payment ledger. Keep the exported function name so
 * stale clients fail closed with a useful error instead of mutating legacy
 * accounting data. New event payments use the EPC/SEPA intent flow.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');

exports.createNodaPayment = onCall(
  { region: 'europe-west1' },
  async () => {
    throw new HttpsError(
      'failed-precondition',
      'Noda is niet meer beschikbaar voor evenementbetalingen. Werk CalyMob bij en gebruik EPC/SEPA.',
    );
  },
);
