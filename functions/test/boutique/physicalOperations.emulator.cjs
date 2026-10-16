'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8087' || process.env.GCLOUD_PROJECT !== 'demo-boutique-qr') throw new Error('Demo Firestore emulator only.');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-boutique-qr' });
const db = admin.firestore();
const { executePhysicalOperation: execute } = require('../../src/boutique/physicalOperations');
const run = (db, actor, input, clock) => execute(db, actor, { expectedActorId: actor.uid, ...input }, clock);
const { sendPickupNotification } = require('../../src/boutique/pickupNotifications');
let sequence = 0;
const clubId = `qa_${Date.now()}`, club = db.collection('clubs').doc(clubId);
const actor = uid => ({ uid, clubClaim: clubId });
const call = (uid, action, params = {}) => run(db, actor(uid), { clubId, action, ...params });
const key = () => `qa_confirmation_${++sequence}`;
const piece = async n => (await call('rb', 'lookup', { unitId: `u${n}` })).unit;
const selection = async ns => Promise.all(ns.map(piece)).then(us => us.map(({ id, revision }) => ({ id, revision })));
const mutate = async (uid, action, ns, params = {}) => call(uid, action, { units: await selection(ns), idempotencyKey: key(), sourceLocation: 'Jim', ...params });
const count = async name => (await club.collection(name).get()).size;
before(async () => {
  await club.collection('settings').doc('feature_flags').set({ boutiqueQrEnabled: true, boutiqueMobileEnabled: true, boutiqueAccess: 'testeurs' });
  for (const uid of ['rb','helper1','helper2','outsider', ...Array.from({length:10},(_,i)=>`buyer${i}`)]) await club.collection('members').doc(uid).set({ member_status: 'active', display_name: uid, clubStatuten: uid === 'rb' ? ['RB'] : uid.startsWith('helper') ? ['Accueil'] : [], ...(uid === 'outsider' ? { role:'admin' } : {}) });
  for (let i=0;i<10;i++) {
    const qty = i === 9 ? 1 : 3, ids = Array.from({length:qty},(_,j)=>`u${i*3+j}`);
    await club.collection('orders').doc(`o${i}`).set({ status:'preparing', buyer:{ userId:`buyer${i}`, displayName:`Acheteur ${i}` }, orderNumber:`BTQ-QA-${i}`, payment:{status:i===8?'pending':'paid'}, items:[{lineId:'line',qty,deliveryMode:'pool_pickup',physicalStockUnitIds:ids,fulfillmentStatus:'preparing',productionStatus:'in_progress'}] });
    for (let j=0;j<qty;j++) await club.collection('boutique_physical_stock_units').doc(ids[j]).set({ productName:'Polo QA',variantLabel:'M',location:'Jim',destination:'customer_reserved',finish:'at_jim',saleStatus:'not_ready',requiresEmbroidery:true, customerOrderId:`o${i}`,customerLineId:'line',customerName:`Acheteur ${i}`, history:[] });
  }
});
after(async () => { await db.recursiveDelete(club); await admin.app().delete(); });
let missionId;
test('25 scans: workshop completion preserves Jim; departure sends nothing; arrival notifies only eight complete paid buyers', async () => {
  const ns=Array.from({length:25},(_,i)=>i);
  await mutate('rb','finishJim',ns,{note:'Broderies contrôlées'});
  assert.equal((await piece(0)).location,'Jim'); assert.equal((await piece(0)).saleStatus,'not_ready');
  assert.equal(await count('boutique_pickup_notifications'),0);
  const request={clubId,action:'dispatch',units:await selection(ns),idempotencyKey:key(),sourceLocation:'Jim',destination:'Piscine',assigneeIds:['helper1','helper2'],pickupPoint:true,pickupWindow:'Vendredi 19h–21h'};
  const preview=await run(db,actor('rb'),{...request,preview:true}); assert.equal(preview.notificationCount,0); assert.equal(await count('boutique_pickup_missions'),0);
  const departure=await run(db,actor('rb'),request); missionId=departure.missionId;
  assert.equal(await count('boutique_pickup_notifications'),0);
  assert.equal((await piece(0)).location,'En transport → Piscine');
  const access=await call('helper1','access'); assert.equal(access.canManage,false); assert.equal(access.hasAssignments,true);
  await assert.rejects(call('helper1','list'),{code:'permission-denied'});
  await assert.rejects(call('outsider','list'),{code:'permission-denied'});
  const arrivalRequest={clubId,action:'arrive',missionId,units:await selection(ns),idempotencyKey:key()};
  const arrival=await run(db,actor('helper1'),arrivalRequest); assert.equal(arrival.notificationCount,8); assert.equal(arrival.heldOrders.length,1);
  const replay=await run(db,actor('helper1'),arrivalRequest); assert.equal(replay.replayed,true); assert.equal(await count('boutique_pickup_notifications'),8);
  assert.equal((await piece(0)).location,'Piscine'); assert.equal((await piece(0)).finish,'returned_embroidered');
});
test('handover requires correct member and explicit confirmation; shared mission updates without duplication',async()=>{
  const params={missionId,recipientMemberId:'buyer1',confirmed:true};
  await assert.rejects(mutate('helper1','deliver',[0,1,2],params),{code:'failed-precondition'});
  await assert.rejects(mutate('helper1','deliver',[0,1,2],{...params,recipientMemberId:'buyer0',confirmed:false}),{code:'invalid-argument'});
  const request={clubId,action:'deliver',units:await selection([0,1,2]),missionId,recipientMemberId:'buyer0',confirmed:true,idempotencyKey:key()};
  await run(db,actor('helper1'),request); assert.equal((await piece(0)).saleStatus,'sold');
  const order=(await club.collection('orders').doc('o0').get()).data(); assert.equal(order.status,'delivered'); assert.equal(order.items[0].signatureStatus,'qr_confirmed');
  assert.equal((await call('helper2','mission',{missionId})).mission.delivered,3);
  await run(db,actor('helper1'),request); assert.equal(await count('boutique_handover_receipts'),1);
  await assert.rejects(mutate('helper2','deliver',[0],{missionId,recipientMemberId:'buyer0',confirmed:true}),{code:'failed-precondition'});
});
test('stale unit aborts whole lot; wrong club, unassigned helper, removed RB fail closed',async()=>{
  const units=await selection([3,4]); units[0].revision='stale';
  await assert.rejects(call('rb','move',{units,sourceLocation:'Piscine',destination:'Réserve',idempotencyKey:key()}),{code:'aborted'});
  assert.equal((await piece(4)).location,'Piscine');
  await assert.rejects(run(db,{uid:'rb',clubClaim:'elsewhere'},{clubId,action:'list'}),{code:'permission-denied'});
  await assert.rejects(call('outsider','mission',{missionId}),{code:'permission-denied'});
  await club.collection('members').doc('rb').update({clubStatuten:[]});
  await assert.rejects(call('helper1','mission',{missionId}),{code:'permission-denied'});
  await club.collection('members').doc('rb').update({clubStatuten:['RB']});
});
test('outbox sends once, keeps one deterministic history entry, and honors disabled push',async()=>{
  const doc=(await club.collection('boutique_pickup_notifications').where('orderId','==','o2').limit(1).get()).docs[0];
  await club.collection('members').doc(doc.data().recipientId).update({fcm_tokens:['qa-token']});
  let sends=0; const send=async()=>{sends++;return {successCount:1,failureCount:0};};
  await Promise.all([sendPickupNotification(db,clubId,doc.id,send),sendPickupNotification(db,clubId,doc.id,send)]); assert.equal(sends,1);
  assert.equal((await club.collection('members').doc(doc.data().recipientId).collection('notifications').get()).size,1);
  const second=(await club.collection('boutique_pickup_notifications').where('orderId','==','o3').limit(1).get()).docs[0];
  await club.collection('members').doc(second.data().recipientId).update({notifications_enabled:false,fcm_tokens:['qa-token']});
  await sendPickupNotification(db,clubId,second.id,send);assert.equal(sends,1);assert.equal((await second.ref.get()).data().status,'disabled');
  const stale=(await club.collection('boutique_pickup_notifications').where('orderId','==','o4').limit(1).get()).docs[0];
  await club.collection('members').doc(stale.data().recipientId).update({fcm_tokens:['qa-token']});
  await club.collection('boutique_physical_stock_units').doc('u12').update({location:'Autre lieu'});
  await sendPickupNotification(db,clubId,stale.id,send);assert.equal(sends,1);assert.equal((await stale.ref.get()).data().status,'stale');
});
test('unpaid packages stay blocked, and revocation removes helper access and releases unit locks',async()=>{
  await assert.rejects(mutate('helper2','deliver',[24],{missionId,recipientMemberId:'buyer8',confirmed:true}),{code:'failed-precondition'});
  await call('rb','revoke',{missionId,idempotencyKey:key()});
  await assert.rejects(call('helper2','mission',{missionId}),{code:'permission-denied'});
  assert.equal((await piece(24)).pickupMissionId,null);
  await mutate('rb','move',[24],{sourceLocation:'Piscine',destination:'Réserve'});
});
test('two helpers racing to hand over the same paid order produce one receipt; a full-order mission forbids underscanning',async()=>{
  const ns=[3,4,5];
  const task=await mutate('rb','dispatch',ns,{sourceLocation:'Piscine',destination:'Piscine',assigneeIds:['helper1','helper2'],confirmed:true,note:'Présence vérifiée',pickupPoint:true,pickupWindow:'Ce soir'});
  await assert.rejects(mutate('helper1','deliver',[3],{missionId:task.missionId,recipientMemberId:'buyer1',confirmed:true}),{code:'failed-precondition'});
  const units=await selection(ns);
  const base={clubId,action:'deliver',missionId:task.missionId,units,recipientMemberId:'buyer1',confirmed:true};
  const before=await count('boutique_handover_receipts');
  const results=await Promise.allSettled(['helper1','helper2'].map(uid=>run(db,actor(uid),{...base,idempotencyKey:key()})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await count('boutique_handover_receipts'),before+1);
});
test('partial handover is an explicit RB decision; shipping orders and expired missions cannot be handed out',async()=>{
  await mutate('rb','finishJim',[27],{note:'Contrôle terminé'});
  const task=await mutate('rb','dispatch',[27],{destination:'Piscine',assigneeIds:['helper1'],pickupPoint:true,pickupWindow:'Ce soir',allowPartial:true});
  await mutate('helper1','arrive',[27],{missionId:task.missionId});
  await club.collection('orders').doc('o9').update({items:[{lineId:'line',qty:1,deliveryMode:'post',physicalStockUnitIds:['u27'],fulfillmentStatus:'ready'}]});
  await assert.rejects(mutate('helper1','deliver',[27],{missionId:task.missionId,recipientMemberId:'buyer9',confirmed:true}),{code:'failed-precondition'});
  await club.collection('boutique_pickup_missions').doc(task.missionId).update({expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()-1000)});
  await assert.rejects(call('helper1','mission',{missionId:task.missionId}),{code:'permission-denied'});
  assert.ok((await call('rb','mission',{missionId:task.missionId})).mission);
  await call('rb','revoke',{missionId:task.missionId,idempotencyKey:key()});
});
test('revoking an in-transit mission frees the lock without pretending arrival; changed replay payload is rejected',async()=>{
  const ns=[6,7,8];
  const departure=await mutate('rb','dispatch',ns,{sourceLocation:'Piscine',destination:'Réserve',assigneeIds:['helper1']});
  const keyValue=key();
  const request={missionId:departure.missionId,idempotencyKey:keyValue};
  await call('rb','revoke',request);
  assert.equal((await piece(6)).transportMissionId,null);assert.equal((await piece(6)).location,'En transport → Réserve');
  await call('rb','revoke',request);
  await assert.rejects(call('rb','revoke',{...request,note:'Different payload'}),{code:'already-exists'});
  await mutate('rb','move',ns,{sourceLocation:'En transport → Réserve',destination:'Réserve'});
});
test('split missions hold the complete-order message until RB regroups the actual pieces',async()=>{
  await club.collection('members').doc('buyer10').set({member_status:'active',display_name:'Acheteur 10'});
  const ids=['u30','u31','u32'];
  await club.collection('orders').doc('o10').set({status:'ready',buyer:{userId:'buyer10'},payment:{status:'paid'},items:[{lineId:'line',qty:3,deliveryMode:'pool_pickup',physicalStockUnitIds:ids,fulfillmentStatus:'ready'}]});
  for (const unitId of ids) await club.collection('boutique_physical_stock_units').doc(unitId).set({productName:'Veste QA',variantLabel:'L',location:'Piscine',destination:'customer_reserved',finish:'returned_embroidered',saleStatus:'sale_ready',requiresEmbroidery:true,customerOrderId:'o10',customerLineId:'line',history:[]});
  const params={sourceLocation:'Piscine',destination:'Piscine',assigneeIds:['helper1'],confirmed:true,note:'Présence vérifiée',pickupPoint:true,pickupWindow:'Ce soir'};
  const first=await mutate('rb','dispatch',[30],params);assert.equal(first.notificationCount,0);assert.equal(first.heldOrders[0].reason,'regroup');
  await mutate('rb','dispatch',[31,32],params);
  const task=(await call('helper1','mission',{missionId:first.missionId}));assert.equal(task.packets[0].ready,false);
  const full=await mutate('rb','dispatch',[30,31,32],params);assert.equal(full.notificationCount,1);
  const notification=(await club.collection('boutique_pickup_notifications').where('orderId','==','o10').get()).docs[0].data();assert.match(notification.body,/Veste QA/);assert.match(notification.body,/Piscine/);
});

