/**
 * Cloud Function: createPontoPayment
 * Creates a payment request via Ponto Connect (Ibanity) for event registration
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { PontoClient } = require('../utils/ponto-client');

/**
 * Callable function to create a Ponto payment request
 *
 * @param {Object} data - Payment data
 * @param {string} data.clubId - Club ID
 * @param {string} data.operationId - Operation (event) ID
 * @param {string} data.participantId - Participant ID
 * @param {number} data.amount - Amount in EUR
 * @param {string} data.description - Payment description
 * @param {Object} context - Firebase authentication context
 * @returns {Promise<Object>} - { paymentId, paymentUrl, status }
 */
exports.createPontoPayment = functions.https.onCall(async (data, context) => {
  // 1. Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Vous devez être authentifié pour créer un paiement'
    );
  }

  const userId = context.auth.uid;
  const { clubId, operationId, participantId, amount, description } = data;

  // 2. Validate parameters
  if (!clubId || !operationId || !participantId || !amount || !description) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Paramètres manquants: clubId, operationId, participantId, amount, description requis'
    );
  }

  if (amount <= 0 || amount > 10000) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Le montant doit être entre 0 et 10000 euros'
    );
  }

  try {
    const db = admin.firestore();

    // 3. Verify participant exists and hasn't paid yet
    // Check both possible collection paths (inscriptions subcollection or operation_participants)
    let participantRef = db
      .collection('clubs')
      .doc(clubId)
      .collection('operations')
      .doc(operationId)
      .collection('inscriptions')
      .doc(participantId);

    let participantDoc = await participantRef.get();

    // Fallback to legacy collection if not found
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

    // Verify this is the user's own registration
    if (participantData.membre_id !== userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Vous ne pouvez pas payer pour une autre personne'
      );
    }

    if (participantData.paye === true) {
      throw new functions.https.HttpsError('already-exists', 'Paiement déjà effectué');
    }

    // 4. Create payment request via Ponto
    const pontoClient = new PontoClient();

    const pontoPaymentData = {
      amount: amount,
      description: description,
      reference: participantId,
      metadata: {
        clubId: clubId,
        operationId: operationId,
        participantId: participantId,
        userId: userId,
      },
    };

    console.log('📤 Creating Ponto payment request:', pontoPaymentData);

    const pontoResponse = await pontoClient.createPaymentRequest(pontoPaymentData);

    console.log('✅ Ponto payment request created:', pontoResponse.paymentId);

    // 5. Store payment ID in Firestore
    await participantRef.update({
      payment_id: pontoResponse.paymentId,
      payment_provider: 'ponto',
      payment_status: 'pending',
      payment_initiated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 6. Return info to client
    return {
      paymentId: pontoResponse.paymentId,
      paymentUrl: pontoResponse.paymentUrl,
      status: 'pending',
      provider: 'ponto',
    };
  } catch (error) {
    console.error('❌ Error createPontoPayment:', error);

    // Re-throw if already an HttpsError
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    // Create generic error
    throw new functions.https.HttpsError(
      'internal',
      `Erreur lors de la création du paiement: ${error.message}`
    );
  }
});
