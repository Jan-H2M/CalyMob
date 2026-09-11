const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');
const { buildEmailRouting, logEmailHistoryAndCommunication } = require('../utils/communicationTemplates');
const { sendEmailWithConfig } = require('../utils/emailDelivery');

const options = { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60, maxInstances: 10 };
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const memberEmail = (member = {}) => String(member.email || member.email_address || member.emailAddress || '').trim();
const canManage = (member = {}) => (member.clubStatuten || []).map((r) => String(r).toLowerCase()).some((r) => r === 'g' || r === 'gonflage') || ['admin', 'superadmin'].includes(String(member.app_role || '').toLowerCase());
const pdfColor = '#17365D';

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateLabel(value) {
  const date = asDate(value);
  return date ? new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels' }).format(date) : 'Non précisée';
}

function dateTimeLabel(value) {
  const date = asDate(value);
  if (!date) return 'Non précisée';
  const day = new Intl.DateTimeFormat('fr-BE', {
    timeZone: 'Europe/Brussels',
  }).format(date);
  const time = new Intl.DateTimeFormat('fr-BE', {
    timeZone: 'Europe/Brussels',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return `${day} à ${time}`;
}

function loanNumberFor(loan, loanId) {
  return String(loan.loanNumber || loan.loan_number || `PRET-${loanId.slice(0, 8).toUpperCase()}`);
}

function materialLabel(item = {}) {
  const parts = [item.code ? `CDC ${item.code}` : '', item.nom || item.name || item.category || '', item.variant || item.option || ''].filter(Boolean);
  return parts.join(' - ') || 'Matériel enregistré sur la fiche';
}

function allLoanMaterial(loan = {}) {
  const tracked = Array.isArray(loan.items_snapshot) ? loan.items_snapshot : [];
  const nonTracked = Array.isArray(loan.non_tracked_lines) ? loan.non_tracked_lines : [];
  return [
    ...tracked.map(materialLabel),
    ...nonTracked.map((line) => {
      const lead = Number(line.lead_kg || line.leadKg || 0);
      return [line.category || line.label || 'Matériel', line.option || line.variant || '', lead > 0 ? `${lead} kg de lest` : ''].filter(Boolean).join(' - ');
    }),
  ];
}

async function downloadImage(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn('[material-loan-receipt] Image unavailable for PDF:', error.message);
    return null;
  }
}

function addPdfHeader(doc, { clubName, logoBuffer, loanNumber }) {
  if (logoBuffer) {
    try { doc.image(logoBuffer, 50, 40, { fit: [135, 58] }); } catch (_) { /* Invalid logo is not a reason to reject a signed loan. */ }
  }
  doc.fillColor(pdfColor).font('Helvetica-Bold').fontSize(18).text(clubName, 210, 46, { width: 335, align: 'right' });
  doc.fillColor('#52637A').font('Helvetica').fontSize(10).text('FICHE DE REMISE DE MATÉRIEL', 210, 72, { width: 335, align: 'right' });
  doc.moveTo(50, 112).lineTo(545, 112).strokeColor('#A8C9E8').stroke();
  doc.fillColor(pdfColor).font('Helvetica-Bold').fontSize(16).text(`Prêt ${loanNumber}`, 50, 132);
}

async function buildHandoverReceiptPdf({ clubName, logoUrl, memberName, loan, loanId }) {
  const [logoBuffer, signatureBuffer] = await Promise.all([
    downloadImage(logoUrl),
    downloadImage(loan.handover_receipt?.signature_url),
  ]);
  const receipt = loan.handover_receipt || {};
  const material = allLoanMaterial(loan);
  const number = loanNumberFor(loan, loanId);
  const chunks = [];
  const doc = new PDFDocument({ size: 'A4', margins: { top: 45, bottom: 50, left: 50, right: 50 }, info: { Title: `Fiche de remise ${number}`, Author: clubName } });
  doc.on('data', (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });

  addPdfHeader(doc, { clubName, logoBuffer, loanNumber: number });
  doc.fillColor('#1E293B').font('Helvetica').fontSize(11);
  doc.text(`Membre : ${memberName}`, 50, 166);
  doc.text(`Date et heure de remise : ${dateTimeLabel(receipt.signed_at || loan.date_pret)}`, 50, 184);
  doc.text(`Retour prévu : ${dateLabel(loan.date_retour_prevue || loan.expectedReturnDate)}`, 50, 202);
  doc.text(`Émis par : ${loan.createdByName || loan.created_by_name || 'Responsable Gonflage'}`, 50, 220);
  doc.moveTo(50, 246).lineTo(545, 246).strokeColor('#D9E5F1').stroke();
  doc.fillColor(pdfColor).font('Helvetica-Bold').fontSize(13).text('Matériel remis', 50, 262);
  doc.fillColor('#1E293B').font('Helvetica').fontSize(10.5);
  material.forEach((label) => doc.text(`-  ${label}`, 62, undefined, { width: 470, lineGap: 3 }));

  doc.moveDown(1.2);
  doc.fillColor(pdfColor).font('Helvetica-Bold').fontSize(13).text('Conditions de prêt acceptées');
  doc.fillColor('#1E293B').font('Helvetica').fontSize(9.5).text(receipt.terms_text || '', { width: 495, lineGap: 3, align: 'left' });
  if (doc.y > 615) doc.addPage();
  doc.moveDown(1.2);
  doc.fillColor(pdfColor).font('Helvetica-Bold').fontSize(13).text('Signature du membre');
  doc.fillColor('#1E293B').font('Helvetica').fontSize(10).text(`Signé électroniquement par ${receipt.signed_by_name || memberName} le ${dateTimeLabel(receipt.signed_at)}.`, { lineGap: 3 });
  const signatureTop = doc.y + 12;
  doc.roundedRect(50, signatureTop, 300, 104, 6).lineWidth(1).strokeColor('#A8C9E8').stroke();
  if (signatureBuffer) {
    try { doc.image(signatureBuffer, 62, signatureTop + 10, { fit: [276, 82], align: 'center', valign: 'center' }); } catch (_) { doc.fillColor('#64748B').fontSize(9).text('Signature enregistrée', 62, signatureTop + 42); }
  } else {
    doc.fillColor('#64748B').fontSize(9).text('Signature électronique enregistrée', 62, signatureTop + 42);
  }
  doc.fillColor('#64748B').font('Helvetica').fontSize(8).text(`${clubName} - copie électronique de la remise`, 50, 775, { width: 495, align: 'center' });
  doc.end();
  return completed;
}

function renderedReceipt({ clubName, logoUrl, memberName, loan, loanId }) {
  const number = loanNumberFor(loan, loanId);
  const returnDate = dateLabel(loan.date_retour_prevue || loan.expectedReturnDate);
  const safeLogoUrl = String(logoUrl || '').trim();
  const subject = `Copie de votre prêt de matériel — ${number}`;
  return { subject, html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#17365D;max-width:680px;margin:auto;padding:24px"><div style="padding-bottom:18px;border-bottom:3px solid #7DB8E8">${safeLogoUrl ? `<img src="${escapeHtml(safeLogoUrl)}" alt="${escapeHtml(clubName)}" style="max-width:180px;max-height:70px">` : `<strong style="font-size:20px">${escapeHtml(clubName)}</strong>`}</div><h2 style="margin:24px 0 8px">Votre prêt est confirmé</h2><p>Bonjour ${escapeHtml(memberName)},</p><p>Vous avez reçu le matériel du prêt <strong>${escapeHtml(number)}</strong>. Merci de le rapporter au plus tard le <strong>${escapeHtml(returnDate)}</strong>.</p><p>La fiche complète, avec le matériel remis, les conditions acceptées et votre signature, est jointe à cet e-mail.</p><p style="color:#52637A;font-size:12px;margin-top:28px">${escapeHtml(clubName)}</p></div>` };
}

const sendMaterialLoanHandoverReceipt = onCall(options, async (request) => {
  const { clubId, loanId } = request.data || {};
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  if (!clubId || !loanId) throw new HttpsError('invalid-argument', 'clubId et loanId sont requis.');
  const db = admin.firestore();
  const clubRef = db.collection('clubs').doc(clubId);
  const [callerDoc, loanDoc, generalDoc, emailConfigDoc] = await Promise.all([
    clubRef.collection('members').doc(request.auth.uid).get(),
    clubRef.collection('inventory_loans').doc(loanId).get(),
    clubRef.collection('settings').doc('general').get(),
    clubRef.collection('settings').doc('email_config').get(),
  ]);
  if (!callerDoc.exists || !canManage(callerDoc.data())) throw new HttpsError('permission-denied', 'Réservé aux responsables Gonflage.');
  if (!loanDoc.exists) throw new HttpsError('not-found', 'Prêt introuvable.');
  const loan = loanDoc.data();
  if (!loan.handover_receipt?.signature_url || !loan.handover_receipt?.terms_text) throw new HttpsError('failed-precondition', 'La signature du membre est requise.');
  const memberId = String(loan.memberId || loan.member_id || '');
  const memberDoc = memberId ? await clubRef.collection('members').doc(memberId).get() : null;
  const email = String(loan.memberEmail || memberEmail(memberDoc?.data())).trim();
  if (!email) throw new HttpsError('failed-precondition', 'Adresse e-mail du membre absente.');
  if (!emailConfigDoc.exists) throw new HttpsError('failed-precondition', 'Configuration e-mail absente.');
  const config = emailConfigDoc.data();
  const general = generalDoc.data() || {};
  const clubName = String(general.clubName || general.club_name || 'Calypso Diving Club');
  const logoUrl = String(general.logoUrl || general.logo_url || '').trim();
  const memberName = String(loan.memberName || loan.member_name || memberDoc?.data()?.displayName || 'membre');
  const rendered = renderedReceipt({ clubName, logoUrl, memberName, loan, loanId });
  const loanNumber = loanNumberFor(loan, loanId);
  const receiptPdf = await buildHandoverReceiptPdf({ clubName, logoUrl, memberName, loan, loanId });
  const routing = buildEmailRouting(config, {
    clubId,
    entityType: 'inventory_loan',
    entityId: loanId,
    entityLabel: loanNumber,
    recipientEmail: email,
    recipientName: memberName,
  });
  const result = await sendEmailWithConfig(config, {
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    attachments: [{ filename: `fiche-remise-${loanNumber}.pdf`, content: receiptPdf }],
    replyTo: routing.replyToAddress || undefined,
    headers: routing.headers,
  });
  const now = admin.firestore.FieldValue.serverTimestamp();
  await Promise.all([
    loanDoc.ref.update({ 'handover_receipt.email_sent_at': now, 'handover_receipt.email_provider': result.provider || null, 'handover_receipt.email_message_id': result.messageId || null, updatedAt: now }),
    clubRef.collection('audit_logs').add({ event_type: 'material_loan_handover_receipt_sent', entity_type: 'inventory_loan', entity_id: loanId, member_id: memberId, actor_id: request.auth.uid, createdAt: now }),
    logEmailHistoryAndCommunication(db, clubId, {
      recipientEmail: email,
      recipientName: memberName,
      htmlContent: rendered.html,
      sendType: 'automated',
      provider: result.provider,
      providerThreadId: result.providerThreadId || null,
      fallbackUsed: result.fallbackUsed === true,
      attemptedProviders: result.attemptedProviders || null,
      primaryError: result.primaryError || null,
      replyKey: routing.replyKey,
      replyToAddress: routing.replyToAddress,
      emailType: 'material_loan_handover_receipt',
      type: 'material_loan_handover_receipt',
      entityType: 'inventory_loan',
      entityId: loanId,
      entityLabel: loanNumber,
      to: email,
      subject: rendered.subject,
      messageId: result.messageId || null,
      status: 'sent',
      createdAt: now,
      sentAt: now,
    }, {
      entityType: 'inventory_loan',
      entityId: loanId,
      entityLabel: loanNumber,
      templateType: 'material_loan_handover_receipt',
      triggerName: 'material_loan_handover_receipt',
      sendType: 'automated',
    }),
  ]);
  return { success: true };
});

module.exports = { sendMaterialLoanHandoverReceipt, renderedReceipt, buildHandoverReceiptPdf };
