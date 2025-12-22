/**
 * Cloud Function: pontoWebhook
 * Receives webhook notifications from Ponto Connect about payment status changes
 *
 * Note: Ponto uses a different webhook format than traditional payment providers.
 * Payment status is typically checked via polling rather than webhooks for payment requests.
 * This webhook can be used for other Ponto events if needed.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

/**
 * Webhook endpoint for Ponto notifications
 *
 * Endpoint: POST /pontoWebhook
 */
exports.pontoWebhook = functions.https.onRequest(async (req, res) => {
  // 1. Verify request method
  if (req.method !== 'POST') {
    console.warn('⚠️ Webhook called with incorrect method:', req.method);
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const payload = req.body;
    console.log('📥 Ponto webhook received:', JSON.stringify(payload, null, 2));

    // 2. Verify signature if webhook secret is configured
    const signature = req.headers['ibanity-signature'] || req.headers['x-ibanity-signature'];
    const webhookSecret = process.env.PONTO_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      // Ibanity uses RS256 signatures - for now we'll log and continue
      // Full signature verification would require the Ibanity public key
      console.log('🔐 Signature present, verification skipped in sandbox');
    }

    // 3. Extract event data
    // Ponto webhooks follow JSON:API format
    const eventData = payload.data;
    if (!eventData) {
      console.error('❌ No event data in webhook payload');
      return res.status(400).send('Missing event data');
    }

    const eventType = eventData.type;
    const eventAttributes = eventData.attributes || {};

    console.log(`🔔 Ponto event type: ${eventType}`);

    // 4. Handle different event types
    const db = admin.firestore();

    switch (eventType) {
      case 'paymentRequest.closed':
        await handlePaymentRequestClosed(db, eventAttributes);
        break;

      case 'synchronization.succeededWithoutChange':
      case 'synchronization.succeeded':
        // Account sync events - log but no action needed
        console.log('ℹ️ Sync event received, no action needed');
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${eventType}`);
    }

    // 5. Log for audit
    await db.collection('payment_logs').add({
      provider: 'ponto',
      event_type: eventType,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      raw_payload: payload,
    });

    console.log('✅ Webhook processed successfully');
    return res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(500).send('Internal server error');
  }
});

/**
 * Handle payment request closed event
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {Object} attributes - Event attributes
 */
async function handlePaymentRequestClosed(db, attributes) {
  const paymentRequestId = attributes.paymentRequestId;

  if (!paymentRequestId) {
    console.warn('⚠️ No paymentRequestId in event');
    return;
  }

  console.log(`🔄 Payment request closed: ${paymentRequestId}`);

  // Find the participant with this payment ID
  // We need to search across clubs - this is a limitation
  // In production, you'd want to include metadata in the payment request
  // that gets returned in the webhook

  // For now, log the event - status will be updated via polling
  console.log('ℹ️ Payment closure logged, status will be updated via polling');
}
