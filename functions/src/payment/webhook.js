/**
 * Legacy Noda webhook.
 *
 * Noda callbacks previously wrote payment facts to `operation_participants`,
 * which is outside the canonical payment ledger. The endpoint remains
 * published for a graceful provider-side response, but deliberately performs
 * no accounting mutation. Any historical Noda payment needs manual review.
 */
const { onRequest } = require('firebase-functions/v2/https');

exports.nodaWebhook = onRequest(
  { region: 'europe-west1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    console.warn('Rejected legacy Noda webhook: canonical EPC/SEPA ledger is required');
    return res.status(410).send('Noda event payments are retired; use the EPC/SEPA ledger');
  },
);
