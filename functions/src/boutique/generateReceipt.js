const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { REGION } = require('./shared');

exports.generateBoutiqueReceipt = onCall(
  {
    region: REGION,
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 3,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const clubId = typeof request.data?.clubId === 'string' ? request.data.clubId.trim() : '';
    const orderId = typeof request.data?.orderId === 'string' ? request.data.orderId.trim() : '';
    if (!clubId || !orderId) {
      throw new HttpsError('invalid-argument', 'clubId et orderId sont requis');
    }

    const db = admin.firestore();
    const orderSnap = await db.collection('clubs').doc(clubId).collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Commande introuvable');
    }

    const order = orderSnap.data();

    // TODO Phase 3: generate a real PDF using the existing library set in functions/package.json.
    // TODO Phase 3: include CDC logo, buyer block, items table, totals and TVA disclaimer.
    // TODO Phase 3: upload receipt.pdf to Storage at clubs/{clubId}/orders/{orderId}/receipt.pdf.
    return {
      success: true,
      orderId,
      orderNumber: order.orderNumber || '',
      url: 'TODO',
    };
  },
);
