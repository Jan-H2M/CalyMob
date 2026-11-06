'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { executePhysicalOperation } = require('../../src/boutique/physicalOperations');
function makeDb(member, rows) {
  const ref=(path='')=>({path,doc(id){return ref(`${path}/${id}`);},collection(id){return ref(`${path}/${id}`);},orderBy(){return this;},startAfter(){return this;},limit(){return this;}});
  const tx={get: async r=>{
    if(r.path.endsWith('/members/rb')) return {exists:true,data:()=>member};
    if(r.path.endsWith('/settings/feature_flags')) return {data:()=>({boutiqueQrEnabled:true,boutiqueMobileEnabled:true,boutiqueAccess:'tous'})};
    if(r.path.endsWith('/orders')) return {docs:rows.map(([id,data])=>({id,data:()=>data})),size:rows.length};
    throw Error(`unexpected read ${r.path}`);
  },set(){throw Error('unexpected write');},create(){throw Error('unexpected write');},update(){throw Error('unexpected write');}};
  return {collection:id=>ref(id),runTransaction: fn=>fn(tx)};
}
test('overview requires responsible boutique and returns minimal status projection',async()=>{
 const order={orderNumber:'BTQ-1',status:'preparing',buyer:{displayName:'Camille',email:'private'},payment:{status:'paid',iban:'private'},pricing:{total:40},items:[{qty:1,fulfillmentStatus:'preparing',productSnapshot:{name:'Polo',variantLabel:'M'}}]};
 const db=makeDb({member_status:'active',clubStatuten:['RB']},[['order1',order]]);
 const result=await executePhysicalOperation(db,{uid:'rb'},{clubId:'demo',action:'orderOverview'});
 assert.deepEqual(result.orders[0],{id:'order1',orderNumber:'BTQ-1',customerName:'Camille',status:'preparing',paymentStatus:'paid',total:40,items:[{name:'Polo',variant:'M',qty:1,status:'preparing'}]});
 order.additional_payment_due=true;
 assert.equal((await executePhysicalOperation(db,{uid:'rb'},{clubId:'demo',action:'orderOverview'})).orders[0].paymentStatus,'review');
 const noRole=makeDb({member_status:'active',clubStatuten:[]},[['order1',order]]);
 await assert.rejects(executePhysicalOperation(noRole,{uid:'rb'},{clubId:'demo',action:'orderOverview'}),{code:'permission-denied'});
});
