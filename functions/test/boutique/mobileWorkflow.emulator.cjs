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
test('partial handover refuses an old sold piece without its own proof',async()=>{
 await club.collection('members').doc('buyer').set({member_status:'active'});
 await club.collection('orders').doc('mixed-old').set({status:'ready',payment:{status:'paid'},buyer:{userId:'buyer',displayName:'Alex'},items:[{lineId:'line',qty:2,deliveryMode:'pool_pickup',fulfillmentStatus:'ready',physicalStockUnitIds:['old-sold','new-ready']}]});
 const common={location:'Club',finish:'returned_embroidered',destination:'customer_reserved',customerOrderId:'mixed-old',customerLineId:'line'};
 await club.collection('boutique_physical_stock_units').doc('old-sold').set({...common,saleStatus:'sold'});
 await club.collection('boutique_physical_stock_units').doc('new-ready').set({...common,saleStatus:'sale_ready',pickupMissionId:'old-mission'});
 await club.collection('boutique_pickup_missions').doc('old-mission').set({status:'received',expiresAt:admin.firestore.Timestamp.fromMillis(Date.now()+600000),unitIds:['new-ready'],arrivedUnitIds:['new-ready'],deliveredUnitIds:[],destination:'Club',sourceLocation:'Club',assigneeIds:['rb'],createdBy:'rb',allowPartial:true});
 const req=await request('deliver','new-ready',{missionId:'old-mission',recipientMemberId:'buyer',verificationMethod:'manual',confirmed:true});
 await assert.rejects(call('deliver',req),{code:'failed-precondition'});
 assert.equal((await club.collection('boutique_physical_stock_units').doc('new-ready').get()).data().saleStatus,'sale_ready');
 assert.equal((await club.collection('orders').doc('mixed-old').get()).data().items[0].deliveredQty,undefined);
});
test('direct manual handover lists only paid ready pieces and records one receipt without a mission',async()=>{
 const buyer='buyer-free';await club.collection('members').doc(buyer).set({member_status:'active'});
 await club.collection('orders').doc('direct-hand').set({orderNumber:'BTQ-DEMO',status:'ready',payment:{status:'paid'},buyer:{userId:buyer,displayName:'Membre fictif'},items:[{lineId:'line',qty:1,deliveryMode:'in_person',fulfillmentStatus:'ready',physicalStockUnitIds:['direct-piece']}]});
 await club.collection('boutique_physical_stock_units').doc('direct-piece').set({productName:'Polo',variantLabel:'M',location:'Jan',finish:'returned_embroidered',saleStatus:'sale_ready',destination:'customer_reserved',customerOrderId:'direct-hand',customerLineId:'line',requiresEmbroidery:true});
 const candidates=await call('handoverCandidates');assert.ok(candidates.units.some(u=>u.id==='direct-piece'&&u.buyerId===buyer));
 const req=await request('manualDeliver','direct-piece',{recipientMemberId:buyer,verificationMethod:'manual',confirmed:true});
 await assert.rejects(call('manualDeliver',{...req,recipientMemberId:'rb'}),{code:'failed-precondition'});
 assert.equal((await call('manualDeliver',{...req,preview:true})).count,1);assert.equal((await club.collection('boutique_physical_stock_units').doc('direct-piece').get()).data().saleStatus,'sale_ready');
 await call('manualDeliver',req);assert.equal((await call('manualDeliver',req)).replayed,true);
 const piece=(await club.collection('boutique_physical_stock_units').doc('direct-piece').get()).data();assert.equal(piece.saleStatus,'sold');assert.equal(piece.handover.type,'manual');assert.equal(piece.handover.missionId,undefined);
 const order=(await club.collection('orders').doc('direct-hand').get()).data();assert.equal(order.status,'delivered');assert.equal(order.items[0].signatureStatus,'manual_confirmed');
});
test('event sale reserves once, issues an EPC reference, and posts a negative sale on handover',async()=>{
 await club.collection('members').doc('sale-buyer').set({member_status:'active',display_name:'Alex Example',email:'alex@example.invalid'});
 await club.collection('settings').doc('bank').set({iban:'BE68539007547034',beneficiaryName:'Club fictif'});
 await club.collection('products').doc('sale-product').set({name:'Polo',visibility:'published',inventoryMode:'tracked',pricing:{salePrice:25},variants:[{id:'M',label:'M',stockCount:2}]});
 await club.collection('boutique_physical_stock_units').doc('sale-piece').set({productId:'sale-product',variantId:'M',productName:'Polo',variantLabel:'M',location:'Club',finish:'returned_embroidered',saleStatus:'sale_ready',destination:'free',requiresEmbroidery:true});
 const req=await request('salePrepare','sale-piece',{recipientMemberId:'sale-buyer'});
 const quote=await call('salePrepare',{...req,preview:true});assert.equal(quote.total,25);assert.match(quote.epcPayload,/BCD/);assert.match(quote.communication,/BTQ-/);
 const started=await call('salePrepare',req);assert.equal((await call('salePrepare',req)).replayed,true);
 assert.equal((await club.collection('products').doc('sale-product').get()).data().variants[0].stockCount,1);
 const done=await request('saleComplete','sale-piece',{recipientMemberId:'sale-buyer',confirmed:true});
 await call('saleComplete',done);assert.equal((await call('saleComplete',done)).replayed,true);
 const order=(await club.collection('orders').doc(started.orderId).get()).data(),piece=(await club.collection('boutique_physical_stock_units').doc('sale-piece').get()).data();
 assert.equal(order.status,'delivered');assert.equal(order.payment.status,'pending');assert.equal(order.directSale.kind,'event');assert.equal(piece.saleStatus,'sold');assert.equal(piece.handover.recipientMemberId,'sale-buyer');
 const mutations=(await club.collection('inventoryMutations').where('orderId','==',started.orderId).get()).docs.map(d=>d.data());
 assert.equal(mutations.reduce((a,v)=>a+v.change,0),-1);assert.equal(mutations.filter(v=>v.reason==='sale'&&v.change===-1).length,1);
});
test('abandoned event sale restores its reservation once and cannot cancel after bank settlement',async()=>{
 await club.collection('products').doc('cancel-product').set({name:'Bonnet',visibility:'published',inventoryMode:'tracked',pricing:{salePrice:20},variants:[{id:'M',stockCount:1}]});
 await club.collection('boutique_physical_stock_units').doc('cancel-piece').set({productId:'cancel-product',variantId:'M',productName:'Bonnet',location:'Club',finish:'returned_embroidered',saleStatus:'sale_ready',destination:'free'});
 const req=await request('salePrepare','cancel-piece',{recipientMemberId:'sale-buyer'});const started=await call('salePrepare',req);
 const cancel=await request('saleCancel','cancel-piece',{confirmed:true});await call('saleCancel',cancel);assert.equal((await call('saleCancel',cancel)).replayed,true);
 assert.equal((await club.collection('products').doc('cancel-product').get()).data().variants[0].stockCount,1);
 assert.equal((await club.collection('boutique_physical_stock_units').doc('cancel-piece').get()).data().destination,'free');
 assert.equal((await club.collection('orders').doc(started.orderId).get()).data().status,'cancelled');
 const rows=(await club.collection('inventoryMutations').where('orderId','==',started.orderId).get()).docs.map(d=>d.data());assert.equal(rows.reduce((a,v)=>a+v.change,0),0);
});
test('concurrent event sales cannot reserve the same piece twice',async()=>{
 await club.collection('products').doc('race-product').set({name:'Polo',visibility:'published',inventoryMode:'tracked',pricing:{salePrice:15},variants:[{id:'M',stockCount:1}]});
 await club.collection('boutique_physical_stock_units').doc('race-piece').set({productId:'race-product',variantId:'M',productName:'Polo',location:'Club',finish:'returned_embroidered',saleStatus:'sale_ready',destination:'free'});
 const first=await request('salePrepare','race-piece',{recipientMemberId:'sale-buyer'}),second={...first,idempotencyKey:'sale-race-confirmation-12345'};
 const outcomes=await Promise.allSettled([call('salePrepare',first),call('salePrepare',second)]);assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
 assert.equal((await club.collection('products').doc('race-product').get()).data().variants[0].stockCount,0);
});
test('a bank-paid event sale cannot be cancelled and can still be handed over',async()=>{
 await club.collection('products').doc('paid-product').set({name:'Polo',visibility:'published',inventoryMode:'tracked',pricing:{salePrice:15},variants:[{id:'M',stockCount:1}]});
 await club.collection('boutique_physical_stock_units').doc('paid-piece').set({productId:'paid-product',variantId:'M',productName:'Polo',location:'Club',finish:'returned_embroidered',saleStatus:'sale_ready',destination:'free'});
 const started=await call('salePrepare',await request('salePrepare','paid-piece',{recipientMemberId:'sale-buyer'}));
 await club.collection('orders').doc(started.orderId).update({status:'paid','payment.status':'paid','payment.bankRef':'demo-payment'});
 await assert.rejects(call('saleCancel',await request('saleCancel','paid-piece',{confirmed:true})),{code:'failed-precondition'});
 await call('saleComplete',await request('saleComplete','paid-piece',{recipientMemberId:'sale-buyer',confirmed:true}));
 const order=(await club.collection('orders').doc(started.orderId).get()).data();assert.equal(order.status,'delivered');assert.equal(order.payment.status,'paid');
});
