const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { randomUUID } = require('crypto');
const {
  REGION,
  buildDomainError,
  buildInvalidInputError,
  buildTodoOgm,
  getClubRef,
  mapErrorToHttps,
  parseMoney,
  parsePositiveInteger,
} = require('./shared');

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

function resolveLineDeliveryMode(item, product) {
  const candidate = item.deliveryMode || item.delivery_mode || item.selectedDeliveryMode;
  if (!candidate || typeof candidate !== 'string') {
    return Array.isArray(product.deliveryModes) && product.deliveryModes.length > 0
      ? product.deliveryModes[0]
      : null;
  }
  return candidate;
}

function resolveDeliverySurcharge(product, deliveryMode) {
  if (!deliveryMode || !product.deliverySurcharges || typeof product.deliverySurcharges !== 'object') {
    return 0;
  }
  return parseMoney(product.deliverySurcharges[deliveryMode]);
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

exports.createOrder = onCall(
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
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + (72 * 60 * 60 * 1000));
    const currentYear = new Date(now.toMillis()).getUTCFullYear();
    const ogmStub = buildTodoOgm('BOUTIQUE_ORDER', orderRef.id);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const lines = [];
        const productCache = new Map();
        let itemsSubtotal = 0;
        let deliverySurcharges = 0;

        for (const item of items) {
          const productId = typeof item?.productId === 'string' ? item.productId.trim() : '';
          const variantId = typeof item?.variantId === 'string' ? item.variantId.trim() : '';
          const qty = parsePositiveInteger(item?.qty);

          if (!productId || !variantId || !qty) {
            throw buildInvalidInputError('INVALID_INPUT', {
              item,
            });
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

          const deliveryMode = resolveLineDeliveryMode(item, product);
          const unitPrice = resolveVariantUnitPrice(product, variant);
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
            deliveryAddress: item.deliveryAddress || null,
            fulfillmentStatus,
            productSnapshot: {
              name: product.name || '',
              variantLabel: variant.label || '',
              category: product.category || '',
              inventoryMode,
              allowBackorder,
              reservedQty,
              image: Array.isArray(product.images) ? (product.images[0] || '') : '',
            },
            backorderInfo: fulfillmentStatus === 'awaiting_restock'
              ? {
                  reservedAt: now,
                }
              : null,
          });
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
        transaction.set(orderRef, {
          orderNumber,
          structuredCommunication: ogmStub.ogm,
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

        return {
          orderNumber,
          total,
          itemsSubtotal,
          deliverySurcharges,
        };
      });

      return {
        success: true,
        orderId: orderRef.id,
        orderNumber: result.orderNumber,
        ogm: ogmStub.ogm,
        ogm_display: ogmStub.ogm_display,
        total: result.total,
        totals: {
          itemsSubtotal: result.itemsSubtotal,
          deliverySurcharges: result.deliverySurcharges,
        },
      };
    } catch (error) {
      console.error(`[createOrder] Failed for ${clubId}/${orderRef.id}:`, error);
      throw mapErrorToHttps(error, HttpsError);
    }
  },
);
