/**
 * Cloud Function: Auto-cancel expired unpaid boutique orders every hour.
 *
 * Scheduled function that runs every hour to:
 * 1. Find orders with status == 'awaiting_payment' and expiresAt < now
 * 2. Change status to 'cancelled_expired'
 * 3. Restore stock (+variant.stockCount) for each line item that had reserved qty
 * 4. Log inventory mutations (reason: 'cancellation')
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { REGION, isMigrationBackfill } = require('./shared');

const BATCH_SIZE = 50;

exports.autoCancelExpiredOrders = onSchedule(
  {
    schedule: '0 * * * *', // Every hour at :00
    timeZone: 'Europe/Brussels',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 300,
    maxInstances: 1, // Prevent concurrent runs that could double-restore stock
  },
  async (event) => {
    const db = admin.firestore();
    console.log('[autoCancelExpiredOrders] Starting at', new Date().toISOString());

    const now = admin.firestore.Timestamp.now();
    let totalCancelled = 0;
    let totalRestoredQty = 0;

    try {
      // 1. Fetch all clubs
      const clubsSnapshot = await db.collection('clubs').get();
      console.log(`[autoCancelExpiredOrders] Found ${clubsSnapshot.size} clubs`);

      for (const clubDoc of clubsSnapshot.docs) {
        const clubId = clubDoc.id;
        const clubRef = db.collection('clubs').doc(clubId);

        // 2. Query expired pending orders
        const expiredOrders = await clubRef
          .collection('orders')
          .where('status', '==', 'awaiting_payment')
          .where('expiresAt', '<', now)
          .limit(BATCH_SIZE)
          .get();

        if (expiredOrders.empty) {
          continue;
        }

        console.log(
          `[autoCancelExpiredOrders] Club ${clubId}: ${expiredOrders.size} expired order(s) found`,
        );

        for (const orderDoc of expiredOrders.docs) {
          const orderId = orderDoc.id;
          const order = orderDoc.data();

          // Skip backfill/migration records
          if (isMigrationBackfill(order)) {
            console.log(
              `[autoCancelExpiredOrders] Skip backfill order ${clubId}/${orderId}`,
            );
            continue;
          }

          // Double-check: expiresAt must actually be in the past
          if (!order.expiresAt || order.expiresAt.toMillis() >= now.toMillis()) {
            continue;
          }

          try {
            const inventoryMutationsRef = clubRef.collection('inventoryMutations');
            const orderRef = clubRef.collection('orders').doc(orderId);

            // Use a transaction to safely cancel + restore stock
            await db.runTransaction(async (transaction) => {
              // ALL reads FIRST, then writes — Firestore transaction rule
              // 1. Re-read order inside the transaction to detect concurrent changes
              const freshOrderSnap = await transaction.get(orderRef);
              if (!freshOrderSnap.exists) {
                return;
              }

              const freshOrder = freshOrderSnap.data();
              // Only cancel orders that are still awaiting payment
              if (freshOrder.status !== 'awaiting_payment') {
                return;
              }

              // 2. Read items from the transaction-fresh order, not the outer snapshot
              const items = Array.isArray(freshOrder.items) ? freshOrder.items : [];

              // 3. Pre-read all product docs before any writes
              const productReads = new Map();
              for (const item of items) {
                const productId = item.productId || '';
                const variantId = item.variantId || '';
                const qty = Number(item.qty || 0);
                if (!productId || !variantId || qty <= 0) continue;

                if (!productReads.has(productId)) {
                  const productRef = clubRef.collection('products').doc(productId);
                  const snap = await transaction.get(productRef);
                  productReads.set(productId, { ref: productRef, snap });
                }
              }

              // ALL reads done — now do writes

              // 4. Update order status
              transaction.update(orderRef, {
                status: 'cancelled_expired',
                'payment.status': 'cancelled_expired',
                cancellationReason: 'expired',
                cancelledAt: now,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              // 5. Restore stock for each line item
              for (const item of items) {
                const productId = item.productId || '';
                const variantId = item.variantId || '';
                const qty = Number(item.qty || 0);

                if (!productId || !variantId || qty <= 0) {
                  continue;
                }

                const productCache = productReads.get(productId);
                if (!productCache) continue;

                const freshProductSnap = productCache.snap;

                if (!freshProductSnap.exists) {
                  console.warn(
                    `[autoCancelExpiredOrders] Product ${productId} not found for order ${clubId}/${orderId}`,
                  );
                  continue;
                }

                const product = freshProductSnap.data();
                const variants = Array.isArray(product.variants) ? [...product.variants] : [];
                const variantIndex = variants.findIndex((v) => v && v.id === variantId);

                if (variantIndex === -1) {
                  console.warn(
                    `[autoCancelExpiredOrders] Variant ${variantId} not found in product ${productId} for order ${clubId}/${orderId}`,
                  );
                  continue;
                }

                const variant = { ...variants[variantIndex] };
                const inventoryMode = product.inventoryMode || 'tracked';

                // Only restore stock if this item actually had reserved inventory
                // createOrder.js only sets reservedQty > 0 for tracked items with sufficient stock.
                // Preorder/backorder items have reservedQty === 0 — restoring them would inflate stock.
                const reservedQty = Number(item.productSnapshot?.reservedQty || 0);
                if (reservedQty <= 0) {
                  continue;
                }

                {
                  const currentStock = Number.isFinite(Number(variant.stockCount))
                    ? Number(variant.stockCount)
                    : 0;
                  variant.stockCount = currentStock + qty;
                  variants[variantIndex] = variant;

                  transaction.update(productCache.ref, {
                    variants,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  });

                  // Log the inventory mutation
                  const mutationRef = inventoryMutationsRef.doc();
                  transaction.set(mutationRef, {
                    productId,
                    variantId,
                    change: qty,
                    reason: 'cancellation',
                    orderId,
                    byUserId: 'system',
                    timestamp: now,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  });

                  totalRestoredQty += qty;
                }
              }
            });

            totalCancelled++;
            console.log(
              `[autoCancelExpiredOrders] Cancelled order ${clubId}/${orderId} (${items.length} items)`,
            );
          } catch (err) {
            console.error(
              `[autoCancelExpiredOrders] Failed to cancel order ${clubId}/${orderId}:`,
              err,
            );
            // Continue with next order — don't fail the whole batch
          }
        }
      }

      console.log(
        `[autoCancelExpiredOrders] Done. ${totalCancelled} order(s) cancelled, ${totalRestoredQty} item(s) restored.`,
      );
    } catch (err) {
      console.error('[autoCancelExpiredOrders] Fatal error:', err);
    }

    return null;
  },
);
