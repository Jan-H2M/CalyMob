/**
 * Cloud Functions: Stock level alerts.
 *
 * 1. Scheduled function (daily 07:00) — scans all products across all clubs,
 *    writes alert documents for variants where stockCount < reorderPoint.
 * 2. Callable function — on-demand check for a specific club, returns alerts.
 *
 * Alert docs are written to clubs/{clubId}/stockAlerts/{autoId}.
 * No emails or push notifications — just the alert documents.
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { REGION, isMigrationBackfill } = require('./shared');

/**
 * Check stock levels for a single club and return alert entries.
 * Does NOT write to Firestore — caller decides what to do with the results.
 */
async function checkStockLevels(db, clubId) {
  const clubRef = db.collection('clubs').doc(clubId);
  const productsSnapshot = await clubRef.collection('products').get();
  const alerts = [];

  for (const productDoc of productsSnapshot.docs) {
    const product = productDoc.data();

    if (isMigrationBackfill(product)) continue;

    const inventoryMode = product.inventoryMode || 'tracked';
    if (inventoryMode !== 'tracked') continue;

    const variants = Array.isArray(product.variants) ? product.variants : [];

    for (const variant of variants) {
      if (!variant || !variant.id) continue;

      const stockCount = Number.isFinite(Number(variant.stockCount))
        ? Number(variant.stockCount)
        : 0;
      const reorderPoint = Number.isFinite(Number(variant.reorderPoint))
        ? Number(variant.reorderPoint)
        : 0;
      const stockMin = Number.isFinite(Number(variant.stockMin))
        ? Number(variant.stockMin)
        : 0;
      const stockTarget = Number.isFinite(Number(variant.stockTarget))
        ? Number(variant.stockTarget)
        : 0;

      // Out of stock alert (always for tracked products)
      if (stockCount <= 0) {
        alerts.push({
          productId: productDoc.id,
          productName: product.name || '',
          variantId: variant.id,
          variantLabel: variant.label || variant.size || '',
          currentStock: stockCount,
          reorderPoint,
          stockMin,
          stockTarget,
          alertType: 'out_of_stock',
        });
        continue;
      }

      // Low stock alert (only if reorderPoint > 0)
      if (reorderPoint > 0 && stockCount < reorderPoint) {
        alerts.push({
          productId: productDoc.id,
          productName: product.name || '',
          variantId: variant.id,
          variantLabel: variant.label || variant.size || '',
          currentStock: stockCount,
          reorderPoint,
          stockMin,
          stockTarget,
          alertType: 'low_stock',
        });
      }
    }
  }

  return alerts;
}

/**
 * Scheduled: daily stock level scan at 07:00 Europe/Brussels.
 * Writes alert documents to clubs/{clubId}/stockAlerts/.
 */
exports.stockAlertScheduled = onSchedule(
  {
    schedule: '0 7 * * *', // Daily at 07:00
    timeZone: 'Europe/Brussels',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async (event) => {
    const db = admin.firestore();
    console.log('[stockAlertScheduled] Starting at', new Date().toISOString());

    const now = admin.firestore.Timestamp.now();
    let totalAlerts = 0;

    try {
      const clubsSnapshot = await db.collection('clubs').get();
      console.log(`[stockAlertScheduled] Found ${clubsSnapshot.size} clubs`);

      for (const clubDoc of clubsSnapshot.docs) {
        const clubId = clubDoc.id;
        const clubRef = db.collection('clubs').doc(clubId);

        const alerts = await checkStockLevels(db, clubId);

        if (alerts.length === 0) {
          continue;
        }

        console.log(
          `[stockAlertScheduled] Club ${clubId}: ${alerts.length} alert(s) found`,
        );

        // Write alerts in batches of 500 (Firestore batch limit)
        const batch = db.batch();
        let batchCount = 0;

        for (const alert of alerts) {
          const alertRef = clubRef.collection('stockAlerts').doc();
          batch.set(alertRef, {
            ...alert,
            status: 'open',
            triggeredAt: now,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          batchCount++;

          // Commit every 500 docs
          if (batchCount >= 500) {
            await batch.commit();
            batchCount = 0;
          }
        }

        if (batchCount > 0) {
          await batch.commit();
        }

        totalAlerts += alerts.length;
      }

      console.log(
        `[stockAlertScheduled] Done. ${totalAlerts} alert(s) written.`,
      );
    } catch (err) {
      console.error('[stockAlertScheduled] Fatal error:', err);
    }

    return null;
  },
);

/**
 * Callable: on-demand stock level check for a single club.
 * Returns the list of alerts without writing them to Firestore.
 */
exports.checkStockAlerts = onCall(
  {
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const clubId = request.data && request.data.clubId;
    if (!clubId || typeof clubId !== 'string') {
      throw new HttpsError('invalid-argument', 'clubId est requis');
    }

    const db = admin.firestore();
    const alerts = await checkStockLevels(db, clubId);

    console.log(
      `[checkStockAlerts] Club ${clubId}: ${alerts.length} alert(s) found`,
    );

    return { alerts };
  },
);