test('an account switch cannot apply a confirmation captured for another actor', async () => {
  const units = await selection([18]);
  await assert.rejects(run(db,actor('rb'),{clubId,action:'move',expectedActorId:'other-rb',units,sourceLocation:'Piscine',destination:'Réserve',idempotencyKey:key()}),{code:'permission-denied'});
  assert.equal((await piece(18)).location,'Piscine');
});
test('over 100 historical missions cannot hide a current helper task; live missions paginate without omission',async()=>{
  await club.collection('members').doc('pager').set({member_status:'active',clubStatuten:['Accueil']});
  const now=admin.firestore.Timestamp.now(), expiry=admin.firestore.Timestamp.fromMillis(Date.now()+86400000);
  const task={status:'closed',destination:'Piscine',sourceLocation:'Jim',pickupWindow:'Ce soir',createdAt:now,expiresAt:expiry,createdBy:'rb',unitIds:[],arrivedUnitIds:[],deliveredUnitIds:[],assigneeIds:['pager'],assigneeNames:['Pager'],allowPartial:false,pickupPoint:true};
  const history=db.batch();for(let i=0;i<120;i++)history.set(club.collection('boutique_pickup_missions').doc(`history-${String(i).padStart(3,'0')}`),task);
  history.set(club.collection('boutique_pickup_missions').doc('z-current'),{...task,status:'transit'});await history.commit();
  assert.equal((await call('pager','access')).hasAssignments,true);
  assert.deepEqual((await call('pager','missions')).missions.map(m=>m.id),['z-current']);
  const extra=db.batch();for(let i=0;i<100;i++)extra.set(club.collection('boutique_pickup_missions').doc(`active-${String(i).padStart(3,'0')}`),{...task,status:'received'});await extra.commit();
  const first=await call('pager','missions');assert.equal(first.missions.length,100);assert.equal(first.hasMore,true);assert.ok(first.nextCursor);
  const second=await call('pager','missions',{cursor:first.nextCursor});assert.equal(second.missions.length,1);assert.equal(second.hasMore,false);
  assert.equal(new Set([...first.missions,...second.missions].map(m=>m.id)).size,101);
});
test('plain club stock cannot skip a reserved customer name; positive Jim route completes required personalization',async()=>{
  const unitId='u40';
  await club.collection('members').doc('buyer11').set({member_status:'active'});
  await club.collection('orders').doc('o11').set({status:'preparing',buyer:{userId:'buyer11'},payment:{status:'paid'},items:[{lineId:'line',qty:1,deliveryMode:'pool_pickup',physicalStockUnitIds:[unitId],customizations:{name:{text:'Client Name'}},fulfillmentStatus:'preparing',productionStatus:'queued'}]});
  await club.collection('boutique_physical_stock_units').doc(unitId).set({productName:'Plain base + customer name',variantLabel:'M',location:'Réserve',finish:'unembroidered',saleStatus:'not_ready',requiresEmbroidery:false,destination:'customer_reserved',customerOrderId:'o11',customerLineId:'line',history:[]});
  await assert.rejects(mutate('rb','reviewPlain',[40],{sourceLocation:'Réserve',note:'Contrôlé'}),{code:'failed-precondition'});
  assert.equal((await piece(40)).saleStatus,'not_ready');
  await mutate('rb','prepareJim',[40],{sourceLocation:'Réserve'});
  await mutate('rb','confirmJim',[40],{sourceLocation:'Réserve',destination:'Jim',note:'Pièce reçue pour personnalisation'});
  await mutate('rb','finishJim',[40],{note:'Nom brodé et vérifié'});
  const task=await mutate('rb','dispatch',[40],{destination:'Piscine',assigneeIds:['helper1'],pickupPoint:true,pickupWindow:'Ce soir'});
  await mutate('helper1','arrive',[40],{missionId:task.missionId});
  const line=(await club.collection('orders').doc('o11').get()).data().items[0];assert.equal(line.productionStatus,'done');assert.equal(line.fulfillmentStatus,'ready');
  await mutate('helper1','deliver',[40],{missionId:task.missionId,recipientMemberId:'buyer11',confirmed:true});assert.equal((await piece(40)).saleStatus,'sold');
});
test('qty2 with only one received piece reports one missing article and records partial quantity before the rest arrives',async()=>{
  await club.collection('members').doc('buyer12').set({member_status:'active'});
  const line={lineId:'line',qty:2,deliveryMode:'pool_pickup',physicalStockUnitIds:['u41'],fulfillmentStatus:'preparing'};
  await club.collection('orders').doc('o12').set({status:'preparing',buyer:{userId:'buyer12'},payment:{status:'paid'},items:[line]});
  const u={productName:'Polo partiel',variantLabel:'M',location:'Réserve',finish:'unembroidered',saleStatus:'not_ready',requiresEmbroidery:false,destination:'customer_reserved',customerOrderId:'o12',customerLineId:'line',history:[]};
  await club.collection('boutique_physical_stock_units').doc('u41').set(u);
  await mutate('rb','reviewPlain',[41],{sourceLocation:'Réserve',note:'Contrôlé'});
  const task=await mutate('rb','dispatch',[41],{sourceLocation:'Réserve',destination:'Piscine',assigneeIds:['helper1'],pickupPoint:true,pickupWindow:'Ce soir',allowPartial:true});
  await mutate('helper1','arrive',[41],{missionId:task.missionId});
  const notice=(await club.collection('boutique_pickup_notifications').where('orderId','==','o12').get()).docs[0].data();assert.match(notice.body,/1 pièce\(s\) encore en attente/);
  assert.equal((await call('helper1','mission',{missionId:task.missionId})).packets[0].remaining,1);
  await mutate('helper1','deliver',[41],{missionId:task.missionId,recipientMemberId:'buyer12',confirmed:true});
  const partial=(await club.collection('orders').doc('o12').get()).data();assert.equal(partial.items[0].deliveredQty,1);assert.equal(partial.items[0].handoverProofType,'member_qr');assert.equal(partial.items[0].fulfillmentStatus,'preparing');
  // The later real receipt appends a physical ID, preserving existing handover.
  await club.collection('boutique_physical_stock_units').doc('u42').set(u);
  await club.collection('orders').doc('o12').update({items:[{...partial.items[0],physicalStockUnitIds:['u41','u42']}]});
  await mutate('rb','reviewPlain',[42],{sourceLocation:'Réserve',note:'Contrôlé'});
  const rest=await mutate('rb','dispatch',[42],{sourceLocation:'Réserve',destination:'Piscine',assigneeIds:['helper1'],pickupPoint:true,pickupWindow:'Ce soir'});
  await mutate('helper1','arrive',[42],{missionId:rest.missionId});
  await mutate('helper1','deliver',[42],{missionId:rest.missionId,recipientMemberId:'buyer12',confirmed:true});
  const complete=(await club.collection('orders').doc('o12').get()).data();assert.equal(complete.status,'delivered');assert.equal(complete.items[0].deliveredQty,2);
});

