'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8087' || process.env.GCLOUD_PROJECT !== 'demo-boutique-qr') throw new Error('Demo Firestore emulator only.');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-boutique-qr' });
const db = admin.firestore();
const { executePhysicalOperation: execute } = require('../../src/boutique/physicalOperations');
const clubId = `qa_selection_${Date.now()}`, club = db.collection('clubs').doc(clubId);
const actor = uid => ({ uid, clubClaim: clubId });
// Enforce read-only at the transaction API as well as checking persisted state.
const readDb = { collection: db.collection.bind(db), runTransaction: fn => db.runTransaction(tx => fn(new Proxy(tx, { get(target, key) {
  if (['set', 'create', 'update', 'delete'].includes(key)) return () => { throw new Error('Selection attempted a write'); };
  const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
} }))) };
const call = (action, params = {}, uid = 'rb') => execute(readDb, actor(uid), { clubId, action, ...params });
async function seed(orderId, qty = 2) {
  const ids = Array.from({ length: qty }, (_, n) => `${orderId}_p${n}`);
  const order = { status: 'preparing', orderNumber: `QA-${orderId}`, buyer: { userId: 'qa-buyer', displayName: 'Acheteur fictif', email: 'never-return@example.invalid' }, payment: { status: 'paid' }, items: [{ lineId: 'line', qty, deliveryMode: 'pool_pickup', fulfillmentStatus: 'preparing', physicalStockUnitIds: ids }] };
  const batch = db.batch(); batch.set(club.collection('orders').doc(orderId), order);
  for (const id of ids) batch.set(club.collection('boutique_physical_stock_units').doc(id), { productName: 'Polo fictif', location: 'Jim', finish: 'at_jim', saleStatus: 'not_ready', destination: 'customer_reserved', customerOrderId: orderId, customerLineId: 'line' });
  await batch.commit(); return { order, ids };
}
before(async () => {
  await club.collection('settings').doc('feature_flags').set({ boutiqueQrEnabled: true, boutiqueMobileEnabled: true, boutiqueAccess: 'testeurs' });
  await club.collection('members').doc('rb').set({ member_status: 'active', clubStatuten: ['RB'] });
  await club.collection('members').doc('helper').set({ member_status: 'active', clubStatuten: ['Accueil'], role: 'admin' });
});
after(async () => { await db.recursiveDelete(club); await admin.app().delete(); });
test('whole order reads all exact revisions without writing or exposing payments/contact details', async () => {
  const { ids } = await seed('complete');
  const before = (await club.collection('orders').doc('complete').get()).updateTime;
  const result = await call('orderSelection', { orderId: 'complete', sourceLocation: 'Jim' });
  assert.deepEqual(result.units.map(u => u.id), ids);
  assert.ok(result.units.every(u => typeof u.revision === 'string'));
  assert.deepEqual((await club.collection('orders').doc('complete').get()).updateTime, before);
  assert.equal((await club.collection('boutique_stock_operations').get()).size, 0);
  const page = await call('orders');
  const row = page.orders.find(o => o.id === 'complete');
  assert.deepEqual(Object.keys(row).sort(), ['customerName', 'id', 'orderNumber', 'physicalCount']);
  assert.equal(row.physicalCount, 2);
});
test('RB and current feature flag are required; helper/admin and wrong club are denied', async () => {
  for (const action of ['orders', 'orderSelection']) {
    const params = action === 'orderSelection' ? { orderId: 'complete', sourceLocation: 'Jim' } : {};
    await assert.rejects(call(action, params, 'helper'), { code: 'permission-denied' });
    await assert.rejects(execute(readDb, { uid: 'rb', clubClaim: 'other' }, { clubId, action, ...params }), { code: 'permission-denied' });
    await club.collection('settings').doc('feature_flags').update({ boutiqueQrEnabled: false });
    await assert.rejects(call(action, params), { code: 'permission-denied' });
    await club.collection('settings').doc('feature_flags').update({ boutiqueQrEnabled: true });
  }
});
test('missing, malformed, incomplete or cancelled orders never return a partial selection', async () => {
  await assert.rejects(call('orderSelection', { orderId: 'absent', sourceLocation: 'Jim' }), { code: 'not-found' });
  for (const params of [{ orderId: '../escape', sourceLocation: 'Jim' }, { orderId: 'complete' }, { orderId: 'complete', sourceLocation: ' ' }, { orderId: 'complete', sourceLocation: 'Jim', role: 'admin' }]) await assert.rejects(call('orderSelection', params), { code: 'invalid-argument' });
  const { order } = await seed('incomplete');
  await club.collection('orders').doc('incomplete').update({ items: [{ ...order.items[0], qty: 3 }] });
  await assert.rejects(call('orderSelection', { orderId: 'incomplete', sourceLocation: 'Jim' }), { code: 'failed-precondition' });
  await club.collection('orders').doc('incomplete').update({ status: 'cancelled', items: order.items });
  await assert.rejects(call('orderSelection', { orderId: 'incomplete', sourceLocation: 'Jim' }), { code: 'failed-precondition' });
});
for (const [label, change] of [
  ['different place', { location: 'Piscine' }],
  ['in transit', { transportMissionId: 'qa-mission' }],
  ['other reservation', { customerOrderId: 'other' }],
  ['other line', { customerLineId: 'other' }],
  ['unproved sale', { saleStatus: 'sold' }],
]) test(`${label} rejects the entire order`, async () => {
  const { ids } = await seed(`invalid_${label.replaceAll(' ', '_')}`);
  await club.collection('boutique_physical_stock_units').doc(ids[1]).update(change);
  await assert.rejects(call('orderSelection', { orderId: `invalid_${label.replaceAll(' ', '_')}`, sourceLocation: 'Jim' }), { code: 'failed-precondition' });
});
test('missing physical records, duplicate reservations and orders above 50 are refused', async () => {
  const { ids, order } = await seed('broken');
  await club.collection('boutique_physical_stock_units').doc(ids[1]).delete();
  await assert.rejects(call('orderSelection', { orderId: 'broken', sourceLocation: 'Jim' }), { code: 'failed-precondition' });
  await club.collection('orders').doc('broken').update({ items: [{ ...order.items[0], physicalStockUnitIds: [ids[0], ids[0]] }] });
  await assert.rejects(call('orderSelection', { orderId: 'broken', sourceLocation: 'Jim' }), { code: 'failed-precondition' });
  await seed('large', 51);
  await assert.rejects(call('orderSelection', { orderId: 'large', sourceLocation: 'Jim' }), { code: 'failed-precondition' });
});
test('verified partial handovers select only the remaining pieces; digital lines are not stock', async () => {
  const { ids, order } = await seed('partial');
  await club.collection('orders').doc('partial').update({ items: [...order.items, { lineId: 'digital', qty: 1, deliveryMode: 'digital' }] });
  await club.collection('boutique_physical_stock_units').doc(ids[0]).update({ saleStatus: 'sold', handover: { type: 'member_qr', recipientMemberId: 'qa-buyer', operationId: 'qa-operation', confirmedAt: admin.firestore.Timestamp.now() } });
  const result = await call('orderSelection', { orderId: 'partial', sourceLocation: 'Jim' });
  assert.deepEqual(result.units.map(u => u.id), [ids[1]]);
});
test('orders paginate beyond the first page without contact/payment projection', async () => {
  const batch = db.batch();
  for (let i = 0; i < 65; i++) batch.set(club.collection('orders').doc(`pager_${String(i).padStart(3, '0')}`), { status: 'ready', orderNumber: `QA-${i}`, buyer: { displayName: 'Membre fictif', email: 'never-return@example.invalid' }, items: [] });
  await batch.commit();
  const rows = []; let cursor;
  for (let n = 0; n < 10; n++) {
    const page = await call('orders', cursor ? { cursor } : {}); rows.push(...page.orders);
    if (!page.hasMore) break;
    assert.notEqual(cursor, page.nextCursor); cursor = page.nextCursor;
  }
  assert.equal(new Set(rows.map(o => o.id)).size, rows.length);
  assert.equal(rows.filter(o => o.id.startsWith('pager_')).length, 65);
  assert.ok(rows.every(o => !('email' in o) && !('payment' in o)));
});
test('a changed piece still fails the existing mutation preview revision check', async () => {
  const { ids } = await seed('revision');
  const selected = await call('orderSelection', { orderId: 'revision', sourceLocation: 'Jim' });
  await club.collection('boutique_physical_stock_units').doc(ids[0]).update({ location: 'Piscine' });
  await assert.rejects(execute(readDb, actor('rb'), { clubId, action: 'move', expectedActorId: 'rb', units: selected.units.map(({ id, revision }) => ({ id, revision })), sourceLocation: 'Jim', destination: 'Réserve', preview: true, idempotencyKey: 'qa_revision_preview_123' }), { code: 'aborted' });
});
