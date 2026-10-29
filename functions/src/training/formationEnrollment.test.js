'use strict';
jest.mock('firebase-functions/v2/https', () => ({ onCall: (_o, fn) => fn,
  HttpsError: class extends Error { constructor(code,message) { super(message); this.code=code; } } }));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'server-time' } }));
const { executeFormationEnrollment: execute } = require('./formationEnrollment');
const { enrollmentId, manageApneeTraining } = require('./apnee/training');
function fixture() {
  const rows = new Map([
    ['clubs/qa/members/admin',{app_role:'admin',member_status:'active'}],
    ['clubs/qa/members/monitor',{app_role:'user',member_status:'active',plongeur_code:'MC'}],
    ['clubs/qa/members/student',{member_status:'active',formation_active:true,target_formation_level:'3*',plongeur_code:'2',unrelated:'retained'}],
    ['clubs/qa/member_directory/student',{member_status:'active',formation_active:true,target_formation_level:'3*'}],
  ]);
  const ref = path => ({path,collection:name=>collection(`${path}/${name}`)});
  const collection = path => ({path,doc:id=>ref(`${path}/${id}`)});
  const db = {doc:ref,collection,runTransaction:async callback => {
    const writes=[]; const result=await callback({get:async target=> {
      if(writes.length) throw Error('read after write');
      return {exists:rows.has(target.path),data:()=>rows.get(target.path)};
    },update:(target,data)=>writes.push(()=>rows.set(target.path,{...rows.get(target.path),...data})),
      set:(target,data)=>writes.push(()=>rows.set(target.path,data)),create:(target,data)=>writes.push(()=>rows.set(target.path,data))});
    writes.forEach(write=>write());return result;
  }};
  return {db,rows,request:{clubId:'qa',memberId:'student',operationId:'operation',expectedRevision:0,track:'apnee.a1',active:true}};
}
test('SCUBA to apnee atomically leaves one active training and retains official and unrelated records',async()=>{
  const f=fixture();const resultPath=`clubs/qa/apnee_enrollments/${enrollmentId('student','apnee.a1')}/requirements/skill`;
  f.rows.set(resultPath,{status:'validated'});
  await execute(f.db,'admin',f.request);
  expect(f.rows.get('clubs/qa/members/student')).toMatchObject({formation_active:false,formation_track:'apnee.a1',formation_revision:1,target_formation_level:'3*',plongeur_code:'2',unrelated:'retained'});
  expect(f.rows.get('clubs/qa/member_directory/student')).toMatchObject({formation_revision:1,formation_track:'apnee.a1',formation_active:false});
  expect(f.rows.get(resultPath)).toEqual({status:'validated'});
  expect(f.rows.get('clubs/qa/formation_enrollment_audit/operation')).toMatchObject({actor_uid:'admin',before:{formation_active:true},after:{formation_active:false}});
  expect(await execute(f.db,'admin',f.request)).toMatchObject({replay:true,revision:1});
});
test('back to SCUBA closes both apnee tracks, including legacy conflicts, without deleting history',async()=>{
  const f=fixture();
  for(const track of ['apnee.a1','apnee.a2']) f.rows.set(`clubs/qa/apnee_enrollments/${enrollmentId('student',track)}`,{member_id:'student',track,status:'active',revision:3});
  await execute(f.db,'admin',{...f.request,track:'scuba',targetLevel:'4*'});
  expect(f.rows.get('clubs/qa/members/student')).toMatchObject({formation_active:true,target_formation_level:'4*',formation_track:'scuba',plongeur_code:'2'});
  for(const track of ['apnee.a1','apnee.a2']) expect(f.rows.get(`clubs/qa/apnee_enrollments/${enrollmentId('student',track)}`)).toMatchObject({status:'closed',revision:4});
});
test('deactivating one training does not silently select a different formation',async()=>{
  const f=fixture();await execute(f.db,'admin',{...f.request,track:'scuba',targetLevel:'3*',active:false});
  expect(f.rows.get('clubs/qa/members/student')).toMatchObject({formation_track:null,formation_active:false,target_formation_level:'3*'});
});
test.each(['monitor','stale','inactive','hidden','missing-directory','invalid-target','extra-field','replay-other-intent'])('%s cannot write or forge an audit',async scenario=>{
  const f=fixture(); const input={...f.request};
  if(scenario==='stale') input.expectedRevision=1;
  if(scenario==='inactive') f.rows.get('clubs/qa/members/student').member_status='inactive';
  if(scenario==='hidden') f.rows.get('clubs/qa/members/student').is_test_account=true;
  if(scenario==='missing-directory') f.rows.delete('clubs/qa/member_directory/student');
  if(scenario==='invalid-target') Object.assign(input,{track:'scuba',targetLevel:'bad'});
  if(scenario==='extra-field') input.actor_uid='forged';
  if(scenario==='replay-other-intent') {await execute(f.db,'admin',f.request);input.track='apnee.a2';}
  const before=JSON.stringify([...f.rows]);
  await expect(execute(f.db,scenario==='monitor'?'monitor':'admin',input)).rejects.toThrow();
  expect(JSON.stringify([...f.rows])).toBe(before);
});
test('retired apnee-only callable cannot bypass the global invariant',()=>{
  expect(()=>manageApneeTraining({auth:{uid:'admin'},data:{action:'enroll'}})).toThrow('inscription commune');
});
