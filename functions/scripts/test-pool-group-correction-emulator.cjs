// Synthetic integration only. Never runs against production.
'use strict';
const assert = require('node:assert/strict');
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('An explicit localhost Firestore emulator is required.');
}
const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
admin.initializeApp({ projectId: 'demo-form001-pool-group-correction' });
const { executeCorrection, assignmentState } = require('../src/training/correctPoolStudentGroup');
async function main() {
  const db = admin.firestore();
  const club = db.collection('clubs').doc('synthetic');
  const session = club.collection('piscine_sessions').doc(`lesson-${Date.now()}`);
  const attendee = session.collection('attendees').doc('student');
  await club.collection('members').doc('monitor').set({ app_role: 'user', clubStatuten: ['Encadrant'], plongeur_code: 'MC' });
  await club.collection('members').doc('assistant').set({ app_role: 'user', clubStatuten: ['Encadrant'], plongeur_code: 'AM' });
  await session.set({ date: Timestamp.fromMillis(1791230400000), type: 'piscine', niveaux: {
    '3*': { courses_by_hour: { '2eme_heure': [{ id: 'group2', order: 1, theme: 'Synthétique', encadrants: [{ membre_id: 'trainer' }] }] } },
  } });
  const original = { memberId: 'student', scannedAt: Timestamp.fromMillis(1791230410000), remarks: 'Synthétique à conserver', assignedLevel: '2*' };
  await attendee.set(original);
  const request = { clubId: 'synthetic', memberId: 'student', sessionId: session.id,
    operationId: 'correction1', hour: '2eme_heure', level: '3*', courseId: 'group2',
    expectedState: { student: assignmentState(original) } };
  await assert.rejects(executeCorrection(db, 'assistant', request), error => error.code === 'permission-denied');
  assert.equal((await session.collection('group_corrections').get()).size, 0);
  assert.deepEqual(await executeCorrection(db, 'monitor', request), { corrected: true, replay: false });
  const after = (await attendee.get()).data();
  assert.equal(after.assignedLevel, '3*');
  assert.equal(after.scannedAt.toMillis(), original.scannedAt.toMillis());
  assert.equal(after.remarks, original.remarks);
  assert.equal(after.hoursReport['2eme_heure'].group.groupKey, '3star_groupe2');
  const audit = (await session.collection('group_corrections').doc('correction1').get()).data();
  assert.equal(audit.actorUid, 'monitor');
  assert.equal(typeof audit.createdAt.toMillis(), 'number');
  assert.equal(audit.before.student.assignedLevel, '2*');
  assert.equal(audit.after.student.assignedLevel, '3*');
  assert.deepEqual(await executeCorrection(db, 'monitor', request), { corrected: true, replay: true });
  await assert.rejects(executeCorrection(db, 'monitor', { ...request, operationId: 'stale' }), error => error.code === 'aborted');
  assert.equal((await session.collection('group_corrections').get()).size, 1);
  console.log('PASS: real emulator transaction, permission denial, trusted audit, preserved attendance, retry and stale-write rejection.');
  await db.terminate();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
