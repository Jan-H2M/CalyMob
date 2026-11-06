'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const { createHash }=require('node:crypto');
const { executePhysicalOperation: run }=require('../../src/boutique/physicalOperations');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function dbFrom(data){
 const docs=new Map(Object.entries(data));
 const ref=path=>({path,id:path.split('/').at(-1),collection(n){return ref(`${path}/${n}`)},doc(n){return ref(`${path}/${n}`)},where(field,op,value){return {...this,query:{field,value},limit(n){return {...this,max:n}}}}});
 const db={docs,collection:n=>ref(n),runTransaction:async fn=>{const writes=[]; const tx={get:async r=>r.query?(()=>{const rows=[...docs].filter(([k,v])=>k.startsWith(r.path+'/')&&k.slice(r.path.length+1).indexOf('/')<0&&v[r.query.field]===r.query.value).slice(0,r.max).map(([k,v])=>({id:k.split('/').at(-1),ref:ref(k),exists:true,data:()=>v}));return {docs:rows,size:rows.length}})():({id:r.id,ref:r,exists:docs.has(r.path),data:()=>docs.get(r.path)}),set:(r,v)=>writes.push(['set',r,v]),update:(r,v)=>writes.push(['update',r,v]),create:(r,v)=>writes.push(['create',r,v])};const result=await fn(tx);for(const [kind,r,v] of writes){if(kind==='create'&&docs.has(r.path))throw Error('duplicate');docs.set(r.path,kind==='update'?{...docs.get(r.path),...v}:v);}return result;}};return db;
}
test('manual handover is recorded truthfully, once, with payment and recipient checks',async()=>{
 const root='clubs/demo';const unit={productName:'Polo',variantLabel:'M',location:'Club',finish:'returned_embroidered',saleStatus:'sale_ready',destination:'customer_reserved',customerOrderId:'o1',customerLineId:'l1',pickupMissionId:'m1'};
 const db=dbFrom({[`${root}/members/rb`]:{member_status:'active',clubStatuten:['RB']},[`${root}/members/buyer`]:{member_status:'active'},[`${root}/settings/feature_flags`]:{boutiqueQrEnabled:true,boutiqueMobileEnabled:true,boutiqueAccess:'tous'},[`${root}/boutique_pickup_missions/m1`]:{status:'received',expiresAt:new Date(Date.now()+600000),unitIds:['p1'],arrivedUnitIds:['p1'],deliveredUnitIds:[],destination:'Club',sourceLocation:'Club',assigneeIds:['rb'],createdBy:'rb',allowPartial:true},[`${root}/orders/o1`]:{orderNumber:'DÉMO-1',status:'ready',buyer:{userId:'buyer',displayName:'Camille'},payment:{status:'paid'},items:[{lineId:'l1',qty:1,deliveryMode:'pool_pickup',fulfillmentStatus:'ready',physicalStockUnitIds:['p1']}]},[`${root}/boutique_physical_stock_units/p1`]:unit});
 const request={clubId:'demo',action:'deliver',expectedActorId:'rb',missionId:'m1',units:[{id:'p1',revision:hash(unit)}],recipientMemberId:'buyer',verificationMethod:'manual',confirmed:true,idempotencyKey:'manual_handover_test_001'};
 await assert.rejects(run(db,{uid:'rb'},{...request,recipientMemberId:'other',preview:true}),{code:'not-found'});
 db.docs.get(`${root}/orders/o1`).payment.status='pending';
 await assert.rejects(run(db,{uid:'rb'},{...request,preview:true}),{code:'failed-precondition'});
 db.docs.get(`${root}/orders/o1`).payment.status='paid';
 const preview=await run(db,{uid:'rb'}, {...request,preview:true});assert.equal(preview.count,1);assert.equal(db.docs.get(`${root}/boutique_physical_stock_units/p1`).saleStatus,'sale_ready');
 await run(db,{uid:'rb'},request);
 const piece=db.docs.get(`${root}/boutique_physical_stock_units/p1`),order=db.docs.get(`${root}/orders/o1`);
 assert.equal(piece.saleStatus,'sold');assert.equal(piece.handover.type,'manual');assert.equal(order.items[0].handoverProofType,'manual');assert.equal(order.items[0].signatureStatus,'manual_confirmed');assert.equal(order.status,'delivered');
 const replay=await run(db,{uid:'rb'},request);assert.equal(replay.replayed,true);assert.equal([...db.docs.keys()].filter(k=>k.includes('/boutique_handover_receipts/')).length,1);
});

