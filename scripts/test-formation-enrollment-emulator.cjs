'use strict';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8096') throw Error('Synthetic local emulator required');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc } = require('firebase/firestore');
const admin = require('../functions/node_modules/firebase-admin');
const { executeFormationEnrollment: enroll } = require('../functions/src/training/formationEnrollment');
const { enrollmentId, participationId } = require('../functions/src/training/apnee/training');
const { assignQrTrainingGroup: assign } = require('../functions/src/training/assignQrTrainingGroup');
const { executeApneeCourseAssignment: correct } = require('../functions/src/training/assignApneePoolCourse');
const { assignmentState, executeCorrection: scubaCorrect } = require('../functions/src/training/correctPoolStudentGroup');
async function run(rules) {
  const projectId = 'demo-calymob-formation';
  const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8096,
    rules: fs.readFileSync(rules, 'utf8') } });
  const app = admin.initializeApp({ projectId }, `formation-${Date.now()}`);
  const db = admin.firestore(app); const club = db.doc('clubs/qa');
  const request = { clubId: 'qa', memberId: 'student', track: 'apnee.a1', active: true, expectedRevision: 0, operationId: 'switch' };
  try {
    await env.clearFirestore();
    for (const [id, values] of Object.entries({ admin: { app_role: 'admin' }, monitor: { plongeur_code: 'MC', clubStatuten: ['E'] },
      student: { formation_active: true, target_formation_level: '3*', plongeur_code: '2', retained: 'yes' } })) {
      await club.collection('members').doc(id).set({ member_status: 'active', app_role: 'user', ...values });
      await club.collection('member_directory').doc(id).set({ member_status: 'active', ...values });
    }
    await club.collection('members').doc('student').collection('exercices_valides').doc('history').set({ status: 'validated' });
    const concurrent = await Promise.allSettled([enroll(db, 'admin', request), enroll(db, 'admin', { ...request, operationId: 'racing', track: 'apnee.a2' })]);
    assert.equal(concurrent.filter(row => row.status === 'fulfilled').length, 1);
    let member = (await club.collection('members').doc('student').get()).data();
    assert.equal(member.formation_revision, 1); assert.equal(member.formation_active, false);
    // Explicitly select A1 for deterministic QA, independent of race winner.
    await enroll(db, 'admin', { ...request, operationId: 'a1', expectedRevision: 1 });
    assert.equal((await club.collection('member_directory').doc('student').get()).data().formation_track, 'apnee.a1');
    await assert.rejects(enroll(db, 'monitor', { ...request, operationId: 'denied', expectedRevision: 2 }));
    await assert.rejects(enroll(db, 'admin', { ...request, operationId: 'stale' }));
    const actorDb = env.authenticatedContext('admin').firestore();
    for (const key of ['formation_active', 'formation_revision', 'formation_track'])
      await assertFails(setDoc(doc(actorDb, `clubs/qa/members/create-${key}`),
        { member_status: 'active', [key]: key === 'formation_active' ? true : key === 'formation_revision' ? 1 : 'apnee.a1' }));
    await assertSucceeds(setDoc(doc(actorDb, 'clubs/qa/members/create-contact'), { member_status: 'active', telephone: 'synthetic' }));
    for (const key of ['formation_active', 'target_formation_level', 'formation_revision', 'formation_track'])
      await assertFails(updateDoc(doc(actorDb, 'clubs/qa/members/student'), { [key]: 'forged' }));
    await assertSucceeds(updateDoc(doc(actorDb, 'clubs/qa/members/student'), { telephone: 'synthetic' }));
    await assertFails(setDoc(doc(actorDb, 'clubs/qa/formation_enrollment_audit/forged'), { actor_uid: 'admin' }));
    await assertFails(setDoc(doc(actorDb, 'clubs/qa/audit_logs/forged'), { action: 'formation_enrollment' }));
    const session = club.collection('piscine_sessions').doc('pool');
    const date = admin.firestore.Timestamp.fromMillis(Date.now());
    await session.set({ date, type: 'piscine' });
    await session.collection('apnee_lessons').doc('a1').set({ track: 'apnee.a1', hour: '1ere_heure', theme: 'Synthetic', instructor_ids: ['monitor'], member_ids: [], revision: 1 });
    const attendee = session.collection('attendees').doc('student');
    const receipt = { version: 1, memberId: 'student', sessionId: 'pool', scannerUid: 'admin', scannedAt: date };
    await attendee.set({ memberId: 'student', scannedBy: 'admin', scannedAt: date, isGuest: false });
    assert.equal((await assign(db, 'qa', 'pool', 'student')).reason, 'no-proof');
    await session.collection('qr_scan_receipts').doc('student').set(receipt);
    await attendee.update({ qrVerified: receipt });
    await session.collection('apnee_lessons').doc('parallel').set({ track: 'apnee.a1', hour: '1ere_heure', member_ids: [] });
    assert.equal((await assign(db, 'qa', 'pool', 'student')).reason, 'course-choice-required');
    await session.collection('apnee_lessons').doc('parallel').delete();
    await club.collection('members').doc('student').update({ formation_active: true });
    assert.equal((await assign(db, 'qa', 'pool', 'student')).reason, 'no-sole-training');
    await club.collection('members').doc('student').update({ formation_active: false });
    for (const explicit of [{ groupAssignment: { level: '3*' } }, { outcome: 'gonflage' }]) {
      await attendee.update(explicit);
      assert.equal((await assign(db, 'qa', 'pool', 'student')).reason, 'manual-placement');
      assert.equal((await club.collection('apnee_participations').get()).size, 0);
      await attendee.update({ groupAssignment: admin.firestore.FieldValue.delete(), outcome: admin.firestore.FieldValue.delete() });
    }
    const result = await assign(db, 'qa', 'pool', 'student'); assert.equal(result.assigned, true);
    assert.equal((await attendee.get()).data().assignedLevel, 'apnee.a1');
    assert.equal((await club.collection('apnee_participations').doc(participationId('pool', 'a1', 'student')).get()).data().source, 'verified_qr_training');
    assert.equal((await assign(db, 'qa', 'pool', 'student')).reason, 'already-processed');
    await session.collection('apnee_lessons').doc('group2').set({ track: 'apnee.a1', hour: '1ere_heure', theme: 'Second synthetic group', instructor_ids: ['monitor'], member_ids: [], revision: 1 });
    const otherHour = { activity: 'formation', role: 'eleve', group: { level: '2*', course_id: 'preserved-other-hour' } };
    await attendee.update({ 'hoursReport.2eme_heure': otherHour });
    const legacy = session.collection('attendees').doc('legacy');
    await legacy.set({ ...(await attendee.get()).data(), membre_id: 'student', remarks: 'preserved legacy remark' });
    const move = { clubId: 'qa', sessionId: 'pool', memberId: 'student', lessonId: 'group2', operationId: 'move',
      expectedState: { student: assignmentState((await attendee.get()).data()), legacy: assignmentState((await legacy.get()).data()) } };
    await assert.rejects(correct(db, 'other', move));
    await assert.rejects(correct(db, 'monitor', { ...move, expectedState: { student: { ...move.expectedState.student, assignedCourseId: 'stale' } } }));
    await correct(db, 'student', move);
    assert.equal((await correct(db, 'student', move)).replay, true);
    assert.equal((await attendee.get()).data().assignedCourseId, 'group2');
    assert.equal((await attendee.get()).data().hoursReport['1ere_heure'].group.course_id, 'group2');
    assert.equal((await legacy.get()).data().hoursReport['1ere_heure'].group.course_id, 'group2');
    assert.deepEqual((await attendee.get()).data().hoursReport['2eme_heure'], otherHour);
    assert.equal((await legacy.get()).data().remarks, 'preserved legacy remark');
    assert.equal((await club.collection('apnee_participations').doc(participationId('pool', 'a1', 'student')).get()).data().participation_status, 'cancelled');
    assert.equal((await club.collection('apnee_participations').doc(participationId('pool', 'group2', 'student')).get()).data().participation_status, 'attended');
    await session.update({ niveaux: { '3*': { courses_by_hour: { '1ere_heure': [
      { id: 'scuba-group', order: 0, theme: 'Synthetic SCUBA', encadrants: [] }] } } } });
    await scubaCorrect(db, 'student', { clubId: 'qa', memberId: 'student', sessionId: 'pool',
      operationId: 'back-scuba-group', hour: '1ere_heure', level: '3*', courseId: 'scuba-group',
      expectedState: { student: assignmentState((await attendee.get()).data()), legacy: assignmentState((await legacy.get()).data()) } });
    assert.equal((await club.collection('apnee_participations').doc(participationId('pool', 'group2', 'student')).get()).data().participation_status, 'cancelled');
    assert.deepEqual((await attendee.get()).data().hoursReport['2eme_heure'], otherHour);
    assert.equal((await attendee.get()).data().hoursReport['1ere_heure'].group.level, '3*');
    await assertFails(setDoc(doc(actorDb, 'clubs/qa/piscine_sessions/pool/qr_training_assignments/forged'), { member_id: 'student' }));
    await enroll(db, 'admin', { clubId: 'qa', memberId: 'student', operationId: 'back-scuba', track: 'scuba', active: true, targetLevel: '3*', expectedRevision: 2 });
    member = (await club.collection('members').doc('student').get()).data();
    assert.equal(member.formation_active, true); assert.equal(member.plongeur_code, '2'); assert.equal(member.retained, 'yes');
    assert.equal((await club.collection('apnee_enrollments').doc(enrollmentId('student', 'apnee.a1')).get()).data().status, 'closed');
    assert.equal((await club.collection('members').doc('student').collection('exercices_valides').get()).size, 1);
    console.log(`PASS global enrollment + concurrency + QR + protected audit; rules ${rules}; synthetic only`);
  } finally { await db.terminate(); await app.delete(); await env.cleanup(); }
}
(async () => { await run(require('node:path').join(__dirname, '../firestore.rules'));
  if (process.argv[2]) await run(process.argv[2]); })().catch(error => { console.error(error); process.exitCode = 1; });
