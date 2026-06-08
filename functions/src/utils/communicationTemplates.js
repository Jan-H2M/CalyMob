const Handlebars = require('handlebars');
const admin = require('firebase-admin');
const crypto = require('node:crypto');

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCommunicationPreview({ bodyPreview, bodyText, bodyHtml, maxLength = 240 }) {
  const raw = bodyPreview || bodyText || stripHtml(bodyHtml);
  const normalized = String(raw || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function normalizeDomain(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/^@/, '');
}

function getInboundReplyDomain(emailConfig) {
  return normalizeDomain(emailConfig?.domain?.inboundDomain)
    || normalizeDomain(emailConfig?.domain?.primaryDomain)
    || normalizeDomain(emailConfig?.inbound?.domain)
    || normalizeDomain(emailConfig?.replyDomain)
    || null;
}

function getReplyLocalPart(emailConfig) {
  const configured = emailConfig?.inbound?.replyLocalPart || emailConfig?.replyLocalPart || 'reply';
  return String(configured || 'reply').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'reply';
}

function createReplyKey({ clubId, entityType, entityId }) {
  const randomPart = crypto.randomBytes(10).toString('hex');
  const readable = [clubId, entityType, entityId]
    .filter(Boolean)
    .map((part) => String(part).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 48))
    .join('.');
  return `${readable}.${randomPart}`;
}

function buildAutoReplyAddress(emailConfig, replyKey) {
  const domain = getInboundReplyDomain(emailConfig);
  if (!domain || !replyKey) return null;
  return `${getReplyLocalPart(emailConfig)}+${replyKey}@${domain}`;
}

function buildProviderHeaders({ clubId, replyKey, entityType, entityId, sourceHistoryId }) {
  const headers = {
    'X-CalyCompta-Club': clubId,
  };

  if (replyKey) headers['X-CalyCompta-Reply-Key'] = replyKey;
  if (entityType) headers['X-CalyCompta-Entity-Type'] = entityType;
  if (entityId) headers['X-CalyCompta-Entity-Id'] = entityId;
  if (sourceHistoryId) headers['X-CalyCompta-Source-History-Id'] = sourceHistoryId;

  return headers;
}

function buildEmailRouting(emailConfig, { clubId, entityType, entityId, entityLabel, recipientEmail, recipientName }) {
  if (!clubId || !entityType || !entityId) {
    return {
      replyKey: null,
      replyToAddress: null,
      headers: buildProviderHeaders({ clubId }),
    };
  }

  const replyKey = createReplyKey({ clubId, entityType, entityId });
  const replyToAddress = buildAutoReplyAddress(emailConfig, replyKey);

  return {
    replyKey,
    replyToAddress,
    route: {
      reply_key: replyKey,
      club_id: clubId,
      entity_type: entityType,
      entity_id: entityId,
      ...(entityLabel ? { entity_label: entityLabel } : {}),
      ...(recipientEmail ? { recipient_email: recipientEmail } : {}),
      ...(recipientName ? { recipient_name: recipientName } : {}),
      ...(replyToAddress ? { reply_to_address: replyToAddress } : {}),
    },
    headers: buildProviderHeaders({ clubId, replyKey, entityType, entityId }),
  };
}

