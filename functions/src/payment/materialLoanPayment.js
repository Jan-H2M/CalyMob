/**
 * EPC QR payment helpers for material-loan cautions.
 *
 * This intentionally is not coupled to event registrations. The callable only
 * accepts a loan id and derives the member, email, amount and communication
 * from Firestore, so a client cannot redirect a QR payment email or lower its
 * amount.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const QRCode = require('qrcode');
const { buildEmailRouting, logEmailHistoryAndCommunication } = require('../utils/communicationTemplates');
const { sendEmailWithConfig } = require('../utils/emailDelivery');

const REGION = 'europe-west1';
const callableOptions = {
  region: REGION,
  memory: '256MiB',
  timeoutSeconds: 60,
  maxInstances: 10,
};

function normalizeRoles(value) {
  return Array.isArray(value)
    ? value.map((role) => String(role || '').trim().toLowerCase())
    : [];
}

function isMaterialLoanManager(member = {}) {
  const appRole = String(member.app_role || member.appRole || '').toLowerCase();
  if (appRole === 'admin' || appRole === 'superadmin') return true;
  const roles = normalizeRoles(member.clubStatuten);
  return roles.some((role) => [
    'encadrant', 'encadrants', 'e', 'ca', 'comite', 'comité', 'gonflage', 'g',
  ].includes(role));
}

function formatAmount(amount) {
  return `${Number(amount).toFixed(2).replace('.', ',')} €`;
}

function formatIban(iban) {
  return String(iban || '').replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}

function buildMaterialLoanEpcPayload({ beneficiaryName, iban, bic = '', amount, reference }) {
  const numericAmount = Number(amount);
  if (!beneficiaryName || !iban || !Number.isFinite(numericAmount) || numericAmount <= 0 || !reference) {
    throw new HttpsError('failed-precondition', 'Les données de paiement de la caution sont incomplètes.');
  }
  const lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    String(bic || '').replace(/\s/g, '').toUpperCase(),
    String(beneficiaryName).trim().substring(0, 70),
    String(iban).replace(/\s/g, '').toUpperCase(),
    `EUR${numericAmount.toFixed(2)}`,
    '',
    '',
    String(reference).trim().substring(0, 140),
    '',
  ];
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join('\n');
}

function renderMaterialLoanPaymentEmail({
  memberName,
  loanNumber,
  amount,
  beneficiaryName,
  iban,
  reference,
  clubName,
}) {
  const safeName = String(memberName || '').trim() || 'membre';
  const amountFormatted = formatAmount(amount);
  const subject = `Caution de ${amountFormatted} — prêt ${loanNumber}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#17365D;max-width:640px;margin:auto">
      <h2 style="margin-bottom:8px">Caution pour votre prêt de matériel</h2>
      <p>Bonjour ${escapeHtml(safeName)},</p>
      <p>Une caution remboursable de <strong>${amountFormatted}</strong> est demandée pour le prêt <strong>${escapeHtml(loanNumber)}</strong>.</p>
      <p>Scannez le QR code avec votre application bancaire ou utilisez les informations suivantes :</p>
      <p style="text-align:center"><img src="cid:qrcode" alt="QR code EPC pour la caution" width="220" height="220"></p>
      <table style="border-collapse:collapse;width:100%;background:#f5f8fc">
        <tr><td style="padding:8px"><strong>Bénéficiaire</strong></td><td style="padding:8px">${escapeHtml(beneficiaryName)}</td></tr>
        <tr><td style="padding:8px"><strong>IBAN</strong></td><td style="padding:8px">${escapeHtml(formatIban(iban))}</td></tr>
        <tr><td style="padding:8px"><strong>Communication</strong></td><td style="padding:8px">${escapeHtml(reference)}</td></tr>
      </table>
      <p>Le matériel peut être remis après confirmation du paiement par le responsable.</p>
      <p>Merci,<br>${escapeHtml(clubName || 'Calypso Diving Club')}</p>
    </div>`;
  return { subject, html };
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function loanReference(loan) {
  return String(loan.caution_reference || `+++${loan.loanNumber || loan.loan_number || ''}+++`).trim();
}

function loanNumber(loan, loanId) {
  return String(loan.loanNumber || loan.loan_number || `PRET-${loanId.slice(0, 8).toUpperCase()}`);
}

function memberEmail(member) {
  return String(member.email || member.email_address || member.emailAddress || '').trim();
}

async function loadMaterialLoanPaymentContext(db, { clubId, loanId, callerUid }) {
  if (!clubId || !loanId) {
    throw new HttpsError('invalid-argument', 'clubId et loanId sont requis.');
  }
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Connexion requise.');
  }

  const clubRef = db.collection('clubs').doc(clubId);
  const [callerDoc, loanDoc, bankDoc, generalDoc] = await Promise.all([
    clubRef.collection('members').doc(callerUid).get(),
    clubRef.collection('inventory_loans').doc(loanId).get(),
    clubRef.collection('settings').doc('bank').get(),
    clubRef.collection('settings').doc('general').get(),
  ]);
  if (!callerDoc.exists || !isMaterialLoanManager(callerDoc.data())) {
    throw new HttpsError('permission-denied', 'Seuls les responsables matériel peuvent gérer cette caution.');
  }
  if (!loanDoc.exists) {
    throw new HttpsError('not-found', 'Prêt matériel introuvable.');
  }
  if (!bankDoc.exists) {
    throw new HttpsError('failed-precondition', 'Les coordonnées bancaires du club ne sont pas configurées.');
  }

  const loan = loanDoc.data();
  const amount = Number(loan.caution_amount ?? loan.montant_caution ?? loan.caution_montant ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError('failed-precondition', 'Ce prêt ne comporte aucune caution à payer.');
  }
  if (loan.caution_payment_status === 'paid' || loan.caution_payee === true) {
    throw new HttpsError('failed-precondition', 'La caution de ce prêt est déjà confirmée.');
  }
  if (!['attente_caution', 'en_attente_paiement'].includes(String(loan.statut || ''))) {
    throw new HttpsError('failed-precondition', 'Ce prêt doit être en attente de caution avant l’envoi du QR.');
  }

  const memberId = String(loan.memberId || loan.member_id || '');
  if (!memberId) {
    throw new HttpsError('failed-precondition', 'Le prêt ne contient pas de membre.');
  }
  const memberDoc = await clubRef.collection('members').doc(memberId).get();
  if (!memberDoc.exists) {
    throw new HttpsError('not-found', 'Membre du prêt introuvable.');
  }
  const bank = bankDoc.data();
  const reference = loanReference(loan);
  const number = loanNumber(loan, loanId);
  const epcPayload = buildMaterialLoanEpcPayload({
    beneficiaryName: bank.beneficiaryName,
    iban: bank.iban,
    bic: bank.bic,
    amount,
    reference,
  });

  return {
    clubRef,
    loanDoc,
    loan,
    memberId,
    member: memberDoc.data(),
    bank,
    general: generalDoc.exists ? generalDoc.data() : {},
    amount,
    reference,
    loanNumber: number,
    epcPayload,
  };
}

const getMaterialLoanPaymentQr = onCall(callableOptions, async (request) => {
  try {
    const context = await loadMaterialLoanPaymentContext(admin.firestore(), {
      clubId: request.data?.clubId,
      loanId: request.data?.loanId,
      callerUid: request.auth?.uid,
    });
    return {
      success: true,
      epcPayload: context.epcPayload,
      loanNumber: context.loanNumber,
      amount: context.amount,
      reference: context.reference,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('[getMaterialLoanPaymentQr]', error);
    throw new HttpsError('internal', error.message || 'Impossible de préparer le QR de caution.');
  }
});

const sendMaterialLoanPaymentQrEmail = onCall(callableOptions, async (request) => {
  try {
    const context = await loadMaterialLoanPaymentContext(admin.firestore(), {
      clubId: request.data?.clubId,
      loanId: request.data?.loanId,
      callerUid: request.auth?.uid,
    });
    const email = memberEmail(context.member);
    if (!email) {
      throw new HttpsError('failed-precondition', 'Le membre ne possède pas d’adresse e-mail.');
    }
    const emailConfigDoc = await context.clubRef.collection('settings').doc('email_config').get();
    if (!emailConfigDoc.exists) {
      throw new HttpsError('failed-precondition', 'La configuration e-mail du club est absente.');
    }
    const emailConfig = emailConfigDoc.data();
    const provider = emailConfig.provider || 'resend';
    const hasGmail = provider === 'gmail'
      && emailConfig.gmail?.clientId
      && emailConfig.gmail?.clientSecret
      && emailConfig.gmail?.fromEmail
      && emailConfig.gmail?.refreshToken;
    const hasResend = provider !== 'gmail'
      && emailConfig.resend?.fromEmail
      && emailConfig.resend?.apiKey;
    const hasFallback = emailConfig.deliveryFallback?.enabled === true
      && emailConfig.deliveryFallback.provider
      && emailConfig.deliveryFallback.provider !== provider;
    if (!hasGmail && !hasResend && !hasFallback) {
      throw new HttpsError('failed-precondition', 'Aucun fournisseur e-mail n’est configuré.');
    }
    const memberName = [context.member.prenom || context.member.firstName, context.member.nom || context.member.lastName]
      .filter(Boolean).join(' ').trim() || context.loan.memberName || context.loan.member_name || '';
    const clubName = context.general.clubName || 'Calypso Diving Club';
    const rendered = renderMaterialLoanPaymentEmail({
      memberName,
      loanNumber: context.loanNumber,
      amount: context.amount,
      beneficiaryName: context.bank.beneficiaryName,
      iban: context.bank.iban,
      reference: context.reference,
      clubName,
    });
    const qrDataUrl = await QRCode.toDataURL(context.epcPayload, {
      errorCorrectionLevel: 'M', type: 'image/png', width: 300, margin: 2,
    });
    const routing = buildEmailRouting(emailConfig, {
      clubId: request.data.clubId,
      entityType: 'inventory_loan',
      entityId: request.data.loanId,
      entityLabel: context.loanNumber,
      recipientEmail: email,
      recipientName: memberName,
    });
    const result = await sendEmailWithConfig(emailConfig, {
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      attachments: [{
        filename: `qr-caution-${context.loanNumber}.png`,
        content: qrDataUrl.replace(/^data:image\/png;base64,/, ''),
        content_id: 'qrcode',
      }],
      replyTo: routing.replyToAddress || undefined,
      headers: routing.headers,
    });
    const now = admin.firestore.FieldValue.serverTimestamp();
    await Promise.all([
      context.loanDoc.ref.update({
        caution_payment_status: 'email_sent',
        caution_email_sent_at: now,
        caution_email_member_id: context.memberId,
        updatedAt: now,
      }),
      context.clubRef.collection('audit_logs').add({
        event_type: 'material_loan_payment_email_sent',
        entity_type: 'inventory_loan',
        entity_id: context.loanDoc.id,
        loan_number: context.loanNumber,
        member_id: context.memberId,
        caution_amount: context.amount,
        actor_id: request.auth.uid,
        createdAt: now,
      }),
      logEmailHistoryAndCommunication(admin.firestore(), request.data.clubId, {
        recipientEmail: email,
        recipientName: memberName,
        htmlContent: rendered.html,
        sendType: 'automated',
        provider: result.provider,
        entityType: 'inventory_loan',
        entityId: context.loanDoc.id,
        entityLabel: context.loanNumber,
        emailType: 'material_loan_payment',
        type: 'material_loan_payment',
        to: email,
        subject: rendered.subject,
        amount: context.amount,
        loanNumber: context.loanNumber,
        messageId: result.messageId,
        status: 'sent',
        createdAt: now,
        sentAt: now,
      }, {
        entityType: 'inventory_loan',
        entityId: context.loanDoc.id,
        entityLabel: context.loanNumber,
        triggerName: 'material_loan_payment',
        sendType: 'automated',
      }),
    ]);
    return { success: true, loanNumber: context.loanNumber };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('[sendMaterialLoanPaymentQrEmail]', error);
    throw new HttpsError('internal', error.message || 'Impossible d’envoyer le QR de caution.');
  }
});

module.exports = {
  buildMaterialLoanEpcPayload,
  getMaterialLoanPaymentQr,
  isMaterialLoanManager,
  renderMaterialLoanPaymentEmail,
  sendMaterialLoanPaymentQrEmail,
};
