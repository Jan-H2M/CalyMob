const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { randomUUID } = require('crypto');
const QRCode = require('qrcode');
const {
  REGION,
  buildDomainError,
  buildEpcQrPayload,
  buildInvalidInputError,
  getClubRef,
  mapErrorToHttps,
  parseMoney,
  parsePositiveInteger,
} = require('./shared');
const { formatOgmDisplay } = require('../shared/ogm');
const { createPaymentReference, generateNextOgm } = require('../shared/ogmService');

function resolveVariantUnitPrice(product, variant) {
  if (typeof variant.salePriceOverride === 'number') {
    return variant.salePriceOverride;
  }
  if (product.pricing && typeof product.pricing.salePriceOverride === 'number') {
    return product.pricing.salePriceOverride;
  }
  if (product.pricing && typeof product.pricing.salePrice === 'number') {
    return product.pricing.salePrice;
  }
  return 0;
}

function resolveDeliveryMode(item, product) {
  const candidate = item.deliveryMode || item.delivery_mode || item.selectedDeliveryMode;
  const allowedModes = Array.isArray(product.deliveryModes) && product.deliveryModes.length > 0
    ? product.deliveryModes
    : ['pool_pickup'];
  if (candidate && typeof candidate === 'string' && allowedModes.includes(candidate)) {
    return candidate;
  }
  return Array.isArray(product.deliveryModes) && product.deliveryModes.length > 0
    ? product.deliveryModes[0]
    : 'pool_pickup';
}

function sanitizeDeliveryAddress(deliveryMode, value) {
  if (deliveryMode !== 'post') return null;
  const address = value && typeof value === 'object' ? value : {};
  const line1 = typeof address.line1 === 'string' ? address.line1.trim() : '';
  const postalCode = typeof address.postalCode === 'string' ? address.postalCode.trim() : '';
  const city = typeof address.city === 'string' ? address.city.trim() : '';
  const country = typeof address.country === 'string' ? address.country.trim() : '';

  if (!line1 || !postalCode || !city || !country) {
    throw buildInvalidInputError('INVALID_INPUT', {
      missing: 'deliveryAddress',
    });
  }

  return {
    name: typeof address.name === 'string' ? address.name.trim() : '',
    line1,
    line2: typeof address.line2 === 'string' ? address.line2.trim() : '',
    postalCode,
    city,
    country,
  };
}

function resolveDeliverySurcharge(product, deliveryMode) {
  if (!deliveryMode || !product.deliverySurcharges || typeof product.deliverySurcharges !== 'object') {
    return 0;
  }
  return parseMoney(product.deliverySurcharges[deliveryMode]);
}

function resolveMinimumOrderQuantity(product) {
  const embroidery = product.embroidery && typeof product.embroidery === 'object'
    ? product.embroidery
    : {};
  if (embroidery.enabled !== true) return 1;
  const constraints = embroidery.productionConstraints && typeof embroidery.productionConstraints === 'object'
    ? embroidery.productionConstraints
    : {};
  return parsePositiveInteger(constraints.minimumOrderQuantity) || 1;
}

function sanitizeBuyer(inputBuyer, authUid) {
  const buyer = inputBuyer && typeof inputBuyer === 'object' ? inputBuyer : {};
  const email = typeof buyer.email === 'string' ? buyer.email.trim() : '';
  const displayName = typeof buyer.displayName === 'string'
    ? buyer.displayName.trim()
    : (typeof buyer.name === 'string' ? buyer.name.trim() : '');

  if (!email || !displayName) {
    throw buildInvalidInputError('INVALID_INPUT', {
      missing: !email ? 'buyer.email' : 'buyer.displayName',
    });
  }

  return {
    userId: authUid,
    displayName,
    email,
    phone: typeof buyer.phone === 'string' ? buyer.phone.trim() : '',
    memberId: typeof buyer.memberId === 'string' ? buyer.memberId.trim() : '',
  };
}

function sanitizeCustomizations(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const customizations = JSON.parse(JSON.stringify(value));
  const surcharge = parseMoney(customizations.surcharge);
  customizations.surcharge = Math.max(0, surcharge);
  return customizations;
}

async function resolveClubBankSettings(clubRef) {
  const [bankSnap, generalSnap, clubInfoSnap] = await Promise.all([
    clubRef.collection('settings').doc('bank').get(),
    clubRef.collection('settings').doc('general').get(),
    clubRef.collection('settings').doc('club_info').get(),
  ]);

  const bank = bankSnap.exists ? bankSnap.data() : {};
  const general = generalSnap.exists ? generalSnap.data() : {};
  const clubInfo = clubInfoSnap.exists ? clubInfoSnap.data() : {};

  const iban = String(
    clubInfo.iban ||
      bank.iban ||
      process.env.CLUB_IBAN ||
      '',
  ).replace(/\s/g, '').toUpperCase();
  const beneficiary = String(
    clubInfo.beneficiaryName ||
      clubInfo.beneficiary ||
      bank.beneficiaryName ||
      general.clubName ||
      'Calypso',
  ).trim();

  if (!iban || !beneficiary) {
    throw buildInvalidInputError('INVALID_INPUT', {
      missing: !iban ? 'settings.bank.iban|settings.club_info.iban|env.CLUB_IBAN' : 'beneficiaryName',
    });
  }

  return { iban, beneficiary };
}

