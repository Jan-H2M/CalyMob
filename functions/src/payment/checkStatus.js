/**
 * Cloud Function: checkNodaPaymentStatus (Gen2)
 * Vérifie le statut d'un paiement Noda (polling manuel)
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { NodaClient } = require('../utils/noda-client');

/**
 * Fonction callable pour vérifier le statut d'un paiement
 *
 * @param {Object} request.data - Données de la requête
 * @param {string} request.data.clubId - ID du club
 * @param {string} request.data.participantId - ID du participant
 * @returns {Promise<Object>} - { paymentId, status, paye, updatedAt }
 */
exports.checkNodaPaymentStatus = onCall(
  {
    region: 'europe-west1',
  },
  async (request) => {
    // 1. Vérifier l'authentification
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez être authentifié pour vérifier un paiement'
      );
    }

    const userId = request.auth.uid;
    const { clubId, participantId } = request.data;

    // 2. Valider les paramètres
    if (!clubId || !participantId) {
      throw new HttpsError(
        'invalid-argument',
        'Paramètres manquants: clubId, participantId requis'
      );
    }

    try {
      const db = admin.firestore();

      // 3. Récupérer l'inscription
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
          'Vous ne pouvez consulter que vos propres paiements'
        );
      }

      // 4. Vérifier qu'il y a un paiement en cours
      const paymentId = participantData.payment_id;

      if (!paymentId) {
        throw new HttpsError(
          'failed-precondition',
          'Aucun paiement associé à cette inscription'
        );
      }

      // 5. Si déjà payé, retourner le statut actuel sans appeler Noda
      if (participantData.paye === true) {
        console.log('Paiement déjà confirmé:', paymentId);
        return {
          paymentId: paymentId,
          status: 'completed',
          paye: true,
          updatedAt: participantData.updated_at?.toDate().toISOString() || null,
        };
      }

      // 6. Appeler l'API Noda pour vérifier le statut
      console.log('Vérification statut Noda:', paymentId);

      const apiKey = process.env.NODA_API_KEY;
      if (!apiKey) {
        throw new HttpsError('failed-precondition', 'Noda API key not configured');
      }
      const nodaClient = new NodaClient(apiKey);
      const paymentStatus = await nodaClient.getPaymentStatus(paymentId);

      console.log('Statut Noda reçu:', paymentStatus.status);

      // 7. Mettre à jour Firestore si le statut a changé
      const currentStatus = participantData.payment_status;
      const newStatus = paymentStatus.status;

      if (currentStatus !== newStatus) {
        console.log(`Mise à jour statut: ${currentStatus} → ${newStatus}`);

        const updates = {
          payment_status: newStatus,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (newStatus === 'completed' || newStatus === 'succeeded') {
          updates.paye = true;
          updates.date_paiement = admin.firestore.FieldValue.serverTimestamp();
        } else if (newStatus === 'failed' || newStatus === 'cancelled' || newStatus === 'expired') {
          updates.paye = false;
          updates.date_paiement = null;
        }

        await participantRef.update(updates);
      }

      // 8. Retourner le statut au client
      return {
        paymentId: paymentId,
        status: newStatus,
        paye: newStatus === 'completed' || newStatus === 'succeeded',
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Erreur checkNodaPaymentStatus:', error);

      // Si c'est déjà une HttpsError, la relancer
      if (error instanceof HttpsError) {
        throw error;
      }

      // Sinon, créer une erreur générique
      throw new HttpsError(
        'internal',
        `Erreur lors de la vérification du paiement: ${error.message}`
      );
    }
  }
);
