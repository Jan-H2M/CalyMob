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
const {
  buildEmailRouting,
  logEmailHistoryAndCommunication,
  renderCommunicationTemplate,
  resolveCommunicationTemplate,
} = require('../utils/communicationTemplates');
const { sendEmailWithConfig } = require('../utils/emailDelivery');
const { isLegacyMirrorWrite } = require('../expenses/expenseSync');
const { memberDisplayName, memberFirstName } = require('../utils/memberName');

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

    // E-mail-guard: enkel forward-mirror-echo's (legacy->canonical) overslaan.
    // Web-wijzigingen komen als canonical-mirror binnen en MOETEN nog mailen.
    if (isLegacyMirrorWrite(demande)) {
      console.log('📧 [onExpenseCreated] forward-mirror-echo — e-mail overgeslagen');
      return null;
    }

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

      const recipientName = memberDisplayName(member, recipientEmail);

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

      const provider = emailConfig.provider || 'resend';
      if (provider === 'gmail') {
        if (!emailConfig.gmail?.clientId || !emailConfig.gmail?.clientSecret || !emailConfig.gmail?.refreshToken || !emailConfig.gmail?.fromEmail) {
          console.log('⚠️ [onExpenseCreated] Gmail not configured, skipping email');
          return null;
        }
      } else if (!emailConfig.resend?.apiKey || !emailConfig.resend?.fromEmail) {
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

      // 4. Resolve and render email content
      const emailType = 'expense_submitted';
      const templateData = {
        recipientName,
        firstName: memberFirstName(member) || recipientName.split(' ')[0] || '',
        description: demande.description || demande.titre || 'Note de frais',
        montant: formatMontant(demande.montant),
        dateDepense: formatDate(demande.date_depense),
        fournisseur: demande.fournisseur || '',
        categorie: demande.categorie || '',
        clubName,
        logoUrl,
        appUrl,
        paymentReference: paymentReference || demande.payment_reference || '',
      };
      const resolvedTemplate = await resolveCommunicationTemplate(db, clubId, emailType, 'allow_system_seed');
      if (resolvedTemplate.warning) {
        console.warn(`[onExpenseCreated] ${resolvedTemplate.warning}`);
      }
      const { subject, html: htmlContent } = renderCommunicationTemplate(resolvedTemplate.template, templateData);

      // 5. Send email via Resend
      const fromEmail = provider === 'gmail' ? emailConfig.gmail.fromEmail : emailConfig.resend.fromEmail;
      const fromName = provider === 'gmail' ? (emailConfig.gmail.fromName || clubName) : (emailConfig.resend.fromName || clubName);
      const entityLabel = demande.description || demande.titre || 'Note de frais';
      const routing = buildEmailRouting(emailConfig, {
        clubId,
        entityType: 'expense_claim',
        entityId: demandeId,
        entityLabel,
        recipientEmail,
        recipientName,
      });

      console.log(`📧 [onExpenseCreated] Sending email to ${recipientEmail}...`);

      const result = await sendEmailWithConfig(emailConfig, {
        to: recipientEmail,
        subject,
        html: htmlContent,
        replyTo: routing.replyToAddress || undefined,
        replyToName: fromName,
        headers: routing.headers,
      });

      console.log(`✅ [onExpenseCreated] Email sent successfully: ${result.messageId}`);

      // 6. Log to email_history and communication_entries
      await logEmailHistoryAndCommunication(db, clubId, {
        recipientEmail,
        recipientName,
        recipientId: demandeurId,
        demandeId,
        entityType: 'expense_claim',
        entityId: demandeId,
        entityLabel: demande.description || demande.titre || 'Note de frais',
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
        entityLabel,
        templateId: resolvedTemplate.template.id,
        templateName: resolvedTemplate.template.name,
        templateType: emailType,
        triggerName: emailType,
        sendType: 'automated',
      });

      console.log(`✅ [onExpenseCreated] Email logged to email_history`);

      return { success: true, messageId: result.messageId };

    } catch (error) {
      console.error('❌ [onExpenseCreated] Error:', error);

      // Log failure to email_history
      try {
        await logEmailHistoryAndCommunication(db, clubId, {
          recipientEmail: demande.demandeur_email || 'unknown',
          recipientName: demande.demandeur_nom || 'unknown',
          recipientId: demande.demandeur_id,
          demandeId,
          entityType: 'expense_claim',
          entityId: demandeId,
          entityLabel: demande.description || demande.titre || 'Note de frais',
          emailType: 'expense_submitted',
          subject: `Note de frais enregistrée - ${demande.description || 'Note de frais'}`,
          htmlContent: '',
          status: 'failed',
          statusMessage: error.message,
          sendType: 'expense_notification',
          triggerName: 'expense_submitted',
          sentBy: 'system',
          sentByName: 'Cloud Function',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {
          entityType: 'expense_claim',
          entityId: demandeId,
          entityLabel: demande.description || demande.titre || 'Note de frais',
          templateType: 'expense_submitted',
          triggerName: 'expense_submitted',
          sendType: 'automated',
        });
      } catch (logError) {
        console.error('❌ [onExpenseCreated] Error logging failure:', logError);
      }

      throw error;
    }
  }
);