exports.createBoutiqueOrder = onCall(
  {
    region: REGION,
    memory: '512MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const db = admin.firestore();
    const clubId = typeof request.data?.clubId === 'string' ? request.data.clubId.trim() : '';
    const items = Array.isArray(request.data?.items) ? request.data.items : [];

    if (!clubId || items.length === 0) {
      throw new HttpsError('invalid-argument', 'clubId ou items manquant', {
        code: 'INVALID_INPUT',
      });
    }

    let buyer;
    try {
      buyer = sanitizeBuyer(request.data?.buyer, request.auth.uid);
    } catch (error) {
      throw mapErrorToHttps(error, HttpsError);
    }

    const clubRef = getClubRef(db, clubId);
    const orderRef = clubRef.collection('orders').doc();
    const orderCounterRef = clubRef.collection('settings').doc('order_counter');
    const inventoryMutationsRef = clubRef.collection('inventoryMutations');
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + (72 * 60 * 60 * 1000));
    const currentYear = new Date(now.toMillis()).getUTCFullYear();
    const bankSettings = await resolveClubBankSettings(clubRef);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const ogm = await generateNextOgm(db, clubId, transaction);
        const ogmDisplay = formatOgmDisplay(ogm);
        const lines = [];
        const productCache = new Map();
        const inventoryReservations = [];
        let itemsSubtotal = 0;
        let deliverySurcharges = 0;

        for (const item of items) {
          const productId = typeof item?.productId === 'string' ? item.productId.trim() : '';
          const variantId = typeof item?.variantId === 'string' ? item.variantId.trim() : '';
          const qty = parsePositiveInteger(item?.qty);

          if (!productId || !variantId || !qty) {
            throw buildInvalidInputError('INVALID_INPUT', { item });
          }

          let cachedProduct = productCache.get(productId);
          if (!cachedProduct) {
            const productRef = clubRef.collection('products').doc(productId);
            const productSnap = await transaction.get(productRef);

            if (!productSnap.exists) {
              throw buildDomainError('PRODUCT_NOT_FOUND', 'Produit introuvable', {
                productId,
                variantId,
              });
            }

            cachedProduct = {
              ref: productRef,
              data: productSnap.data(),
            };
            productCache.set(productId, cachedProduct);
          }

          const product = cachedProduct.data;
          if (product.visibility === 'archived') {
            throw buildDomainError('PRODUCT_ARCHIVED', 'Produit archivé', {
              productId,
              variantId,
            });
          }

          const minimumOrderQuantity = resolveMinimumOrderQuantity(product);
          if (qty < minimumOrderQuantity) {
            throw buildInvalidInputError('INVALID_INPUT', {
              productId,
              variantId,
              minimumOrderQuantity,
              requested: qty,
            });
          }

          const variants = Array.isArray(product.variants) ? product.variants : [];
          const variantIndex = variants.findIndex((entry) => entry && entry.id === variantId);
          if (variantIndex === -1) {
            throw buildDomainError('PRODUCT_NOT_FOUND', 'Variant introuvable', {
              productId,
              variantId,
            });
          }

          const variant = { ...variants[variantIndex] };
          const inventoryMode = product.inventoryMode || 'tracked';
          const allowBackorder = variant.allowBackorder === true;
          const currentStock = Number.isFinite(Number(variant.stockCount)) ? Number(variant.stockCount) : 0;
          let fulfillmentStatus = 'pending';
          let reservedQty = 0;

          if (inventoryMode === 'tracked') {
            if (currentStock >= qty) {
              reservedQty = qty;
              variant.stockCount = currentStock - qty;
              variants[variantIndex] = variant;
              cachedProduct.data = {
                ...product,
                variants,
              };
              productCache.set(productId, cachedProduct);
            } else if (!allowBackorder) {
              throw buildDomainError('OUT_OF_STOCK', 'Stock insuffisant', {
                productId,
                variantId,
                requested: qty,
                available: currentStock,
              });
            } else {
              fulfillmentStatus = 'awaiting_restock';
            }
          } else if (inventoryMode === 'preorder' || allowBackorder) {
            fulfillmentStatus = 'awaiting_restock';
          }

          const customizations = sanitizeCustomizations(item.customizations || item.personalization);
          const customizationSurcharge = parseMoney(customizations.surcharge);
          const deliveryMode = resolveDeliveryMode(item, product);
          const deliveryAddress = sanitizeDeliveryAddress(deliveryMode, item.deliveryAddress);
          const unitPrice = resolveVariantUnitPrice(product, variant) + customizationSurcharge;
          const lineTotal = unitPrice * qty;
          const lineDeliverySurcharge = resolveDeliverySurcharge(product, deliveryMode);

          itemsSubtotal += lineTotal;
          deliverySurcharges += lineDeliverySurcharge;

          lines.push({
            lineId: randomUUID(),
            productId,
            variantId,
            qty,
            unitPrice,
            lineTotal,
            supplierId: product.supplierId || '',
            deliveryMode,
            deliveryAddress,
            fulfillmentStatus,
            customizations: Object.keys(customizations).length > 0 ? customizations : null,
            productSnapshot: {
              name: product.name || '',
              variantLabel: variant.label || '',
              category: product.category || '',
              inventoryMode,
              allowBackorder,
              reservedQty,
              image: Array.isArray(product.images) ? (product.images[0] || '') : '',
              customizations: Object.keys(customizations).length > 0 ? customizations : null,
            },
            backorderInfo: fulfillmentStatus === 'awaiting_restock'
              ? { reservedAt: now }
              : null,
          });

          if (reservedQty > 0) {
            inventoryReservations.push({ productId, variantId, qty });
          }
        }

        for (const cachedProduct of productCache.values()) {
          transaction.update(cachedProduct.ref, {
            variants: cachedProduct.data.variants,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        const counterSnap = await transaction.get(orderCounterRef);
        const nextCounter = counterSnap.exists
          ? Number(counterSnap.get('counter') || 0) + 1
          : 1;
        const orderNumber = `BTQ-${currentYear}-${String(nextCounter).padStart(4, '0')}`;

        transaction.set(orderCounterRef, {
          counter: nextCounter,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        const total = itemsSubtotal + deliverySurcharges;
        const epcPayload = buildEpcQrPayload({
          iban: bankSettings.iban,
          beneficiary: bankSettings.beneficiary,
          amount: total,
          ogm,
        });
        const qrCodeUrl = await QRCode.toDataURL(epcPayload);

        transaction.set(orderRef, {
          orderNumber,
          structuredCommunication: ogmDisplay,
          ogm,
          ogm_display: ogmDisplay,
          buyer,
          items: lines,
          pricing: {
            itemsSubtotal,
            deliverySurcharges,
            total,
            currency: 'EUR',
          },
          payment: {
            method: 'qr_transfer',
            iban: bankSettings.iban,
            beneficiary: bankSettings.beneficiary,
            amount: total,
            structuredCommunication: ogmDisplay,
            ogm,
            ogm_display: ogmDisplay,
            epcPayload,
            qrCodeUrl,
            status: 'pending',
          },
          status: 'awaiting_payment',
          deliveryPreferences: request.data?.deliveryPreferences || null,
          expiresAt,
          migration_source: null,
          _backfill: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await createPaymentReference(db, clubId, {
          ogm,
          payload_text: `Boutique ${orderNumber}`,
          context_type: 'BOUTIQUE_ORDER',
          context_id: orderRef.id,
          amount_cents: Math.round(total * 100),
          created_by: request.auth.uid,
        }, transaction);

        inventoryReservations.forEach((entry) => {
          const mutationRef = inventoryMutationsRef.doc();
          transaction.set(mutationRef, {
            productId: entry.productId,
            variantId: entry.variantId,
            change: -entry.qty,
            reason: 'reservation',
            orderId: orderRef.id,
            byUserId: request.auth.uid,
            timestamp: now,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        return {
          deliverySurcharges,
          epcPayload,
          itemsSubtotal,
          ogm,
          ogmDisplay,
          orderNumber,
          qrCodeUrl,
          total,
        };
      });

      return {
        success: true,
        orderId: orderRef.id,
        orderNumber: result.orderNumber,
        ogm: result.ogm,
        ogm_display: result.ogmDisplay,
        total: result.total,
        expiresAt: expiresAt.toDate().toISOString(),
        payment: {
          ogm: result.ogm,
          ogm_display: result.ogmDisplay,
          iban: bankSettings.iban,
          beneficiary: bankSettings.beneficiary,
          amount: result.total,
          structuredCommunication: result.ogmDisplay,
          epcPayload: result.epcPayload,
          qrCodeUrl: result.qrCodeUrl,
        },
      };
    } catch (error) {
      console.error(`[createBoutiqueOrder] Failed for ${clubId}/${orderRef.id}:`, error);
      throw mapErrorToHttps(error, HttpsError);
    }
  },
);
