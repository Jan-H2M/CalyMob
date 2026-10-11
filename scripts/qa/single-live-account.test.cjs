const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, validateEnvironment, assertManaged, roleFields, UID, EMAIL } = require('./single-live-account.cjs');
const { activateHiddenAccount } = require('./single-live-account.cjs');
test('activation happens last, after repair and server verification', async () => {
  const calls=[]; let visible=true;
  await activateHiddenAccount({updateUser:async(uid,data)=>{
    assert.equal(uid,UID); assert.equal(data.disabled,false); calls.push('enable');
  }}, {get:async()=>{calls.push('get');return {exists:visible};},
    delete:async()=>{calls.push('delete');visible=false;}});
  assert.deepEqual(calls,['get','delete','get','enable']);
});
test('directory read/delete/reverification failures never enable Auth', async () => {
  for(const failure of ['first-read','delete','second-read','still-visible']) {
    let enabled=false,reads=0;
    const dir={get:async()=>{
      reads++;
      if((failure==='first-read'&&reads===1)||(failure==='second-read'&&reads===2)) throw Error('synthetic');
      return {exists:reads===1||failure==='still-visible'};
    },delete:async()=>{if(failure==='delete')throw Error('synthetic');}};
    await assert.rejects(activateHiddenAccount({updateUser:async()=>{enabled=true;}},dir));
    assert.equal(enabled,false,failure);
  }
});
test('enable failure propagates and has no later success-producing operation', async () => {
  const calls=[];
  await assert.rejects(activateHiddenAccount({updateUser:async()=>{
    calls.push('enable');throw Error('synthetic');
  }}, {get:async()=>{calls.push('get');return {exists:false};}}));
  assert.deepEqual(calls,['get','enable']);
});
test('writes require explicit opt-in, deployment gate and operator', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.throws(() => parseArgs(['--apply']));
  assert.throws(() => parseArgs(['--profile=admin']));
  assert.equal(parseArgs(['--apply','--visibility-ready','--operator=jan']).apply, true);
});
test('fixed production project and identity only', () => {
  validateEnvironment({}, {project_id:'calycompta'});
  assert.throws(() => validateEnvironment({}, {project_id:'wrong'}));
  assert.throws(() => validateEnvironment({FIRESTORE_EMULATOR_HOST:'localhost:8195'}, {project_id:'calycompta'}));
  assert.throws(() => assertManaged({uid:'somebody',email:EMAIL}, null));
  assert.throws(() => assertManaged({uid:UID,email:EMAIL}, {email:EMAIL}));
  assertManaged({uid:UID,email:EMAIL}, {email:EMAIL,is_test_account:true,exclude_from_directory:true,qa_managed_by:'QA-002'});
});
test('profiles retain one hidden ordinary-user account with distinct functions/levels', () => {
  assert.deepEqual(roleFields('mc').clubStatuten, ['Membre','Encadrant']);
  assert.equal(roleFields('mc').plongeur_code, 'MC');
  assert.deepEqual(roleFields('piscine').clubStatuten, ['Membre','Encadrants et assistants']);
  for(const profile of ['mc','am','encadrant','piscine','eleve']) {
    const data=roleFields(profile);
    assert.equal(data.is_test_account,true);
    assert.equal(data.exclude_from_directory,true);
    assert.equal(data.app_role,'user');
  }
});
