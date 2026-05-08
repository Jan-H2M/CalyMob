/**
 * Cloud Function: Create a simple boutique order with EPC QR code
 *
 * Callable from CalyMob (mobile app) when a member buys at the boutique counter.
 * Creates a document in clubs/{clubId}/boutique_orders/ with:
 *   - memberId, items, total, status: 'pending', qr_code (base64 PNG), created_at, paid_at: null
 *
 * Input: {
 *   clubId: string,
 *   memberId: string,
 *   items: [{
 *     productId: string,
 *     productName: string,
 *     variantId?: string,
 *     variantLabel?: string,
 *     qty: number,
 *     unitPrice: number
 *   }],
 *   total: number             // Must match automated calculation to prevent tampering
 * }
 *
 * Auth: caller must be authenticated
 *
 * Uses Firebase Functions v2 API (Gen2).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const QRCode = require('qrcode');

/**
 * Generate EPC QR code payload for SEPA Credit Transfer
 * Reuses the same format as sendPaymentQrEmail.js
 */
function generateEpcPayload({ beneficiaryName, iban, amount, structuredRef }) {
  const lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    '',                            // BIC (optional in version 002 for EEA)
    beneficiaryName.slice(0, 70),  // Beneficiary name (max 70)
    iban.replace(/\s/g, ''),       // IBAN (no spaces)
    `EUR${amount.toFixed(2)}`,     // Amount
    '',                            // Purpose code (optional)
    structuredRef || '',           // Structured reference (ISO 11649)
    '',                            // Unstructured text
    '',                            // Beneficiary info (optional)
  ];
  return lines.join('\n');
}

/**
 * Get bank settings from Firestore
 */
async function getBankSettings(clubId) {
  // Try 'boutique_payment' settings first
  const boutiquePaymentDoc = await admin
    .firestore()
    .collection('clubs')
    .doc(clubId)
    .collection('settings')
    .doc('boutique_payment')
    .get();

  if (boutiquePaymentDoc.exists) {
    const data = boutiquePaymentDoc.data();
    if (data?.iban && data?.beneficiaryName) {
      return {
        beneficiaryName: data.beneficiaryName,
        iban: data.iban,
        bic: data.bic || null,
      };
    }
  }

  // Fallback: 'bank_settings'
  const bankSettingsDoc = await admin
    .firestore()
    .collection('clubs')
    .doc(clubId)
    .collection('settings')
    .doc('bank_settings')
    .get();

  if (bankSettingsDoc.exists) {
    const data = bankSettingsDoc.data();
    if (data?.iban && data?.beneficiaryName) {
      return {
        beneficiaryName: data.beneficiaryName,
        iban: data.iban,
        bic: data.bic || null,
      };
    }
  }

  return null;
}

/**
 * Generate a structured communication reference for the order
 * Format: +++ ORDER_ID (first 8 chars) + TOTAL (cents, 10 chars) +++
 */
function generateStructuredRef(orderId, total) {
  const orderPart = orderId.replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase();
  const cents = String(Math.round(total * 100)).padStart(10, '0').slice(0, 10);
  return `+++${orderPart}/${cents}+++`;
}

exports.createBoutiqueOrder = onCall(
  { cors: true },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'You must be logged in to create a boutique order'
      );
    }

    const { clubId, memberId, items, total } = request.data;

    // ── Validation ──────────────────────────────────────────────────
    if (!clubId || typeof clubId !== 'string') {
      throw new HttpsError('invalid-argument', 'clubId is required');
    }
    if (!memberId || typeof memberId !== 'string') {
      throw new HttpsError('invalid-argument', 'memberId is required');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpsError('invalid-argument', 'items must be a non-empty array');
    }
    if (typeof total !== 'number' || total <= 0) {
      throw new HttpsError('invalid-argument', 'total must be a positive number');
    }

    // Validate and compute line totals server-side
    const validatedItems = items.map((item, idx) => {
      if (!item.productId || typeof item.productId !== 'string') {
        throw new HttpsError('invalid-argument', `items[${idx}].productId is required`);
      }
      const qty = typeof item.qty === 'number' ? Math.floor(item.qty) : 1;
      const unitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
      return {
        productId: item.productId,
        productName: item.productName || '',
        variantId: item.variantId || null,
        variantLabel: item.variantLabel || null,
        qty,
        unitPrice,
        lineTotal: qty * unitPrice,
      };
    });

    // Verify total (server-side calculation prevents price tampering)
    const calculatedTotal = validatedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    if (Math.abs(calculatedTotal - total) > 0.01) {
      throw new HttpsError(
        'invalid-argument',
        `Total mismatch: computed ${calculatedTotal.toFixed(2)}, received ${total.toFixed(2)}`
      );
    }

    // ── Generate EPC QR code ────────────────────────────────────────
    const bankSettings = await getBankSettings(clubId);
    if (!bankSettings) {
      throw new HttpsError(
        'failed-precondition',
        'Bank settings not configured — contact the club administrator'
      );
    }

    // Create the order document first to get its ID for the QR reference
    const ordersRef = admin
      .firestore()
      .collection('clubs')
      .doc(clubId)
      .collection('boutique_orders');

    const orderDocRef = await ordersRef.add({
      memberId,
      items: validatedItems,
      total: calculatedTotal,
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      paid_at: null,
      qr_code: '', // placeholder, will be updated below
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const orderId = orderDocRef.id;
    const structuredRef = generateStructuredRef(orderId, calculatedTotal);

    const epcPayload = generateEpcPayload({
      beneficiaryName: bankSettings.beneficiaryName,
      iban: bankSettings.iban,
      amount: calculatedTotal,
      structuredRef,
    });

    // Generate QR code as base64 data URI
    const qrCodeDataUri = await QRCode.toDataURL(epcPayload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 300,
      color: { dark: '#000000', light: '#ffffff' },
    });

    // Update the order with the QR code
    await orderDocRef.update({
      qr_code: qrCodeDataUri,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Generate plain-text EPC for the mobile app to display
    const epcPlainText = epcPayload;

    return {
      orderId,
      qrCodeDataUri,
      epcPlainText,
      structuredRef,
      total: calculatedTotal,
      beneficiaryName: bankSettings.beneficiaryName,
      iban: bankSettings.iban,
    };
  }
);
