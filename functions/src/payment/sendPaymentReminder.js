/**
 * Cloud Function: Send a payment reminder prepared by `eventPaymentReminder`.
 *
 * Callable from CalyCompta. When the admin clicks "Envoyer" on the
 * Inscriptions tab banner, this function:
 *   1. For every member in `operation.payment_reminder.groups.qr_email`,
 *      re-sends the EPC QR payment email (via the shared helper).
 *   2. Posts the reminder message text into `operations/{id}/messages`,
 *      which triggers `onNewEventMessage` → push notifications to all
 *      participants.
 *   3. Updates `payment_reminder.status = 'sent'` with metadata.
 *
 * Input: {
 *   clubId: string,
 *   operationId: string,
 *   overrideText?: string,   // optional replacement for payment_reminder.text
 * }
 *
 * Auth: caller must be logged in (request.auth required).
 *
 * Uses Firebase Functions v2 API (Gen2).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { sendPaymentEmailForMember } = require('./sendPaymentQrEmail');
const { recomputePaymentReminderDraft } = require('./paymentReminderHelpers');
const { memberFirstName, memberLastName } = require('../utils/memberName');

/**
 * Resolve a human-friendly sender name for the reminder message.
 * Fall back chain: token.name → email local part → uid.
 */
function resolveSenderName(auth) {
  const token = (auth && auth.token) || {};
  const name = typeof token.name === 'string' ? token.name.trim() : '';
  if (name) return name;

  const email = typeof token.email === 'string' ? token.email.trim() : '';
  if (email.includes('@')) return email.split('@')[0];
  if (email) return email;

  return auth && auth.uid ? auth.uid : 'Trésorier';
}

/**
 * Coerce an inscription's amount to a positive number. Handles both
 * `montant` (new) and `prix` (legacy) + string/undefined fallbacks.
 */
function resolveInscriptionAmount(inscription) {
  const candidates = [inscription.montant, inscription.prix];
  for (const candidate of candidates) {
    const asNumber = typeof candidate === 'number' ? candidate : Number(candidate);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  }
  return 0;
}

function resolveReminderInstallment(entry, inscription) {
  const installmentId = typeof entry.installment_id === 'string'
    ? entry.installment_id.trim()
    : '';
  if (!installmentId) return null;

  const payment = inscription.installment_payments && inscription.installment_payments[installmentId];
  if (!payment) {
    throw new HttpsError('failed-precondition', `Tranche ${installmentId} introuvable sur l'inscription`);
  }

  const status = payment.status || 'unpaid';
  const amountDue = Number(payment.amount_due);
  return {
    installmentId,
    installmentLabel: entry.installment_label || 'Tranche',
    status,
    amountDue: Number.isFinite(amountDue) ? amountDue : 0,
  };
}

