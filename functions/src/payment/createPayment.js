/**
 * Cloud Function: createNodaPayment (Gen2)
 * Crée un paiement Noda pour une inscription à un événement
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { NodaClient } = require('../utils/noda-client');

/**
 * Fonction callable pour créer un paiement Noda
 *
 * @param {Object} request.data - Données du paiement
 * @param {string} request.data.clubId - ID du club
 * @param {string} request.data.operationId - ID de l'opération (événement)
 * @param {string} request.data.participantId - ID du participant
 * @param {number} request.data.amount - Montant en euros
 * @param {string} request.data.description - Description du paiement
 * @returns {Promise<Object>} - { paymentId, paymentUrl, status, expiresAt }
 */
exports.createNodaPayment = onCall(
  {
    region: 'europe-west1',
  },
  async (request) => {
    // 1. Vérifier l'authentification
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez être authentifié pour créer un paiement'
      );
    }

    const userId = request.auth.uid;
    const { clubId, operationId, participantId, amount, description } = request.data;

    // 2. Valider les paramètres
    if (!clubId || !operationId || !participantId || !amount || !description) {
      throw new HttpsError(
        'invalid-argument',
        'Paramètres manquants: clubId, operationId, participantId, amount, description requis'
      );
    }

    if (amount <= 0 || amount > 10000) {
      throw new HttpsError(
        'invalid-argument',
        'Le montant doit être entre 0 et 10000 euros'
      );
    }

    try {
      const db = admin.firestore();

      // 3. Vérifier que le participant existe et n'a pas déjà payé
      const participantRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('operation_participants')
        .doc(participantId);

      const participantDoc = await participantRef.get();

      if (!participantDoc.exists) {
        throw new HttpsError('not-found', 'Inscription non trouvée');
      }

      const participantData = participantDoc.data();

      // Vérifier que c'est bien l'inscription de l'utilisateur
      if (participantData.membre_id !== userId) {
        throw new HttpsError(
          'permission-denied',
          'Vous ne pouvez pas payer pour une autre personne'
        );
      }

      if (participantData.paye === true) {
        throw new HttpsError('already-exists', 'Paiement déjà effectué');
      }

      // 4. Créer le paiement chez Noda
      const apiKey = process.env.NODA_API_KEY;
      if (!apiKey) {
        throw new HttpsError('failed-precondition', 'Noda API key not configured');
      }
      const nodaClient = new NodaClient(apiKey);

      // URL de webhook pour recevoir les notifications
      const webhookUrl = `https://europe-west1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/nodaWebhook`;

      const nodaPaymentData = {
        amount: amount,
        currency: 'EUR',
        description: description,
        reference: `${clubId}_${operationId}_${participantId}`,
        webhook_url: webhookUrl,
        metadata: {
          clubId: clubId,
          operationId: operationId,
          participantId: participantId,
          userId: userId,
        },
      };

      console.log('Création paiement Noda:', nodaPaymentData);

      const nodaResponse = await nodaClient.createPayment(nodaPaymentData);

      console.log('Paiement Noda créé:', nodaResponse.payment_id);

      // 5. Enregistrer l'ID de paiement dans Firestore
      await participantRef.update({
        payment_id: nodaResponse.payment_id,
        payment_status: 'pending',
        payment_initiated_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 6. Retourner les infos au client
      return {
        paymentId: nodaResponse.payment_id,
        paymentUrl: nodaResponse.payment_url,
        status: 'pending',
        expiresAt: nodaResponse.expires_at || null,
      };
    } catch (error) {
      console.error('Erreur createNodaPayment:', error);

      // Si c'est déjà une HttpsError, la relancer
      if (error instanceof HttpsError) {
        throw error;
      }

      // Sinon, créer une erreur générique
      throw new HttpsError(
        'internal',
        `Erreur lors de la création du paiement: ${error.message}`
      );
    }
  }
);
