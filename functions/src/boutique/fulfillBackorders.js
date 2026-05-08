/**
 * Cloud Function: FIFO backorder fulfillment — daily at 03:00.
 *
 * Scheduled function that runs daily to:
 * 1. Find orders with status == 'awaiting_payment' that have items with
 *    fulfillmentStatus == 'awaiting_restock'
 * 2. Group backorder items by (productId, variantId)
 * 3. Sort orders within each group by createdAt ASC (FIFO — oldest first)
 * 4. Allocate available stock: decrement variant stockCount, change
 *    fulfillmentStatus from 'awaiting_restock' to 'pending'
 * 5. Write inventory mutation logs (reason: 'fulfillment')
 * 6. If stock runs out partway through, leave remaining as awaiting_restock
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { REGION, isMigrationBackfill } = require('./shared');

const BATCH_SIZE = 50;

exports.fulfillBackorders = onSchedule(
  {
    schedule: '0 3 * * *', // Daily at 03:00
    timeZone: 'Europe/Brussels',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async (event) => {
    const db = admin.firestore();
    console.log('[fulfillBackorders] Starting at', new Date().toISOString());

    const now = admin.firestore.Timestamp.now();
    let totalAllocated = 0;
    let totalOrdersUpdated = 0;

    try {
      const clubsSnapshot = await db.collection('clubs').get();
      console.log(`[fulfillBackorders] Found ${clubsSnapshot.size} clubs`);

      for (const clubDoc of clubsSnapshot.docs) {
        const clubId = clubDoc.id;
        const clubRef = db.collection('clubs').doc(clubId);

        // 1. Query orders that may contain backorder items
        const ordersSnapshot = await clubRef
          .collection('orders')
          .where('status', '==', 'awaiting_payment')
          .orderBy('createdAt', 'asc')
          .limit(BATCH_SIZE)
          .get();

        if (ordersSnapshot.empty) {
          continue;
        }

        // 2. Collect all backorder items grouped by (productId, variantId)
        //    Each entry: { orderId, orderRef, itemIndex, qty, productSnapshot }
        const backorderGroups = new Map(); // key: "productId|variantId"
        const relevantOrders = [];

        for (const orderDoc of ordersSnapshot.docs) {
          const order = orderDoc.data();

          if (isMigrationBackfill(order)) {
            continue;
          }

          const items = Array.isArray(order.items) ? order.items : [];
          let hasBackorderItem = false;

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (
              item.fulfillmentStatus === 'awaiting_restock' &&
              item.productSnapshot &&
              item.productSnapshot.inventoryMode === 'tracked'
            ) {
              const productId = item.productId || '';
              const variantId = item.variantId || '';
              const qty = Number(item.qty || 0);

              if (!productId || !variantId || qty <= 0) continue;

              const key = `${productId}|${variantId}`;
              if (!backorderGroups.has(key)) {
                backorderGroups.set(key, []);
              }

              backorderGroups.get(key).push({
                orderId: orderDoc.id,
                orderRef: orderDoc.ref,
                itemIndex: i,
                qty,
                createdAt: order.createdAt,
              });

              hasBackorderItem = true;
            }
          }

          if (hasBackorderItem) {
            relevantOrders.push(orderDoc);
          }
        }

        if (backorderGroups.size === 0) {
          continue;
        }

        console.log(
          `[fulfillBackorders] Club ${clubId}: ${backorderGroups.size} product/variant group(s), ${relevantOrders.length} order(s) with backorder items`,
        );

        // 3. For each (productId, variantId) group, allocate stock FIFO
        //    Items within each group are already sorted by createdAt ASC
        //    because we queried orders with orderBy('createdAt', 'asc')

        // Collect all allocations, then execute in a transaction per order
        // Map: orderId -> [{ itemIndex, productId, variantId, allocatedQty }]
        const allocationsByOrder = new Map();
        // Map: "productId|variantId" -> totalAllocatedFromStock
        const stockDecrements = new Map();

        for (const [key, entries] of backorderGroups) {
          const [productId, variantId] = key.split('|');

          // Read current stock for this product
          const productRef = clubRef.collection('products').doc(productId);
          const productSnap = await productRef.get();

          if (!productSnap.exists) {
            console.warn(
              `[fulfillBackorders] Product ${productId} not found, skipping`,
            );
            continue;
          }

          const product = productSnap.data();
          const variants = Array.isArray(product.variants) ? product.variants : [];
          const variant = variants.find((v) => v && v.id === variantId);

          if (!variant) {
            console.warn(
              `[fulfillBackorders] Variant ${variantId} not found in product ${productId}, skipping`,
            );
            continue;
          }

          let availableStock = Number.isFinite(Number(variant.stockCount))
            ? Number(variant.stockCount)
            : 0;

          if (availableStock <= 0) {
            console.log(
              `[fulfillBackorders] No stock for ${productId}/${variantId}, skipping`,
            );
            continue;
          }

          // FIFO allocation — entries are already ordered by createdAt ASC
          for (const entry of entries) {
            if (availableStock <= 0) break;

            const allocateQty = Math.min(entry.qty, availableStock);
            availableStock -= allocateQty;

            if (!allocationsByOrder.has(entry.orderId)) {
              allocationsByOrder.set(entry.orderId, {
                orderRef: entry.orderRef,
                allocations: [],
              });
            }

            allocationsByOrder.get(entry.orderId).allocations.push({
              itemIndex: entry.itemIndex,
              productId,
              variantId,
              allocatedQty,
              fullAllocation: allocateQty === entry.qty,
            });

            // Track total decrement per variant
            const currentDecrement = stockDecrements.get(key) || 0;
            stockDecrements.set(key, currentDecrement + allocateQty);
          }
        }

        if (allocationsByOrder.size === 0) {
          console.log(`[fulfillBackorders] Club ${clubId}: No stock available for allocation`);
          continue;
        }

        // 4. Execute allocations in a single transaction per order
        for (const [orderId, { orderRef, allocations }] of allocationsByOrder) {
          try {
            await db.runTransaction(async (transaction) => {
              // ALL reads FIRST
              const freshOrderSnap = await transaction.get(orderRef);
              if (!freshOrderSnap.exists) return;

              const freshOrder = freshOrderSnap.data();
              if (freshOrder.status !== 'awaiting_payment') return;

              const items = Array.isArray(freshOrder.items) ? [...freshOrder.items] : [];

              // Pre-read all product docs needed for this order
              const productReads = new Map();
              for (const alloc of allocations) {
                if (!productReads.has(alloc.productId)) {
                  const productRef = clubRef.collection('products').doc(alloc.productId);
                  const snap = await transaction.get(productRef);
                  productReads.set(alloc.productId, { ref: productRef, snap });
                }
              }

              // ALL reads done — now do writes

              // Track which products need variant array updates
              const productUpdates = new Map(); // productId -> variants[]

              for (const alloc of allocations) {
                // Verify item still needs allocation
                if (
                  alloc.itemIndex >= items.length ||
                  items[alloc.itemIndex].fulfillmentStatus !== 'awaiting_restock'
                ) {
                  continue;
                }

                const productCache = productReads.get(alloc.productId);
                if (!productCache || !productCache.snap.exists) continue;

                // Get or initialize variant array for this product
                if (!productUpdates.has(alloc.productId)) {
                  const product = productCache.snap.data();
                  productUpdates.set(alloc.productId, {
                    ref: productCache.ref,
                    variants: Array.isArray(product.variants) ? [...product.variants] : [],
                  });
                }

                const productUpdate = productUpdates.get(alloc.productId);
                const variantIndex = productUpdate.variants.findIndex(
                  (v) => v && v.id === alloc.variantId,
                );

                if (variantIndex === -1) continue;

                const variant = { ...productUpdate.variants[variantIndex] };
                const currentStock = Number.isFinite(Number(variant.stockCount))
                  ? Number(variant.stockCount)
                  : 0;

                // Re-check stock inside transaction
                if (currentStock < alloc.allocatedQty) {
                  console.warn(
                    `[fulfillBackorders] Insufficient stock in transaction for ${alloc.productId}/${alloc.variantId}: need ${alloc.allocatedQty}, have ${currentStock}`,
                  );
                  continue;
                }

                // Decrement stock
                variant.stockCount = currentStock - alloc.allocatedQty;
                productUpdate.variants[variantIndex] = variant;

                // Update order item fulfillmentStatus
                items[alloc.itemIndex] = {
                  ...items[alloc.itemIndex],
                  fulfillmentStatus: 'pending',
                };

                // Write inventory mutation
                const mutationRef = clubRef.collection('inventoryMutations').doc();
                transaction.set(mutationRef, {
                  productId: alloc.productId,
                  variantId: alloc.variantId,
                  change: -alloc.allocatedQty,
                  reason: 'fulfillment',
                  orderId,
                  byUserId: 'system',
                  timestamp: now,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                totalAllocated += alloc.allocatedQty;
              }

              // Write order items update
              transaction.update(orderRef, {
                items,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              // Write product variant updates
              for (const [, productUpdate] of productUpdates) {
                transaction.update(productUpdate.ref, {
                  variants: productUpdate.variants,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
              }
            });

            totalOrdersUpdated++;
            console.log(
              `[fulfillBackorders] Allocated stock for order ${clubId}/${orderId} (${allocations.length} item(s))`,
            );
          } catch (err) {
            console.error(
              `[fulfillBackorders] Failed to process order ${clubId}/${orderId}:`,
              err,
            );
            // Continue with next order
          }
        }
      }

      console.log(
        `[fulfillBackorders] Done. ${totalOrdersUpdated} order(s) updated, ${totalAllocated} item(s) allocated.`,
      );
    } catch (err) {
      console.error('[fulfillBackorders] Fatal error:', err);
    }

    return null;
  },
);