test('a preprinted QR does not fabricate stock and explains receipt before movements', async () => {
  const before = await count('boutique_physical_stock_units');
  await assert.rejects(call('rb', 'lookup', { unitId: 'qr1_' + 'a'.repeat(64) }), e => e.code === 'failed-precondition' && e.message.includes('confirmez la réception'));
  await assert.rejects(call('outsider', 'lookup', { unitId: 'qr1_' + 'a'.repeat(64) }), e => e.code === 'permission-denied');
  assert.equal(await count('boutique_physical_stock_units'), before);
});


test('undecided received stock is confirmed plain only during explicit later control; required/customer embroidery stays protected', async () => {
  const base = { productName: 'Stock réceptionné QA', variantLabel: 'M', stockPurchaseOrderId: 'stock-qa', location: 'Jan', finish: 'unembroidered', saleStatus: 'not_ready', destination: 'free', history: [] };
  await club.collection('boutique_physical_stock_units').doc('u70').set(base);
  await mutate('rb', 'reviewPlain', [70], { sourceLocation: 'Jan', note: 'Aucune broderie nécessaire, contrôle effectué' });
  const plain = (await club.collection('boutique_physical_stock_units').doc('u70').get()).data();
  assert.equal(plain.requiresEmbroidery, false); assert.equal(plain.location, 'Jan'); assert.equal(plain.saleStatus, 'sale_ready');
  assert.ok(plain.history.some(event => event.kind === 'finish_requirement_confirmed'));
  assert.ok(!plain.history.some(event => event.kind === 'moved'));
  await club.collection('boutique_physical_stock_units').doc('u71').set({ ...base, requiresEmbroidery: true });
  await assert.rejects(mutate('rb', 'reviewPlain', [71], { sourceLocation: 'Jan', note: 'Contrôlé' }), { code: 'failed-precondition' });
  await club.collection('orders').doc('o-plain-guard').set({ status: 'preparing', buyer: { userId: 'buyer0' }, payment: { status: 'paid' }, items: [{ lineId: 'line', qty: 1, physicalStockUnitIds: ['u72'], customizations: { name: { text: 'Required name' } }, fulfillmentStatus: 'preparing' }] });
  await club.collection('boutique_physical_stock_units').doc('u72').set({ ...base, destination: 'customer_reserved', customerOrderId: 'o-plain-guard', customerLineId: 'line' });
  await assert.rejects(mutate('rb', 'reviewPlain', [72], { sourceLocation: 'Jan', note: 'Contrôlé' }), { code: 'failed-precondition' });
  assert.equal((await piece(72)).saleStatus, 'not_ready');
});

