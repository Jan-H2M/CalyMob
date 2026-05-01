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
 * Sleep helper for rate limiting (Resend allows max 2 requests/sec)
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
 * Generate HTML email content for FIRST approval notification (to demandeur)
 */
function generateFirstApprovalEmailHtml(data) {
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
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    ${logoUrl
      ? `<img src="${logoUrl}" alt="${clubName}" style="max-width: 200px; height: auto;">`
      : `<h2 style="margin: 0; color: #374151;">${clubName}</h2>`
    }
  </div>

  <div style="padding: 30px 0;">
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">Première validation effectuée</h1>

    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour ${recipientName},</p>

    <div style="background: #FFF4E6; border-left: 4px solid #F97316; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: #EA580C;">
        ✅ ${approvedBy} a approuvé votre note de frais.
      </p>
    </div>

    <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">📋 Détails</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Description:</td>
          <td style="padding: 8px 0; font-weight: 600;">${description}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Montant:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #EA580C;">${montant} EUR</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Approuvé par:</td>
          <td style="padding: 8px 0;">${approvedBy}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Date:</td>
          <td style="padding: 8px 0;">${approvalDate}</td>
        </tr>
      </table>
    </div>

    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #92400E;">⏳ En attente de 2ème validation</p>
      <p style="margin: 0; font-size: 14px; color: #78350F;">
        Une deuxième approbation est requise pour les montants supérieurs à 650 €. Un autre validateur doit encore approuver cette demande avant que le remboursement puisse être effectué.
      </p>
    </div>

    <p style="color: #6B7280; font-size: 14px;">Vous serez notifié dès que la deuxième validation sera effectuée.</p>

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
 * Generate HTML email content for SECOND approval needed (to validators)
 */
function generateSecondApprovalNeededEmailHtml(data) {
  const {
    recipientName,
    demandeurName,
    description,
    montant,
    firstApprover,
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
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    ${logoUrl
      ? `<img src="${logoUrl}" alt="${clubName}" style="max-width: 200px; height: auto;">`
      : `<h2 style="margin: 0; color: #374151;">${clubName}</h2>`
    }
  </div>

  <div style="padding: 30px 0;">
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">Deuxième validation requise</h1>

    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour ${recipientName},</p>

    <div style="background: #FFF4E6; border-left: 4px solid #F97316; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: #EA580C;">
        ⏳ Une note de frais nécessite une deuxième approbation.
      </p>
    </div>

    <p style="font-size: 15px; color: #374151;"><strong>${firstApprover}</strong> a déjà effectué la première validation.</p>

    <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">📋 Détails de la demande</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Demandeur:</td>
          <td style="padding: 8px 0; font-weight: 600;">${demandeurName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Description:</td>
          <td style="padding: 8px 0; font-weight: 600;">${description}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Montant:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #EA580C;">${montant} EUR</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Première validation:</td>
          <td style="padding: 8px 0;">${firstApprover} (${approvalDate})</td>
        </tr>
      </table>
    </div>

    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px; color: #78350F;">
        ⚠️ Cette demande requiert une validation d'une deuxième personne (montant > 650 €).
      </p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${appUrl}/depenses" style="display: inline-block; background: #3B82F6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Voir et Approuver
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
 * Generate HTML email content for SECOND approval complete (to demandeur)
 */
function generateSecondApprovalCompleteEmailHtml(data) {
  const {
    recipientName,
    description,
    montant,
    firstApprover,
    secondApprover,
    firstApprovalDate,
    secondApprovalDate,
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
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    ${logoUrl
      ? `<img src="${logoUrl}" alt="${clubName}" style="max-width: 200px; height: auto;">`
      : `<h2 style="margin: 0; color: #374151;">${clubName}</h2>`
    }
  </div>

  <div style="padding: 30px 0;">
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">Validation complète</h1>

    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour ${recipientName},</p>

    <div style="background: #ECFDF5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: #065F46;">
        ✅ Bonne nouvelle ! Votre note de frais a été entièrement approuvée par deux validateurs.
      </p>
    </div>

    <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">📋 Détails</h3>
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
          <td style="padding: 8px 0; color: #6B7280;">1ère validation:</td>
          <td style="padding: 8px 0;">${firstApprover} (${firstApprovalDate})</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">2ème validation:</td>
          <td style="padding: 8px 0;">${secondApprover} (${secondApprovalDate})</td>
        </tr>
      </table>
    </div>

    <div style="background: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px; color: #065F46;">
        ✅ Votre demande est maintenant prête pour le remboursement. Vous serez notifié dès que le virement aura été effectué.
      </p>
    </div>

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
 * Send first approval email to demandeur
 */
async function sendFirstApprovalEmailToDemandeur(db, clubId, expenseData, emailConfig, generalSettings) {
  const { demandeur_id, description, montant, approuve_par_nom, date_approbation } = expenseData;

  // Get demandeur email
  const demandeurDoc = await db.collection('clubs').doc(clubId)
    .collection('members').doc(demandeur_id).get();

  if (!demandeurDoc.exists) {
    console.log('⚠️ Demandeur not found');
    return;
  }

  const demandeur = demandeurDoc.data();
  const recipientEmail = demandeur.email;

  if (!recipientEmail) {
    console.log('⚠️ No email for demandeur');
    return;
  }

  const recipientName = `${demandeur.prenom || ''} ${demandeur.nom || ''}`.trim() || recipientEmail;
  const clubName = generalSettings.clubName || 'Calypso Diving Club';
  const logoUrl = generalSettings.logoUrl || '';
  const appUrl = 'https://caly.club';

  // Generate email
  const subject = `✅ Première approbation reçue - ${description || 'Note de frais'}`;
  const htmlContent = generateFirstApprovalEmailHtml({
    recipientName,
    description: description || 'Note de frais',
    montant: formatMontant(montant),
    approvedBy: approuve_par_nom || 'Validateur',
    approvalDate: formatDate(date_approbation),
    clubName,
    logoUrl,
    appUrl,
  });

  // Send email
  const fromEmail = emailConfig.resend.fromEmail || 'onboarding@resend.dev';
  const fromName = emailConfig.resend.fromName || clubName;
  const from = `${fromName} <${fromEmail}>`;

  console.log(`📧 Sending first approval email to demandeur: ${recipientEmail}...`);

  const result = await sendEmailViaResend(
    emailConfig.resend.apiKey,
    from,
    recipientEmail,
    subject,
    htmlContent
  );

  console.log(`✅ First approval email sent to demandeur: ${result.id}`);

  // Log to email_history
  await db.collection('clubs').doc(clubId).collection('email_history').add({
    recipientEmail,
    recipientName,
    recipientId: demandeur_id,
    emailType: 'expense_first_approval_demandeur',
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

  return result;
}

/**
 * Send second approval needed emails to all other validators
 */
async function sendSecondApprovalNeededToValidators(db, clubId, expenseData, emailConfig, generalSettings) {
  const { demandeur_id, demandeur_nom, description, montant, approuve_par, approuve_par_nom, date_approbation } = expenseData;

  // Get all validators EXCEPT the first approver
  const validatorRoles = ['validateur', 'admin', 'superadmin'];
  const validatorEmails = [];

  for (const role of validatorRoles) {
    const membersSnapshot = await db.collection('clubs').doc(clubId)
      .collection('members')
      .where('app_role', '==', role)
      .get();

    membersSnapshot.docs.forEach(doc => {
      const member = doc.data();

      // Skip first approver (they already approved)
      if (doc.id === approuve_par) {
        console.log(`   ⏭️ Skipping first approver: ${member.prenom} ${member.nom}`);
        return;
      }

      // Skip demandeur (they can't approve their own)
      if (doc.id === demandeur_id) {
        return;
      }

      // Check if active
      const isActive = member.isActive === true || member.app_status === 'active';
      if (!isActive) {
        return;
      }

      if (member.email && !validatorEmails.some(v => v.email === member.email)) {
        validatorEmails.push({
          email: member.email,
          name: `${member.prenom} ${member.nom}`,
          id: doc.id
        });
      }
    });
  }

  if (validatorEmails.length === 0) {
    console.log('⚠️ No other validators found');
    return;
  }

  console.log(`📬 Sending second approval needed to ${validatorEmails.length} validator(s)`);

  const clubName = generalSettings.clubName || 'Calypso Diving Club';
  const logoUrl = generalSettings.logoUrl || '';
  const appUrl = 'https://caly.club';

  const fromEmail = emailConfig.resend.fromEmail || 'onboarding@resend.dev';
  const fromName = emailConfig.resend.fromName || clubName;
  const from = `${fromName} <${fromEmail}>`;

  // Send to each validator
  for (const validator of validatorEmails) {
    const subject = `⏳ Note de frais en attente de votre validation (> 650 €)`;
    const htmlContent = generateSecondApprovalNeededEmailHtml({
      recipientName: validator.name,
      demandeurName: demandeur_nom || 'N/A',
      description: description || 'Note de frais',
      montant: formatMontant(montant),
      firstApprover: approuve_par_nom || 'Validateur',
      approvalDate: formatDate(date_approbation),
      clubName,
      logoUrl,
      appUrl,
    });

    try {
      const result = await sendEmailViaResend(
        emailConfig.resend.apiKey,
        from,
        validator.email,
        subject,
        htmlContent
      );

      console.log(`   ✅ Sent to ${validator.name} (${validator.email}): ${result.id}`);

      // Log to email_history
      await db.collection('clubs').doc(clubId).collection('email_history').add({
        recipientEmail: validator.email,
        recipientName: validator.name,
        recipientId: validator.id,
        emailType: 'expense_second_approval_needed',
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

      // Rate limiting (Resend: max 2 req/sec)
      await sleep(600);

    } catch (error) {
      console.error(`   ❌ Failed to send to ${validator.email}:`, error);
      // Continue with other validators
    }
  }
}

/**
 * Send second approval complete email to demandeur
 */
async function sendSecondApprovalCompleteEmail(db, clubId, expenseData, emailConfig, generalSettings) {
  const {
    demandeur_id,
    description,
    montant,
    approuve_par_nom,         // First approver
    approuve_par_2_nom,       // Second approver
    date_approbation,         // First approval date
    date_approbation_2        // Second approval date
  } = expenseData;

  // Get demandeur email
  const demandeurDoc = await db.collection('clubs').doc(clubId)
    .collection('members').doc(demandeur_id).get();

  if (!demandeurDoc.exists) {
    console.log('⚠️ Demandeur not found');
    return;
  }

  const demandeur = demandeurDoc.data();
  const recipientEmail = demandeur.email;

  if (!recipientEmail) {
    console.log('⚠️ No email for demandeur');
    return;
  }

  const recipientName = `${demandeur.prenom || ''} ${demandeur.nom || ''}`.trim() || recipientEmail;
  const clubName = generalSettings.clubName || 'Calypso Diving Club';
  const logoUrl = generalSettings.logoUrl || '';
  const appUrl = 'https://caly.club';

  // Generate email
  const subject = `✅ Votre note de frais a été entièrement approuvée - ${description || 'Note de frais'}`;
  const htmlContent = generateSecondApprovalCompleteEmailHtml({
    recipientName,
    description: description || 'Note de frais',
    montant: formatMontant(montant),
    firstApprover: approuve_par_nom || 'Validateur 1',
    secondApprover: approuve_par_2_nom || 'Validateur 2',
    firstApprovalDate: formatDate(date_approbation),
    secondApprovalDate: formatDate(date_approbation_2),
    clubName,
    logoUrl,
    appUrl,
  });

  // Send email
  const fromEmail = emailConfig.resend.fromEmail || 'onboarding@resend.dev';
  const fromName = emailConfig.resend.fromName || clubName;
  const from = `${fromName} <${fromEmail}>`;

  console.log(`📧 Sending second approval complete email to demandeur: ${recipientEmail}...`);

  const result = await sendEmailViaResend(
    emailConfig.resend.apiKey,
    from,
    recipientEmail,
    subject,
    htmlContent
  );

  console.log(`✅ Second approval complete email sent: ${result.id}`);

  // Log to email_history
  await db.collection('clubs').doc(clubId).collection('email_history').add({
    recipientEmail,
    recipientName,
    recipientId: demandeur_id,
    emailType: 'expense_second_approval_complete',
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

  return result;
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

    const db = admin.firestore();

    try {
      // Get email configuration from club settings
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

      // Get club settings for branding
      const generalSettingsDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('general')
        .get();

      const generalSettings = generalSettingsDoc.exists ? generalSettingsDoc.data() : {};

      // === HANDLE FIRST APPROVAL (soumis → en_attente_validation) ===
      if (oldStatus === 'soumis' && newStatus === 'en_attente_validation') {
        console.log('🔔 First approval received - sending notifications...');

        // 1. Send email to demandeur
        await sendFirstApprovalEmailToDemandeur(db, clubId, afterData, emailConfig, generalSettings);

        // 2. Send email to other validators
        await sendSecondApprovalNeededToValidators(db, clubId, afterData, emailConfig, generalSettings);

        return { success: true, emailType: 'first_approval' };
      }

      // === HANDLE SECOND APPROVAL (en_attente_validation → approuve) ===
      if (oldStatus === 'en_attente_validation' && newStatus === 'approuve') {
        console.log('🔔 Second approval received - double validation complete!');

        // Send email to demandeur with both approver names
        await sendSecondApprovalCompleteEmail(db, clubId, afterData, emailConfig, generalSettings);

        return { success: true, emailType: 'second_approval_complete' };
      }

      // === HANDLE DIRECT APPROVAL (soumis → approuve, for amounts < 650€) ===
      if (oldStatus === 'soumis' && newStatus === 'approuve') {
        console.log('🔔 Direct approval (single step)');

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

        const clubName = generalSettings.clubName || 'Calypso Diving Club';
        const logoUrl = generalSettings.logoUrl || '';
        const appUrl = 'https://caly.club';

        const subject = `Note de frais approuvée - ${afterData.description || 'Note de frais'}`;
        const htmlContent = generateApprovedEmailHtml({
          recipientName,
          description: afterData.description || afterData.titre || 'Note de frais',
          montant: formatMontant(afterData.montant),
          approvedBy: afterData.approuve_par_nom || afterData.approuve_par || 'Un administrateur',
          approvalDate: formatDate(afterData.date_approbation),
          clubName,
          logoUrl,
          appUrl,
        });

        const fromEmail = emailConfig.resend.fromEmail || 'onboarding@resend.dev';
        const fromName = emailConfig.resend.fromName || clubName;
        const from = `${fromName} <${fromEmail}>`;

        console.log(`📧 [onExpenseStatusChange] Sending approved email to ${recipientEmail}...`);

        const result = await sendEmailViaResend(
          emailConfig.resend.apiKey,
          from,
          recipientEmail,
          subject,
          htmlContent
        );

        console.log(`✅ [onExpenseStatusChange] Email sent successfully: ${result.id}`);

        // Log to email_history
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('email_history')
          .add({
            recipientEmail,
            recipientName,
            recipientId: demandeurId,
            demandeId,
            emailType: 'expense_approved',
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

        return { success: true, messageId: result.id, emailType: 'approved' };
      }

      // === HANDLE REIMBURSEMENT (approuve → rembourse) ===
      if (oldStatus === 'approuve' && newStatus === 'rembourse') {
        console.log('🔔 Expense reimbursed');

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

        const clubName = generalSettings.clubName || 'Calypso Diving Club';
        const logoUrl = generalSettings.logoUrl || '';
        const appUrl = 'https://caly.club';

        const subject = `Note de frais remboursée - ${afterData.description || 'Note de frais'}`;
        const htmlContent = generateReimbursedEmailHtml({
          recipientName,
          description: afterData.description || afterData.titre || 'Note de frais',
          montant: formatMontant(afterData.montant),
          reimbursementDate: formatDate(afterData.date_remboursement || new Date()),
          clubName,
          logoUrl,
          appUrl,
        });

        const fromEmail = emailConfig.resend.fromEmail || 'onboarding@resend.dev';
        const fromName = emailConfig.resend.fromName || clubName;
        const from = `${fromName} <${fromEmail}>`;

        console.log(`📧 [onExpenseStatusChange] Sending reimbursed email to ${recipientEmail}...`);

        const result = await sendEmailViaResend(
          emailConfig.resend.apiKey,
          from,
          recipientEmail,
          subject,
          htmlContent
        );

        console.log(`✅ [onExpenseStatusChange] Email sent successfully: ${result.id}`);

        // Log to email_history
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('email_history')
          .add({
            recipientEmail,
            recipientName,
            recipientId: demandeurId,
            demandeId,
            emailType: 'expense_reimbursed',
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

        return { success: true, messageId: result.id, emailType: 'reimbursed' };
      }

      // No email needed for this transition
      console.log(`📧 [onExpenseStatusChange] No email needed for transition: ${oldStatus} → ${newStatus}`);
      return null;

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
