'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8087' || process.env.GCLOUD_PROJECT !== 'demo-boutique-qr') throw Error('Demo emulator only');
const admin = require('firebase-admin'); admin.initializeApp({projectId:'demo-boutique-qr'});
const db=admin.firestore(), {executePhysicalOperation:run}=require('../../src/boutique/physicalOperations');
const clubId=`qa_mobile_${Date.now()}`, club=db.collection('clubs').doc(clubId), actor={uid:'rb',clubClaim:clubId};
const call=(action,params={})=>run(db,actor,{clubId,action,...params});
let counter=0;
async function request(action, unitId, extra={}) {const {unit}=await call('lookup',{unitId});return {expectedActorId:'rb',units:[{id:unit.id,revision:unit.revision}],idempotencyKey:`mobile-integration-${String(++counter).padStart(5,'0')}`, ...extra};}
before(async()=>{await club.collection('settings').doc('feature_flags').set({boutiqueQrEnabled:true,boutiqueMobileEnabled:true,boutiqueAccess:'tous'});await club.collection('members').doc('rb').set({member_status:'active',clubStatuten:['RB']});});
after(async()=>{await db.recursiveDelete(club);await admin.app().delete();});
test('moving a customer piece to Jim prepares it for finishing without losing its order',async()=>{
 const unit={productId:'p',variantId:'v',productName:'Polo',variantLabel:'M',location:'Jan',finish:'unembroidered',saleStatus:'not_ready',destination:'customer_reserved',customerOrderId:'o',customerLineId:'l',requiresEmbroidery:true};
 await club.collection('boutique_physical_stock_units').doc('move').set(unit);await club.collection('orders').doc('o').set({orderNumber:'DEMO',status:'paid',payment:{status:'paid'},buyer:{userId:'buyer'},items:[{lineId:'l',qty:1,fulfillmentStatus:'pending',physicalStockUnitIds:['move']}]});
 const move=await request('move','move',{sourceLocation:'Jan',destination:'Jim'});await call('move',{...move,preview:true});await call('move',move);
 let piece=(await club.collection('boutique_physical_stock_units').doc('move').get()).data();assert.equal(piece.finish,'unembroidered');assert.equal(piece.location,'Jim');
 const finish=await request('finishJim','move');await call('finishJim',finish);piece=(await club.collection('boutique_physical_stock_units').doc('move').get()).data();assert.ok(piece.workshopReadyAt);assert.equal((await club.collection('orders').doc('o').get()).data().items[0].productionStatus,'in_progress');
});
test('moving a piece belonging to a pickup mission is refused without altering either',async()=>{
 await club.collection('boutique_physical_stock_units').doc('owned').set({productName:'Bonnet',location:'Club',finish:'returned_embroidered',saleStatus:'sale_ready',destination:'free',pickupMissionId:'mission'});
 const move=await request('move','owned',{sourceLocation:'Club',destination:'Jim'});await assert.rejects(call('move',move),{code:'failed-precondition'});
 const piece=(await club.collection('boutique_physical_stock_units').doc('owned').get()).data();assert.equal(piece.pickupMissionId,'mission');assert.equal(piece.location,'Club');
});
test('damage replacement is transactional, requires an accepted choice and remains idempotent',async()=>{
 await club.collection('boutique_physical_stock_units').doc('damage').set({productId:'p2',variantId:'v',productName:'Bonnet',variantLabel:'OS',location:'Jim',finish:'at_jim',saleStatus:'not_ready',destination:'customer_reserved',customerOrderId:'d',customerLineId:'l'});
 await club.collection('orders').doc('d').set({orderNumber:'DEMO2',status:'paid',payment:{status:'paid'},buyer:{userId:'buyer'},items:[{lineId:'l',qty:1,physicalStockUnitIds:['damage']}]});
 await club.collection('products').doc('p2').set({supplierId:'supplier'});await club.collection('fournisseurs').doc('supplier').set({nom:'Wordans'});
 const base=await request('damageJim','damage',{note:'Fil cassé'});assert.equal((await call('damageJim',{...base,preview:true})).replacement,'supplier');
 await assert.rejects(call('damageJim',base),{code:'invalid-argument'});const approved={...base,expectedReplacement:'supplier'};
 await call('damageJim',approved);assert.equal((await call('damageJim',approved)).replayed,true);
 const piece=(await club.collection('boutique_physical_stock_units').doc('damage').get()).data();assert.equal(piece.inventoryExcluded,true);
 const purchases=await club.collection('boutique_stock_purchase_orders').get();assert.equal(purchases.size,1);assert.equal(purchases.docs[0].data().lines[0].embroideryRecovery.orderId,'d');
});
test('reopening embroidery also clears a dispatched status',async()=>{
 await club.collection('boutique_physical_stock_units').doc('reopen').set({productName:'Polo',location:'Jim',finish:'at_jim',saleStatus:'not_ready',destination:'free',workshopReadyAt:admin.firestore.Timestamp.now(),workshopDispatchedAt:admin.firestore.Timestamp.now()});
 const req=await request('reopenJim','reopen');await call('reopenJim',req);
 const piece=(await club.collection('boutique_physical_stock_units').doc('reopen').get()).data();assert.equal(piece.workshopReadyAt,null);assert.equal(piece.workshopDispatchedAt,null);
 assert.deepEqual(piece.history.map(h=>h.kind),['atelier_dispatch_reopened','workshop_reopened']);
});
test('an existing unembroidered club piece at Jim can be finished',async()=>{
 await club.collection('boutique_physical_stock_units').doc('legacy-jim').set({productName:'Polo',location:'Chez Jim',finish:'unembroidered',saleStatus:'not_ready',destination:'free',requiresEmbroidery:true});
 const req=await request('finishJim','legacy-jim');await call('finishJim',req);
 const piece=(await club.collection('boutique_physical_stock_units').doc('legacy-jim').get()).data();assert.equal(piece.finish,'at_jim');assert.ok(piece.workshopReadyAt);
});
test('order overview verifies ready pieces and withholds unverified readiness',async()=>{
 const line={lineId:'line',qty:1,fulfillmentStatus:'ready',physicalStockUnitIds:['ready-piece'],productSnapshot:{name:'Polo'}};
 await club.collection('orders').doc('verified-ready').set({orderNumber:'READY',status:'ready',payment:{status:'paid'},buyer:{displayName:'Test'},items:[line]});
 const ref=club.collection('boutique_physical_stock_units').doc('ready-piece');
 await ref.set({productName:'Polo',customerOrderId:'verified-ready',customerLineId:'line',destination:'customer_reserved',finish:'returned_embroidered',saleStatus:'sale_ready',requiresEmbroidery:true});
 let order=(await call('orderOverview')).orders.find(o=>o.id==='verified-ready');assert.equal(order.status,'ready');assert.equal(order.items[0].status,'ready');
 await ref.update({finish:'at_jim',saleStatus:'not_ready'});order=(await call('orderOverview')).orders.find(o=>o.id==='verified-ready');assert.equal(order.status,'review');assert.equal(order.items[0].status,'review');
});
test('finish and dispatch reject stale Jim location and unpaid customer orders',async()=>{
 for (const [name,loc,status,readyFlag,action] of [['wrong-place','Jan','paid',false,'finishJim'],['unpaid','Jim','pending',false,'finishJim'],['wrong-dispatch','Jan','paid',true,'sendJim'],['unpaid-dispatch','Jim','pending',true,'sendJim']]) {
  const id=`piece-${name}`, orderId=`order-${name}`;
  await club.collection('orders').doc(orderId).set({status:'preparing',payment:{status},items:[{lineId:'l',qty:1,physicalStockUnitIds:[id]}]});
  await club.collection('boutique_physical_stock_units').doc(id).set({productName:'Polo',location:loc,finish:'at_jim',saleStatus:'not_ready',destination:'customer_reserved',customerOrderId:orderId,customerLineId:'l',requiresEmbroidery:true,...(readyFlag?{workshopReadyAt:admin.firestore.Timestamp.now()}:{})});
  const req=await request(action,id);await assert.rejects(call(action,req),{code:'failed-precondition'});
 }
});
