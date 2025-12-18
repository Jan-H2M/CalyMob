/**
 * Cloud Function: createMolliePayment (Gen2)
 * Cree un paiement Mollie pour une inscription a un evenement
 *
 * Methodes de paiement activees pour Calypso Diving Club:
 * - bancontact, kbc, belfius, creditcard, applepay
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { MollieClient } = require('../utils/mollie-client');

/**
 * Fonction callable pour creer un paiement Mollie
 *
 * @param {Object} request.data - Donnees du paiement
 * @param {string} request.data.clubId - ID du club
 * @param {string} request.data.operationId - ID de l'operation (evenement)
 * @param {string} request.data.participantId - ID du participant
 * @param {number} request.data.amount - Montant en euros
 * @param {string} request.data.description - Description du paiement
 * @param {string} [request.data.method] - Methode de paiement (bancontact, kbc, belfius, creditcard, applepay)
 * @param {string} [request.data.locale] - Locale (nl_BE, fr_BE, en_US) - defaut: nl_BE
 * @returns {Promise<Object>} - { paymentId, molliePaymentId, paymentUrl, status, expiresAt }
 */
exports.createMolliePayment = onCall(
  {
    region: 'europe-west1',
    // Use Firebase Admin SDK service account for Firestore access
    serviceAccount: `firebase-adminsdk-fbsvc@${process.env.GCLOUD_PROJECT}.iam.gserviceaccount.com`,
    // Load Mollie API key from Firebase Secrets
    secrets: ['MOLLIE_API_KEY'],
  },
  async (request) => {
    // 1. Verifier l'authentification
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Vous devez etre authentifie pour creer un paiement'
      );
    }

    const userId = request.auth.uid;
    const {
      clubId,
      operationId,
      participantId,
      amount,
      description,
      method = null,
      locale = 'nl_BE'
    } = request.data;

    // 2. Valider les parametres
    if (!clubId || !operationId || !participantId || !amount || !description) {
      throw new HttpsError(
        'invalid-argument',
        'Parametres manquants: clubId, operationId, participantId, amount, description requis'
      );
    }

    if (amount <= 0 || amount > 10000) {
      throw new HttpsError(
        'invalid-argument',
        'Le montant doit etre entre 0 et 10000 euros'
      );
    }

    // Valider la methode de paiement si specifiee
    const validMethods = ['bancontact', 'kbc', 'belfius', 'creditcard', 'applepay'];
    if (method && !validMethods.includes(method)) {
      throw new HttpsError(
        'invalid-argument',
        `Methode de paiement invalide. Methodes acceptees: ${validMethods.join(', ')}`
      );
    }

    try {
      const db = admin.firestore();

      // 3. Verifier que le participant existe et n'a pas deja paye
      // Inscriptions are stored in: clubs/{clubId}/operations/{operationId}/inscriptions/{participantId}
      const participantRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(operationId)
        .collection('inscriptions')
        .doc(participantId);

      // Generate internal payment ID early for transaction
      const internalPaymentId = `mol_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      // Use transaction to prevent race conditions (double-payment)
      // Mark payment as "initiating" atomically before calling Mollie
      let participantData;
      await db.runTransaction(async (transaction) => {
        const participantDoc = await transaction.get(participantRef);

        if (!participantDoc.exists) {
          throw new HttpsError('not-found', 'Inscription non trouvee');
        }

        participantData = participantDoc.data();

        // Verifier que c'est bien l'inscription de l'utilisateur
        if (participantData.membre_id !== userId) {
          throw new HttpsError(
            'permission-denied',
            'Vous ne pouvez pas payer pour une autre personne'
          );
        }

        // Check if already paid
        if (participantData.paye === true) {
          throw new HttpsError('already-exists', 'Paiement deja effectue');
        }

        // Only block if payment was initiated very recently (prevents double-click)
        // 30 seconds is enough to prevent accidental double payments
        const paymentInitiatedAt = participantData.payment_initiated_at?.toDate?.();
        const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
        const isRecentPayment = paymentInitiatedAt && paymentInitiatedAt > thirtySecondsAgo;

        if (participantData.payment_status === 'initiating' && isRecentPayment) {
          throw new HttpsError('already-exists', 'Un paiement est deja en cours. Attendez quelques secondes.');
        }

        // Log retry attempt
        if (participantData.payment_status && participantData.payment_status !== 'paid') {
          console.log(`Retrying payment (previous status: ${participantData.payment_status})`);
        }

        // Mark as initiating to prevent concurrent payment attempts
        // Also clear any old payment IDs from failed attempts
        transaction.update(participantRef, {
          payment_status: 'initiating',
          payment_id: internalPaymentId,
          mollie_payment_id: null, // Clear old Mollie ID for retry
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      // 4. Fetch operation data for enriched payment description
      const operationRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(operationId);

      const operationDoc = await operationRef.get();
      let operationData = null;
      if (operationDoc.exists) {
        operationData = operationDoc.data();
      }

      // Build enriched payment description for bank reconciliation
      // Format: "Event Number - Event Title - DD/MM/YYYY - First Name"
      let enrichedDescription = description; // Fallback to client-provided description

      if (operationData) {
        const eventTitle = operationData.titre || description;
        const eventNumber = operationData.event_number || '';
        const eventDate = operationData.date_debut?.toDate?.();
        const formattedDate = eventDate
          ? `${String(eventDate.getDate()).padStart(2, '0')}/${String(eventDate.getMonth() + 1).padStart(2, '0')}/${eventDate.getFullYear()}`
          : '';
        // Use only first name (membre_prenom) for privacy
        const firstName = participantData.membre_prenom || '';

        // Build description parts - event number first for easy bank reconciliation
        const parts = [];
        if (eventNumber) parts.push(eventNumber);
        parts.push(eventTitle);
        if (formattedDate) parts.push(formattedDate);
        if (firstName) parts.push(firstName);

        enrichedDescription = parts.join(' - ');
        console.log('Enriched payment description:', enrichedDescription);
      }

      // 5. Creer le paiement chez Mollie (outside transaction - external API call)
      const apiKey = process.env.MOLLIE_API_KEY;
      if (!apiKey) {
        throw new HttpsError('failed-precondition', 'Configuration paiement manquante. Contactez l\'administrateur.');
      }
      const mollieClient = new MollieClient(apiKey);

      // URL de webhook pour recevoir les notifications
      const webhookUrl = `https://europe-west1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/mollieWebhook`;

      // URL de redirection apres paiement (deep link vers l'app)
      // Utilise le custom URL scheme calymob:// pour ouvrir directement l'app
      const redirectUrl = `calymob://payment/return?provider=mollie&payment=${internalPaymentId}&clubId=${clubId}&operationId=${operationId}`;

      const molliePaymentData = {
        amount: {
          currency: 'EUR',
          value: parseFloat(amount).toFixed(2)
        },
        description: enrichedDescription,
        redirectUrl: redirectUrl,
        webhookUrl: webhookUrl,
        locale: locale,
        metadata: {
          internalPaymentId: internalPaymentId,
          clubId: clubId,
          operationId: operationId,
          participantId: participantId,
          userId: userId,
          createdFrom: 'calymob-app'
        }
      };

      // Ajouter la methode de paiement si specifiee
      if (method) {
        molliePaymentData.method = method;
      }

      console.log('Creation paiement Mollie:', {
        internalPaymentId,
        amount: molliePaymentData.amount.value,
        method: method || 'customer_choice',
        clubId,
        operationId,
        participantId
      });

      let mollieResponse;
      try {
        mollieResponse = await mollieClient.createPayment(molliePaymentData);
      } catch (mollieError) {
        // Reset payment status if Mollie fails
        await participantRef.update({
          payment_status: null,
          payment_id: null,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        throw mollieError;
      }

      console.log('Paiement Mollie cree:', mollieResponse.id, 'status:', mollieResponse.status);

      // 5. Enregistrer l'ID de paiement dans Firestore
      await participantRef.update({
        payment_id: internalPaymentId,
        mollie_payment_id: mollieResponse.id,
        payment_provider: 'mollie',
        payment_status: mollieResponse.status, // 'open'
        payment_method: method || null,
        payment_initiated_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 6. Retourner les infos au client
      return {
        paymentId: internalPaymentId,
        molliePaymentId: mollieResponse.id,
        paymentUrl: mollieResponse._links?.checkout?.href || null,
        status: mollieResponse.status,
        method: mollieResponse.method || method,
        expiresAt: mollieResponse.expiresAt || null,
        provider: 'mollie'
      };
    } catch (error) {
      console.error('Erreur createMolliePayment:', error);

      // Si c'est deja une HttpsError, la relancer
      if (error instanceof HttpsError) {
        throw error;
      }

      // Sinon, creer une erreur generique
      throw new HttpsError(
        'internal',
        `Erreur lors de la creation du paiement: ${error.message}`
      );
    }
  }
);