test('atelier status, reversible dispatch and comments preserve the physical piece history',async()=>{
 const root='clubs/demo';
 const db=dbFrom({[`${root}/members/rb`]:{member_status:'active',clubStatuten:['RB']},[`${root}/settings/feature_flags`]:{boutiqueQrEnabled:true,boutiqueMobileEnabled:true,boutiqueAccess:'tous'},[`${root}/boutique_physical_stock_units/p1`]:{productName:'Polo',location:'Jim',finish:'at_jim',saleStatus:'not_ready',destination:'free',requiresEmbroidery:true}});
 let n=0;
 async function change(action,note){const unit=(await run(db,{uid:'rb'},{clubId:'demo',action:'lookup',unitId:'p1'})).unit;return run(db,{uid:'rb'},{clubId:'demo',action,expectedActorId:'rb',units:[{id:unit.id,revision:unit.revision}],idempotencyKey:`workshop-action-${++n}-unique`,...(note?{note}:{})});}
 await assert.rejects(change('sendJim'),{code:'failed-precondition'});
 await change('finishJim');await change('sendJim');
 let piece=db.docs.get(`${root}/boutique_physical_stock_units/p1`);assert.ok(piece.workshopReadyAt);assert.ok(piece.workshopDispatchedAt);
 await change('unsendJim');await change('reopenJim');await change('commentJim','Logo à revoir');
 piece=db.docs.get(`${root}/boutique_physical_stock_units/p1`);assert.equal(piece.workshopReadyAt,null);assert.equal(piece.workshopDispatchedAt,null);assert.equal(piece.atelierComment,'Logo à revoir');assert.deepEqual(piece.history.map(e=>e.kind),['workshop_ready','atelier_dispatched','atelier_dispatch_reopened','workshop_reopened','atelier_comment']);
});

test('mixed QR and manual partial handovers retain truthful per-piece proof and remain consistent',async()=>{
 const root='clubs/demo';const makeUnit=(name)=>({productName:name,location:'Club',finish:'returned_embroidered',saleStatus:'sale_ready',destination:'customer_reserved',customerOrderId:'o2',customerLineId:'l1',pickupMissionId:'m2'});const a=makeUnit('Polo'),b=makeUnit('Bonnet');
 const db=dbFrom({[`${root}/members/rb`]:{member_status:'active',clubStatuten:['RB']},[`${root}/members/buyer`]:{member_status:'active'},[`${root}/settings/feature_flags`]:{boutiqueQrEnabled:true,boutiqueMobileEnabled:true,boutiqueAccess:'tous'},[`${root}/boutique_pickup_missions/m2`]:{status:'received',expiresAt:new Date(Date.now()+600000),unitIds:['a','b'],arrivedUnitIds:['a','b'],deliveredUnitIds:[],destination:'Club',sourceLocation:'Club',assigneeIds:['rb'],createdBy:'rb',allowPartial:true},[`${root}/orders/o2`]:{orderNumber:'DEMO-2',status:'ready',buyer:{userId:'buyer',displayName:'Camille'},payment:{status:'paid'},items:[{lineId:'l1',qty:2,deliveryMode:'pool_pickup',fulfillmentStatus:'ready',physicalStockUnitIds:['a','b']}]},[`${root}/boutique_physical_stock_units/a`]:a,[`${root}/boutique_physical_stock_units/b`]:b});
 const req={clubId:'demo',action:'deliver',expectedActorId:'rb',missionId:'m2',recipientMemberId:'buyer',confirmed:true};
 await run(db,{uid:'rb'},{...req,units:[{id:'a',revision:hash(a)}],idempotencyKey:'mixed-handover-qr-001'});
 let order=db.docs.get(`${root}/orders/o2`);assert.equal(order.items[0].deliveredQty,1);assert.equal(order.items[0].handoverProofType,'manual');
 // Model an earlier verified QR handover to test mixed historical proof.
 db.docs.get(`${root}/boutique_physical_stock_units/a`).handover.type='member_qr';
 await run(db,{uid:'rb'},{...req,units:[{id:'b',revision:hash(b)}],verificationMethod:'manual',idempotencyKey:'mixed-handover-manual-002'});
 order=db.docs.get(`${root}/orders/o2`);assert.equal(order.items[0].deliveredQty,2);assert.equal(order.items[0].handoverProofType,'manual');assert.equal(order.items[0].signatureStatus,'manual_confirmed');assert.equal(db.docs.get(`${root}/boutique_physical_stock_units/a`).handover.type,'member_qr');assert.equal(db.docs.get(`${root}/boutique_physical_stock_units/b`).handover.type,'manual');
});

