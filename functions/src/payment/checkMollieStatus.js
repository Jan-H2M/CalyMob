/**
 * Cloud Function: checkMolliePaymentStatus (Gen2)
 * Verifie le statut d'un paiement Mollie (polling manuel)
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { MollieClient } = require('../utils/mollie-client');

// Test API key for sandbox mode
const MOLLIE_TEST_API_KEY = 'test_KmcCG7eVBTuJMrEUrfCS5FcMtJAa5V';

/**
 * Fonction callable pour verifier le statut d'un paiement Mollie
 *
 * @param {Object} request.data - Donnees de la requete
 * @param {string} request.data.clubId - ID du club
 * @param {string} request.data.participantId - ID du participant
 * @returns {Promise<Object>} - { paymentId, molliePaymentId, status, paye, method, updatedAt }
 */
exports.checkMolliePaymentStatus = onCall(
  {
    region: 'europe-west1',
  },
  async (request) => {
    // 1. Verifier l'authentification
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez etre authentifie pour verifier un paiement'
      );
    }

    const userId = request.auth.uid;
    const { clubId, participantId } = request.data;

    // 2. Valider les parametres
    if (!clubId || !participantId) {
      throw new HttpsError(
        'invalid-argument',
        'Parametres manquants: clubId, participantId requis'
      );
    }

    try {
      const db = admin.firestore();

      // 3. Recuperer l'inscription
      const participantRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('operation_participants')
        .doc(participantId);

      const participantDoc = await participantRef.get();

      if (!participantDoc.exists) {
        throw new HttpsError('not-found', 'Inscription non trouvee');
      }

      const participantData = participantDoc.data();

      // Verifier que c'est bien l'inscription de l'utilisateur
      if (participantData.membre_id !== userId) {
        throw new HttpsError(
          'permission-denied',
          'Vous ne pouvez consulter que vos propres paiements'
        );
      }

      // 4. Verifier qu'il y a un paiement Mollie en cours
      const molliePaymentId = participantData.mollie_payment_id;

      if (!molliePaymentId) {
        throw new HttpsError(
          'failed-precondition',
          'Aucun paiement Mollie associe a cette inscription'
        );
      }

      // 5. Si deja paye, retourner le statut actuel sans appeler Mollie
      if (participantData.paye === true) {
        console.log('Paiement deja confirme:', molliePaymentId);
        return {
          paymentId: participantData.payment_id,
          molliePaymentId: molliePaymentId,
          status: 'paid',
          paye: true,
          method: participantData.payment_method || null,
          updatedAt: participantData.updated_at?.toDate().toISOString() || null,
          provider: 'mollie'
        };
      }

      // 6. Appeler l'API Mollie pour verifier le statut
      console.log('Verification statut Mollie:', molliePaymentId);

      const apiKey = process.env.MOLLIE_API_KEY || MOLLIE_TEST_API_KEY;
      const mollieClient = new MollieClient(apiKey);
      const paymentStatus = await mollieClient.getPaymentStatus(molliePaymentId);

      console.log('Statut Mollie recu:', paymentStatus.status);

      // 7. Mettre a jour Firestore si le statut a change
      const currentStatus = participantData.payment_status;
      const newStatus = paymentStatus.status;

      if (currentStatus !== newStatus) {
        console.log(`Mise a jour statut: ${currentStatus} -> ${newStatus}`);

        const updates = {
          payment_status: newStatus,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Mollie status: open, pending, paid, failed, canceled, expired
        if (newStatus === 'paid') {
          updates.paye = true;
          updates.date_paiement = paymentStatus.paidAt
            ? new Date(paymentStatus.paidAt)
            : admin.firestore.FieldValue.serverTimestamp();
        } else if (['failed', 'canceled', 'expired'].includes(newStatus)) {
          updates.paye = false;
          updates.date_paiement = null;
        }

        // Update payment method if known
        if (paymentStatus.method) {
          updates.payment_method = paymentStatus.method;
        }

        await participantRef.update(updates);
      }

      // 8. Retourner le statut au client
      return {
        paymentId: participantData.payment_id,
        molliePaymentId: molliePaymentId,
        status: newStatus,
        paye: newStatus === 'paid',
        method: paymentStatus.method || participantData.payment_method || null,
        updatedAt: new Date().toISOString(),
        provider: 'mollie'
      };
    } catch (error) {
      console.error('Erreur checkMolliePaymentStatus:', error);

      // Si c'est deja une HttpsError, la relancer
      if (error instanceof HttpsError) {
        throw error;
      }

      // Sinon, creer une erreur generique
      throw new HttpsError(
        'internal',
        `Erreur lors de la verification du paiement: ${error.message}`
      );
    }
  }
);
