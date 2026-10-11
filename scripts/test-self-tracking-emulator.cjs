'use strict';
// Synthetic local Firestore only. Never load a production credential or project.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8094') throw Error('Local emulator at port 8094 required');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, Timestamp } = require('firebase/firestore');
const admin = require('firebase-admin');
const { executeQrAttendance } = require('../functions/src/training/poolQrAttendance');
const { executePersonalProgress, progressId } = require('../functions/src/training/personalExerciseProgress');
const { executeOfficialResult } = require('../functions/src/training/officialFormationResults');
const { executeCorrection, assignmentState } = require('../functions/src/training/correctPoolStudentGroup');
const { rebuildSnapshot } = require('../functions/src/progression/rebuildFormationSnapshot');

async function main() {
  const projectId = 'demo-calymob-personal-tracking';
  const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8094,
    rules: fs.readFileSync(require('node:path').join(__dirname, '../firestore.rules'), 'utf8') } });
  const app = admin.initializeApp({ projectId });
  const db = admin.firestore(app);
  const club = db.collection('clubs').doc('calypso');
  const member = club.collection('members').doc('student');
  try {
    await env.clearFirestore();
    await member.set({ app_role: 'user', member_status: 'active', plongeur_code: '2', target_formation_level: '3*' });
    await club.collection('members').doc('other').set({ app_role: 'user', member_status: 'active' });
    await club.collection('members').doc('admin').set({ app_role: 'admin', member_status: 'active', prenom: 'Synthetic' });
    await club.collection('members').doc('monitor').set({ app_role: 'user', member_status: 'active', plongeur_code: 'MC', clubStatuten: ['Encadrant'] });
    for (const [id, code] of [['ra', 'P3.RA'], ['ext', 'P3.EXT'], ['exp', 'P3.EXP']]) {
      await club.collection('exercices_lifras').doc(id).set({ code, description: 'Synthetic only', niveau: id === 'ra' ? '3' : '3★' });
    }
    await member.collection('formation_goals').doc('current').set({ codes: ['P3.RA'], redo_codes: [] });
    const request = { clubId: 'calypso', memberId: 'student', exerciseId: 'ra', done: true, date: '2026-01-05', expectedRevision: 0, operationId: 'personal1' };
    await executePersonalProgress(db, 'student', request);
    assert.equal((await executePersonalProgress(db, 'student', request)).replay, true);
    const snapshot = await rebuildSnapshot('calypso', 'student', db);
    assert.deepEqual(snapshot.exercises.validated.map(row => row.code), ['P3.RA']);
    assert.equal(snapshot.exercises.validated[0].personal, true);
    assert.deepEqual((await member.collection('formation_goals').doc('current').get()).data().codes, ['P3.RA']);
    assert.equal((await member.collection('exercices_valides').get()).size, 0);
    assert.equal((await member.get()).data().plongeur_code, '2');
    await assert.rejects(executePersonalProgress(db, 'other', request));
    await assert.rejects(executePersonalProgress(db, 'student', { ...request, exerciseId: 'ext', operationId: 'not-exam' }));
    await executePersonalProgress(db, 'student', { ...request, done: false, expectedRevision: 1, operationId: 'personal2' });
    assert.equal((await rebuildSnapshot('calypso', 'student', db)).exercises.validated.length, 0);

    const session = club.collection('piscine_sessions').doc('synthetic-session');
    await session.set({ date: admin.firestore.Timestamp.fromDate(new Date('2026-01-06T20:00:00Z')), type: 'piscine',
      niveaux: { '3*': { courses_by_hour: { '2eme_heure': [{ id: 'group2', order: 1, theme: 'Synthetic lesson', encadrants: [] }] } } } });
    const attendee = session.collection('attendees').doc('student');
    await attendee.set({ memberId: 'student', remarks: 'Preserve synthetic note' });
    let attendance = (await attendee.get()).data();
    const correction = { clubId: 'calypso', memberId: 'student', sessionId: 'synthetic-session', operationId: 'pool1',
      hour: '2eme_heure', level: '3*', courseId: 'group2', expectedState: { student: assignmentState(attendance) } };
    await assert.rejects(executeCorrection(db, 'student', correction));
    const scan = admin.firestore.Timestamp.fromDate(new Date('2026-01-06T19:30:00Z'));
    await attendee.update({ scannedAt: scan, scannedBy: 'admin' });
    await assert.rejects(executeCorrection(db, 'student', correction));
    await session.collection('qr_scan_receipts').doc('student').set({ version: 1, memberId: 'student',
      scannerUid: 'admin', sessionId: session.id, scannedAt: scan });
    await attendee.update({ qrVerified: (await session.collection('qr_scan_receipts').doc('student').get()).data() });
    attendance = (await attendee.get()).data();
    correction.expectedState = { student: assignmentState(attendance) };
    await executeCorrection(db, 'student', correction);
    const corrected = (await attendee.get()).data();
    assert.equal(corrected.scannedAt.toMillis(), scan.toMillis());
    assert.equal(corrected.remarks, 'Preserve synthetic note');
    assert.equal(corrected.hoursReport['2eme_heure'].group.level, '3*');
    assert.equal((await session.collection('group_corrections').doc('pool1').get()).data().actorUid, 'student');

    const exam = { clubId: 'calypso', memberId: 'student', kind: 'exam', exerciseId: 'ext', passed: true,
      date: '2026-01-05', expectedRevision: 0, operationId: 'exam1' };
    await assert.rejects(executeOfficialResult(db, 'student', exam));
    await executeOfficialResult(db, 'admin', exam);
    await member.collection('exercices_valides').doc('legacy').set({ exercice_code: 'P3.EXT', status: 'validated' });
    await executeOfficialResult(db, 'admin', { ...exam, passed: false, expectedRevision: 1, operationId: 'exam2' });
    assert.equal((await rebuildSnapshot('calypso', 'student', db)).exercises.validated.some(row => row.code === 'P3.EXT'), false);
    await executeOfficialResult(db, 'admin', { clubId: 'calypso', memberId: 'student', kind: 'brevet', level: '3',
      expectedLevel: '2', date: '2026-01-05', operationId: 'brevet1' });
    assert.equal((await member.get()).data().plongeur_code, '3');
    assert.equal((await member.collection('brevet_history').get()).size, 1);

    const studentDb = env.authenticatedContext('student').firestore();
    const otherDb = env.authenticatedContext('other').firestore();
    const monitorDb = env.authenticatedContext('monitor').firestore();
    const adminDb = env.authenticatedContext('admin').firestore();
    const spoofSession = club.collection('piscine_sessions').doc('spoof');
    await spoofSession.set({ date: admin.firestore.Timestamp.fromMillis(Date.now()), type: 'piscine',
      niveaux: { '3*': { courses_by_hour: { '2eme_heure': [{ id: 'group2', order: 1, theme: 'Synthetic', encadrants: [] }] } } } });
    const spoofPath = 'clubs/calypso/piscine_sessions/spoof/attendees/student';
    // Existing legacy scanner rules may allow a timestamp. It is never proof.
    await assertSucceeds(setDoc(doc(studentDb, spoofPath), {
      memberId: 'student', memberName: 'Synthetic', scannedBy: 'admin', scannedAt: Timestamp.now(), isGuest: false }));
    const spoof = (await db.doc(spoofPath).get()).data();
    await assert.rejects(executeCorrection(db, 'student', { ...correction, sessionId: 'spoof',
      operationId: 'spoof', expectedState: { student: assignmentState(spoof) } }));
    await assertFails(setDoc(doc(studentDb, 'clubs/calypso/piscine_sessions/spoof/qr_scan_receipts/student'), {
      version: 1, memberId: 'student', sessionId: 'spoof', scannerUid: 'admin', scannedAt: Timestamp.now() }));
    await db.doc(spoofPath).delete();
    await assert.rejects(executeQrAttendance(db, 'student', { clubId: 'calypso', sessionId: 'spoof', memberId: 'student' }));
    await assert.rejects(executeQrAttendance(db, 'admin', { clubId: 'calypso', sessionId: 'synthetic-session', memberId: 'student' }));
    await executeQrAttendance(db, 'admin', { clubId: 'calypso', sessionId: 'spoof', memberId: 'student' });
    await assert.rejects(executeQrAttendance(db, 'admin', { clubId: 'calypso', sessionId: 'spoof', memberId: 'student' }));
    const trusted = (await db.doc(spoofPath).get()).data();
    const clientTrusted = { ...trusted, scannedAt: Timestamp.fromMillis(trusted.scannedAt.toMillis()),
      qrVerified: { ...trusted.qrVerified, scannedAt: Timestamp.fromMillis(trusted.qrVerified.scannedAt.toMillis()) } };
    await executeCorrection(db, 'student', { ...correction, sessionId: 'spoof',
      operationId: 'trusted', expectedState: { student: assignmentState(trusted) } });
    // Admin deletion must not leave reusable proof for a member to reactivate.
    await db.doc(spoofPath).delete();
    await assertSucceeds(setDoc(doc(studentDb, spoofPath), {
      memberId: 'student', memberName: 'Synthetic', scannedBy: trusted.scannedBy,
      scannedAt: Timestamp.fromMillis(trusted.scannedAt.toMillis()), isGuest: false }));
    const revived = (await db.doc(spoofPath).get()).data();
    await assert.rejects(executeCorrection(db, 'student', { ...correction, sessionId: 'spoof',
      operationId: 'revived', expectedState: { student: assignmentState(revived) } }));
    await db.doc(spoofPath).delete();
    await assertFails(setDoc(doc(studentDb, spoofPath), {
      memberId: 'student', memberName: 'Synthetic', scannedBy: trusted.scannedBy,
      scannedAt: Timestamp.fromMillis(trusted.scannedAt.toMillis()), isGuest: false, qrVerified: clientTrusted.qrVerified }));
    // The existing privileged Undo is lossless and remains authorized.
    await assertSucceeds(setDoc(doc(adminDb, spoofPath), clientTrusted));
    await executeCorrection(db, 'student', { ...correction, sessionId: 'spoof',
      operationId: 'restored', expectedState: { student: assignmentState(trusted) } });
    const personalPath = `clubs/calypso/exercise_claims/${progressId('student', 'ra')}`;
    const auditPath = 'clubs/calypso/members/student/formation_admin_audit/exam1';
    await assertSucceeds(getDoc(doc(studentDb, personalPath)));
    await assertSucceeds(getDoc(doc(monitorDb, personalPath)));
    await assertFails(getDoc(doc(otherDb, personalPath)));
    await assertFails(updateDoc(doc(studentDb, personalPath), { status: 'personal_done' }));
    await assertFails(setDoc(doc(studentDb, 'clubs/calypso/exercise_claims/forged'), {
      member_id: 'student', declared_by: 'student', server_verified: true, validation_mode: 'personal_only', status: 'personal_done' }));
    await assertSucceeds(getDoc(doc(adminDb, auditPath)));
    await assertFails(getDoc(doc(studentDb, auditPath)));
    await assertFails(setDoc(doc(adminDb, auditPath), { actorUid: 'admin', requested: { kind: 'brevet' } }));
    await assertFails(setDoc(doc(studentDb, 'clubs/calypso/members/student/exercices_valides/forged'), { status: 'validated' }));
    console.log('PASS: real emulator transactions, personal done/undo, same dossier counts, QR-only own correction, exams, award, audit and permission denials. No production data touched.');
  } finally { await db.terminate(); await app.delete(); await env.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
