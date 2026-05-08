/**
 * Cloud Function: Create a boutique order with FIFO-aware stock management.
 *
 * Callable from CalyMob (mobile app) — validates stock, handles backorder,
 * writes inventory mutations, and returns payment info (EPC QR code).
 *
 * For tracked inventory:
 *   - Stock >= qty → decrement stock, fulfillmentStatus = 'pending'
 *   - Stock < qty with allowBackorder → decrement available stock, set remaining as
 *     awaiting_restock, fulfillmentStatus = 'awaiting_restock'
 *   - Stock < qty without allowBackorder → REJECT
 *
 * For preorder inventory:
 *   - Always fulfillmentStatus = 'awaiting_restock' (no stock decrement)
 *
 * Uses Firebase Functions v2 API (Gen2).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const QRCode = require('qrcode');
const { REGION, isMigrationBackfill } = require('./shared');

/**
 * Generate EPC QR code payload for SEPA Credit Transfer
 */
function generateEpcPayload({ beneficiaryName, iban, amount, structuredRef }) {
  const lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    '',
    (beneficiaryName || '').slice(0, 70),
    (iban || '').replace(/\s/g, ''),
    `EUR${Number(amount || 0).toFixed(2)}`,
    '',
    (structuredRef || ''),
    '',
    '',
  ];
  return lines.join('\n');
}

/**
 * Get bank settings from Firestore — tries boutique_payment first,
 * falls back to bank_settings.
 */