for (const hasStock of [true,false]) test(`damaged embroidery creates one ${hasStock?'stock replacement':'supplier request'} and safely replays`,async()=>{
 const root='clubs/demo'; const damaged={productId:'p',variantId:'v',productName:'Bonnet',variantLabel:'OS',location:'Jim',finish:'at_jim',saleStatus:'not_ready',destination:'customer_reserved',customerOrderId:'o1',customerLineId:'l1'};
 const replacement={productId:'p',variantId:'v',location:'Jan',finish:'unembroidered',saleStatus:'not_ready',destination:'free'};
 const db=dbFrom({[`${root}/members/rb`]:{member_status:'active',clubStatuten:['RB']},[`${root}/settings/feature_flags`]:{boutiqueQrEnabled:true,boutiqueMobileEnabled:true,boutiqueAccess:'tous'},[`${root}/orders/o1`]:{orderNumber:'BTQ-1',status:'preparing',payment:{status:'paid'},buyer:{displayName:'Camille'},items:[{lineId:'l1',qty:1,physicalStockUnitIds:['damaged']}]},[`${root}/boutique_physical_stock_units/damaged`]:damaged,...(hasStock?{[`${root}/boutique_physical_stock_units/replacement`]:replacement}:{}),[`${root}/products/p`]:{supplierId:'supplier'},[`${root}/fournisseurs/supplier`]:{nom:'Wordans'}});
 const req={clubId:'demo',action:'damageJim',expectedActorId:'rb',units:[{id:'damaged',revision:hash(damaged)}],note:'Fil cassé',idempotencyKey:'damage-embroidery-test-001',expectedReplacement:hasStock?'club_stock':'supplier',...(hasStock?{expectedReplacementUnitId:'replacement'}:{})};
 await assert.rejects(run(db,{uid:'rb'},{...req,note:'',preview:true}),{code:'invalid-argument'});
 assert.equal((await run(db,{uid:'rb'},{...req,preview:true})).replacement,hasStock?'club_stock':'supplier');
 assert.equal(db.docs.get(`${root}/boutique_physical_stock_units/damaged`).inventoryExcluded,undefined);
 await assert.rejects(run(db,{uid:'rb'},{...req,expectedReplacement:hasStock?'supplier':'club_stock',...(hasStock?{}:{expectedReplacementUnitId:'replacement'})}),{code:'aborted'});
 assert.equal(db.docs.get(`${root}/boutique_physical_stock_units/damaged`).inventoryExcluded,undefined);
 await run(db,{uid:'rb'},req); assert.equal(db.docs.get(`${root}/boutique_physical_stock_units/damaged`).inventoryExcluded,true);
 const order=db.docs.get(`${root}/orders/o1`); assert.deepEqual(order.items[0].physicalStockUnitIds,hasStock?['replacement']:[]);
 const purchases=[...db.docs.entries()].filter(([k])=>k.includes('/boutique_stock_purchase_orders/')); assert.equal(purchases.length,hasStock?0:1);
 if(hasStock) assert.equal(db.docs.get(`${root}/boutique_physical_stock_units/replacement`).customerOrderId,'o1');
 else assert.equal(purchases[0][1].lines[0].embroideryRecovery.damagedUnitId,'damaged');
 assert.equal((await run(db,{uid:'rb'},req)).replayed,true);
});
