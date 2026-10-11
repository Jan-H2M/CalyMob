jest.mock('firebase-functions/v2/https', () => ({ onCall: (_o, fn) => fn,
  HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } } }));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { fromMillis: ms => ({ milliseconds: ms }) } }));
const { executePersonalProgress, progressId, targetNiveau, parseDate } = require('./personalExerciseProgress');
const { executeOfficialResult, examRecordId } = require('./officialFormationResults');

function fixture() {
  const rows = new Map([
    ['clubs/synthetic/members/student', { member_status: 'active', plongeur_code: '2', target_formation_level: '3*' }],
    ['clubs/synthetic/members/admin', { member_status: 'active', app_role: 'admin', prenom: 'Synthetic' }],
    ['clubs/synthetic/exercices_lifras/natural', { code: 'P3.RA', niveau: 'P3', description: 'Remontée assistée' }],
    ['clubs/synthetic/exercices_lifras/theory', { code: 'P3.EXT', niveau: 'P3', description: 'Examen théorique' }],
    ['clubs/synthetic/exercices_lifras/pool', { code: 'P3.EXP', niveau: 'P3', description: 'Examen piscine' }],
    ['clubs/synthetic/exercices_lifras/other', { code: 'P2.RA', niveau: 'P2' }],
  ]);
  const collection = path => ({ doc: id => ref(`${path}/${id}`) });
  const ref = path => ({ path, collection: name => collection(`${path}/${name}`) });
  const db = { collection, runTransaction: async fn => {
    const writes = [];
    const result = await fn({ get: async target => ({ exists: rows.has(target.path), data: () => rows.get(target.path) }),
      set: (target, data) => writes.push(() => rows.set(target.path, data)),
      update: (target, data) => writes.push(() => rows.set(target.path, { ...rows.get(target.path), ...data })),
      create: (target, data) => writes.push(() => { if (rows.has(target.path)) throw Error('duplicate'); rows.set(target.path, data); }),
    });
    writes.forEach(write => write());
    return result;
  } };
  const request = { clubId: 'synthetic', memberId: 'student', exerciseId: 'natural', done: true,
    date: '2026-01-05', expectedRevision: 0, operationId: 'op1' };
  return { db, rows, request };
}

