/**
 * Cloud Function: Send email notification when expense status changes
 *
 * Triggers on: clubs/{clubId}/demandes_remboursement/{demandeId} (onUpdate)
 *
 * This function sends email notifications when:
 * - Expense is approved (status: soumis → approuve OR en_attente_validation → approuve)
 * - Expense is reimbursed (status: approuve → rembourse)
 *
 * Emails are sent automatically for both CalyMob and CalyCompta.
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
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

/**
 * Generate HTML email content for expense approved notification
 */
function generateApprovedEmailHtml(data) {
  const {
    recipientName,
    description,
    montant,
    approvedBy,
    approvalDate,
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
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">Note de frais approuvée</h1>

    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour ${recipientName},</p>

    <div style="background: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: #065F46;">
        Bonne nouvelle ! Votre note de frais a été approuvée.
      </p>
    </div>

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
          <td style="padding: 8px 0; color: #6B7280;">Approuvé par:</td>
          <td style="padding: 8px 0;">${approvedBy}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Date d'approbation:</td>
          <td style="padding: 8px 0;">${approvalDate}</td>
        </tr>
      </table>
    </div>

    <p style="color: #6B7280; font-size: 14px;">Le remboursement sera effectué dans les plus brefs délais.</p>

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
 * Generate HTML email content for expense reimbursed notification
 */
function generateReimbursedEmailHtml(data) {
  const {
    recipientName,
    description,
    montant,
    reimbursementDate,
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
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">Note de frais remboursée</h1>

    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour ${recipientName},</p>

    <div style="background: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: #065F46;">
        Votre note de frais a été remboursée !
      </p>
    </div>

    <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Détails du remboursement</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Description:</td>
          <td style="padding: 8px 0; font-weight: 600;">${description}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Montant remboursé:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #059669;">${montant} EUR</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Date de remboursement:</td>
          <td style="padding: 8px 0;">${reimbursementDate}</td>
        </tr>
      </table>
    </div>

    <p style="color: #6B7280; font-size: 14px;">Le montant devrait apparaître sur votre compte bancaire dans les prochains jours.</p>

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
 * Firestore trigger for expense status changes (Gen2)
 */
exports.onExpenseStatusChange = onDocumentUpdated(
  {
    document: 'clubs/{clubId}/demandes_remboursement/{demandeId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, demandeId } = event.params;
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    const oldStatus = beforeData.statut;
    const newStatus = afterData.statut;

    // Only process status changes
    if (oldStatus === newStatus) {
      return null;
    }

    console.log(`📧 [onExpenseStatusChange] Status changed: ${oldStatus} → ${newStatus} for ${demandeId}`);

    // Determine which email to send
    let emailType = null;

    // Approved: soumis → approuve OR en_attente_validation → approuve
    if (newStatus === 'approuve' && (oldStatus === 'soumis' || oldStatus === 'en_attente_validation')) {
      emailType = 'approved';
    }
    // Reimbursed: approuve → rembourse
    else if (newStatus === 'rembourse' && oldStatus === 'approuve') {
      emailType = 'reimbursed';
    }

    if (!emailType) {
      console.log(`📧 [onExpenseStatusChange] No email needed for transition: ${oldStatus} → ${newStatus}`);
      return null;
    }

    const db = admin.firestore();

    try {
      // 1. Get the submitter's email from members collection
      const demandeurId = afterData.demandeur_id;
      if (!demandeurId) {
        console.log('⚠️ [onExpenseStatusChange] No demandeur_id, skipping email');
        return null;
      }

      const memberDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(demandeurId)
        .get();

      if (!memberDoc.exists) {
        console.log(`⚠️ [onExpenseStatusChange] Member ${demandeurId} not found, skipping email`);
        return null;
      }

      const member = memberDoc.data();
      const recipientEmail = member.email;

      if (!recipientEmail) {
        console.log(`⚠️ [onExpenseStatusChange] Member ${demandeurId} has no email, skipping`);
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
        console.log('⚠️ [onExpenseStatusChange] No email config found, skipping email');
        return null;
      }

      const emailConfig = emailConfigDoc.data();

      // Currently only support Resend (simpler for Cloud Functions)
      if (emailConfig.provider !== 'resend' || !emailConfig.resend?.apiKey) {
        console.log('⚠️ [onExpenseStatusChange] Resend not configured, skipping email');
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
      const appUrl = 'https://calycompta.vercel.app';

      // 4. Generate email content based on type
      let subject, htmlContent;

      if (emailType === 'approved') {
        subject = `Note de frais approuvée - ${afterData.description || 'Note de frais'}`;
        htmlContent = generateApprovedEmailHtml({
          recipientName,
          description: afterData.description || afterData.titre || 'Note de frais',
          montant: formatMontant(afterData.montant),
          approvedBy: afterData.approuve_par_nom || afterData.approuve_par || 'Un administrateur',
          approvalDate: formatDate(afterData.date_approbation),
          clubName,
          logoUrl,
          appUrl,
        });
      } else if (emailType === 'reimbursed') {
        subject = `Note de frais remboursée - ${afterData.description || 'Note de frais'}`;
        htmlContent = generateReimbursedEmailHtml({
          recipientName,
          description: afterData.description || afterData.titre || 'Note de frais',
          montant: formatMontant(afterData.montant),
          reimbursementDate: formatDate(afterData.date_remboursement || new Date()),
          clubName,
          logoUrl,
          appUrl,
        });
      }

      // 5. Send email via Resend
      const fromEmail = emailConfig.resend.fromEmail || 'onboarding@resend.dev';
      const fromName = emailConfig.resend.fromName || clubName;
      const from = `${fromName} <${fromEmail}>`;

      console.log(`📧 [onExpenseStatusChange] Sending ${emailType} email to ${recipientEmail}...`);

      const result = await sendEmailViaResend(
        emailConfig.resend.apiKey,
        from,
        recipientEmail,
        subject,
        htmlContent
      );

      console.log(`✅ [onExpenseStatusChange] Email sent successfully: ${result.id}`);

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
          emailType: emailType === 'approved' ? 'expense_approved' : 'expense_reimbursed',
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

      console.log(`✅ [onExpenseStatusChange] Email logged to email_history`);

      return { success: true, messageId: result.id, emailType };

    } catch (error) {
      console.error('❌ [onExpenseStatusChange] Error:', error);

      // Log failure to email_history
      try {
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('email_history')
          .add({
            recipientEmail: afterData.demandeur_email || 'unknown',
            recipientName: afterData.demandeur_nom || 'unknown',
            recipientId: afterData.demandeur_id,
            demandeId,
            emailType: emailType === 'approved' ? 'expense_approved' : 'expense_reimbursed',
            subject: `Note de frais ${emailType === 'approved' ? 'approuvée' : 'remboursée'}`,
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
        console.error('❌ [onExpenseStatusChange] Error logging failure:', logError);
      }

      throw error;
    }
  }
);
