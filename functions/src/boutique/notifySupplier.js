const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { REGION } = require('./shared');

async function loadSupplier(db, clubId, supplierId) {
  const ref = db.collection('clubs').doc(clubId).collection('fournisseurs').doc(supplierId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Fournisseur introuvable');
  }
  return { ref, data: snap.data() };
}

async function buildSupplierNotificationPlan(db, clubId, supplierId, supplier) {
  const strategy = supplier?.boutique_config?.notification_strategy || {};
  const threshold = Number(strategy.threshold?.min_items || 0);

  // TODO Phase 3: replace this placeholder count with an orders query grouped by supplier.
  const pendingItemsCount = 0;
  const thresholdReached = threshold > 0 ? pendingItemsCount >= threshold : true;

  return {
    supplierId,
    clubId,
    mode: strategy.mode || 'manual',
    pendingItemsCount,
    thresholdReached,
    readyToSend: thresholdReached,
  };
}

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
    const supplier = await loadSupplier(db, clubId, supplierId);
    const plan = await buildSupplierNotificationPlan(db, clubId, supplierId, supplier.data);

    // TODO Phase 3: admin authorization check.
    // TODO Phase 3: compose and send supplier digest email.
    return {
      success: true,
      mode: 'callable',
      supplierId,
      plan,
      sent: false,
      reason: 'TODO_SUPPLIER_NOTIFICATION_NOT_IMPLEMENTED',
    };
  },
);

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
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    const clubsSnapshot = await db.collection('clubs').get();
    let evaluatedSuppliers = 0;

    for (const clubDoc of clubsSnapshot.docs) {
      const suppliersSnap = await clubDoc.ref.collection('fournisseurs').get();
      for (const supplierDoc of suppliersSnap.docs) {
        const supplier = supplierDoc.data();
        const strategy = supplier?.boutique_config?.notification_strategy || {};
        if (strategy.mode !== 'weekly_digest') {
          continue;
        }

        const weeklyDigest = strategy.weekly_digest || {};
        if (weeklyDigest.day_of_week !== currentDay || weeklyDigest.hour !== currentHour) {
          continue;
        }

        evaluatedSuppliers += 1;
        const plan = await buildSupplierNotificationPlan(db, clubDoc.id, supplierDoc.id, supplier);
        console.log('[notifySupplierScheduler] TODO weekly digest candidate', {
          clubId: clubDoc.id,
          supplierId: supplierDoc.id,
          plan,
        });
      }
    }

    return { evaluatedSuppliers };
  },
);
