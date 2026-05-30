const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { REGION } = require('./shared');

function timestampToIso(value) {
  if (!value || typeof value.toDate !== 'function') return null;
  return value.toDate().toISOString();
}

function simplifyOrder(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    orderNumber: data.orderNumber || '',
    status: data.status || '',
    createdAt: timestampToIso(data.createdAt),
    expiresAt: timestampToIso(data.expiresAt),
    pricing: data.pricing || {},
    payment: data.payment || {},
    buyer: data.buyer || {},
    paymentCommunication: data.paymentCommunication || data.structuredCommunication || data.ogm_display || '',
    structuredCommunication: data.structuredCommunication || '',
    items: Array.isArray(data.items)
      ? data.items.map((item) => ({
          lineId: item.lineId || '',
          productId: item.productId || '',
          variantId: item.variantId || '',
          qty: item.qty || 0,
          unitPrice: item.unitPrice || 0,
          lineTotal: item.lineTotal || 0,
          fulfillmentStatus: item.fulfillmentStatus || '',
          deliveryMode: item.deliveryMode || '',
          deliveryAddress: item.deliveryAddress || null,
          customizations: item.customizations || null,
          productSnapshot: item.productSnapshot || {},
        }))
      : [],
  };
}

exports.listBoutiqueOrders = onCall(
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
    if (!clubId) {
      throw new HttpsError('invalid-argument', 'clubId manquant');
    }

    const snapshot = await admin.firestore()
      .collection('clubs')
      .doc(clubId)
      .collection('orders')
      .where('buyer.userId', '==', request.auth.uid)
      .get();

    const orders = snapshot.docs
      .map(simplifyOrder)
      .filter((order) => order.status !== 'cancelled')
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    return { orders };
  },
);
