const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { randomUUID } = require('crypto');
const QRCode = require('qrcode');
const {
  REGION,
  assertBoutiqueAccess,
  buildDomainError,
  buildEpcQrPayload,
  buildInvalidInputError,
  getClubRef,
  mapErrorToHttps,
  parseMoney,
  parsePositiveInteger,
} = require('./shared');
const {
  buildEmailRouting,
  logEmailHistoryAndCommunication,
  renderCommunicationTemplate,
  resolveCommunicationTemplate,
} = require('../utils/communicationTemplates');
const { sendEmailWithConfig } = require('../utils/emailDelivery');

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
  const provider = emailConfig.provider || 'resend';
  const hasPrimaryGmail = provider === 'gmail'
    && emailConfig.gmail?.clientId
    && emailConfig.gmail?.clientSecret
    && emailConfig.gmail?.refreshToken
    && emailConfig.gmail?.fromEmail;
  const hasPrimaryResend = provider !== 'gmail'
    && emailConfig.resend?.apiKey
    && emailConfig.resend?.fromEmail;
  const hasFallback = emailConfig.deliveryFallback?.enabled === true
    && emailConfig.deliveryFallback.provider
    && emailConfig.deliveryFallback.provider !== provider;

  if (!hasPrimaryGmail && !hasPrimaryResend && !hasFallback) {
    throw buildDomainError('EMAIL_NOT_CONFIGURED', 'La configuration email du club est manquante.');
  }
  const clubName = general.clubName || 'Calypso';
  return {
    emailConfig,
    provider,
    apiKey: emailConfig.resend?.apiKey || '',
    fromEmail: emailConfig.resend?.fromEmail || emailConfig.gmail?.fromEmail || 'onboarding@resend.dev',
    fromName: emailConfig.resend?.fromName || emailConfig.gmail?.fromName || clubName,
    clubName,
    logoUrl: general.logoUrl || '',
  };
}

function formatAmount(amount) {
  return `${Number(amount || 0).toFixed(2).replace('.', ',')} €`;
}

async function sendBoutiqueOrderEmail({ clubRef, clubId, orderRef, order }) {
  const buyer = order.buyer || {};
  const recipientEmail = String(buyer.email || '').trim();
  if (!recipientEmail) {
    throw buildDomainError('EMAIL_MISSING', 'Votre commande ne contient pas d’adresse email.');
  }
  const emailSettings = await resolveClubEmailSettings(clubRef);
  const payment = order.payment || {};
  const templateType = 'boutique_order_payment';
  const templateData = {
    recipientName: buyer.displayName || recipientEmail,
    clubName: emailSettings.clubName,
    logoUrl: emailSettings.logoUrl,
    orderNumber: order.orderNumber,
    amount: payment.amount,
    amountFormatted: formatAmount(payment.amount),
    communication: payment.communication || `+++${order.orderNumber}+++`,
    items: Array.isArray(order.items)
      ? order.items.map(item => ({
        name: item.productName || item.product_name || item.name || item.productId || 'Article',
        quantity: item.quantity || item.quantite || 1,
      }))
      : [],
  };
  const resolvedTemplate = await resolveCommunicationTemplate(clubRef.firestore, clubId, templateType, 'allow_system_seed');
  const { subject, html } = renderCommunicationTemplate(resolvedTemplate.template, templateData);
  const qrBase64 = String(payment.qrCodeUrl || '').replace(/^data:image\/png;base64,/, '');
  const entityLabel = `Commande ${order.orderNumber}`;
  const recipientName = buyer.displayName || recipientEmail;
  const routing = buildEmailRouting(emailSettings.emailConfig, {
    clubId,
    entityType: 'payment',
    entityId: orderRef.id,
    entityLabel,
    recipientEmail,
    recipientName,
  });
  const configuredFromName = emailSettings.provider === 'gmail'
    ? (emailSettings.emailConfig.gmail?.fromName || emailSettings.clubName)
    : (emailSettings.emailConfig.resend?.fromName || emailSettings.clubName);
  const result = await sendEmailWithConfig(emailSettings.emailConfig, {
    to: recipientEmail,
    subject,
    html,
    attachments: [
      {
        filename: 'boutique-qrcode.png',
        content: qrBase64,
        content_id: 'qrcode',
      },
    ],
    replyTo: routing.replyToAddress || undefined,
    replyToName: configuredFromName,
    headers: routing.headers,
  });
  const usedProviderConfig = result.provider === 'gmail'
    ? (emailSettings.emailConfig.gmail || {})
    : (emailSettings.emailConfig.resend || {});
  const now = admin.firestore.Timestamp.now();
  await Promise.all([
    orderRef.update({
      'payment.email_sent_at': now,
      'payment.email_status': 'sent',
      'payment.email_resend_id': result.provider === 'resend' ? result.messageId || null : null,
      'payment.email_gmail_id': result.provider === 'gmail' ? result.messageId || null : null,
      updatedAt: now,
    }),
    logEmailHistoryAndCommunication(clubRef.firestore, clubId, {
      recipientEmail,
      recipientName,
      htmlContent: html,
      sendType: 'automated',
      provider: result.provider,
      providerThreadId: result.providerThreadId || null,
      fallbackUsed: result.fallbackUsed === true,
      attemptedProviders: result.attemptedProviders || null,
      primaryProvider: result.primaryProvider || null,
      fallbackProvider: result.fallbackProvider || null,
      primaryError: result.primaryError || null,
      replyKey: routing.replyKey,
      replyToAddress: routing.replyToAddress,
      fromEmail: usedProviderConfig.fromEmail || null,
      fromName: usedProviderConfig.fromName || emailSettings.clubName,
      emailType: 'boutique_order_payment',
      templateId: resolvedTemplate.template.id,
      templateName: resolvedTemplate.template.name,
      templateType: 'boutique_order_payment',
      createdAt: now,
      sentAt: now,
      type: 'boutique_order_payment',
      to: recipientEmail,
      subject,
      amount: payment.amount,
      orderId: orderRef.id,
      orderNumber: order.orderNumber,
      entityType: 'payment',
      entityId: orderRef.id,
      entityLabel,
      messageId: result.messageId || null,
      resendId: result.provider === 'resend' ? result.messageId || null : null,
      gmailMessageId: result.provider === 'gmail' ? result.messageId || null : null,
      status: 'sent',
    }, {
      entityType: 'payment',
      entityId: orderRef.id,
      entityLabel,
      templateId: resolvedTemplate.template.id,
      templateName: resolvedTemplate.template.name,
      templateType: 'boutique_order_payment',
      triggerName: 'boutique_order_payment',
      sendType: 'automated',
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
    await assertBoutiqueAccess({ clubRef, authUid: request.auth.uid, HttpsError });

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
      await assertBoutiqueAccess({ clubRef, authUid: request.auth.uid, HttpsError });

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