function buildDefaultExpenseHtml(title, body, detailsRows, footer) {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    {{#if logoUrl}}<img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto;">{{else}}<h2 style="margin: 0; color: #374151;">{{clubName}}</h2>{{/if}}
  </div>
  <div style="padding: 30px 0;">
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">${title}</h1>
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour {{recipientName}},</p>
    <p>${body}</p>
    <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Détails</h3>
      <table style="width: 100%;">
        ${detailsRows}
      </table>
    </div>
    ${footer}
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{appUrl}}/depenses" style="display: inline-block; background: #F97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">Voir mes demandes</a>
    </div>
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
    <p style="font-size: 14px; margin: 0;">Cordialement,<br><strong>{{clubName}}</strong></p>
  </div>
</body>
</html>`.trim();
}

const BASE_EXPENSE_ROWS = `
<tr><td style="padding: 8px 0; color: #6B7280;">Description:</td><td style="padding: 8px 0; font-weight: 600;">{{description}}</td></tr>
<tr><td style="padding: 8px 0; color: #6B7280;">Montant:</td><td style="padding: 8px 0; font-weight: 600; color: #059669;">{{montant}} EUR</td></tr>`;

const SYSTEM_SEED_TEMPLATES = {
  expense_submitted: {
    name: 'System seed expense submitted',
    subject: 'Note de frais enregistrée - {{description}}',
    htmlContent: buildDefaultExpenseHtml(
      'Note de frais enregistrée',
      'Votre note de frais a bien été enregistrée et est en attente de validation.',
      `${BASE_EXPENSE_ROWS}
<tr><td style="padding: 8px 0; color: #6B7280;">Date de dépense:</td><td style="padding: 8px 0;">{{dateDepense}}</td></tr>
{{#if fournisseur}}<tr><td style="padding: 8px 0; color: #6B7280;">Fournisseur:</td><td style="padding: 8px 0;">{{fournisseur}}</td></tr>{{/if}}`,
      '<p style="color: #6B7280; font-size: 14px;">Vous recevrez une notification dès que votre demande sera traitée.</p>'
    ),
  },
  expense_approved: {
    name: 'System seed expense approved',
    subject: 'Note de frais approuvée - {{description}}',
    htmlContent: buildDefaultExpenseHtml(
      'Note de frais approuvée',
      'Bonne nouvelle, votre note de frais a été approuvée.',
      `${BASE_EXPENSE_ROWS}
<tr><td style="padding: 8px 0; color: #6B7280;">Approuvé par:</td><td style="padding: 8px 0;">{{approvedBy}}</td></tr>
<tr><td style="padding: 8px 0; color: #6B7280;">Date d'approbation:</td><td style="padding: 8px 0;">{{approvalDate}}</td></tr>`,
      '<p style="color: #6B7280; font-size: 14px;">Le remboursement sera effectué dans les plus brefs délais.</p>'
    ),
  },
  expense_reimbursed: {
    name: 'System seed expense reimbursed',
    subject: 'Note de frais remboursée - {{description}}',
    htmlContent: buildDefaultExpenseHtml(
      'Note de frais remboursée',
      'Votre note de frais a été remboursée.',
      `${BASE_EXPENSE_ROWS}
<tr><td style="padding: 8px 0; color: #6B7280;">Date de remboursement:</td><td style="padding: 8px 0;">{{reimbursementDate}}</td></tr>`,
      '<p style="color: #6B7280; font-size: 14px;">Le montant devrait apparaître sur votre compte bancaire dans les prochains jours.</p>'
    ),
  },
  expense_first_approval_received: {
    name: 'System seed first approval received',
    subject: 'Première approbation reçue - {{description}}',
    htmlContent: buildDefaultExpenseHtml(
      'Première validation effectuée',
      '{{approvedBy}} a approuvé votre note de frais. Une deuxième approbation peut encore être requise.',
      `${BASE_EXPENSE_ROWS}
<tr><td style="padding: 8px 0; color: #6B7280;">Approuvé par:</td><td style="padding: 8px 0;">{{approvedBy}}</td></tr>
<tr><td style="padding: 8px 0; color: #6B7280;">Date:</td><td style="padding: 8px 0;">{{approvalDate}}</td></tr>`,
      '<p style="color: #6B7280; font-size: 14px;">Vous serez notifié dès que la validation finale sera effectuée.</p>'
    ),
  },
  expense_second_approval_needed: {
    name: 'System seed second approval needed',
    subject: 'Deuxième approbation requise - {{description}}',
    htmlContent: buildDefaultExpenseHtml(
      'Deuxième validation requise',
      'Une note de frais nécessite une deuxième approbation.',
      `${BASE_EXPENSE_ROWS}
<tr><td style="padding: 8px 0; color: #6B7280;">Demandeur:</td><td style="padding: 8px 0;">{{demandeurName}}</td></tr>
<tr><td style="padding: 8px 0; color: #6B7280;">Première validation:</td><td style="padding: 8px 0;">{{firstApprovedBy}} ({{approvalDate}})</td></tr>`,
      '<p style="color: #6B7280; font-size: 14px;">Merci de vérifier cette demande dans CalyCompta.</p>'
    ),
  },
  expense_second_approval_complete: {
    name: 'System seed second approval complete',
    subject: 'Note de frais entièrement approuvée - {{description}}',
    htmlContent: buildDefaultExpenseHtml(
      'Validation complète',
      'Votre note de frais a été entièrement approuvée.',
      `${BASE_EXPENSE_ROWS}
<tr><td style="padding: 8px 0; color: #6B7280;">1ère validation:</td><td style="padding: 8px 0;">{{firstApprovedBy}} ({{firstApprovalDate}})</td></tr>
<tr><td style="padding: 8px 0; color: #6B7280;">2ème validation:</td><td style="padding: 8px 0;">{{approvedBy}} ({{approvalDate}})</td></tr>`,
      '<p style="color: #6B7280; font-size: 14px;">Votre demande est maintenant prête pour le remboursement.</p>'
    ),
  },
  membership_payment: {
    name: 'System seed membership payment',
    subject: 'Cotisation {{seasonLabel}} - {{amountFormatted}}',
    htmlContent: `
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    {{#if logoUrl}}<img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto;">{{else}}<h2 style="margin: 0; color: #374151;">{{clubName}}</h2>{{/if}}
  </div>
  <h1 style="font-size: 22px; color: #111827;">Paiement de cotisation</h1>
  <p>Bonjour {{recipientName}},</p>
  <p>Votre paiement de cotisation est prêt.</p>
  <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <p><strong>Saison:</strong> {{seasonLabel}}</p>
    <p><strong>Tarif:</strong> {{tariffLabel}}</p>
    <p><strong>Période:</strong> {{periodLabel}}</p>
    <p><strong>Montant:</strong> {{amountFormatted}}</p>
    <p><strong>Communication:</strong> {{communication}}</p>
    <p><strong>IBAN:</strong> {{iban}}</p>
    <p><strong>Bénéficiaire:</strong> {{beneficiary}}</p>
  </div>
  <p>Le QR code de paiement est joint à cet email.</p>
  <p>Cordialement,<br><strong>{{clubName}}</strong></p>
</body>
</html>`.trim(),
  },
  boutique_order_payment: {
    name: 'System seed boutique order payment',
    subject: 'Commande {{orderNumber}} - {{amountFormatted}}',
    htmlContent: `
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    {{#if logoUrl}}<img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto;">{{else}}<h2 style="margin: 0; color: #374151;">{{clubName}}</h2>{{/if}}
  </div>
  <h1 style="font-size: 22px; color: #111827;">Paiement de commande</h1>
  <p>Bonjour {{recipientName}},</p>
  <p>Votre commande {{orderNumber}} est enregistrée et prête à payer.</p>
  <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <p><strong>Commande:</strong> {{orderNumber}}</p>
    <p><strong>Montant:</strong> {{amountFormatted}}</p>
    <p><strong>Communication:</strong> {{communication}}</p>
    {{#if items.length}}
      <p><strong>Articles:</strong></p>
      <ul>
        {{#each items}}<li>{{name}} x {{quantity}}</li>{{/each}}
      </ul>
    {{/if}}
  </div>
  <p>Le QR code de paiement est joint à cet email.</p>
  <p>Cordialement,<br><strong>{{clubName}}</strong></p>
</body>
</html>`.trim(),
  },
  event_payment: {
    name: 'System seed event payment',
    subject: 'Paiement pour {{eventTitle}} - {{amountFormatted}}',
    htmlContent: `
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    {{#if logoUrl}}<img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto;">{{else}}<h2 style="margin: 0; color: #374151;">{{clubName}}</h2>{{/if}}
  </div>
  <h1 style="font-size: 22px; color: #111827;">Paiement pour {{eventTitle}}</h1>
  <p>Bonjour {{recipientName}},</p>
  <p>Votre paiement est prêt.</p>
  <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <p><strong>Activité:</strong> {{eventTitle}}</p>
    {{#if eventDate}}<p><strong>Date:</strong> {{eventDate}}</p>{{/if}}
    {{#if installmentLabel}}<p><strong>Échéance:</strong> {{installmentLabel}}</p>{{/if}}
    <p><strong>Montant:</strong> {{amountFormatted}}</p>
    <p><strong>Communication:</strong> {{paymentReference}}</p>
    <p><strong>IBAN:</strong> {{ibanFormatted}}</p>
    <p><strong>Bénéficiaire:</strong> {{beneficiaryName}}</p>
  </div>
  <p>Le QR code de paiement est joint à cet email.</p>
  <p>Cordialement,<br><strong>{{clubName}}</strong></p>
</body>
</html>`.trim(),
  },
};

async function resolveCommunicationTemplate(db, clubId, emailType, fallbackPolicy = 'allow_system_seed') {
  const snapshot = await db
    .collection('clubs')
    .doc(clubId)
    .collection('email_templates')
    .where('emailType', '==', emailType)
    .get();

  const templates = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const activeTemplates = templates.filter((template) => template.isActive !== false);
  const defaultTemplates = activeTemplates.filter((template) => template.isDefault === true);

  if (defaultTemplates.length === 1) {
    return { template: defaultTemplates[0], source: 'default' };
  }

  if (defaultTemplates.length > 1) {
    throw new Error(`Configuration invalide: plusieurs templates par défaut pour ${emailType}`);
  }

  if (activeTemplates.length === 1) {
    return {
      template: activeTemplates[0],
      source: 'sole_active',
      warning: `Aucun template par défaut pour ${emailType}; utilisation du seul template actif.`,
    };
  }

  if (activeTemplates.length > 1) {
    throw new Error(`Configuration invalide: plusieurs templates actifs sans défaut pour ${emailType}`);
  }

  if (fallbackPolicy === 'allow_system_seed' && SYSTEM_SEED_TEMPLATES[emailType]) {
    const seed = SYSTEM_SEED_TEMPLATES[emailType];
    return {
      template: {
        id: `system-seed:${emailType}`,
        emailType,
        isActive: true,
        isDefault: false,
        ...seed,
      },
      source: 'system_seed',
      warning: `Aucun template Firestore trouvé; system seed utilisé pour ${emailType}.`,
    };
  }

  throw new Error(`Aucun template actif disponible pour ${emailType}`);
}

function renderCommunicationTemplate(template, data) {
  const subject = Handlebars.compile(template.subject || '')(data);
  const html = Handlebars.compile(template.htmlContent || '')(data);
  const unreplacedVariables = `${subject} ${html}`.match(/\{\{[^}]+\}\}/g) || [];

  if (unreplacedVariables.length > 0) {
    throw new Error(`Variables non remplacées dans le template: ${Array.from(new Set(unreplacedVariables)).join(', ')}`);
  }

  return { subject, html };
}