async function getBankSettings(clubRef) {
  const boutiquePaymentSnap = await clubRef
    .collection('settings')
    .doc('boutique_payment')
    .get();

  if (boutiquePaymentSnap.exists) {
    const data = boutiquePaymentSnap.data();
    if (data?.iban && data?.beneficiaryName) {
      return {
        beneficiaryName: data.beneficiaryName,
        iban: data.iban,
        bic: data.bic || null,
      };
    }
  }

  const bankSettingsSnap = await clubRef
    .collection('settings')
    .doc('bank_settings')
    .get();

  if (bankSettingsSnap.exists) {
    const data = bankSettingsSnap.data();
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
 * Generate a structured communication reference for the order.
 * Format: +++ ORDER_ID (8 chars) + TOTAL (cents, 10 chars) +++
 */
function generateStructuredRef(orderId, total) {
  const orderPart = (orderId || '').replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase();
  const cents = String(Math.round(Number(total || 0) * 100)).padStart(10, '0').slice(0, 10);
  return `+++${orderPart}/${cents}+++`;
}

/**
 * Generate a human-readable order number like BTQ-2026-00001.
 */
function generateOrderNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const prefix = `BTQ-${year}-`;
  // Random suffix — in production this should be a counter, but for now
  // a padded random number is sufficient for display purposes.
  const suffix = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  return `${prefix}${suffix}`;
}

/**
 * Core order creation logic.
 *
 * Steps:
 *  1. Validate input
 *  2. For each tracked item, read product + variant stock
 *  3. Allocate stock (or fail) in-memory
 *  4. Write everything in a transaction
 *
 * Returns { orderId, order, qrCodeDataUri, epcPlainText, structuredRef, total }
 */
async function createOrderCore(db, clubRef, data, now, nowTs) {
  const { clubId, buyer, items, deliveryAddress, pricing } = data;

  // ── Validate items ────────────────────────────────────────────────
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpsError('invalid-argument', 'items must be a non-empty array');
  }

  // Fetch all products referenced in this order
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  const productSnaps = await Promise.all(
    productIds.map((pid) => clubRef.collection('products').doc(pid).get()),
  );
  const productMap = {};
  for (let i = 0; i < productIds.length; i++) {
    const snap = productSnaps[i];
    if (!snap.exists) {
      throw new HttpsError('not-found', `Product ${productIds[i]} not found`);
    }
    productMap[productIds[i]] = { id: snap.id, ...snap.data() };
  }

  // ── Prepare order items with stock checks ──────────────────────────
  const orderItems = [];
  const stockWrites = [];        // { productId, variantIndex, stockCount }
  const inventoryMutations = []; // { productId, variantId, change, reason, ... }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const qty = typeof item.qty === 'number' ? Math.floor(item.qty) : 1;
    if (qty <= 0) {
      throw new HttpsError('invalid-argument', `items[${idx}].qty must be > 0`);
    }

    const product = productMap[item.productId];
    if (!product) {
      throw new HttpsError('not-found', `Product ${item.productId} not found`);
    }

    const variantId = item.variantId || '';
    const variantIndex = product.variants.findIndex((v) => v && v.id === variantId);
    if (variantIndex === -1) {
      throw new HttpsError('not-found', `Variant ${variantId} not found in product ${item.productId}`);
    }

    const variant = product.variants[variantIndex];
    const inventoryMode = product.inventoryMode || 'tracked';

    let fulfillmentStatus;
    let decrementedQty = 0;

    if (inventoryMode === 'tracked') {
      const currentStock = Number.isFinite(Number(variant.stockCount)) ? Number(variant.stockCount) : 0;

      if (currentStock >= qty) {
        // Sufficient stock — allocate all
        fulfillmentStatus = 'awaiting_payment';
        decrementedQty = qty;
      } else if (variant.allowBackorder && currentStock > 0) {
        // Partial stock + backorder allowed — allocate what we have
        fulfillmentStatus = 'awaiting_restock';
        decrementedQty = currentStock;
      } else if (variant.allowBackorder && currentStock === 0) {
        // No stock but backorder allowed — full backorder
        fulfillmentStatus = 'awaiting_restock';
        decrementedQty = 0;
      } else {
        // No stock + no backorder — reject
        const variantLabel = variant.label || variantId;
        throw new HttpsError(
          'failed-precondition',
          `Stock insuffisant pour ${product.name || item.productId} (${variantLabel}). ` +
          `Stock: ${currentStock}, demandé: ${qty}`,
        );
      }

      // Decrement stock
      const newStock = currentStock - decrementedQty;
      const updatedVariant = { ...variant, stockCount: newStock };
      stockWrites.push({ productId: item.productId, variantIndex, variant: updatedVariant });

      // Inventory mutation for sold stock
      if (decrementedQty > 0) {
        inventoryMutations.push({
          productId: item.productId,
          variantId,
          change: -decrementedQty,
          reason: 'sale',
          byUserId: buyer?.userId || 'unknown',
          orderId: null, // filled after order doc created
          timestamp: nowTs,
        });
      }
    } else {
      // preorder mode — always awaiting_restock, no stock change
      fulfillmentStatus = 'awaiting_restock';
    }

    orderItems.push({
      lineId: `${item.productId}_${variantId}_${idx}`,
      productId: item.productId,
      variantId,
      productSnapshot: {
        name: product.name || '',
        variantLabel: variant.label || variant.size || '',
        inventoryMode,
        allowBackorder: variant.allowBackorder || false,
        stockCountAtOrder: Number.isFinite(Number(variant.stockCount)) ? variant.stockCount : 0,
        reservedQty: decrementedQty,
      },
      qty,
      unitPrice: item.unitPrice || variant.salePriceOverride || product.pricing?.salePrice || 0,
      lineTotal: qty * (item.unitPrice || variant.salePriceOverride || product.pricing?.salePrice || 0),
      supplierId: product.supplierId || '',
      deliveryMode: item.deliveryMode || 'pool_pickup',
      deliveryAddress: item.deliveryAddress || deliveryAddress || null,
      fulfillmentStatus,
      deliveredAt: null,
    });
  }

  // ── Compute pricing ───────────────────────────────────────────────
  const itemsSubtotal = orderItems.reduce((s, i) => s + i.lineTotal, 0);
  const computedTotal = pricing?.total || itemsSubtotal;

  // ── Create order document in a transaction ─────────────────────────
  let orderId;
  let orderRef;
  let payment;

  const nowTsEpoch = nowTs ? nowTs.toMillis() : Date.now();

  await db.runTransaction(async (transaction) => {
    // 1. Re-read all products inside transaction for concurrent safety
    const txnProductSnaps = await Promise.all(
      stockWrites.map((sw) =>
        transaction.get(clubRef.collection('products').doc(sw.productId)),
      ),
    );

    // 2. Verify stock hasn't changed since initial read
    for (let i = 0; i < stockWrites.length; i++) {
      const sw = stockWrites[i];
      const snap = txnProductSnaps[i];
      if (!snap.exists) continue; // safety check — we already validated

      const freshProduct = snap.data();
      const freshVariants = Array.isArray(freshProduct.variants) ? freshProduct.variants : [];
      const freshVariant = freshVariants.find((v) => v && v.id === sw.variant.id);

      if (!freshVariant) continue;

      const freshStock = Number.isFinite(Number(freshVariant.stockCount)) ? Number(freshVariant.stockCount) : 0;
      const expectedEndStock = sw.variant.stockCount;
      const expectedDecrement = freshStock - expectedEndStock;

      // Only check if we actually decremented
      if (expectedDecrement > 0) {
        // The stock we expect to deduct should still be available
        if (freshStock < expectedDecrement) {
          const product = productMap[sw.productId];
          const label = product?.variants?.[sw.variantIndex]?.label || sw.variant.id;
          throw new HttpsError(
            'aborted',
            `Stock concurrente de ${sw.productId}/${label} — ${freshStock} disponible, ${expectedDecrement} requis. Probeer opnieuw.`,
          );
        }
      }
    }

    // 3. Generate order ref
    const orderNumber = generateOrderNumber();
    const ordersRef = clubRef.collection('orders');
    const newOrderRef = ordersRef.doc();
    orderId = newOrderRef.id;
    orderRef = newOrderRef;

    // 4. Build payment info
    const structuredRef = generateStructuredRef(orderId, computedTotal);
    const bankSettings = await getBankSettings(clubRef);
    const epcPayload = bankSettings
      ? generateEpcPayload({
          beneficiaryName: bankSettings.beneficiaryName,
          iban: bankSettings.iban,
          amount: computedTotal,
          structuredRef,
        })
      : '';

    payment = {
      method: 'qr_transfer',
      iban: bankSettings?.iban || '',
      beneficiary: bankSettings?.beneficiaryName || '',
      amount: computedTotal,
      structuredCommunication: structuredRef,
      epcPayload,
      qrCodeUrl: '',
      status: 'pending',
      paidAt: null,
      bankRef: null,
    };

    // 5. Set expiresAt — 72 hours from now
    const expiresAt = admin.firestore.Timestamp.fromMillis(nowTsEpoch + 72 * 60 * 60 * 1000);

    // 6. Write order document
    transaction.set(newOrderRef, {
      orderNumber,
      structuredCommunication: structuredRef,
      buyer: {
        userId: buyer?.userId || '',
        displayName: buyer?.displayName || '',
        email: buyer?.email || '',
        phone: buyer?.phone || '',
        memberId: buyer?.memberId || '',
      },
      items: orderItems,
      pricing: {
        itemsSubtotal,
        deliverySurcharges: pricing?.deliverySurcharges || 0,
        total: computedTotal,
        currency: 'EUR',
      },
      payment,
      deliveryAddress: deliveryAddress || null,
      status: 'awaiting_payment',
      statusHistory: [
        {
          oldStatus: null,
          newStatus: 'awaiting_payment',
          changedBy: buyer?.userId || 'system',
          changedAt: now,
          note: 'Order created',
        },
      ],
      buyerNotifications: [],
      supplierNotifications: [],
      accountingEntries: [],
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });

    // 7. Write product variant stock changes
    for (const sw of stockWrites) {
      const snap = txnProductSnaps[stockWrites.indexOf(sw)];
      if (!snap.exists) continue;

      const freshProduct = snap.data();
      const freshVariants = Array.isArray(freshProduct.variants) ? [...freshProduct.variants] : [];
      const idx = freshVariants.findIndex((v) => v && v.id === sw.variant.id);
      if (idx === -1) continue;

      freshVariants[idx] = sw.variant;
      transaction.update(snap.ref, {
        variants: freshVariants,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 8. Write inventory mutations with orderId now known
    for (const mut of inventoryMutations) {
      mut.orderId = orderId;
      const mutRef = clubRef.collection('inventoryMutations').doc();
      transaction.set(mutRef, {
        ...mut,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  // ── Generate QR code (outside transaction — pure computation) ────
  let qrCodeDataUri = '';
  if (payment.epcPayload) {
    qrCodeDataUri = await QRCode.toDataURL(payment.epcPayload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 300,
      color: { dark: '#000000', light: '#ffffff' },
    });

    // Update the order with the QR code (non-transactional — acceptable)
    await orderRef.update({
      'payment.qrCodeUrl': qrCodeDataUri,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return {
    orderId,
    qrCodeDataUri,
    epcPlainText: payment.epcPayload,
    structuredRef: payment.structuredCommunication,
    total: computedTotal,
    beneficiaryName: payment.beneficiary,
    iban: payment.iban,
    order: {
      orderNumber: payment.structuredCommunication, // legacy compat
    },
  };
}

// ─── Cloud Function export ────────────────────────────────────────────────

exports.createOrder = onCall(
  {
    cors: true,
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté pour créer une commande');
    }

    const { clubId, buyer, items, deliveryAddress, pricing } = request.data;

    // ── Validation ──────────────────────────────────────────────────
    if (!clubId || typeof clubId !== 'string') {
      throw new HttpsError('invalid-argument', 'clubId est requis');
    }
    if (!buyer || !buyer.userId) {
      throw new HttpsError('invalid-argument', 'buyer.userId est requis');
    }

    const db = admin.firestore();
    const clubRef = db.collection('clubs').doc(clubId);
    const now = admin.firestore.Timestamp.now();

    const result = await createOrderCore(db, clubRef, request.data, now, now);

    return result;
  },
);

// ─── Export core logic for unit testing ────────────────────────────────
exports._test = {
  createOrderCore,
  generateEpcPayload,
  generateStructuredRef,
  generateOrderNumber,
  getBankSettings,
};
