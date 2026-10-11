const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, validateEnvironment, assertManaged, roleFields, UID, EMAIL } = require('./single-live-account.cjs');
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
