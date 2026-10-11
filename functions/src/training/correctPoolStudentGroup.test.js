jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'server-time' },
  Filter: { where: (...args) => args, or: (...args) => args },
}));
const { executeCorrection, assignmentState, mayCorrect, buildPatch, choices } = require('./correctPoolStudentGroup');

function fixture({ actor, attendance, duplicate, session } = {}) {
  const data = new Map([
    ['clubs/calypso/members/student', { member_status: 'active', app_role: 'user', clubStatuten: ['Membre'], plongeur_code: 'P2' }],
    ['clubs/calypso/members/monitor', actor || { app_role: 'user', clubStatuten: ['Encadrant'], plongeur_code: 'MC' }],
    ['clubs/calypso/piscine_sessions/synthetic', session || {
      date: { toMillis: () => 1791230400000 }, type: 'piscine', niveaux: {
        '3*': { courses_by_hour: { '2eme_heure': [{ id: 'group2', order: 1,
          theme: 'Exercice synthétique', encadrants: [{ membre_id: 'trainer' }] }] } },
      },
    }],
    ['clubs/calypso/piscine_sessions/synthetic/attendees/student', attendance || {
      memberId: 'student', scannedAt: 'original-scan', remarks: 'keep',
      assignedLevel: '2*', hoursReport: { '1ere_heure': { role: 'eleve', group: { level: '1*' } } },
    }],
  ]);
  if (duplicate) data.set('clubs/calypso/piscine_sessions/synthetic/attendees/legacy', duplicate);
  const ref = path => ({ path, collection: name => collection(`${path}/${name}`) });
  const collection = path => ({ path, doc: id => ref(`${path}/${id}`), where: () => ({ query: path }) });
  const snap = path => ({ id: path.split('/').at(-1), ref: ref(path), exists: data.has(path), data: () => data.get(path) });
  const db = {
    collection,
    runTransaction: async fn => {
      const writes = [];
      const value = await fn({
        get: async target => target.query
          ? { docs: [...data.keys()].filter(path => path.startsWith(`${target.query}/`)).map(snap) }
          : snap(target.path),
        update: (target, patch) => writes.push(() => data.set(target.path, { ...data.get(target.path), ...patch })),
        create: (target, patch) => writes.push(() => data.set(target.path, patch)),
      });
      writes.forEach(write => write());
      return value;
    },
  };
  const expectedState = {};
  for (const [path, value] of data) if (path.includes('/attendees/')) expectedState[path.split('/').at(-1)] = assignmentState(value);
  const request = { clubId: 'calypso', memberId: 'student', sessionId: 'synthetic', operationId: 'operation1',
    hour: '2eme_heure', level: '3*', courseId: 'group2', expectedState };
  return { db, data, request };
}