test('personal done/date, uncheck, audit and retry never touch official documents', async () => {
  const f = fixture();
  const memberBefore = f.rows.get('clubs/synthetic/members/student');
  await executePersonalProgress(f.db, 'student', f.request);
  const path = `clubs/synthetic/exercise_claims/${progressId('student', 'natural')}`;
  expect(f.rows.get(path)).toMatchObject({ status: 'personal_done', validation_mode: 'personal_only', server_verified: true, revision: 1 });
  expect(f.rows.get(`${path}/progress_history/op1`)).toMatchObject({ actorUid: 'student', before: null, after: { done: true }, source: 'calymob_personal_tracking' });
  expect((await executePersonalProgress(f.db, 'student', f.request)).replay).toBe(true);
  await executePersonalProgress(f.db, 'student', { ...f.request, done: false, operationId: 'op2', expectedRevision: 1 });
  expect(f.rows.get(path)).toMatchObject({ status: 'personal_not_done', performed_date: null, revision: 2 });
  expect(f.rows.get('clubs/synthetic/members/student')).toEqual(memberBefore);
  expect([...f.rows.keys()].some(key => /exercices_valides|brevet_history|formation_tasks/.test(key))).toBe(false);
});
test.each(['another-member', 'inactive', 'theory', 'pool', 'other', 'revision', 'invalid-date', 'future-date', 'missing-catalog'])('%s refuses personal mutation atomically', async scenario => {
  const f = fixture();
  if (scenario === 'inactive') f.rows.get('clubs/synthetic/members/student').member_status = 'inactive';
  if (['theory', 'pool', 'other'].includes(scenario)) f.request.exerciseId = scenario;
  if (scenario === 'revision') f.request.expectedRevision = 7;
  if (scenario === 'invalid-date') f.request.date = '2026-02-31';
  if (scenario === 'future-date') f.request.date = '2099-01-01';
  if (scenario === 'missing-catalog') f.request.exerciseId = 'missing';
  const before = JSON.stringify([...f.rows]);
  await expect(executePersonalProgress(f.db, scenario === 'another-member' ? 'admin' : 'student', f.request)).rejects.toThrow();
  expect(JSON.stringify([...f.rows])).toBe(before);
});
test('replay id cannot change date or done', async () => {
  const f = fixture(); await executePersonalProgress(f.db, 'student', f.request);
  await expect(executePersonalProgress(f.db, 'student', { ...f.request, done: false })).rejects.toThrow();
});
test('target aliases remain aligned and numeric catalogue alias works', async () => {
  expect(targetNiveau({ plongeur_code: '2*' })).toBe('P3');
  expect(targetNiveau({ target_formation_level: '3★', plongeur_code: '1' })).toBe('P3');
  const f = fixture(); f.rows.get('clubs/synthetic/exercices_lifras/natural').niveau = '3';
  await expect(executePersonalProgress(f.db, 'student', f.request)).resolves.toMatchObject({ saved: true });
});
test('strict date parser rejects rollovers', () => {
  expect(() => parseDate('2026-02-31')).toThrow();
  expect(() => parseDate('bad')).toThrow();
});
test('official exam can be corrected, retains one canonical result plus independent audit', async () => {
  const f = fixture();
  const request = { ...f.request, kind: 'exam', exerciseId: 'theory', passed: true };
  await executeOfficialResult(f.db, 'admin', request);
  const path = `clubs/synthetic/members/student/exercices_valides/${examRecordId('P3.EXT')}`;
  expect(f.rows.get(path)).toMatchObject({ status: 'validated', source: 'formation_admin', declared_by_member: false, revision: 1 });
  expect((await executeOfficialResult(f.db, 'admin', request)).replay).toBe(true);
  await executeOfficialResult(f.db, 'admin', { ...request, operationId: 'op2', expectedRevision: 1, passed: false });
  expect(f.rows.get(path)).toMatchObject({ status: 'refused', revision: 2 });
  expect(f.rows.get('clubs/synthetic/members/student/formation_admin_audit/op2')).toMatchObject({ actorUid: 'admin', before: { status: 'validated' }, after: { status: 'refused' } });
  expect(f.rows.get('clubs/synthetic/members/student').plongeur_code).toBe('2');
});
test('official brevet records explicit date and updates current code but not formation goal', async () => {
  const f = fixture();
  const request = { ...f.request, kind: 'brevet', level: '3', expectedLevel: '2' };
  await executeOfficialResult(f.db, 'admin', request);
  expect(f.rows.get('clubs/synthetic/members/student')).toMatchObject({ plongeur_code: '3', target_formation_level: '3*', formation_official_operation: 'op1' });
  expect(f.rows.get('clubs/synthetic/members/student/brevet_history/official_op1')).toMatchObject({ level: '3', previous_level: '2', from: 'formation_admin', recorded_by: 'admin' });
  expect((await executeOfficialResult(f.db, 'admin', request)).replay).toBe(true);
});
test.each(['ordinary', 'inactive-admin', 'natural-exam', 'stale-exam', 'stale-brevet'])('%s cannot administer results, zero writes', async scenario => {
  const f = fixture();
  const request = { ...f.request, kind: 'exam', exerciseId: 'theory', passed: true };
  if (scenario === 'inactive-admin') f.rows.get('clubs/synthetic/members/admin').member_status = 'archived';
  if (scenario === 'natural-exam') request.exerciseId = 'natural';
  if (scenario === 'stale-exam') request.expectedRevision = 2;
  if (scenario === 'stale-brevet') Object.assign(request, { kind: 'brevet', level: '3', expectedLevel: '1' });
  const before = JSON.stringify([...f.rows]);
  await expect(executeOfficialResult(f.db, scenario === 'ordinary' ? 'student' : 'admin', request)).rejects.toThrow();
  expect(JSON.stringify([...f.rows])).toBe(before);
});