test('complete receipt listing pages beyond 200 with batch identity and manager-only access; 60-piece move stays atomic and move-only', async () => {
  const writes = db.batch();
  for (let i = 0; i < 205; i++) writes.set(club.collection('boutique_physical_stock_units').doc(`page_${String(i).padStart(3, '0')}`), {
    productName: 'Receipt QA', variantLabel: 'M', location: 'Jan', supplierBatchId: 'receipt-qa', supplierOrderReference: 'W-QA', finish: 'unembroidered', saleStatus: 'not_ready', destination: 'club_stock', history: []
  });
  await writes.commit();
  const first = await call('rb', 'list');
  assert.equal(first.units.length, 200); assert.equal(first.hasMore, true); assert.ok(first.nextCursor);
  const second = await call('rb', 'list', { cursor: first.nextCursor });
  assert.equal(second.hasMore, false); assert.equal(second.nextCursor, null);
  const all = [...first.units, ...second.units];
  assert.equal(new Set(all.map(u => u.id)).size, all.length);
  const receipt = all.filter(u => u.supplierBatchId === 'receipt-qa');
  assert.equal(receipt.length, 205); assert.ok(receipt.every(u => u.supplierOrderReference === 'W-QA' && u.revision));
  await assert.rejects(call('helper1', 'list', { cursor: first.nextCursor }), { code: 'permission-denied' });
  const chosen = receipt.slice(0, 60).map(({id,revision}) => ({id,revision}));
  const request = { units: chosen, sourceLocation: 'Jan', destination: 'Jim', idempotencyKey: key() };
  await assert.rejects(call('rb', 'prepareJim', request), { code:'invalid-argument' });
  const notifications = await count('boutique_pickup_notifications');
  const stale = club.collection('boutique_physical_stock_units').doc(chosen.at(-1).id);
  await stale.update({ updatedAt: admin.firestore.Timestamp.now() });
  await assert.rejects(call('rb', 'move', request), { code: 'aborted' });
  for (const u of chosen) assert.equal((await club.collection('boutique_physical_stock_units').doc(u.id).get()).data().location, 'Jan');
  request.units = await Promise.all(chosen.map(async u => { const {id,revision} = (await call('rb','lookup',{unitId:u.id})).unit; return {id,revision}; }));
  const preview = await call('rb', 'move', { ...request, preview: true }); assert.equal(preview.count, 60);
  const result = await call('rb', 'move', request); assert.equal(result.count, 60);
  const replay = await call('rb', 'move', request); assert.equal(replay.replayed, true);
  for (const u of request.units) {
    const moved = (await club.collection('boutique_physical_stock_units').doc(u.id).get()).data();
    assert.equal(moved.location, 'Jim'); assert.equal(moved.finish, 'unembroidered'); assert.equal(moved.saleStatus, 'not_ready'); assert.equal(moved.destination, 'club_stock');
    assert.equal(moved.history.length, 1); assert.equal(moved.history[0].kind, 'moved');
  }
  assert.equal((await club.collection('boutique_physical_stock_units').doc(receipt[60].id).get()).data().location, 'Jan');
  assert.equal(await count('boutique_pickup_notifications'), notifications);
});
