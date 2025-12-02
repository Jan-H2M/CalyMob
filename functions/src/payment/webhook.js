/**
 * Cloud Function: nodaWebhook (Gen2)
 * Reçoit les notifications de Noda sur les changements de statut de paiement
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

/**
 * Webhook pour recevoir les notifications Noda
 *
 * Endpoint: POST /nodaWebhook
 * Body: { payment_id, status, metadata, signature, timestamp }
 */
exports.nodaWebhook = onRequest(
  {
    region: 'europe-west1',
  },
  async (req, res) => {
    // 1. Vérifier que c'est une requête POST
    if (req.method !== 'POST') {
      console.warn('Webhook appelé avec méthode incorrecte:', req.method);
      return res.status(405).send('Method Not Allowed');
    }

    try {
      const payload = req.body;
      console.log('Webhook Noda reçu:', JSON.stringify(payload, null, 2));

      // 2. Vérifier la signature (sécurité) - optionnel en sandbox
      const signature = req.headers['x-noda-signature'] || req.body.signature;
      const webhookSecret = process.env.NODA_WEBHOOK_SECRET;

      if (webhookSecret && signature) {
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(JSON.stringify(req.body))
          .digest('hex');

        if (signature !== expectedSignature) {
          console.error('Signature webhook invalide');
          return res.status(401).send('Invalid signature');
        }
      }

      // 3. Extraire les données
      const {
        payment_id: paymentId,
        status,
        metadata,
        amount,
        currency,
      } = payload;

      if (!paymentId || !status || !metadata) {
        console.error('Données webhook incomplètes');
        return res.status(400).send('Missing required fields');
      }

      const { clubId, operationId, participantId, userId } = metadata;

      if (!clubId || !operationId || !participantId) {
        console.error('Metadata incomplètes');
        return res.status(400).send('Missing metadata');
      }

      const db = admin.firestore();

      // 4. Récupérer l'inscription
      const participantRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('operation_participants')
        .doc(participantId);

      const participantDoc = await participantRef.get();

      if (!participantDoc.exists) {
        console.error('Inscription non trouvée:', participantId);
        return res.status(404).send('Participant not found');
      }

      // 5. Mettre à jour selon le statut
      console.log(`Mise à jour statut paiement: ${status}`);

      const updates = {
        payment_status: status,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (status === 'completed' || status === 'succeeded') {
        // Paiement réussi
        updates.paye = true;
        updates.date_paiement = admin.firestore.FieldValue.serverTimestamp();
        console.log('Paiement confirmé pour:', participantId);
      } else if (status === 'failed' || status === 'cancelled' || status === 'expired') {
        // Paiement échoué
        updates.paye = false;
        updates.date_paiement = null;
        console.log('Paiement échoué/annulé pour:', participantId);
      }

      await participantRef.update(updates);

      // 6. Log pour audit
      await db.collection('payment_logs').add({
        payment_id: paymentId,
        club_id: clubId,
        operation_id: operationId,
        participant_id: participantId,
        user_id: userId,
        status: status,
        amount: amount,
        currency: currency,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        raw_payload: payload,
      });

      console.log('Webhook traité avec succès');
      return res.status(200).send('Webhook processed');
    } catch (error) {
      console.error('Erreur webhook:', error);
      return res.status(500).send('Internal server error');
    }
  }
);
