const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {
  REGION,
  assertBoutiqueAccess,
  buildDomainError,
  getClubRef,
  mapErrorToHttps,
} = require('./shared');

exports.cancelBoutiqueOrder = onCall(
  {
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const clubId = typeof request.data?.clubId === 'string' ? request.data.clubId.trim() : '';
    const orderId = typeof request.data?.orderId === 'string' ? request.data.orderId.trim() : '';
    if (!clubId || !orderId) {
      throw new HttpsError('invalid-argument', 'clubId ou orderId manquant');
    }

    const db = admin.firestore();
    const clubRef = getClubRef(db, clubId);
    await assertBoutiqueAccess({ clubRef, authUid: request.auth.uid, HttpsError });

    const orderRef = clubRef.collection('orders').doc(orderId);
    const inventoryMutationsRef = clubRef.collection('inventoryMutations');

    try {
      await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) {
          throw buildDomainError('ORDER_NOT_FOUND', 'Commande introuvable', { orderId });
        }

        const order = orderSnap.data() || {};
        if (order.buyer?.userId !== request.auth.uid) {
          throw new HttpsError('permission-denied', 'Cette commande ne vous appartient pas');
        }
        if (order.status !== 'awaiting_payment' || order.payment?.status !== 'pending') {
          throw buildDomainError('ORDER_NOT_CANCELLABLE', 'Cette commande ne peut plus être supprimée', {
            orderId,
            status: order.status,
            paymentStatus: order.payment?.status,
          });
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
            orderId,
            byUserId: request.auth.uid,
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
          },
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          cancelledBy: request.auth.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      return { success: true };
    } catch (error) {
      throw mapErrorToHttps(error, HttpsError);
    }
  },
);
