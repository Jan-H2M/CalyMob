/**
 * Cloud Function: checkPontoPaymentStatus
 * Checks the status of a Ponto payment request
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { PontoClient } = require('../utils/ponto-client');

/**
 * Callable function to check Ponto payment status
 *
 * @param {Object} data - Request data
 * @param {string} data.clubId - Club ID
 * @param {string} data.operationId - Operation ID
 * @param {string} data.participantId - Participant ID
 * @param {string} data.paymentId - Ponto payment request ID
 * @param {Object} context - Firebase authentication context
 * @returns {Promise<Object>} - { paymentId, status, paye, updatedAt }
 */
exports.checkPontoPaymentStatus = functions.https.onCall(async (data, context) => {
  // 1. Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Vous devez être authentifié pour vérifier le statut'
    );
  }

  const { clubId, operationId, participantId, paymentId } = data;

  // 2. Validate parameters
  if (!clubId || !participantId || !paymentId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Paramètres manquants: clubId, participantId, paymentId requis'
    );
  }

  try {
    const db = admin.firestore();

    // 3. Get participant record
    // Check both possible collection paths
    let participantRef = db
      .collection('clubs')
      .doc(clubId)
      .collection('operations')
      .doc(operationId)
      .collection('inscriptions')
      .doc(participantId);

    let participantDoc = await participantRef.get();

    // Fallback to legacy collection
    if (!participantDoc.exists) {
      participantRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('operation_participants')
        .doc(participantId);

      participantDoc = await participantRef.get();
    }

    if (!participantDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Inscription non trouvée');
    }

    const participantData = participantDoc.data();

    // 4. If already paid, return cached status
    if (participantData.paye === true) {
      console.log('✅ Payment already confirmed (cached)');
      return {
        paymentId: paymentId,
        status: 'completed',
        paye: true,
        updatedAt: participantData.date_paiement?.toDate?.()?.toISOString() || new Date().toISOString(),
      };
    }

    // 5. Check status via Ponto API
    const pontoClient = new PontoClient();
    const pontoStatus = await pontoClient.getPaymentRequestStatus(paymentId);

    console.log('📊 Ponto status:', pontoStatus);

    // 6. Update Firestore if status changed
    const updates = {
      payment_status: pontoStatus.status,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (pontoStatus.paye) {
      updates.paye = true;
      updates.date_paiement = admin.firestore.FieldValue.serverTimestamp();
      console.log('✅ Payment confirmed, updating Firestore');
    }

    await participantRef.update(updates);

    // 7. Log status check
    await db.collection('payment_logs').add({
      provider: 'ponto',
      payment_id: paymentId,
      club_id: clubId,
      operation_id: operationId,
      participant_id: participantId,
      status: pontoStatus.status,
      paye: pontoStatus.paye,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      paymentId: paymentId,
      status: pontoStatus.status,
      paye: pontoStatus.paye,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ Error checkPontoPaymentStatus:', error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      `Erreur lors de la vérification du statut: ${error.message}`
    );
  }
});