async function saveCommunicationEntry(db, clubId, input) {
  if (!clubId || !input.entityType || !input.entityId) return null;

  const now = admin.firestore.FieldValue.serverTimestamp();
  const bodyPreview = buildCommunicationPreview({
    bodyPreview: input.bodyPreview,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
  });

  const docRef = await db.collection('clubs').doc(clubId).collection('communication_entries').add({
    club_id: clubId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    ...(input.entityLabel ? { entity_label: input.entityLabel } : {}),
    channel: input.channel || 'email',
    direction: input.direction || 'outbound',
    ...(input.subject ? { subject: input.subject } : {}),
    body_preview: bodyPreview || input.subject || '(Sans contenu)',
    ...(input.bodyHtml ? { body_html: input.bodyHtml } : {}),
    ...(input.bodyText ? { body_text: input.bodyText } : {}),
    ...(input.recipientId ? { recipient_id: input.recipientId } : {}),
    ...(input.recipientName ? { recipient_name: input.recipientName } : {}),
    ...(input.recipientEmail ? { recipient_email: input.recipientEmail } : {}),
    status: input.status || 'sent',
    ...(input.statusMessage ? { status_message: input.statusMessage } : {}),
    ...(input.templateId ? { template_id: input.templateId } : {}),
    ...(input.templateName ? { template_name: input.templateName } : {}),
    ...(input.templateType ? { template_type: input.templateType } : {}),
    ...(input.sourceHistoryId ? { source_history_id: input.sourceHistoryId } : {}),
    ...(input.providerMessageId ? { provider_message_id: input.providerMessageId } : {}),
    ...(input.providerThreadId ? { provider_thread_id: input.providerThreadId } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.fallbackUsed ? { fallback_used: true } : {}),
    ...(input.attemptedProviders ? { provider_attempts: input.attemptedProviders } : {}),
    ...(input.primaryError ? { primary_provider_error: input.primaryError } : {}),
    ...(input.replyKey ? { reply_key: input.replyKey } : {}),
    ...(input.replyToAddress ? { reply_to_address: input.replyToAddress } : {}),
    ...(input.fromEmail ? { from_email: input.fromEmail } : {}),
    ...(input.fromName ? { from_name: input.fromName } : {}),
    ...(input.senderIdentityId ? { sender_identity_id: input.senderIdentityId } : {}),
    send_type: input.sendType || 'automated',
    ...(input.triggerName ? { trigger_name: input.triggerName } : {}),
    sent_by: input.sentBy || 'system',
    sent_by_name: input.sentByName || 'Cloud Function',
    ...(input.status === 'failed' ? {} : { sent_at: now }),
    created_at: now,
  });

  return docRef.id;
}

