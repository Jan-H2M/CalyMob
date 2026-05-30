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

function extractOrderCounter(orderNumber, year) {
  const match = String(orderNumber || '').match(new RegExp(`^BTQ-${year}-(\\d{4,})$`));
  return match ? Number(match[1]) : 0;
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

async function resolveClubEmailSettings(clubRef) {
  const [emailSnap, generalSnap] = await Promise.all([
    clubRef.collection('settings').doc('email_config').get(),
    clubRef.collection('settings').doc('general').get(),
  ]);
  const emailConfig = emailSnap.exists ? emailSnap.data() : {};
  const general = generalSnap.exists ? generalSnap.data() : {};
  if (emailConfig.provider !== 'resend' || !emailConfig.resend?.apiKey) {
    throw buildDomainError('EMAIL_NOT_CONFIGURED', 'La configuration email du club est manquante.');
  }
  const clubName = general.clubName || 'Calypso';
  return {
    apiKey: emailConfig.resend.apiKey,
    fromEmail: emailConfig.resend.fromEmail || 'onboarding@resend.dev',
    fromName: emailConfig.resend.fromName || clubName,
    clubName,
    logoUrl: general.logoUrl || '',
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatAmount(amount) {
  return `${Number(amount || 0).toFixed(2).replace('.', ',')} €`;
}

function buildOrderEmailHtml({ order, clubName, logoUrl }) {
  const buyer = order.buyer || {};
  const payment = order.payment || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const logoBlock = logoUrl
    ? `<div style="text-align:center;margin:0 0 22px;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(clubName)}" style="max-width:220px;max-height:90px;height:auto;"></div>`
    : '';
  const itemRows = items.map((item) => {
    const snapshot = item.productSnapshot || {};
    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #edf2f7;">${escapeHtml(snapshot.name || item.productId)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #edf2f7;text-align:center;">${escapeHtml(item.qty || 0)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #edf2f7;text-align:right;">${escapeHtml(formatAmount(item.lineTotal))}</td>
      </tr>`;
  }).join('');

  return `
<!doctype html>
<html>
<body style="margin:0;background:#f3f7fb;font-family:Arial,Helvetica,sans-serif;color:#12325c;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border-radius:16px;padding:26px;border:1px solid #dfe8f2;">
      ${logoBlock}
      <h1 style="margin:0 0 10px;font-size:24px;color:#12325c;">Commande ${escapeHtml(order.orderNumber)}</h1>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.45;">
        Bonjour ${escapeHtml(buyer.displayName)}, voici le QR code pour payer votre commande Boutique.
        Ouvrez ce mail sur ordinateur et scannez le QR avec votre application bancaire.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <img src="cid:qrcode" alt="QR code de paiement" style="width:260px;max-width:100%;border:1px solid #dfe8f2;border-radius:14px;padding:12px;background:#fff;">
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:15px;margin-bottom:18px;">
        ${itemRows}
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:8px 0;color:#667085;">Total</td><td style="padding:8px 0;font-weight:800;color:#ff8500;">${escapeHtml(formatAmount(payment.amount))}</td></tr>
        <tr><td style="padding:8px 0;color:#667085;">Bénéficiaire</td><td style="padding:8px 0;font-weight:700;">${escapeHtml(payment.beneficiary)}</td></tr>
        <tr><td style="padding:8px 0;color:#667085;">IBAN</td><td style="padding:8px 0;font-weight:700;">${escapeHtml(payment.iban)}</td></tr>
        <tr><td style="padding:8px 0;color:#667085;">Communication</td><td style="padding:8px 0;font-weight:800;">${escapeHtml(payment.paymentCommunication)}</td></tr>
      </table>
      <p style="margin:22px 0 0;font-size:14px;line-height:1.45;color:#667085;">
        Si vous préférez faire un virement manuel, utilisez exactement l'IBAN et la communication ci-dessus.
      </p>
      <p style="margin:14px 0 0;font-size:14px;color:#667085;">À bientôt,<br><strong>${escapeHtml(clubName)}</strong></p>
    </div>
  </div>
</body>
</html>`.trim();
}

async function sendEmailViaResend(apiKey, from, to, subject, html, attachments = []) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, attachments }),
  });
  if (!response.ok) {
    let message = `Resend API failed (${response.status})`;
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (_) {
      // Keep fallback.
    }
    throw new Error(message);
  }
  return response.json();
}

async function sendBoutiqueOrderEmail({ clubRef, clubId, orderRef, order }) {
  const buyer = order.buyer || {};
  const recipientEmail = String(buyer.email || '').trim();
  if (!recipientEmail) {
    throw buildDomainError('EMAIL_MISSING', 'Votre commande ne contient pas d’adresse email.');
  }
  const emailSettings = await resolveClubEmailSettings(clubRef);
  const payment = order.payment || {};
  const html = buildOrderEmailHtml({
    order,
    clubName: emailSettings.clubName,
    logoUrl: emailSettings.logoUrl,
  });
  const subject = `Commande ${order.orderNumber} - ${formatAmount(payment.amount)}`;
  const qrBase64 = String(payment.qrCodeUrl || '').replace(/^data:image\/png;base64,/, '');
  const result = await sendEmailViaResend(
    emailSettings.apiKey,
    `${emailSettings.fromName} <${emailSettings.fromEmail}>`,
    recipientEmail,
    subject,
    html,
    [
      {
        filename: 'boutique-qrcode.png',
        content: qrBase64,
        content_id: 'qrcode',
      },
    ],
  );
  const now = admin.firestore.Timestamp.now();
  await Promise.all([
    orderRef.update({
      'payment.email_sent_at': now,
      'payment.email_status': 'sent',
      'payment.email_resend_id': result.id || null,
      updatedAt: now,
    }),
    clubRef.collection('email_history').add({
      recipientEmail,
      recipientName: buyer.displayName || recipientEmail,
      htmlContent: html,
      sendType: 'automated',
      provider: 'resend',
      emailType: 'boutique_order_payment',
      createdAt: now,
      sentAt: now,
      clubId,
      type: 'boutique_order_payment',
      to: recipientEmail,
      subject,
      amount: payment.amount,
      orderId: orderRef.id,
      orderNumber: order.orderNumber,
      resendId: result.id || null,
      status: 'sent',
    }),
  ]);
  return now;
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
    const inventoryMutationsRef = clubRef.collection('inventoryMutations');
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + (72 * 60 * 60 * 1000));
    const currentYear = new Date(now.toMillis()).getUTCFullYear();
    const orderCounterRef = clubRef.collection('settings').doc(`boutique_order_counter_${currentYear}`);
    const bankSettings = await resolveClubBankSettings(clubRef);

    try {
      const result = await db.runTransaction(async (transaction) => {
        const counterSnap = await transaction.get(orderCounterRef);
        const prefix = `BTQ-${currentYear}-`;
        const existingNumbersSnap = await transaction.get(
          clubRef.collection('orders')
            .where('orderNumber', '>=', prefix)
            .where('orderNumber', '<=', `${prefix}\uf8ff`),
        );
        const highestExistingCounter = existingNumbersSnap.docs.reduce((highest, doc) => {
          return Math.max(highest, extractOrderCounter(doc.get('orderNumber'), currentYear));
        }, 0);
        const storedCounter = counterSnap.exists ? Number(counterSnap.get('counter') || 0) : 0;
        const nextCounter = Math.max(storedCounter, highestExistingCounter) + 1;
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

        const orderNumber = `BTQ-${currentYear}-${String(nextCounter).padStart(4, '0')}`;
        const paymentCommunication = `+++${orderNumber}+++`;
        const total = itemsSubtotal + deliverySurcharges;
        const epcPayload = buildEpcQrPayload({
          iban: bankSettings.iban,
          beneficiary: bankSettings.beneficiary,
          amount: total,
          communication: paymentCommunication,
        });
        const qrCodeUrl = await QRCode.toDataURL(epcPayload);

        for (const cachedProduct of productCache.values()) {
          transaction.update(cachedProduct.ref, {
            variants: cachedProduct.data.variants,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        transaction.set(orderCounterRef, {
          counter: nextCounter,
          year: currentYear,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        const orderData = {
          orderNumber,
          structuredCommunication: paymentCommunication,
          paymentCommunication,
          ogm: null,
          ogm_display: paymentCommunication,
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
            structuredCommunication: paymentCommunication,
            paymentCommunication,
            ogm: null,
            ogm_display: paymentCommunication,
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
        };

        transaction.set(orderRef, orderData);

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
          orderNumber,
          paymentCommunication,
          qrCodeUrl,
          total,
          orderData,
        };
      });

      let emailSentAt = null;
      let emailStatus = 'failed';
      try {
        emailSentAt = await sendBoutiqueOrderEmail({
          clubRef,
          clubId,
          orderRef,
          order: {
            ...result.orderData,
            pricing: {
              ...result.orderData.pricing,
              total: result.total,
            },
          },
        });
        emailStatus = 'sent';
      } catch (emailError) {
        console.error(`[createBoutiqueOrder] Email failed for ${clubId}/${orderRef.id}:`, emailError);
        await orderRef.update({
          'payment.email_status': 'failed',
          'payment.email_error': emailError.message || 'Email failed',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return {
        success: true,
        orderId: orderRef.id,
        orderNumber: result.orderNumber,
        ogm: null,
        ogm_display: result.paymentCommunication,
        paymentCommunication: result.paymentCommunication,
        total: result.total,
        expiresAt: expiresAt.toDate().toISOString(),
        payment: {
          ogm: null,
          ogm_display: result.paymentCommunication,
          paymentCommunication: result.paymentCommunication,
          iban: bankSettings.iban,
          beneficiary: bankSettings.beneficiary,
          amount: result.total,
          structuredCommunication: result.paymentCommunication,
          epcPayload: result.epcPayload,
          qrCodeUrl: result.qrCodeUrl,
          emailSentAt: emailSentAt?.toDate?.()?.toISOString?.() || null,
          emailStatus,
        },
      };
    } catch (error) {
      console.error(`[createBoutiqueOrder] Failed for ${clubId}/${orderRef.id}:`, error);
      throw mapErrorToHttps(error, HttpsError);
    }
  },
);

exports.sendBoutiqueOrderPaymentEmail = onCall(
  {
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const db = admin.firestore();
    const clubId = typeof request.data?.clubId === 'string' ? request.data.clubId.trim() : '';
    const orderId = typeof request.data?.orderId === 'string' ? request.data.orderId.trim() : '';
    if (!clubId || !orderId) {
      throw new HttpsError('invalid-argument', 'clubId ou orderId manquant', { code: 'INVALID_INPUT' });
    }

    try {
      const clubRef = getClubRef(db, clubId);
      const orderRef = clubRef.collection('orders').doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        throw buildDomainError('ORDER_NOT_FOUND', 'Commande introuvable');
      }
      const order = orderSnap.data();
      if (order.buyer?.userId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Accès refusé');
      }
      if (order.status !== 'awaiting_payment' || order.payment?.status !== 'pending') {
        throw buildDomainError('ORDER_NOT_CANCELLABLE', 'Cette commande n’est plus en attente de paiement.');
      }
      const emailSentAt = await sendBoutiqueOrderEmail({
        clubRef,
        clubId,
        orderRef,
        order,
      });
      return {
        success: true,
        emailSentAt: emailSentAt.toDate().toISOString(),
      };
    } catch (error) {
      throw mapErrorToHttps(error, HttpsError);
    }
  },
);
