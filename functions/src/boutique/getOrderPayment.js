const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const QRCode = require('qrcode');
const { REGION, assertBoutiqueAccess, getClubRef, mapErrorToHttps } = require('./shared');
const { currentBoutiquePayment, assertCurrentPayment } = require('./paymentContext');

async function getBoutiqueOrderPaymentHandler(request, dependencies = {}) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const { clubId, orderId } = request.data || {};
  if (typeof clubId !== 'string' || !clubId || typeof orderId !== 'string' || !orderId) {
    throw new HttpsError('invalid-argument', 'Commande et club requis.');
  }
  try {
    const clubRef = getClubRef(dependencies.db || admin.firestore(), clubId);
    await (dependencies.assertAccess || assertBoutiqueAccess)({ clubRef, authUid: request.auth.uid, HttpsError });
    const ref = clubRef.collection('orders').doc(orderId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'Commande introuvable.');
    const order = snapshot.data();
    if (order.buyer?.userId !== request.auth.uid) throw new HttpsError('permission-denied', 'Accès refusé.');
    const context = currentBoutiquePayment(order);
    const qrCodeUrl = context.epcPayload ? await (dependencies.qrToDataURL || QRCode.toDataURL)(context.epcPayload) : null;
    const current = await ref.get();
    if (!current.exists || current.data().buyer?.userId !== request.auth.uid) throw new HttpsError('permission-denied', 'Accès refusé.');
    assertCurrentPayment(context, currentBoutiquePayment(current.data()));
    return { ...context, qrCodeUrl };
  } catch (error) { throw mapErrorToHttps(error, HttpsError); }
}
exports.getBoutiqueOrderPaymentHandler = getBoutiqueOrderPaymentHandler;
exports.getBoutiqueOrderPayment = onCall({ region: REGION, memory: '256MiB', timeoutSeconds: 30, maxInstances: 10 }, getBoutiqueOrderPaymentHandler);
