'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit');
const { REGION } = require('./shared');

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Format a Firestore Timestamp or JS Date as a French-Belgian date string.
 * Returns an em-dash for null/undefined.
 */
function formatDate(ts) {
  if (!ts) return '\u2014';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString('fr-BE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a number as a EUR currency string: "€ 25.00"
 */
function formatEur(amount) {
  return `\u20AC ${Number(amount || 0).toFixed(2)}`;
}

// ─── PDF Builder ───────────────────────────────────────────────────────

/**
 * Build a receipt PDF buffer for a boutique order.
 *
 * @param {object} order - The order data from Firestore.
 * @param {string} orderId - The Firestore document ID.
 * @returns {Promise<Buffer>} The PDF as a Node.js Buffer.
 */
async function buildReceiptPdf(order, orderId) {
  const chunks = [];
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: `Reçu ${order.orderNumber || orderId}`,
      Author: 'Calypso Diving Club',
    },
  });

  doc.on('data', (chunk) => chunks.push(chunk));
  const pdfBuffer = await new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftColX = doc.page.margins.left;

    // ─── Header ───────────────────────────────────────────────
    doc.fontSize(20).font('Helvetica-Bold').text('Calypso Diving Club', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).font('Helvetica').fillColor('#555555')
      .text('FACTURE / REÇU', { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(0.6);

    // Divider
    doc.moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor('#CCCCCC').lineWidth(1).stroke();
    doc.moveDown(0.8);

    // ─── Order info + Buyer ───────────────────────────────────
    const buyer = order.buyer || {};
    const rightColX = doc.page.margins.left + pageWidth * 0.55;
    const infoY = doc.y;

    doc.fontSize(10).font('Helvetica-Bold').text('Commande:', leftColX, infoY);
    doc.font('Helvetica').text(order.orderNumber || orderId, leftColX + 75, infoY);

    doc.font('Helvetica-Bold').text('Date:', leftColX, infoY + 16);
    doc.font('Helvetica').text(formatDate(order.createdAt), leftColX + 75, infoY + 16);

    doc.font('Helvetica-Bold').text('Statut:', leftColX, infoY + 32);
    doc.font('Helvetica').text(order.status || '\u2014', leftColX + 75, infoY + 32);

    doc.font('Helvetica-Bold').text('Client:', rightColX, infoY);
    doc.font('Helvetica').text(buyer.displayName || '\u2014', rightColX + 50, infoY);

    if (buyer.email) {
      doc.font('Helvetica-Bold').text('Email:', rightColX, infoY + 16);
      doc.font('Helvetica').text(buyer.email, rightColX + 50, infoY + 16);
    }
    if (buyer.phone) {
      doc.font('Helvetica-Bold').text('Tél:', rightColX, infoY + 32);
      doc.font('Helvetica').text(buyer.phone, rightColX + 50, infoY + 32);
    }

    doc.y = infoY + 55;
    doc.moveDown(0.5);

    // ─── Items table header ───────────────────────────────────
    const colQty = leftColX;
    const colName = leftColX + 35;
    const colVariant = leftColX + pageWidth * 0.50;
    const colUnit = leftColX + pageWidth * 0.68;
    const colTotal = leftColX + pageWidth * 0.85;

    const headerY = doc.y;
    doc.rect(leftColX, headerY - 2, pageWidth, 18).fillColor('#2C3E50').fill();
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold');
    doc.text('Qté', colQty, headerY + 2, { width: 30 });
    doc.text('Produit', colName, headerY + 2, { width: pageWidth * 0.40 });
    doc.text('Variante', colVariant, headerY + 2, { width: pageWidth * 0.16 });
    doc.text('P.U.', colUnit, headerY + 2, { width: pageWidth * 0.15, align: 'right' });
    doc.text('Total', colTotal, headerY + 2, { width: pageWidth * 0.15, align: 'right' });

    doc.fillColor('#000000');
    doc.y = headerY + 20;

    // Table rows (zebra striping)
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item, idx) => {
      const snap = item.productSnapshot || {};
      const rowY = doc.y + 2;

      if (idx % 2 === 1) {
        doc.rect(leftColX, rowY - 2, pageWidth, 16).fillColor('#F5F5F5').fill();
        doc.fillColor('#000000');
      }

      doc.fontSize(9).font('Helvetica');
      doc.text(String(item.qty || 0), colQty, rowY, { width: 30 });
      doc.text(snap.name || '\u2014', colName, rowY, { width: pageWidth * 0.40 });
      doc.text(snap.variantLabel || '', colVariant, rowY, { width: pageWidth * 0.16 });
      doc.text(formatEur(item.unitPrice), colUnit, rowY, { width: pageWidth * 0.15, align: 'right' });
      doc.text(formatEur(item.lineTotal), colTotal, rowY, { width: pageWidth * 0.15, align: 'right' });

      doc.y = rowY + 16;
    });

    doc.moveDown(0.3);

    // Divider under table
    doc.moveTo(leftColX, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor('#CCCCCC').lineWidth(0.5).stroke();
    doc.moveDown(0.5);

    // ─── Totals ───────────────────────────────────────────────
    const pricing = order.pricing || {};
    const totalsX = leftColX + pageWidth * 0.60;
    const totalsValX = leftColX + pageWidth * 0.85;
    const totalsW = pageWidth * 0.15;

    doc.fontSize(10).font('Helvetica');
    const subtotalY = doc.y;
    doc.text('Sous-total:', totalsX, subtotalY);
    doc.text(formatEur(pricing.itemsSubtotal), totalsValX, subtotalY, { width: totalsW, align: 'right' });

    if (pricing.deliverySurcharges) {
      doc.text('Livraison:', totalsX, subtotalY + 16);
      doc.text(formatEur(pricing.deliverySurcharges), totalsValX, subtotalY + 16, { width: totalsW, align: 'right' });
      doc.y = subtotalY + 34;
    } else {
      doc.y = subtotalY + 18;
    }

    // Total line
    doc.moveTo(totalsX, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor('#2C3E50').lineWidth(1).stroke();
    doc.moveDown(0.3);

    doc.fontSize(12).font('Helvetica-Bold');
    const totalY = doc.y;
    doc.text('TOTAL:', totalsX, totalY);
    doc.text(formatEur(pricing.total), totalsValX, totalY, { width: totalsW, align: 'right' });

    doc.moveDown(1.5);

    // ─── Payment info ─────────────────────────────────────────
    const payment = order.payment || {};
    const payY = doc.y;

    doc.rect(leftColX, payY - 5, pageWidth, 75).fillColor('#F0F4F8').fill();
    doc.fillColor('#000000');
    doc.fontSize(11).font('Helvetica-Bold').text('Informations de paiement', leftColX + 10, payY + 2);
    doc.moveDown(0.3);

    doc.fontSize(9).font('Helvetica');
    const payInfoY = doc.y;
    const payLabelW = 160;

    doc.font('Helvetica-Bold').text('Communication structurée:', leftColX + 10, payInfoY, { width: payLabelW });
    doc.font('Helvetica').text(
      order.ogm_display || payment.ogm_display || payment.structuredCommunication || '\u2014',
      leftColX + 10 + payLabelW,
      payInfoY,
    );

    doc.font('Helvetica-Bold').text('IBAN:', leftColX + 10, payInfoY + 14, { width: payLabelW });
    doc.font('Helvetica').text(payment.iban || '\u2014', leftColX + 10 + payLabelW, payInfoY + 14);

    doc.font('Helvetica-Bold').text('Bénéficiaire:', leftColX + 10, payInfoY + 28, { width: payLabelW });
    doc.font('Helvetica').text(payment.beneficiary || '\u2014', leftColX + 10 + payLabelW, payInfoY + 28);

    if (payment.paidAt) {
      doc.font('Helvetica-Bold').text('Payé le:', leftColX + 10, payInfoY + 42, { width: payLabelW });
      doc.font('Helvetica').text(formatDate(payment.paidAt), leftColX + 10 + payLabelW, payInfoY + 42);
    }

    doc.y = payY + 80;
    doc.moveDown(1.5);

    // ─── TVA disclaimer ───────────────────────────────────────
    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#888888')
      .text('TVA non applicable \u2014 article 44, \u00A73, 2\u00B0 C.TVA', { align: 'center' });

    doc.moveDown(0.3);
    doc.text(
      `Document généré le ${new Date().toLocaleDateString('fr-BE', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      { align: 'center' },
    );

    doc.end();
  });

  return pdfBuffer;
}

// ─── Cloud Function ────────────────────────────────────────────────────

exports.generateBoutiqueReceipt = onCall(
  {
    region: REGION,
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 3,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const clubId = typeof request.data?.clubId === 'string' ? request.data.clubId.trim() : '';
    const orderId = typeof request.data?.orderId === 'string' ? request.data.orderId.trim() : '';
    if (!clubId || !orderId) {
      throw new HttpsError('invalid-argument', 'clubId et orderId sont requis');
    }

    const db = admin.firestore();

    try {
      // 1. Read order
      const orderSnap = await db.collection('clubs').doc(clubId)
        .collection('orders').doc(orderId).get();
      if (!orderSnap.exists) {
        throw new HttpsError('not-found', 'Commande introuvable');
      }
      const order = orderSnap.data();

      // 2. Read club settings for default IBAN / beneficiary
      const settingsSnap = await db.collection('clubs').doc(clubId)
        .collection('settings').doc('boutique').get();
      const settings = settingsSnap.data() || {};
      const clubInfo = {
        iban: settings.iban || 'BE68 1234 5678 9012',
        beneficiary: settings.beneficiary || 'Calypso Diving Club',
      };

      // Merge club defaults into payment if not already set
      if (!order.payment) order.payment = {};
      if (!order.payment.iban) order.payment.iban = clubInfo.iban;
      if (!order.payment.beneficiary) order.payment.beneficiary = clubInfo.beneficiary;

      // 3. Generate PDF
      const pdfBuffer = await buildReceiptPdf(order, orderId);

      // 4. Upload to Firebase Storage
      const bucket = admin.storage().bucket();
      const fileRef = bucket.file(`clubs/${clubId}/orders/${orderId}/receipt.pdf`);
      await fileRef.save(pdfBuffer, {
        metadata: { contentType: 'application/pdf' },
      });
      await fileRef.makePublic();
      const receiptUrl = fileRef.publicUrl();

      // 5. Update order document with receipt URL
      await db.collection('clubs').doc(clubId)
        .collection('orders').doc(orderId).update({
          receiptUrl,
          receiptGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      return {
        success: true,
        orderId,
        orderNumber: order.orderNumber || '',
        url: receiptUrl,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('generateBoutiqueReceipt error:', err);
      throw new HttpsError('internal', 'Erreur lors de la génération du reçu');
    }
  },
);

// ─── Exports for testing ───────────────────────────────────────────────

exports.buildReceiptPdf = buildReceiptPdf;
exports.formatEur = formatEur;
exports.formatDate = formatDate;
