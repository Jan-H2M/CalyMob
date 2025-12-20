/**
 * Cloud Function: mollieWebhook (Gen2)
 * Recoit les notifications de Mollie sur les changements de statut de paiement
 *
 * Important: Mollie envoie seulement { id: "tr_xxx" } dans le webhook.
 * On doit recuperer les details complets via l'API.
 * On retourne toujours 200 OK pour eviter les retries inutiles.
 *
 * Security: Mollie webhooks are verified by fetching payment details from the API.
 * Only valid payment IDs that exist in your Mollie account will return data.
 * This is the recommended verification method by Mollie.
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { MollieClient } = require('../utils/mollie-client');

/**
 * Webhook pour recevoir les notifications Mollie
 *
 * Endpoint: POST /mollieWebhook
 * Body: { id: "tr_xxx" }
 */
exports.mollieWebhook = onRequest(
  {
    region: 'europe-west1',
    // Use Firebase Admin SDK service account for Firestore access
    serviceAccount: `firebase-adminsdk-fbsvc@${process.env.GCLOUD_PROJECT}.iam.gserviceaccount.com`,
    // Load Mollie API key from Firebase Secrets
    secrets: ['MOLLIE_API_KEY'],
  },
  async (req, res) => {
    // 1. Verifier que c'est une requete POST
    if (req.method !== 'POST') {
      console.warn('Webhook appele avec methode incorrecte:', req.method);
      return res.status(405).send('Method Not Allowed');
    }

    try {
      // 2. Extraire l'ID du paiement Mollie
      const { id: molliePaymentId } = req.body;

      console.log('Webhook Mollie recu pour payment:', molliePaymentId);

      if (!molliePaymentId) {
        console.error('ID paiement manquant dans le webhook');
        // Retourner 200 pour eviter les retries
        return res.status(200).send('Missing payment ID');
      }

      // 3. Recuperer les details du paiement via l'API Mollie
      // This also serves as webhook verification - only valid Mollie payments will return data
      const apiKey = process.env.MOLLIE_API_KEY;
      if (!apiKey) {
        console.error('MOLLIE_API_KEY environment variable not configured');
        return res.status(500).send('Server configuration error');
      }
      const mollieClient = new MollieClient(apiKey);

      let paymentData;
      try {
        paymentData = await mollieClient.getPaymentStatus(molliePaymentId);
      } catch (apiError) {
        console.error('Erreur API Mollie:', apiError.message);
        // Retourner 200 pour eviter les retries - on logguera l'erreur
        return res.status(200).send('API error logged');
      }

      console.log('Paiement Mollie recupere:', {
        id: paymentData.id,
        status: paymentData.status,
        method: paymentData.method,
        amount: paymentData.amount?.value,
        metadata: paymentData.metadata
      });

      // 4. Extraire les metadonnees
      const metadata = paymentData.metadata || {};
      const {
        internalPaymentId,
        clubId,
        operationId,
        participantId,
        userId
      } = metadata;

      if (!clubId || !operationId || !participantId) {
        console.error('Metadata incompletes dans le paiement Mollie');
        // Log l'erreur mais retourner 200
        return res.status(200).send('Missing metadata');
      }

      const db = admin.firestore();

      // 5. Recuperer l'inscription
      // Inscriptions are stored in: clubs/{clubId}/operations/{operationId}/inscriptions/{participantId}
      const participantRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(operationId)
        .collection('inscriptions')
        .doc(participantId);

      const participantDoc = await participantRef.get();

      if (!participantDoc.exists) {
        console.error('Inscription non trouvee:', participantId);
        // Retourner 200 pour eviter les retries
        return res.status(200).send('Participant not found');
      }

      // 6. Mettre a jour selon le statut Mollie
      const status = paymentData.status;
      console.log(`Mise a jour statut paiement Mollie: ${status}`);

      const updates = {
        payment_status: status,
        mollie_payment_id: molliePaymentId,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Update payment method if available
      if (paymentData.method) {
        updates.payment_method = paymentData.method;
      }

      // Mollie status: open, pending, paid, failed, canceled, expired
      if (status === 'paid') {
        // Paiement reussi
        updates.paye = true;
        updates.date_paiement = paymentData.paidAt
          ? new Date(paymentData.paidAt)
          : admin.firestore.FieldValue.serverTimestamp();
        console.log('Paiement Mollie confirme pour:', participantId);
      } else if (['failed', 'canceled', 'expired'].includes(status)) {
        // Paiement echoue
        updates.paye = false;
        updates.date_paiement = null;
        console.log('Paiement Mollie echoue/annule pour:', participantId, 'status:', status);
      }
      // Pour 'open' et 'pending', on ne change pas paye

      await participantRef.update(updates);

      // 7. Log pour audit
      await db.collection('payment_logs').add({
        payment_id: internalPaymentId || molliePaymentId,
        mollie_payment_id: molliePaymentId,
        provider: 'mollie',
        club_id: clubId,
        operation_id: operationId,
        participant_id: participantId,
        user_id: userId,
        status: status,
        method: paymentData.method || null,
        amount: paymentData.amount?.value,
        currency: paymentData.amount?.currency || 'EUR',
        paid_at: paymentData.paidAt || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        raw_payload: paymentData,
      });

      console.log('Webhook Mollie traite avec succes');
      return res.status(200).send('Webhook processed');
    } catch (error) {
      console.error('Erreur webhook Mollie:', error);
      // Toujours retourner 200 pour eviter les retries de Mollie
      return res.status(200).send('Error logged');
    }
  }
);