async function logEmailHistoryAndCommunication(db, clubId, historyInput, communicationInput = {}) {
  const historyRef = await db.collection('clubs').doc(clubId).collection('email_history').add({
    ...historyInput,
    clubId,
  });

  await saveCommunicationEntry(db, clubId, {
    channel: 'email',
    direction: 'outbound',
    entityType: communicationInput.entityType || historyInput.entityType || (historyInput.demandeId ? 'expense_claim' : undefined),
    entityId: communicationInput.entityId || historyInput.entityId || historyInput.demandeId,
    entityLabel: communicationInput.entityLabel || historyInput.entityLabel,
    recipientId: historyInput.recipientId,
    recipientName: historyInput.recipientName,
    recipientEmail: historyInput.recipientEmail,
    subject: historyInput.subject,
    bodyHtml: historyInput.htmlContent,
    status: historyInput.status,
    statusMessage: historyInput.statusMessage,
    templateId: communicationInput.templateId || historyInput.templateId,
    templateName: communicationInput.templateName || historyInput.templateName,
    templateType: communicationInput.templateType || historyInput.templateType || historyInput.emailType,
    sourceHistoryId: historyRef.id,
    providerMessageId: historyInput.messageId,
    providerThreadId: historyInput.providerThreadId,
    provider: historyInput.provider || 'resend',
    fallbackUsed: historyInput.fallbackUsed,
    attemptedProviders: historyInput.attemptedProviders,
    primaryError: historyInput.primaryError,
    replyKey: historyInput.replyKey,
    replyToAddress: historyInput.replyToAddress,
    fromEmail: historyInput.fromEmail,
    fromName: historyInput.fromName,
    senderIdentityId: historyInput.identityId || historyInput.senderIdentityId,
    sendType: communicationInput.sendType || historyInput.sendType || 'automated',
    triggerName: communicationInput.triggerName || historyInput.triggerName || historyInput.emailType,
    sentBy: historyInput.sentBy || 'system',
    sentByName: historyInput.sentByName || 'Cloud Function',
  });

  if (historyInput.replyKey && (communicationInput.entityType || historyInput.entityType) && (communicationInput.entityId || historyInput.entityId)) {
    await db.collection('email_reply_routes').doc(historyInput.replyKey).set({
      reply_key: historyInput.replyKey,
      club_id: clubId,
      entity_type: communicationInput.entityType || historyInput.entityType,
      entity_id: communicationInput.entityId || historyInput.entityId,
      ...(communicationInput.entityLabel || historyInput.entityLabel ? { entity_label: communicationInput.entityLabel || historyInput.entityLabel } : {}),
      ...(historyInput.recipientEmail ? { recipient_email: historyInput.recipientEmail } : {}),
      ...(historyInput.recipientName ? { recipient_name: historyInput.recipientName } : {}),
      source_history_id: historyRef.id,
      ...(historyInput.messageId ? { provider_message_id: historyInput.messageId } : {}),
      ...(historyInput.providerThreadId ? { provider_thread_id: historyInput.providerThreadId } : {}),
      ...(historyInput.replyToAddress ? { reply_to_address: historyInput.replyToAddress } : {}),
      ...(historyInput.identityId || historyInput.senderIdentityId ? { sender_identity_id: historyInput.identityId || historyInput.senderIdentityId } : {}),
      provider: historyInput.provider || 'resend',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      last_outbound_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return historyRef.id;
}

module.exports = {
  buildEmailRouting,
  buildProviderHeaders,
  buildAutoReplyAddress,
  createReplyKey,
  resolveCommunicationTemplate,
  renderCommunicationTemplate,
  saveCommunicationEntry,
  logEmailHistoryAndCommunication,
};