test('only monitor encadrant or admin may correct groups', () => {
  expect(mayCorrect({ clubStatuten: ['Encadrant'], plongeur_code: 'AM' })).toBe(false);
  expect(mayCorrect({ clubStatuten: ['Membre'], plongeur_code: 'MC' })).toBe(false);
  expect(mayCorrect({ clubStatuten: ['Encadrant'], plongeur_code: 'MC' })).toBe(true);
  expect(mayCorrect({ app_role: 'admin' })).toBe(true);
  expect(mayCorrect({ app_role: 'user', clubStatuten: ['Administrateur'] })).toBe(false);
});
test('scanned member may correct only their own group without granting monitor powers', async () => {
  const scan = { toMillis: () => 1791230400000 };
  const f = fixture({ attendance: { memberId: 'student', scannedAt: scan, scannedBy: 'monitor', remarks: 'preserved' } });
  f.data.set('clubs/calypso/piscine_sessions/synthetic/qr_scan_receipts/student', {
    version: 1, memberId: 'student', sessionId: 'synthetic', scannerUid: 'monitor', scannedAt: scan });
  f.data.get('clubs/calypso/piscine_sessions/synthetic/attendees/student').qrVerified =
    f.data.get('clubs/calypso/piscine_sessions/synthetic/qr_scan_receipts/student');
  await executeCorrection(f.db, 'student', f.request);
  const row = f.data.get('clubs/calypso/piscine_sessions/synthetic/attendees/student');
  expect(row.scannedAt).toBe(scan);
  expect(row.remarks).toBe('preserved');
  expect(row.hoursReport['2eme_heure'].group.level).toBe('3*');
  expect(f.data.get('clubs/calypso/piscine_sessions/synthetic/group_corrections/operation1').source)
    .toBe('calymob_member_group_correction');
  expect((await executeCorrection(f.db, 'student', f.request)).replay).toBe(true);
});
test.each([
  { memberId: 'student', checkinCompletedAt: 'completed-report' },
  { memberId: 'student', assignedLevel: '3*' },
  { memberId: 'student', scannedAt: 'invalid-scan' },
  { memberId: 'student', scannedAt: { toMillis: () => 1791230400000 }, scannedBy: 'monitor',
    qrVerified: { version: 1, memberId: 'student', scannerUid: 'monitor' } },
])('own correction without actual QR timestamp performs zero writes: %j', async attendance => {
  const f = fixture({ attendance });
  const before = JSON.stringify([...f.data]);
  await expect(executeCorrection(f.db, 'student', f.request)).rejects.toThrow();
  expect(JSON.stringify([...f.data])).toBe(before);
});
test('ordinary member cannot correct another student even when scanned', async () => {
  const f = fixture();
  f.data.set('clubs/calypso/members/other', { clubStatuten: ['Membre'], plongeur_code: 'MC' });
  const before = JSON.stringify([...f.data]);
  await expect(executeCorrection(f.db, 'other', f.request)).rejects.toThrow();
  expect(JSON.stringify([...f.data])).toBe(before);
});
test('inactive member cannot self correct even with a genuine QR scan', async () => {
  const f = fixture({ attendance: { memberId: 'student', scannedAt: { toMillis: () => 1791230400000 } } });
  f.data.get('clubs/calypso/members/student').member_status = 'inactive';
  const before = JSON.stringify([...f.data]);
  await expect(executeCorrection(f.db, 'student', f.request)).rejects.toThrow();
  expect(JSON.stringify([...f.data])).toBe(before);
});
test('atomic correction preserves scan other hour notes and writes server audit', async () => {
  const { db, data, request } = fixture();
  await executeCorrection(db, 'monitor', request);
  const attendee = data.get('clubs/calypso/piscine_sessions/synthetic/attendees/student');
  expect(attendee.scannedAt).toBe('original-scan');
  expect(attendee.remarks).toBe('keep');
  expect(attendee.hoursReport['1ere_heure'].group.level).toBe('1*');
  expect(attendee.hoursReport['2eme_heure'].group).toMatchObject({ level: '3*', groupNumber: 2, course_id: 'group2', groupKey: '3star_groupe2', validatorId: 'trainer' });
  expect(attendee.groupAssignment.level).toBe('1*');
  const audit = data.get('clubs/calypso/piscine_sessions/synthetic/group_corrections/operation1');
  expect(audit).toMatchObject({ actorUid: 'monitor', createdAt: 'server-time', memberId: 'student' });
  expect(audit.before.student.assignedLevel).toBe('2*');
  expect(audit.after.student.assignedLevel).toBe('3*');
  expect(attendee.outcome).toBeUndefined();
  expect((await executeCorrection(db, 'monitor', request)).replay).toBe(true);
});
test('duplicates for same identity are corrected consistently', async () => {
  const { db, data, request } = fixture({ duplicate: { membre_id: 'student', scannedAt: 'legacy-scan' } });
  await executeCorrection(db, 'monitor', request);
  expect(data.get('clubs/calypso/piscine_sessions/synthetic/attendees/legacy').assignedCourseId).toBe('group2');
});
test('conflicting identity aliases perform zero writes', async () => {
  const f = fixture({ attendance: { memberId: 'student', membre_id: 'different', scannedAt: 'scan' } });
  const before = JSON.stringify([...f.data]);
  await expect(executeCorrection(f.db, 'monitor', f.request)).rejects.toThrow();
  expect(JSON.stringify([...f.data])).toBe(before);
});
test.each(['unauthenticated', 'permission', 'concurrent', 'invalid-course', 'undated', 'identity'])('%s performs zero writes', async scenario => {
  const f = fixture(scenario === 'permission' ? { actor: { clubStatuten: ['Membre'] } }
    : scenario === 'undated' ? { session: { type: 'piscine' } }
      : scenario === 'identity' ? { attendance: { memberId: 'different', scannedAt: 'scan' } } : {});
  if (scenario === 'concurrent') f.request.expectedState.student.assignedLevel = 'stale';
  if (scenario === 'invalid-course') f.request.courseId = 'missing';
  const before = JSON.stringify([...f.data]);
  await expect(executeCorrection(f.db, scenario === 'unauthenticated' ? null : 'monitor', f.request)).rejects.toThrow();
  expect(JSON.stringify([...f.data])).toBe(before);
});
test('cannot overwrite a different recorded role', () => {
  expect(() => buildPatch({ hoursReport: { '2eme_heure': { role: 'encadrant' } } },
    { hour: '2eme_heure', level: '2*', courseId: 'course', groupNumber: 1, monitors: [] })).toThrow();
});
test('cannot reclassify a service-only presence as student training', () => {
  expect(() => buildPatch({ outcome: 'service_only' },
    { hour: '2eme_heure', level: '2*', courseId: 'course', groupNumber: 1, monitors: [] })).toThrow();
});
test.each(['service', 'nage_libre', 'absent'])('cannot overwrite mixed-hour %s activity without a role', activity => {
  expect(() => buildPatch({ outcome: 'training', hoursReport: {
    '1ere_heure': { activity: 'formation', role: 'eleve', group: { level: '1*' } },
    '2eme_heure': { activity },
  } }, { hour: '2eme_heure', level: '2*', courseId: 'course', groupNumber: 1, monitors: [] })).toThrow();
});
test('replay operation cannot be reused for another correction', async () => {
  const f = fixture();
  await executeCorrection(f.db, 'monitor', f.request);
  const before = JSON.stringify([...f.data]);
  await expect(executeCorrection(f.db, 'monitor', { ...f.request, courseId: 'another' })).rejects.toThrow();
  expect(JSON.stringify([...f.data])).toBe(before);
});
test('explicit group supervisor is retained for future session closing', async () => {
  const f = fixture();
  f.data.set('clubs/calypso/piscine_sessions/synthetic/groups/3star_groupe2', { supervisorId: 'supervisor', hourKey: '2eme_heure' });
  await executeCorrection(f.db, 'monitor', f.request);
  expect(f.data.get('clubs/calypso/piscine_sessions/synthetic/attendees/student').hoursReport['2eme_heure'].group.validatorId).toBe('supervisor');
});
test.each([{ groupNumber: 1 }, { group_key: '3*-1' }, { hour_key: '1ere_heure' }, { niveau: '2*' }])('conflicting supervisor override metadata is ignored: %j', async metadata => {
  const f = fixture();
  f.data.set('clubs/calypso/piscine_sessions/synthetic/groups/3star_groupe2', { supervisorId: 'wrong', ...metadata });
  await executeCorrection(f.db, 'monitor', f.request);
  expect(f.data.get('clubs/calypso/piscine_sessions/synthetic/attendees/student').hoursReport['2eme_heure'].group.validatorId).toBe('trainer');
});
test('legacy plans use one unambiguous group per populated hour', () => {
  expect(choices({ niveaux: { '2*': { theme_2eme_heure: 'Synthétique' } } })).toEqual([
    { level: '2*', hour: '2eme_heure', courseId: '2*_legacy', groupNumber: 1, theme: 'Synthétique', monitors: [] },
  ]);
});
