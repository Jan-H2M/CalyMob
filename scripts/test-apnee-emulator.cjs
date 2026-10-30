'use strict';
// Synthetic emulator only: never load credentials or a production project.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8096') throw Error('Local emulator required');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, collection, getDoc, getDocs, query, where, setDoc } = require('firebase/firestore');
const admin = require('../functions/node_modules/firebase-admin');
const { executeApnee, enrollmentId, participationId } = require('../functions/src/training/apnee/training');
const catalog = require('../functions/src/training/apnee/catalog.json');
async function run(rulesPath) {
  const projectId = 'demo-calymob-apnee';
  const env = await initializeTestEnvironment({ projectId, firestore: { host:'127.0.0.1',port:8096,rules:fs.readFileSync(rulesPath,'utf8') } });
  const app = admin.initializeApp({ projectId }, `apnee-${Date.now()}`); const db=admin.firestore(app);
  const base='clubs/synthetic'; const club=db.doc(base);
  const operation = { clubId:'synthetic',expectedRevision:0 };
  try {
    await env.clearFirestore();
    for (const [uid, values] of Object.entries({ student:{ plongeur_code:'2',target_formation_level:'3*' },other:{},admin:{ app_role:'admin' },pool:{ clubStatuten:['P'] },monitor:{ clubStatuten:['E'],plongeur_code:'MC' } }))
      await club.collection('members').doc(uid).set({ member_status:'active',app_role:'user',...values });
    await executeApnee(db,'admin',{ ...operation,action:'enroll',operationId:'enrol',memberId:'student',track:'apnee.a1',status:'active' });
    const enrolled=`${base}/apnee_enrollments/${enrollmentId('student','apnee.a1')}`;
    const session=club.collection('piscine_sessions').doc('lesson-day');
    await session.set({ date:admin.firestore.Timestamp.fromDate(new Date('2026-01-06T20:00:00Z')),type:'piscine' });
    const lesson={ ...operation,action:'lesson',operationId:'lesson',sessionId:'lesson-day',lessonId:'a1',track:'apnee.a1',hour:'1ere_heure',theme:'Synthétique',memberIds:['student'],instructorIds:['pool'] };
    await executeApnee(db,'pool',lesson);
    const participation=`${base}/apnee_participations/${participationId('lesson-day','a1','student')}`;
    assert.equal((await db.doc(participation).get()).data().source,'roster_inferred');
    assert.equal((await session.collection('attendees').get()).size,0);
    const official={ ...operation,action:'result',memberId:'student',track:'apnee.a1',status:'validated',date:'2026-01-06',validatorName:'Instructeur synthétique',validatorFederation:'LIFRAS',qualificationConfirmed:true };
    for (const setting of ['pool','depth']) {
      const item=catalog.requirements.find(r=>r.track==='apnee.a1' && r.setting===setting && r.kind==='skill');
      await executeApnee(db,'admin',{ ...official,operationId:setting,requirementKey:item.key });
    }
    const poolKey=catalog.requirements.find(r=>r.track==='apnee.a1' && r.setting==='pool' && r.kind==='skill').key;
    const depthKey=catalog.requirements.find(r=>r.track==='apnee.a1' && r.setting==='depth' && r.kind==='skill').key;
    const contexts=Object.fromEntries(['student','other','pool','monitor','admin'].map(uid=>[uid,env.authenticatedContext(uid).firestore()]));
    await assertSucceeds(getDoc(doc(contexts.student,enrolled)));
    await assertFails(getDoc(doc(contexts.other,enrolled)));
    await assertSucceeds(getDoc(doc(contexts.monitor,`${enrolled}/requirements/${depthKey}`)));
    await assertSucceeds(getDocs(query(collection(contexts.pool,`${enrolled}/requirements`),where('setting','==','pool'))));
    await assertFails(getDocs(collection(contexts.pool,`${enrolled}/requirements`)));
    await assertFails(getDoc(doc(contexts.pool,`${enrolled}/requirements/${depthKey}`)));
    await assertFails(getDoc(doc(contexts.other,`${enrolled}/requirements/${poolKey}`)));
    await assertSucceeds(getDoc(doc(contexts.student,participation)));
    await assertFails(getDoc(doc(contexts.other,participation)));
    for (const uid of ['student','pool','monitor','admin']) {
      for (const target of [enrolled,participation,`${enrolled}/requirements/${poolKey}`,`${enrolled}/awards/a1`,`${base}/apnee_audit/forged`,`${base}/piscine_sessions/lesson-day/apnee_lessons/a1`])
        await assertFails(setDoc(doc(contexts[uid],target),{ member_id:'student',status:'validated' }));
    }
    assert.equal((await club.collection('members').doc('student').get()).data().plongeur_code,'2');
    await assert.rejects(executeApnee(db,'pool',{ ...official,operationId:'pool-cannot-sign',requirementKey:poolKey }));
    await assert.rejects(executeApnee(db,'student',{ ...operation,action:'attendance',operationId:'no-qr',expectedRevision:1,memberId:'student',sessionId:'lesson-day',lessonId:'a1',status:'attended',note:'Synthetic' }));
    const nextEnrollment=`${base}/apnee_enrollments/${enrollmentId('student','apnee.a2')}`;
    const move={ ...operation,action:'enroll',operationId:'move',memberId:'student',track:'apnee.a2',status:'active',fromTrack:'apnee.a1',fromRevision:1 };
    await assert.rejects(executeApnee(db,'admin',{ ...operation,action:'enroll',operationId:'parallel-target',memberId:'student',track:'apnee.a2',status:'active' }));
    await assert.rejects(executeApnee(db,'admin',{ ...move,operationId:'stale-source',fromRevision:0 }));
    await assert.rejects(executeApnee(db,'admin',{ ...move,operationId:'stale-destination',expectedRevision:1 }));
    assert.equal((await db.doc(enrolled).get()).data().status,'active');
    assert.equal((await db.doc(nextEnrollment).get()).exists,false);
    await executeApnee(db,'admin',move);
    assert.equal((await db.doc(enrolled).get()).data().status,'closed');
    assert.equal((await db.doc(nextEnrollment).get()).data().status,'active');
    assert.equal((await db.doc(`${enrolled}/requirements/${poolKey}`).get()).data().status,'validated');
    assert.equal((await db.collection(`${nextEnrollment}/requirements`).get()).size,0);
    const audit=(await club.collection('apnee_audit').doc('move').get()).data();
    assert.equal(audit.related_changes.source_enrollment.before.status,'active');
    assert.equal(audit.related_changes.source_enrollment.after.status,'closed');
    assert.equal(audit.related_changes.source_enrollment.after.updated_at.toMillis(),(await db.doc(enrolled).get()).data().updated_at.toMillis());
    assert.equal((await executeApnee(db,'admin',move)).replay,true);
    assert.equal((await club.collection('members').doc('student').get()).data().target_formation_level,'3*');
    assert.equal((await session.collection('attendees').get()).size,0);
    console.log(`PASS apnee transactions and rules: ${path.basename(path.dirname(rulesPath))}; synthetic only`);
  } finally { await db.terminate(); await app.delete(); await env.cleanup(); }
}
(async () => {
  await run(path.join(__dirname,'../firestore.rules'));
  if (process.argv[2]) await run(path.resolve(process.argv[2]));
})().catch(error => { console.error(error);process.exitCode=1; });
