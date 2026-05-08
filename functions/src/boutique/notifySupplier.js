'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { REGION } = require('./shared');

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function formatDate(date) {
  if (!date) return '-';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('fr-BE');
}

function formatMoney(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '0.00';
  return amount.toFixed(2);
}

function generateSupplierEmailHtml({ supplierName, orders, clubName, logoUrl, orderCount, itemCount }) {
  const ordersHtml = orders.map((order) => {
    const supplierItems = order.supplierItems || [];
    const itemsHtml = supplierItems.map((item) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${escapeHtml(item.productSnapshot?.name || item.productId || '-')}</td>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${escapeHtml(item.productSnapshot?.variantLabel || item.variantId || '-')}</td>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: center;">${Number(item.qty) || 0}</td>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatMoney(item.unitPrice)} EUR</td>
          <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatMoney(item.lineTotal)} EUR</td>
        </tr>`).join('');

    const orderSubtotal = supplierItems.reduce(
      (sum, item) => sum + (typeof item.lineTotal === 'number' ? item.lineTotal : 0), 0,
    );

    return `
      <div style="background: #F3F4F6; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h3 style="margin: 0 0 8px 0; font-size: 15px; color: #374151;">
          Commande ${escapeHtml(order.orderNumber || order.id || '-')}
        </h3>
        <p style="margin: 0 0 12px 0; font-size: 13px; color: #6B7280;">
          Client&nbsp;: <strong>${escapeHtml(order.buyer?.displayName || '-')}</strong>
          &nbsp;&middot;&nbsp;
          Date&nbsp;: ${formatDate(order.createdAt)}
        </p>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #E5E7EB;">
              <th style="padding: 8px; text-align: left; color: #374151;">Produit</th>
              <th style="padding: 8px; text-align: left; color: #374151;">Variante</th>
              <th style="padding: 8px; text-align: center; color: #374151;">Qt&eacute;</th>
              <th style="padding: 8px; text-align: right; color: #374151;">Prix u.</th>
              <th style="padding: 8px; text-align: right; color: #374151;">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="padding: 8px; text-align: right; font-weight: 600; color: #374151;">Sous-total (vos articles)&nbsp;:</td>
              <td style="padding: 8px; text-align: right; font-weight: 700; color: #059669;">${formatMoney(orderSubtotal)} EUR</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    ${logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(clubName)}" style="max-width: 200px; height: auto;">`
    : `<h2 style="margin: 0; color: #374151;">${escapeHtml(clubName)}</h2>`
  }
  </div>

  <div style="padding: 30px 0;">
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">R&eacute;capitulatif de commandes</h1>

    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour ${escapeHtml(supplierName)},</p>

    <p>Vous trouverez ci-dessous le r&eacute;capitulatif des commandes en attente vous concernant.</p>

    <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0; font-size: 16px;">
        <strong>${orderCount}</strong> commande${orderCount > 1 ? 's' : ''}&nbsp;&middot;&nbsp;
        <strong>${itemCount}</strong> article${itemCount > 1 ? 's' : ''} au total
      </p>
    </div>

    ${ordersHtml}

    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>${escapeHtml(clubName)}</strong>
    </p>
  </div>

  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 8px;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plong&eacute;e
    </p>
  </div>
</body>
</html>`.trim();
}

// ─── Async helpers ────────────────────────────────────────────────────────────

async function sendEmailViaResend(apiKey, from, to, subject, html) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to send email via Resend');
  }
  return response.json();
}

async function loadEmailConfig(db, clubId) {
  const clubRef = db.collection('clubs').doc(clubId);
  const [emailConfigSnap, generalSnap] = await Promise.all([
    clubRef.collection('settings').doc('email_config').get(),
    clubRef.collection('settings').doc('general').get(),
  ]);

  if (!emailConfigSnap.exists) return null;
  const emailConfig = emailConfigSnap.data();
  if (emailConfig.provider !== 'resend' || !emailConfig.resend?.apiKey) return null;

  const general = generalSnap.exists ? generalSnap.data() : {};
  return {
    apiKey: emailConfig.resend.apiKey,
    fromEmail: emailConfig.resend.fromEmail || 'onboarding@resend.dev',
    fromName: emailConfig.resend.fromName || general.clubName || 'Calypso',
    clubName: general.clubName || 'Calypso Diving Club',
    logoUrl: general.logoUrl || '',
  };
}

/**
 * Returns all active (awaiting_payment | pending) orders that contain
 * at least one item for the given supplierId.
 * Because supplierId lives on individual order items (not at order level),
 * we fetch by status and then filter in-process.
 */
async function getPendingOrdersForSupplier(db, clubId, supplierId) {
  const ordersSnap = await db
    .collection('clubs')
    .doc(clubId)
    .collection('orders')
    .where('status', 'in', ['awaiting_payment', 'pending'])
    .get();

  const result = [];
  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    const items = Array.isArray(order.items) ? order.items : [];
    const supplierItems = items.filter((item) => item.supplierId === supplierId);
    if (supplierItems.length > 0) {
      result.push({ id: doc.id, ...order, supplierItems });
    }
  }
  return result;
}

async function buildSupplierNotificationPlan(db, clubId, supplierId, supplier) {
  const strategy = supplier?.boutique_config?.notification_strategy || {};
  const threshold = Number(strategy.threshold?.min_items || 0);

  const orders = await getPendingOrdersForSupplier(db, clubId, supplierId);
  const pendingItemsCount = orders.reduce((sum, o) => sum + o.supplierItems.length, 0);
  const thresholdReached = threshold > 0 ? pendingItemsCount >= threshold : true;

  return {
    supplierId,
    clubId,
    mode: strategy.mode || 'manual',
    pendingItemsCount,
    pendingOrdersCount: orders.length,
    thresholdReached,
    readyToSend: thresholdReached,
  };
}

/**
 * Core email-sending logic: fetch pending orders for the supplier,
 * compose the digest email, send via Resend, and log to email_history.
 */
async function sendSupplierNotificationEmail(db, clubId, supplierId, supplier, emailConfig) {
  const supplierName = supplier.name || supplierId;
  const supplierEmail = supplier.email;

  if (!supplierEmail) {
    console.warn(`[notifySupplier] Supplier ${supplierId} has no email address, skipping`);
    return { sent: false, reason: 'NO_SUPPLIER_EMAIL' };
  }

  const orders = await getPendingOrdersForSupplier(db, clubId, supplierId);
  if (orders.length === 0) {
    console.log(`[notifySupplier] No pending orders for supplier ${supplierId}, skipping`);
    return { sent: false, reason: 'NO_PENDING_ORDERS', orderCount: 0 };
  }

  const itemCount = orders.reduce((sum, o) => sum + o.supplierItems.length, 0);
  const orderLabel = orders.length === 1 ? 'commande' : 'commandes';
  const subject = `R\u00e9capitulatif de ${orderLabel} \u2014 ${orders.length} ${orderLabel} en attente`;
  const html = generateSupplierEmailHtml({
    supplierName,
    orders,
    clubName: emailConfig.clubName,
    logoUrl: emailConfig.logoUrl,
    orderCount: orders.length,
    itemCount,
  });

  const from = `${emailConfig.fromName} <${emailConfig.fromEmail}>`;
  const result = await sendEmailViaResend(emailConfig.apiKey, from, supplierEmail, subject, html);

  await db.collection('clubs').doc(clubId).collection('email_history').add({
    recipientEmail: supplierEmail,
    recipientName: supplierName,
    supplierId,
    emailType: 'supplier_order_digest',
    subject,
    status: 'sent',
    messageId: result.id,
    sendType: 'supplier_notification',
    sentBy: 'system',
    sentByName: 'Cloud Function',
    orderCount: orders.length,
    itemCount,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    clubId,
  });

  console.log(`[notifySupplier] Email sent to ${supplierEmail} (${orders.length} orders, ${itemCount} items, messageId=${result.id})`);
  return { sent: true, messageId: result.id, orderCount: orders.length, itemCount };
}

async function loadSupplier(db, clubId, supplierId) {
  const ref = db.collection('clubs').doc(clubId).collection('fournisseurs').doc(supplierId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Fournisseur introuvable');
  }
  return { ref, data: snap.data() };
}

// ─── Cloud Functions ──────────────────────────────────────────────────────────

/**
 * Callable: manual "Send now" from CalyCompta UI.
 * Sends a supplier digest regardless of the supplier's notification_strategy.
 */
exports.notifySupplier = onCall(
  {
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const clubId = typeof request.data?.clubId === 'string' ? request.data.clubId.trim() : '';
    const supplierId = typeof request.data?.supplierId === 'string' ? request.data.supplierId.trim() : '';
    if (!clubId || !supplierId) {
      throw new HttpsError('invalid-argument', 'clubId et supplierId sont requis');
    }

    const db = admin.firestore();
    const [supplier, emailConfig] = await Promise.all([
      loadSupplier(db, clubId, supplierId),
      loadEmailConfig(db, clubId),
    ]);

    if (!emailConfig) {
      throw new HttpsError('failed-precondition', 'Email non configur\u00e9 pour ce club (Resend)');
    }

    const result = await sendSupplierNotificationEmail(db, clubId, supplierId, supplier.data, emailConfig);
    return { success: true, mode: 'callable', supplierId, ...result };
  },
);

/**
 * Scheduled: runs every hour.
 * - weekly_digest: sends on the configured day + hour
 * - threshold:     sends whenever pending item count >= min_items
 * - immediate:     handled by onOrderCreatedNotifySupplier (Firestore trigger)
 * - manual:        handled by the callable above
 */
exports.notifySupplierScheduler = onSchedule(
  {
    schedule: 'every 1 hours',
    region: REGION,
    timeZone: 'Europe/Brussels',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const db = admin.firestore();
    const now = new Date();
    const currentDay = now.getDay();    // 0 = Sunday … 6 = Saturday
    const currentHour = now.getHours(); // 0-23 in Europe/Brussels
    const clubsSnapshot = await db.collection('clubs').get();
    let evaluatedSuppliers = 0;
    let sentEmails = 0;

    for (const clubDoc of clubsSnapshot.docs) {
      const clubId = clubDoc.id;
      let emailConfig;
      try {
        emailConfig = await loadEmailConfig(db, clubId);
      } catch (err) {
        console.error(`[notifySupplierScheduler] Failed to load email config for club ${clubId}:`, err);
        continue;
      }
      if (!emailConfig) continue;

      let suppliersSnap;
      try {
        suppliersSnap = await clubDoc.ref.collection('fournisseurs').get();
      } catch (err) {
        console.error(`[notifySupplierScheduler] Failed to fetch suppliers for club ${clubId}:`, err);
        continue;
      }

      for (const supplierDoc of suppliersSnap.docs) {
        const supplier = supplierDoc.data();
        const strategy = supplier?.boutique_config?.notification_strategy || {};
        const mode = strategy.mode;
        evaluatedSuppliers++;

        try {
          if (mode === 'weekly_digest') {
            const wd = strategy.weekly_digest || {};
            if (wd.day_of_week !== currentDay || wd.hour !== currentHour) continue;
            const res = await sendSupplierNotificationEmail(db, clubId, supplierDoc.id, supplier, emailConfig);
            if (res.sent) sentEmails++;
          } else if (mode === 'threshold') {
            const plan = await buildSupplierNotificationPlan(db, clubId, supplierDoc.id, supplier);
            if (plan.thresholdReached && plan.pendingItemsCount > 0) {
              const res = await sendSupplierNotificationEmail(db, clubId, supplierDoc.id, supplier, emailConfig);
              if (res.sent) sentEmails++;
            }
          }
          // 'immediate' → onOrderCreatedNotifySupplier
          // 'manual'    → notifySupplier callable
        } catch (err) {
          console.error(`[notifySupplierScheduler] Error for ${clubId}/${supplierDoc.id}:`, err);
        }
      }
    }

    console.log(`[notifySupplierScheduler] Done. evaluated=${evaluatedSuppliers}, sent=${sentEmails}`);
    return { evaluatedSuppliers, sentEmails };
  },
);

/**
 * Firestore trigger: fired when an order document is created.
 * For each unique supplier in the order items, if the supplier's
 * notification_strategy.mode === 'immediate', send a digest email right away.
 */
exports.onOrderCreatedNotifySupplier = onDocumentCreated(
  {
    document: 'clubs/{clubId}/orders/{orderId}',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (event) => {
    const { clubId } = event.params;
    const order = event.data.data();

    const items = Array.isArray(order.items) ? order.items : [];
    const supplierIds = [...new Set(items.map((i) => i.supplierId).filter(Boolean))];
    if (supplierIds.length === 0) return null;

    const db = admin.firestore();
    const emailConfig = await loadEmailConfig(db, clubId);
    if (!emailConfig) return null;

    for (const supplierId of supplierIds) {
      try {
        const supplierSnap = await db
          .collection('clubs').doc(clubId)
          .collection('fournisseurs').doc(supplierId)
          .get();
        if (!supplierSnap.exists) continue;

        const supplier = supplierSnap.data();
        const mode = supplier?.boutique_config?.notification_strategy?.mode;
        if (mode !== 'immediate') continue;

        await sendSupplierNotificationEmail(db, clubId, supplierId, supplier, emailConfig);
      } catch (err) {
        console.error(`[onOrderCreatedNotifySupplier] Error for supplier ${supplierId} in club ${clubId}:`, err);
      }
    }

    return null;
  },
);

// ─── Test-only exports ────────────────────────────────────────────────────────
// These are plain helper functions exposed for unit testing.
// They are NOT Cloud Functions and have no impact on production behaviour.
exports._test = {
  escapeHtml,
  formatDate,
  formatMoney,
  generateSupplierEmailHtml,
  getPendingOrdersForSupplier,
  buildSupplierNotificationPlan,
  sendSupplierNotificationEmail,
  loadEmailConfig,
};
