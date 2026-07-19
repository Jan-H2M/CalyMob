const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { REGION } = require('./shared');

// Fix audit 2026-07-19 (K3): créées avec expiresAt = +72h, les commandes
// 'awaiting_payment' n'étaient jamais expirées — le stock réservé restait
// bloqué indéfiniment (voorraadlek/DoS). Ce cron annule les commandes échues
// et libère le stock, avec la même logique transactionnelle que cancelOrder.
// Club unique (calypso) — même hypothèse que le reste de la base.
const CLUB_ID = 'calypso';
const BATCH_LIMIT = 50;

async function expireOrderTransaction(db, clubRef, orderDoc) {
  const orderRef = orderDoc.ref;
  const inventoryMutationsRef = clubRef.collection('inventoryMutations');

  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) return;

    const order = orderSnap.data() || {};
    // Re-check dans la transaction : le membre peut avoir payé entre-temps
    // (auto-match) ou annulé lui-même.
    if (order.status !== 'awaiting_payment' || order.payment?.status !== 'pending') {
      return;
    }
    const expiresAtMillis = order.expiresAt?.toMillis ? order.expiresAt.toMillis() : 0;
    if (!expiresAtMillis || expiresAtMillis > Date.now()) {
      return;
    }

    const releaseRows = [];
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const reservedQty = Number(item.productSnapshot?.reservedQty || 0);
      if (!item.productId || !item.variantId || reservedQty <= 0) continue;

      const productRef = clubRef.collection('products').doc(item.productId);
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists) continue;

      const product = productSnap.data() || {};
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const variantIndex = variants.findIndex((variant) => variant?.id === item.variantId);
      if (variantIndex === -1) continue;

      const variant = { ...variants[variantIndex] };
      variant.stockCount = Number(variant.stockCount || 0) + reservedQty;
      variants[variantIndex] = variant;
      releaseRows.push({ productRef, variants, item, reservedQty });
    }

    for (const row of releaseRows) {
      transaction.update(row.productRef, {
        variants: row.variants,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.set(inventoryMutationsRef.doc(), {
        productId: row.item.productId,
        variantId: row.item.variantId,
        change: row.reservedQty,
        reason: 'release',
        orderId: orderRef.id,
        byUserId: 'system:expiry',
        timestamp: admin.firestore.Timestamp.now(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    transaction.set(orderRef, {
      status: 'cancelled',
      payment: {
        ...order.payment,
        status: 'cancelled',
        lastMatchError: 'order_expired',
      },
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      cancelledBy: 'system:expiry',
      cancellationReason: 'Commande expirée (non payée sous 72 h)',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

exports.expireBoutiqueOrders = onSchedule(
  {
    region: REGION,
    schedule: 'every 60 minutes',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    const db = admin.firestore();
    const clubRef = db.collection('clubs').doc(CLUB_ID);
    const now = admin.firestore.Timestamp.now();

    const expiredSnap = await clubRef.collection('orders')
      .where('status', '==', 'awaiting_payment')
      .where('expiresAt', '<=', now)
      .limit(BATCH_LIMIT)
      .get();

    if (expiredSnap.empty) {
      return;
    }

    let expired = 0;
    for (const orderDoc of expiredSnap.docs) {
      try {
        await expireOrderTransaction(db, clubRef, orderDoc);
        expired += 1;
        console.log(`[expireBoutiqueOrders] Commande expirée: ${orderDoc.get('orderNumber') || orderDoc.id}`);
      } catch (error) {
        console.error(`[expireBoutiqueOrders] Echec expiration ${orderDoc.id}:`, error);
      }
    }
    console.log(`[expireBoutiqueOrders] ${expired}/${expiredSnap.size} commande(s) expirée(s)`);
  },
);
