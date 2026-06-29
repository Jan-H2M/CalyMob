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
const { isSyncMirrorWrite } = require('../expenses/expenseSync');
const {
  buildEmailRouting,
  logEmailHistoryAndCommunication,
  renderCommunicationTemplate,
  resolveCommunicationTemplate,
} = require('../utils/communicationTemplates');
const { sendEmailWithConfig } = require('../utils/emailDelivery');

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

function getExpenseEntityLabel(expenseData) {
  return expenseData.description || expenseData.titre || 'Note de frais';
}

async function sendTemplatedExpenseEmail({
  db,
  clubId,
  demandeId,
  emailType,
  recipient,
  expenseData,
  emailConfig,
  generalSettings,
  templateDataOverrides = {},
}) {
  const clubName = generalSettings.clubName || 'Calypso Diving Club';
  const logoUrl = generalSettings.logoUrl || '';
  const appUrl = 'https://caly.club';
  const description = getExpenseEntityLabel(expenseData);
  const recipientName = recipient.name || recipient.email;

  const templateData = {
    recipientName,
    firstName: String(recipientName).split(' ')[0] || '',
    demandeurName: expenseData.demandeur_nom || '',
    description,
    montant: formatMontant(expenseData.montant),
    dateDepense: formatDate(expenseData.date_depense),
    fournisseur: expenseData.fournisseur || '',
    categorie: expenseData.categorie || '',
    approvedBy: expenseData.approuve_par_nom || expenseData.approuve_par || 'Validateur',
    firstApprovedBy: expenseData.approuve_par_nom || expenseData.approuve_par || 'Validateur',
    approvalDate: formatDate(expenseData.date_approbation_2 || expenseData.date_approbation),
    firstApprovalDate: formatDate(expenseData.date_approbation),
    reimbursementDate: formatDate(expenseData.date_remboursement || new Date()),
    paymentReference: expenseData.payment_reference || '',
    clubName,
    logoUrl,
    appUrl,
    ...templateDataOverrides,
  };

  const resolvedTemplate = await resolveCommunicationTemplate(db, clubId, emailType, 'allow_system_seed');
  if (resolvedTemplate.warning) {
    console.warn(`[onExpenseStatusChange] ${resolvedTemplate.warning}`);
  }

  const { subject, html: htmlContent } = renderCommunicationTemplate(resolvedTemplate.template, templateData);
  const provider = emailConfig.provider || 'resend';
  const fromEmail = provider === 'gmail' ? emailConfig.gmail?.fromEmail : emailConfig.resend?.fromEmail;
  const fromName = provider === 'gmail'
    ? (emailConfig.gmail?.fromName || clubName)
    : (emailConfig.resend?.fromName || clubName);
  const routing = buildEmailRouting(emailConfig, {
    clubId,
    entityType: 'expense_claim',
    entityId: demandeId,
    entityLabel: description,
    recipientEmail: recipient.email,
    recipientName,
  });

  const result = await sendEmailWithConfig(emailConfig, {
    to: recipient.email,
    subject,
    html: htmlContent,
    replyTo: routing.replyToAddress || undefined,
    replyToName: fromName,
    headers: routing.headers,
  });

  await logEmailHistoryAndCommunication(db, clubId, {
    recipientEmail: recipient.email,
    recipientName,
    recipientId: recipient.id,
    demandeId,
    entityType: 'expense_claim',
    entityId: demandeId,
    entityLabel: description,
    emailType,
    templateId: resolvedTemplate.template.id,
    templateName: resolvedTemplate.template.name,
    templateType: emailType,
    subject,
    htmlContent,
    status: 'sent',
    messageId: result.messageId,
    providerThreadId: result.providerThreadId || null,
    provider: result.provider,
    fallbackUsed: result.fallbackUsed === true,
    attemptedProviders: result.attemptedProviders || null,
    primaryProvider: result.primaryProvider || null,
    fallbackProvider: result.fallbackProvider || null,
    primaryError: result.primaryError || null,
    replyKey: routing.replyKey,
    replyToAddress: routing.replyToAddress,
    fromEmail,
    fromName,
    sendType: 'expense_notification',
    triggerName: emailType,
    sentBy: 'system',
    sentByName: 'Cloud Function',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {
    entityType: 'expense_claim',
    entityId: demandeId,
    entityLabel: description,
    templateId: resolvedTemplate.template.id,
    templateName: resolvedTemplate.template.name,
    templateType: emailType,
    triggerName: emailType,
    sendType: 'automated',
  });

  return result;
}

/**
 * Send first approval email to demandeur
 */
async function sendFirstApprovalEmailToDemandeur(db, clubId, demandeId, expenseData, emailConfig, generalSettings) {
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
  console.log(`📧 Sending first approval email to demandeur: ${recipientEmail}...`);

  const result = await sendTemplatedExpenseEmail({
    db,
    clubId,
    demandeId,
    emailType: 'expense_first_approval_received',
    recipient: { id: demandeur_id, name: recipientName, email: recipientEmail },
    expenseData,
    emailConfig,
    generalSettings,
    templateDataOverrides: {
      approvedBy: approuve_par_nom || 'Validateur',
      approvalDate: formatDate(date_approbation),
    },
  });

  console.log(`✅ First approval email sent to demandeur: ${result.messageId}`);

  return result;
}

/**
 * Send second approval needed emails to all other validators
 */
async function sendSecondApprovalNeededToValidators(db, clubId, demandeId, expenseData, emailConfig, generalSettings) {
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

  // Send to each validator
  for (const validator of validatorEmails) {
    try {
      const result = await sendTemplatedExpenseEmail({
        db,
        clubId,
        demandeId,
        emailType: 'expense_second_approval_needed',
        recipient: { id: validator.id, name: validator.name, email: validator.email },
        expenseData,
        emailConfig,
        generalSettings,
        templateDataOverrides: {
          demandeurName: demandeur_nom || 'N/A',
          firstApprovedBy: approuve_par_nom || 'Validateur',
          approvalDate: formatDate(date_approbation),
        },
      });

      console.log(`   ✅ Sent to ${validator.name} (${validator.email}): ${result.messageId}`);

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
async function sendSecondApprovalCompleteEmail(db, clubId, demandeId, expenseData, emailConfig, generalSettings) {
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
  console.log(`📧 Sending second approval complete email to demandeur: ${recipientEmail}...`);

  const result = await sendTemplatedExpenseEmail({
    db,
    clubId,
    demandeId,
    emailType: 'expense_second_approval_complete',
    recipient: { id: demandeur_id, name: recipientName, email: recipientEmail },
    expenseData,
    emailConfig,
    generalSettings,
    templateDataOverrides: {
      firstApprovedBy: approuve_par_nom || 'Validateur 1',
      approvedBy: approuve_par_2_nom || 'Validateur 2',
      firstApprovalDate: formatDate(date_approbation),
      approvalDate: formatDate(date_approbation_2),
    },
  });

  console.log(`✅ Second approval complete email sent: ${result.messageId}`);

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

    // E-mail-guard: statuswijzigingen door een sync-mirror sturen nooit e-mail.
    if (isSyncMirrorWrite(afterData)) {
      return null;
    }

    const oldStatus = beforeData.statut;
    const newStatus = afterData.statut;

    // Only process status changes
    if (oldStatus === newStatus) {
      return null;
    }

    console.log(`📧 [onExpenseStatusChange] Status changed: ${oldStatus} → ${newStatus} for ${demandeId}`);

    const db = admin.firestore();
    let attemptedEmailType = null;

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
      const provider = emailConfig.provider || 'resend';
      if (provider === 'gmail') {
        if (!emailConfig.gmail?.clientId || !emailConfig.gmail?.clientSecret || !emailConfig.gmail?.refreshToken || !emailConfig.gmail?.fromEmail) {
          console.log('⚠️ [onExpenseStatusChange] Gmail not configured, skipping email');
          return null;
        }
      } else if (!emailConfig.resend?.apiKey || !emailConfig.resend?.fromEmail) {
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
        attemptedEmailType = 'expense_first_approval_received';

        // 1. Send email to demandeur
        await sendFirstApprovalEmailToDemandeur(db, clubId, demandeId, afterData, emailConfig, generalSettings);

        // 2. Send email to other validators
        attemptedEmailType = 'expense_second_approval_needed';
        await sendSecondApprovalNeededToValidators(db, clubId, demandeId, afterData, emailConfig, generalSettings);

        return { success: true, emailType: 'first_approval' };
      }

      // === HANDLE SECOND APPROVAL (en_attente_validation → approuve) ===
      if (oldStatus === 'en_attente_validation' && newStatus === 'approuve') {
        console.log('🔔 Second approval received - double validation complete!');
        attemptedEmailType = 'expense_second_approval_complete';

        // Send email to demandeur with both approver names
        await sendSecondApprovalCompleteEmail(db, clubId, demandeId, afterData, emailConfig, generalSettings);

        return { success: true, emailType: 'second_approval_complete' };
      }

      // === HANDLE DIRECT APPROVAL (soumis → approuve, for amounts < 650€) ===
      if (oldStatus === 'soumis' && newStatus === 'approuve') {
        console.log('🔔 Direct approval (single step)');
        attemptedEmailType = 'expense_approved';

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

        console.log(`📧 [onExpenseStatusChange] Sending approved email to ${recipientEmail}...`);

        const result = await sendTemplatedExpenseEmail({
          db,
          clubId,
          demandeId,
          emailType: 'expense_approved',
          recipient: { id: demandeurId, name: recipientName, email: recipientEmail },
          expenseData: afterData,
          emailConfig,
          generalSettings,
          templateDataOverrides: {
            approvedBy: afterData.approuve_par_nom || afterData.approuve_par || 'Un administrateur',
            approvalDate: formatDate(afterData.date_approbation),
          },
        });

        console.log(`✅ [onExpenseStatusChange] Email sent successfully: ${result.messageId}`);

        return { success: true, messageId: result.messageId, emailType: 'approved' };
      }

      // === HANDLE REIMBURSEMENT (approuve → rembourse) ===
      if (oldStatus === 'approuve' && newStatus === 'rembourse') {
        console.log('🔔 Expense reimbursed');
        attemptedEmailType = 'expense_reimbursed';

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

        console.log(`📧 [onExpenseStatusChange] Sending reimbursed email to ${recipientEmail}...`);

        const result = await sendTemplatedExpenseEmail({
          db,
          clubId,
          demandeId,
          emailType: 'expense_reimbursed',
          recipient: { id: demandeurId, name: recipientName, email: recipientEmail },
          expenseData: afterData,
          emailConfig,
          generalSettings,
          templateDataOverrides: {
            reimbursementDate: formatDate(afterData.date_remboursement || new Date()),
          },
        });

        console.log(`✅ [onExpenseStatusChange] Email sent successfully: ${result.messageId}`);

        return { success: true, messageId: result.messageId, emailType: 'reimbursed' };
      }

      // No email needed for this transition
      console.log(`📧 [onExpenseStatusChange] No email needed for transition: ${oldStatus} → ${newStatus}`);
      return null;

    } catch (error) {
      console.error('❌ [onExpenseStatusChange] Error:', error);

      // Log failure to email_history
      try {
        const failedType = attemptedEmailType || 'expense_status_change';
        await logEmailHistoryAndCommunication(db, clubId, {
          recipientEmail: afterData.demandeur_email || 'unknown',
          recipientName: afterData.demandeur_nom || 'unknown',
          recipientId: afterData.demandeur_id,
          demandeId,
          entityType: 'expense_claim',
          entityId: demandeId,
          entityLabel: getExpenseEntityLabel(afterData),
          emailType: failedType,
          templateType: failedType,
          subject: `Note de frais - ${getExpenseEntityLabel(afterData)}`,
          htmlContent: '',
          status: 'failed',
          statusMessage: error.message,
          sendType: 'expense_notification',
          triggerName: failedType,
          sentBy: 'system',
          sentByName: 'Cloud Function',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {
          entityType: 'expense_claim',
          entityId: demandeId,
          entityLabel: getExpenseEntityLabel(afterData),
          templateType: failedType,
          triggerName: failedType,
          sendType: 'automated',
        });
      } catch (logError) {
        console.error('❌ [onExpenseStatusChange] Error logging failure:', logError);
      }

      throw error;
    }
  }
);
