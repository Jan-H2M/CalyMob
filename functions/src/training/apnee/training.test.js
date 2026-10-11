'use strict';
jest.mock('firebase-functions/v2/https', () => ({ onCall: (_o, fn) => fn,
  HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } } }));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { fromMillis: ms => ({ toMillis: () => ms }) } }));
const { executeApnee, enrollmentId, participationId } = require('./training');
const catalog = require('./catalog.json');
const stamp = ms => ({ toMillis: () => ms });
function fixture() {
  const rows = new Map([
    ['clubs/synthetic/members/student', { member_status: 'active', plongeur_code: '2', target_formation_level: '3*' }],
    ['clubs/synthetic/members/other', { member_status: 'active' }],
    ['clubs/synthetic/members/admin', { member_status: 'active', app_role: 'admin' }],
    ['clubs/synthetic/members/pool', { member_status: 'active', clubStatuten: ['Encadrants et assistants'], plongeur_code: '2' }],
    ['clubs/synthetic/piscine_sessions/session', { date: stamp(Date.UTC(2026,0,6)), type: 'piscine' }],
  ]);
  const collection = path => ({ path, doc: id => ref(`${path}/${id}`), where: (field, _op, value) => ({ path, field, value, query: true }) });
  const ref = path => ({ path, collection: name => collection(`${path}/${name}`) });
  const db = { collection, runTransaction: async fn => {
    const writes = [];
    const result = await fn({ get: async target => {
      if (writes.length) throw Error('Read after write');
      if (target.query) return { docs: [...rows].filter(([path,data]) => path.startsWith(`${target.path}/`) && path.split('/').length === target.path.split('/').length+1 && data[target.field] === target.value)
        .map(([path,data]) => ({ id: path.split('/').at(-1), data: () => data })) };
      return { exists: rows.has(target.path), data: () => rows.get(target.path) };
    }, set: (target,data) => writes.push(() => rows.set(target.path,data)),
    create: (target,data) => writes.push(() => { if (rows.has(target.path)) throw Error('duplicate'); rows.set(target.path,data); }) });
    writes.forEach(write => write()); return result;
  } };
  const base = { clubId: 'synthetic', operationId: 'op1', expectedRevision: 0 };
  const enroll = { ...base, action: 'enroll', memberId: 'student', track: 'apnee.a1', status: 'active' };
  const lesson = { ...base, operationId: 'lesson1', action: 'lesson', sessionId: 'session', lessonId: 'lesson',
    track: 'apnee.a1', hour: '1ere_heure', theme: 'Cours synthétique', memberIds: ['student'], instructorIds: ['pool'] };
  const result = { ...base, operationId: 'result1', action: 'result', memberId: 'student', track: 'apnee.a1',
    requirementKey: catalog.requirements.find(r => r.track === 'apnee.a1' && r.kind === 'skill').key,
    status: 'validated', date: '2026-01-06', validatorName: 'Instructeur synthétique', validatorFederation: 'LIFRAS', qualificationConfirmed: true };
  return { rows, db, base, enroll, lesson, result };
}
async function enrolled() { const f = fixture(); await executeApnee(f.db,'admin',f.enroll); return f; }
async function scheduled() { const f = await enrolled(); await executeApnee(f.db,'pool',f.lesson); return f; }
test('reviewed catalogue has 79 unique requirements and two independent tracks', () => {
  expect(catalog.requirements).toHaveLength(79);
  expect(new Set(catalog.requirements.map(r => r.key)).size).toBe(79);
  expect(catalog.requirements.filter(r => r.track === 'apnee.a1')).toHaveLength(38);
  expect(catalog.requirements.filter(r => r.track === 'apnee.a2')).toHaveLength(41);
  expect(catalog.tracks.map(t => t.key)).toEqual(['apnee.a1','apnee.a2']);
});
test('enrolment is idempotent/audited and creates no attendance, exercises or SCUBA changes', async () => {
  const f = await enrolled();
  expect(await executeApnee(f.db,'admin',f.enroll)).toMatchObject({ replay:true, revision:1 });
  expect(f.rows.get(`clubs/synthetic/apnee_enrollments/${enrollmentId('student','apnee.a1')}`)).toMatchObject({ status:'active', revision:1 });
  expect(f.rows.get('clubs/synthetic/members/student')).toEqual({ member_status:'active', plongeur_code:'2', target_formation_level:'3*' });
  expect([...f.rows.keys()].some(p => /attendees|participations|exercices_valides|brevet_history/.test(p))).toBe(false);
  expect(f.rows.get('clubs/synthetic/apnee_audit/op1')).toMatchObject({ actor_uid:'admin', action:'enroll' });
});
test.each(['student','pool','missing'])('%s cannot officially enrol or sign a result', async actor => {
  const f = fixture(); await expect(executeApnee(f.db,actor,f.enroll)).rejects.toThrow();
  const e = await enrolled(); await expect(executeApnee(e.db,actor,e.result)).rejects.toThrow();
});
test.each(['inactive','unknown-track','unknown-field','stale','replay-new-intent'])('%s fails atomically', async scenario => {
  const f = await enrolled(); const request = { ...f.enroll, operationId:'op2', expectedRevision:1 };
  if (scenario === 'inactive') f.rows.get('clubs/synthetic/members/admin').member_status='inactive';
  if (scenario === 'unknown-track') request.track='P3';
  if (scenario === 'unknown-field') request.qrVerified=true;
  if (scenario === 'stale') request.expectedRevision=0;
  if (scenario === 'replay-new-intent') Object.assign(request,{ operationId:'op1', status:'closed' });
  const before = JSON.stringify([...f.rows]);
  await expect(executeApnee(f.db,'admin',request)).rejects.toThrow();
  expect(JSON.stringify([...f.rows])).toBe(before);
});
test('only concrete roster members receive inferred participation, never QR or official results', async () => {
  const f = await scheduled();
  const path = `clubs/synthetic/apnee_participations/${participationId('session','lesson','student')}`;
  expect(f.rows.get(path)).toMatchObject({ source:'roster_inferred', participation_status:'rostered', revision:1 });
  expect([...f.rows.keys()].some(p => /qr_scan_receipts|attendees|requirements|awards/.test(p))).toBe(false);
  await executeApnee(f.db,'pool',{ ...f.lesson, operationId:'lesson2', expectedRevision:1, memberIds:[] });
  expect(f.rows.get(path).participation_status).toBe('cancelled');
});
test('no concurrent apnee courses for the same student/hour', async () => {
  const f = await scheduled(); const before = JSON.stringify([...f.rows]);
  await expect(executeApnee(f.db,'pool',{ ...f.lesson, lessonId:'parallel', operationId:'parallel' })).rejects.toThrow();
  expect(JSON.stringify([...f.rows])).toBe(before);
  await expect(executeApnee(f.db,'pool',{ ...f.lesson, lessonId:'second', hour:'2eme_heure', operationId:'second' })).resolves.toMatchObject({ saved:true });
});
test.each(['not-enrolled','inactive-student','invalid-teacher','duplicate','invalid-date','mutated-track'])('%s cannot change roster', async scenario => {
  const f = await scheduled(); const request = { ...f.lesson, expectedRevision:1, operationId:'lesson2' };
  if (scenario === 'not-enrolled') request.memberIds=['other'];
  if (scenario === 'inactive-student') f.rows.get('clubs/synthetic/members/student').member_status='archived';
  if (scenario === 'invalid-teacher') request.instructorIds=['student'];
  if (scenario === 'duplicate') request.memberIds=['student','student'];
  if (scenario === 'invalid-date') f.rows.get('clubs/synthetic/piscine_sessions/session').date='invalid';
  if (scenario === 'mutated-track') request.track='apnee.a2';
  const before = JSON.stringify([...f.rows]);
  await expect(executeApnee(f.db,'pool',request)).rejects.toThrow();
  expect(JSON.stringify([...f.rows])).toBe(before);
});
test('signed result and explicit award store source snapshots without changing SCUBA level or other results', async () => {
  const f = await enrolled(); await executeApnee(f.db,'admin',f.result);
  const enrollment = `clubs/synthetic/apnee_enrollments/${enrollmentId('student','apnee.a1')}`;
  expect(f.rows.get(`${enrollment}/requirements/${f.result.requirementKey}`)).toMatchObject({ status:'validated', qualification_attested_by:'admin', catalog_id:catalog.catalogId, requirement:{ key:f.result.requirementKey } });
  const { requirementKey, status, ...award } = f.result;
  await executeApnee(f.db,'admin',{ ...award, action:'award', award:'discovery', operationId:'award2' });
  expect(f.rows.get(`${enrollment}/awards/discovery`)).toMatchObject({ award:'discovery', validated_by:'Instructeur synthétique' });
  expect(f.rows.get('clubs/synthetic/members/student').plongeur_code).toBe('2');
});
test.each(['cross-track','unqualified','invalid-date','future-date','wrong-award'])('%s official result is rejected', async scenario => {
  const f = await enrolled(); const request = { ...f.result };
  if (scenario === 'cross-track') request.requirementKey=catalog.requirements.find(r=>r.track==='apnee.a2').key;
  if (scenario === 'unqualified') request.qualificationConfirmed=false;
  if (scenario === 'invalid-date') request.date='2026-02-31';
  if (scenario === 'future-date') request.date='2099-01-01';
  if (scenario === 'wrong-award') { delete request.requirementKey; delete request.status; Object.assign(request,{ action:'award',award:'a2' }); }
  const before=JSON.stringify([...f.rows]); await expect(executeApnee(f.db,'admin',request)).rejects.toThrow(); expect(JSON.stringify([...f.rows])).toBe(before);
});
test('only matching genuine QR proof permits own correction; roster update preserves it', async () => {
  const f = await scheduled(); const scan = stamp(Date.UTC(2026,0,6,20));
  const receipt = { version:1,memberId:'student',sessionId:'session',scannerUid:'pool',scannedAt:scan };
  const request = { ...f.base, operationId:'attendance',expectedRevision:1,action:'attendance',memberId:'student',sessionId:'session',lessonId:'lesson',status:'attended',note:'Synthétique' };
  await expect(executeApnee(f.db,'student',request)).rejects.toThrow();
  f.rows.set('clubs/synthetic/piscine_sessions/session/attendees/student',{ memberId:'student',scannedBy:'pool',scannedAt:scan });
  await expect(executeApnee(f.db,'student',request)).rejects.toThrow();
  f.rows.set('clubs/synthetic/piscine_sessions/session/qr_scan_receipts/student',receipt);
  f.rows.get('clubs/synthetic/piscine_sessions/session/attendees/student').qrVerified=receipt;
  await executeApnee(f.db,'student',request);
  const path=`clubs/synthetic/apnee_participations/${participationId('session','lesson','student')}`;
  expect(f.rows.get(path)).toMatchObject({ participation_status:'attended',source:'qr_verified_member_correction',note:'Synthétique' });
  await executeApnee(f.db,'pool',{ ...f.lesson,operationId:'theme',expectedRevision:1,theme:'Autre thème' });
  expect(f.rows.get(path)).toMatchObject({ participation_status:'attended',source:'qr_verified_member_correction',note:'Synthétique' });
});