const sendPaymentReminder = onCall(
  {
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 5,
  },
  async (request) => {
    const db = admin.firestore();

    // 1. Validate input
    const { clubId, operationId, overrideText } = request.data || {};

    if (!clubId || !operationId) {
      throw new HttpsError('invalid-argument', 'clubId ou operationId manquant');
    }

    // 2. Require authenticated caller
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté pour envoyer un rappel de paiement');
    }

    const sentBy = request.auth.uid;
    const senderName = resolveSenderName(request.auth);

    console.log(`🔔 [sendPaymentReminder] ${sentBy} (${senderName}) sending reminder for ${clubId}/${operationId}`);

    // 3. Read operation
    const operationRef = db
      .collection('clubs').doc(clubId)
      .collection('operations').doc(operationId);

    let operationSnap = await operationRef.get();
    if (!operationSnap.exists) {
      throw new HttpsError('not-found', `Événement ${operationId} introuvable`);
    }

    // 4. Send-time refresh: recompute draft from CURRENT inscription state so
    //    we never email someone who paid in the meantime, and never name a
    //    paid member in the chat post. This is the third freshness layer
    //    (alongside the daily run and the live trigger).
    const refreshResult = await recomputePaymentReminderDraft(
      db, clubId, operationRef, operationSnap.data(),
      { allowResend: true },
    );
    console.log(
      `[sendPaymentReminder] Pre-send refresh ${clubId}/${operationId}: ${refreshResult.reason}`,
    );

    // Re-read the (possibly updated) operation.
    operationSnap = await operationRef.get();
    const operation = operationSnap.data();
    const paymentReminder = operation.payment_reminder;

    // 5. Validate state
    //    Allow resending: as long as there are unpaid inscriptions in the
    //    refreshed draft, we let the admin send again. The recompute above
    //    forces the draft back to 'pending' if there are still unpaid people,
    //    or to 'cleared' if everyone paid.
    if (!paymentReminder) {
      throw new HttpsError('failed-precondition', 'Aucun rappel à envoyer');
    }
    if (paymentReminder.status === 'cleared') {
      throw new HttpsError('failed-precondition', 'Plus aucun paiement en attente — tous les participants ont payé.');
    }
    if (paymentReminder.status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'Le rappel a été annulé — recalculez manuellement');
    }
    // Accept both 'pending' and 'sent' — sending again is allowed.
    if (paymentReminder.status !== 'pending' && paymentReminder.status !== 'sent') {
      throw new HttpsError('failed-precondition', `Rappel dans un état inattendu : "${paymentReminder.status}"`);
    }

    // overrideText still wins if the admin manually edited the text in the
    // modal. Otherwise we use the freshly composed text (post-refresh).
    const messageText = (typeof overrideText === 'string' && overrideText.trim())
      ? overrideText
      : paymentReminder.text;

    if (!messageText) {
      throw new HttpsError('failed-precondition', 'Le rappel ne contient aucun texte');
    }

    // 6. Send QR emails for every member in the qr_email group
    //    (group is fresh from the refresh above)
    const qrGroup = Array.isArray(paymentReminder.groups?.qr_email)
      ? paymentReminder.groups.qr_email
      : [];

    const operationTitle = operation.titre || operation.title || 'Événement';
    const operationDateIso = operation.date_debut && typeof operation.date_debut.toDate === 'function'
      ? operation.date_debut.toDate().toISOString()
      : null;
    const operationNumber = operation.event_number;

    const sendResults = await Promise.all(qrGroup.map(async (entry) => {
      const membreId = entry?.membre_id;
      const inscriptionId = entry?.inscription_id;

      if (!membreId || !inscriptionId) {
        return {
          membre_id: membreId || null,
          inscription_id: inscriptionId || null,
          status: 'failed',
          error: 'Entrée invalide (membre_id ou inscription_id manquant)',
        };
      }

      try {
        // Resolve per-member data: email, name, amount
        const [inscriptionSnap, memberSnap] = await Promise.all([
          operationRef.collection('inscriptions').doc(inscriptionId).get(),
          db.collection('clubs').doc(clubId).collection('members').doc(membreId).get(),
        ]);

        if (!inscriptionSnap.exists) {
          return {
            membre_id: membreId,
            inscription_id: inscriptionId,
            status: 'failed',
            error: 'Inscription introuvable',
          };
        }

        if (!memberSnap.exists) {
          return {
            membre_id: membreId,
            inscription_id: inscriptionId,
            status: 'failed',
            error: 'Membre introuvable',
          };
        }

        const inscription = inscriptionSnap.data();
        const member = memberSnap.data();

        const installment = resolveReminderInstallment(entry, inscription);

        // Final guard: the refresh just before this send may have raced with
        // a payment. Skip anyone who is now marked paid. For payment-plan
        // events, guard the target tranche instead of the whole inscription.
        if (installment && (installment.status === 'paid' || installment.status === 'waived')) {
          return {
            membre_id: membreId,
            inscription_id: inscriptionId,
            status: 'skipped-paid',
          };
        }
        if (!installment && inscription.paye === true) {
          return {
            membre_id: membreId,
            inscription_id: inscriptionId,
            status: 'skipped-paid',
          };
        }

        const amount = installment ? installment.amountDue : resolveInscriptionAmount(inscription);
        if (amount <= 0) {
          return {
            membre_id: membreId,
            inscription_id: inscriptionId,
            status: 'failed',
            error: installment
              ? `Aucun montant valide pour ${installment.installmentLabel}`
              : 'Aucun montant valide sur l\'inscription (montant/prix tous deux invalides)',
          };
        }

        const memberEmail = (typeof member.email === 'string' && member.email.trim()) ? member.email.trim() : null;
        if (!memberEmail) {
          return {
            membre_id: membreId,
            inscription_id: inscriptionId,
            status: 'failed',
            error: 'Le membre n\'a pas d\'email enregistré',
          };
        }

        await sendPaymentEmailForMember(db, {
          clubId,
          operationId,
          participantId: inscriptionId,
          memberEmail,
          memberFirstName: memberFirstName(member),
          memberLastName: memberLastName(member),
          amount,
          operationTitle,
          operationNumber,
          operationDate: operationDateIso,
          installmentId: installment?.installmentId,
          installmentLabel: installment?.installmentLabel,
        });

        return {
          membre_id: membreId,
          inscription_id: inscriptionId,
          status: 'sent',
        };
      } catch (error) {
        console.error(
          `[sendPaymentReminder] Failed to send QR email for ${clubId}/${operationId} member ${membreId}:`,
          error,
        );
        return {
          membre_id: membreId,
          inscription_id: inscriptionId,
          status: 'failed',
          error: error instanceof HttpsError ? `${error.code}: ${error.message}` : (error.message || 'Unknown error'),
        };
      }
    }));

    const qrEmailsSent = sendResults.filter((r) => r.status === 'sent').length;
    const qrEmailsFailed = sendResults.filter((r) => r.status === 'failed').length;
    const qrEmailsSkippedPaid = sendResults.filter((r) => r.status === 'skipped-paid').length;
    const failures = sendResults.filter((r) => r.status === 'failed');

    console.log(
      `📬 [sendPaymentReminder] QR emails: ${qrEmailsSent} sent, ${qrEmailsFailed} failed, ${qrEmailsSkippedPaid} skipped (already paid) for ${clubId}/${operationId}`,
    );

    // 6. Post reminder message to event chat (triggers onNewEventMessage → FCM)
    //    Uses the same field shape the trigger expects:
    //    `message`, `sender_id`, `sender_name`, `created_at`.
    const messageRef = await operationRef.collection('messages').add({
      message: messageText,
      sender_id: sentBy,
      sender_name: senderName,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      system_type: 'payment_reminder',
      payment_reminder_prepared_at: paymentReminder.prepared_at || null,
    });

    console.log(`💬 [sendPaymentReminder] Posted message ${messageRef.id} in ${clubId}/${operationId}`);

    // 7. Mark reminder as sent (preserve prepared_at, text, groups via dotted paths)
    const updatePayload = {
      'payment_reminder.status': 'sent',
      'payment_reminder.sent_at': admin.firestore.FieldValue.serverTimestamp(),
      'payment_reminder.sent_by': sentBy,
      'payment_reminder.sent_message_id': messageRef.id,
      'payment_reminder.qr_emails_sent': qrEmailsSent,
      'payment_reminder.qr_emails_failed': qrEmailsFailed,
      'payment_reminder.qr_email_failures': failures,
    };

    if (overrideText && overrideText !== paymentReminder.text) {
      updatePayload['payment_reminder.sent_text'] = messageText;
    }

    await operationRef.update(updatePayload);

    return {
      success: true,
      qrEmailsSent,
      qrEmailsFailed,
      failures,
      messageId: messageRef.id,
    };
  },
);

module.exports = { sendPaymentReminder };
