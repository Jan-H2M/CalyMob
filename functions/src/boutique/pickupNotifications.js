'use strict';
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { REGION } = require('./shared');
const { paidForPickup, lineNeedsProduction } = require('./physicalOperations');

// The in-app notification is created atomically with arrival. Claim each push
// once: an ambiguous network response must never cause repeated buyer messages.
async function sendPickupNotification(db, clubId, notificationId, send = message => admin.messaging().sendEachForMulticast(message)) {
  const club = db.collection('clubs').doc(clubId);
  const ref = club.collection('boutique_pickup_notifications').doc(notificationId);
  const job = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().status !== 'pending') return null;
    const data = snap.data();
    const [member, flags] = await Promise.all([tx.get(club.collection('members').doc(data.recipientId)), tx.get(club.collection('settings').doc('feature_flags'))]);
    const m = member.data() || {};
    const [order, mission, ...units] = await Promise.all([tx.get(club.collection('orders').doc(data.orderId)), tx.get(club.collection('boutique_pickup_missions').doc(data.missionId)), ...data.unitIds.map(id => tx.get(club.collection('boutique_physical_stock_units').doc(id)))]);
    const task = mission.data();
    const current = paidForPickup(order.data()) && order.data().buyer?.userId === data.recipientId && task && !['revoked','closed'].includes(task.status) && task.expiresAt.toMillis() > Date.now() && units.length > 0 && units.every(snap => { const u = snap.data(), line = order.data()?.items?.find(i => i.lineId === u?.customerLineId && i.physicalStockUnitIds?.includes(snap.id)); return u && !u.inventoryExcluded && line && (!lineNeedsProduction(line) || u.finish === 'returned_embroidered') && u.customerOrderId === data.orderId && u.location === task.destination && u.pickupMissionId === data.missionId && !u.transportMissionId && u.saleStatus === 'sale_ready' && ['returned_embroidered','not_required_reviewed'].includes(u.finish); });
    const enabled = flags.data()?.boutiqueQrEnabled === true && (flags.data()?.boutiqueEnabled === true || flags.data()?.boutiqueMobileEnabled === true) && flags.data()?.boutiqueAccess !== 'masque';
    const tokens = [...new Set((Array.isArray(m.fcm_tokens) ? m.fcm_tokens : [m.fcm_token]).filter(t => typeof t === 'string' && t.length > 0))].slice(0, 500);
    const disabled = !enabled || m.member_status !== 'active' || m.notifications_enabled === false || m.notification_preferences?.boutique === false;
    const status = !current ? 'stale' : disabled ? 'disabled' : !tokens.length ? 'no_tokens' : 'sending';
    tx.update(ref, { status, attemptedAt: admin.firestore.FieldValue.serverTimestamp() });
    return status === 'sending' ? { ...data, tokens } : null;
  });
  if (!job) return;
  try {
    // Do not use badge-helper here: it also adds a second notification history
    // entry. Omit badge; the existing cursor authority owns unread counts.
    const result = await send({ tokens: job.tokens, notification: { title: job.title, body: job.body }, data: Object.fromEntries(Object.entries(job.data).map(([k,v]) => [k,String(v)])), android: { priority: 'high' }, apns: { payload: { aps: { sound: 'default' } } } });
    await ref.update({ status: result.successCount > 0 ? 'sent' : 'failed', successCount: result.successCount, failureCount: result.failureCount, completedAt: admin.firestore.FieldValue.serverTimestamp() });
  } catch (_) {
    // FCM may already have accepted a request whose response was lost. Keep the
    // deterministic in-app message and require a human decision before retry.
    await ref.update({ status: 'unknown', completedAt: admin.firestore.FieldValue.serverTimestamp() });
  }
}
exports.sendPickupNotification = sendPickupNotification;
exports.sendBoutiquePickupNotification = onDocumentCreated({ document: 'clubs/{clubId}/boutique_pickup_notifications/{notificationId}', region: REGION, retry: true, maxInstances: 10 }, event => sendPickupNotification(admin.firestore(), event.params.clubId, event.params.notificationId));
