/**
 * Cloud Function: Send email notification when a new expense request is created
 *
 * Triggers on: clubs/{clubId}/demandes_remboursement/{demandeId}
 *
 * This function sends a confirmation email to the submitter when they create
 * a new expense request (demande de remboursement), whether from CalyMob or CalyCompta.
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

/**
 * Format date to French locale string
 */
function formatDate(date) {
  if (!date) return '-';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('fr-BE');
}

/**
 * Format amount with 2 decimal places
 */
function formatMontant(amount) {
  if (typeof amount !== 'number') return '0.00';
  return amount.toFixed(2);
}

function getReferenceYear(dateDepense) {
  const date = dateDepense?.toDate ? dateDepense.toDate() : new Date(dateDepense || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

function buildRemCommunication(reference, demande) {
  const label = String(demande.titre || demande.description || '').trim() || `Remboursement ${(
    demande.fournisseur_nom ||
    demande.demandeur_nom ||
    'Demande'
  ).toString().trim()}`;
  return `+++${reference}+++ ${label}`.substring(0, 140);
}

const OPEN_UNPAID_STATUSES = new Set([
  'brouillon',
  'soumis',
  'en_attente_validation',
  'approuve',
  'cree_banque_attente_validation',
  'paiement_effectue',
  'a_verifier_paiement',
]);

async function generateNextRemReference(db, clubId, year) {
  const counterRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('settings')
    .doc(`rem_reference_counter_${year}`);

  const nextCounter = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const current = snapshot.exists ? Number(snapshot.data().counter || 0) : 0;
    const next = current + 1;

    transaction.set(counterRef, {
      counter: next,
      year,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return next;
  });

  return `REM-${year}-${String(nextCounter).padStart(4, '0')}`;
}

async function ensureRemReference(db, clubId, demandeId, demande) {
  if (demande.transaction_id || demande.payment_reference) {
    return demande.payment_reference || null;
  }
  if (!OPEN_UNPAID_STATUSES.has(String(demande.statut || ''))) {
    return null;
  }

  const year = getReferenceYear(demande.date_depense || demande.date_demande || demande.created_at);
  const paymentReference = await generateNextRemReference(db, clubId, year);
  const paymentReferencePatch = {
    payment_reference: paymentReference,
    payment_reference_key: `+++${paymentReference}+++`,
    communication_qr: buildRemCommunication(paymentReference, demande),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  const legacyRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('demandes_remboursement')
    .doc(demandeId);
  const canonicalRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('expense_claims')
    .doc(demandeId);

  const canonicalSnap = await canonicalRef.get();
  const writes = [
    legacyRef.set(paymentReferencePatch, { merge: true }),
  ];

  if (canonicalSnap.exists) {
    writes.push(canonicalRef.set({
      payment_reference: paymentReference,
      payment_reference_key: paymentReferencePatch.payment_reference_key,
      payment_qr_message: paymentReferencePatch.communication_qr,
      updated_at: paymentReferencePatch.updated_at,
    }, { merge: true }));
  }

  await Promise.all(writes);

  return paymentReference;
}

/**
 * Generate HTML email content for expense submitted notification
 */
function generateEmailHtml(data) {
  const {
    recipientName,
    description,
    montant,
    dateDepense,
    fournisseur,
    categorie,
    clubName,
    logoUrl,
    appUrl,
  } = data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <!-- Header with logo -->
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    ${logoUrl
      ? `<img src="${logoUrl}" alt="${clubName}" style="max-width: 200px; height: auto;">`
      : `<h2 style="margin: 0; color: #374151;">${clubName}</h2>`
    }
  </div>

  <div style="padding: 30px 0;">
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">Note de frais enregistrée</h1>

    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour ${recipientName},</p>

    <p>Votre note de frais a bien été enregistrée et est en attente de validation.</p>

    <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Détails de votre demande</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Description:</td>
          <td style="padding: 8px 0; font-weight: 600;">${description}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Montant:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #059669;">${montant} EUR</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Date de dépense:</td>
          <td style="padding: 8px 0;">${dateDepense}</td>
        </tr>
        ${fournisseur ? `
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Fournisseur:</td>
          <td style="padding: 8px 0;">${fournisseur}</td>
        </tr>
        ` : ''}
        ${categorie ? `
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Catégorie:</td>
          <td style="padding: 8px 0;">${categorie}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <p style="color: #6B7280; font-size: 14px;">Vous recevrez une notification dès que votre demande sera traitée.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${appUrl}/depenses" style="display: inline-block; background: #F97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Voir mes demandes
      </a>
    </div>

    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>${clubName}</strong>
    </p>
  </div>

  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 8px;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plongée
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send email via Resend API
 */
async function sendEmailViaResend(apiKey, from, to, subject, html) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to send email via Resend');
  }

  return response.json();
}

/**
 * Firestore trigger for new expense requests (Gen2)
 *
 * Only sends automatic email if:
 * - source === 'mobile' (CalyMob app - user creates their own expense)
 * - OR send_confirmation_email === true (explicitly requested)
 *
 * For CalyCompta (web), emails are sent manually via a button because
 * admins often create expenses on behalf of other members and need
 * to select the correct person first.
 */
exports.onExpenseCreated = onDocumentCreated(
  {
    document: 'clubs/{clubId}/demandes_remboursement/{demandeId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, demandeId } = event.params;
    const demande = event.data.data();

    console.log(`📧 [onExpenseCreated] New expense in club/${clubId}/demandes_remboursement/${demandeId}`);
    console.log('📧 [onExpenseCreated] Expense data:', JSON.stringify({
      description: demande.description,
      montant: demande.montant,
      demandeur_id: demande.demandeur_id,
      demandeur_nom: demande.demandeur_nom,
      source: demande.source,
      send_confirmation_email: demande.send_confirmation_email,
    }));

    const db = admin.firestore();

    try {
      const paymentReference = await ensureRemReference(db, clubId, demandeId, demande);
      if (paymentReference) {
        console.log(`✅ [onExpenseCreated] REM reference ready: ${paymentReference}`);
      }

      // Only send automatic email for mobile app submissions
      // Web (CalyCompta) uses manual email sending via button
      const source = demande.source || 'web'; // Default to 'web' if not specified
      const sendEmail = demande.send_confirmation_email === true || source === 'mobile';

      if (!sendEmail) {
        console.log('📧 [onExpenseCreated] Skipping automatic email (source: web, no explicit send request)');
        return null;
      }

      // 1. Get the submitter's email from members collection
      const demandeurId = demande.demandeur_id;
      if (!demandeurId) {
        console.log('⚠️ [onExpenseCreated] No demandeur_id, skipping email');
        return null;
      }

      const memberDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(demandeurId)
        .get();

      if (!memberDoc.exists) {
        console.log(`⚠️ [onExpenseCreated] Member ${demandeurId} not found, skipping email`);
        return null;
      }

      const member = memberDoc.data();
      const recipientEmail = member.email;

      if (!recipientEmail) {
        console.log(`⚠️ [onExpenseCreated] Member ${demandeurId} has no email, skipping`);
        return null;
      }

      const recipientName = `${member.prenom || ''} ${member.nom || ''}`.trim()
        || member.displayName
        || recipientEmail;

      // 2. Get email configuration from club settings
      const emailConfigDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('email_config')
        .get();

      if (!emailConfigDoc.exists) {
        console.log('⚠️ [onExpenseCreated] No email config found, skipping email');
        return null;
      }

      const emailConfig = emailConfigDoc.data();

      // Currently only support Resend (simpler for Cloud Functions)
      if (emailConfig.provider !== 'resend' || !emailConfig.resend?.apiKey) {
        console.log('⚠️ [onExpenseCreated] Resend not configured, skipping email');
        return null;
      }

      // 3. Get club settings for branding
      const generalSettingsDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('general')
        .get();

      const generalSettings = generalSettingsDoc.exists ? generalSettingsDoc.data() : {};
      const clubName = generalSettings.clubName || 'Calypso Diving Club';
      const logoUrl = generalSettings.logoUrl || '';
      const appUrl = 'https://caly.club';

      // 4. Generate email content
      const subject = `Note de frais enregistrée - ${demande.description || 'Note de frais'}`;
      const htmlContent = generateEmailHtml({
        recipientName,
        description: demande.description || demande.titre || 'Note de frais',
        montant: formatMontant(demande.montant),
        dateDepense: formatDate(demande.date_depense),
        fournisseur: demande.fournisseur || '',
        categorie: demande.categorie || '',
        clubName,
        logoUrl,
        appUrl,
      });

      // 5. Send email via Resend
      const fromEmail = emailConfig.resend.fromEmail || 'onboarding@resend.dev';
      const fromName = emailConfig.resend.fromName || clubName;
      const from = `${fromName} <${fromEmail}>`;

      console.log(`📧 [onExpenseCreated] Sending email to ${recipientEmail}...`);

      const result = await sendEmailViaResend(
        emailConfig.resend.apiKey,
        from,
        recipientEmail,
        subject,
        htmlContent
      );

      console.log(`✅ [onExpenseCreated] Email sent successfully: ${result.id}`);

      // 6. Log to email_history collection
      await db
        .collection('clubs')
        .doc(clubId)
        .collection('email_history')
        .add({
          recipientEmail,
          recipientName,
          recipientId: demandeurId,
          demandeId,
          emailType: 'expense_submitted',
          subject,
          htmlContent,
          status: 'sent',
          messageId: result.id,
          sendType: 'expense_notification',
          sentBy: 'system',
          sentByName: 'Cloud Function',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          clubId,
        });

      console.log(`✅ [onExpenseCreated] Email logged to email_history`);

      return { success: true, messageId: result.id };

    } catch (error) {
      console.error('❌ [onExpenseCreated] Error:', error);

      // Log failure to email_history
      try {
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('email_history')
          .add({
            recipientEmail: demande.demandeur_email || 'unknown',
            recipientName: demande.demandeur_nom || 'unknown',
            recipientId: demande.demandeur_id,
            demandeId,
            emailType: 'expense_submitted',
            subject: `Note de frais enregistrée - ${demande.description || 'Note de frais'}`,
            htmlContent: '',
            status: 'failed',
            statusMessage: error.message,
            sendType: 'expense_notification',
            sentBy: 'system',
            sentByName: 'Cloud Function',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            clubId,
          });
      } catch (logError) {
        console.error('❌ [onExpenseCreated] Error logging failure:', logError);
      }

      throw error;
    }
  }
);
