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
      throw new HttpsError('invalid-argument', 'Missing clubId or operationId');
    }

    // 2. Require authenticated caller
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Must be logged in to send a payment reminder');
    }

    const sentBy = request.auth.uid;
    const senderName = resolveSenderName(request.auth);

    console.log(`🔔 [sendPaymentReminder] ${sentBy} (${senderName}) sending reminder for ${clubId}/${operationId}`);

    // 3. Read operation
    const operationRef = db
      .collection('clubs').doc(clubId)
      .collection('operations').doc(operationId);

    const operationSnap = await operationRef.get();
    if (!operationSnap.exists) {
      throw new HttpsError('not-found', `Operation ${operationId} not found`);
    }

    const operation = operationSnap.data();
    const paymentReminder = operation.payment_reminder;

    // 4. Validate state
    if (!paymentReminder) {
      throw new HttpsError('failed-precondition', 'No pending reminder to send');
    }
    if (paymentReminder.status === 'sent') {
      throw new HttpsError('already-exists', 'Reminder already sent');
    }
    if (paymentReminder.status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'Reminder was cancelled — wait for tomorrow\'s preparation or recompute manually');
    }
    if (paymentReminder.status !== 'pending') {
      throw new HttpsError('failed-precondition', `Reminder in unexpected state "${paymentReminder.status}"`);
    }

    const messageText = (typeof overrideText === 'string' && overrideText.trim())
      ? overrideText
      : paymentReminder.text;

    if (!messageText) {
      throw new HttpsError('failed-precondition', 'Reminder has no message text');
    }

    // 5. Send QR emails for every member in the qr_email group
    const qrGroup = Array.isArray(paymentReminder.groups?.qr_email)
      ? paymentReminder.groups.qr_email
      : [];

    const operationTitle = operation.titre || operation.title || 'Événement';
    const operationDateIso = operation.date && typeof operation.date.toDate === 'function'
      ? operation.date.toDate().toISOString()
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
          error: 'Invalid group entry (missing membre_id or inscription_id)',
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
            error: 'Inscription not found',
          };
        }

        if (!memberSnap.exists) {
          return {
            membre_id: membreId,
            inscription_id: inscriptionId,
            status: 'failed',
            error: 'Member not found',
          };
        }

        const inscription = inscriptionSnap.data();
        const member = memberSnap.data();

        const amount = resolveInscriptionAmount(inscription);
        if (amount <= 0) {
          return {
            membre_id: membreId,
            inscription_id: inscriptionId,
            status: 'failed',
            error: 'No positive amount on inscription (montant/prix both unusable)',
          };
        }

        const memberEmail = (typeof member.email === 'string' && member.email.trim()) ? member.email.trim() : null;
        if (!memberEmail) {
          return {
            membre_id: membreId,
            inscription_id: inscriptionId,
            status: 'failed',
            error: 'Member has no email on record',
          };
        }

        await sendPaymentEmailForMember(db, {
          clubId,
          operationId,
          participantId: inscriptionId,
          memberEmail,
          memberFirstName: member.prenom || '',
          memberLastName: member.nom || '',
          amount,
          operationTitle,
          operationNumber,
          operationDate: operationDateIso,
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
    const failures = sendResults.filter((r) => r.status === 'failed');

    console.log(
      `📬 [sendPaymentReminder] QR emails: ${qrEmailsSent} sent, ${qrEmailsFailed} failed for ${clubId}/${operationId}`,
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
