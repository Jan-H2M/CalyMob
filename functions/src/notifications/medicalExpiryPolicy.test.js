const { day, medicalValidity, reminderPlan } = require('./medicalExpiryPolicy');
const { dispatchMedicalReminder, runMedicalExpiryReminders } = require('./medicalExpiryRunner');
const now = new Date('2026-10-31T12:00:00Z');
const member = { member_status: 'active', certificat_medical_date: '2025-11-20',
  certificat_medical_validite: '2030-01-01', fcm_tokens: ['dev-token', 'dev-token'] };
test('annual anniversary caps explicit date, not 365 days or December 31', () => {
  expect(medicalValidity(member, now)).toEqual({ status: 'expiringSoon',
    expiresOn: '2026-11-20', daysRemaining: 20 });
  expect(medicalValidity({ certificat_medical_date: '2024-03-01' }, new Date('2025-02-01T12:00Z')).expiresOn).toBe('2025-03-01');
  expect(medicalValidity({ certificat_medical_date: '2024-02-29' }, new Date('2025-02-28T12:00Z')).daysRemaining).toBe(0);
});
test('Brussels midnight, summer time and inclusive end date', () => {
  expect(day('07/08/2099').toISOString()).toBe('2099-08-07T00:00:00.000Z');
  expect(day('31/02/2026')).toBeNull();
  const m = { certificat_medical_validite: '2026-10-31' };
  expect(medicalValidity(m, new Date('2026-10-31T22:59:59Z')).status).toBe('expiringSoon');
  expect(medicalValidity(m, new Date('2026-10-31T23:00:00Z')).daysRemaining).toBe(-1);
  expect(day(new Date('2026-06-30T22:00:00Z')).toISOString()).toBe('2026-07-01T00:00:00.000Z');
});
test('shorter official date wins and malformed/future/conflicting input stays unknown', () => {
  expect(medicalValidity({ ...member, certificat_medical_validite: '2026-11-01' }, now).daysRemaining).toBe(1);
  for (const m of [{}, { certificat_medical_date: '2026-02-30' },
      { certificat_medical_date: '2027-01-01' }, { certificat_medical_validite: 'bad' },
      { certificat_medical_date: '2026-01-01', certificat_medical_validite: '2025-01-01' }]) {
    expect(medicalValidity(m, now).status).toBe('unknown');
  }
});
test('two bounded reminder bands, missing/expired/pending/opt-out/unknown-active skipped', () => {
  const plan = reminderPlan(member, now);
  expect(plan.band).toBe('30'); expect(plan.tokens).toEqual(['dev-token']);
  expect(reminderPlan(member, new Date('2026-11-15T12:00Z')).band).toBe('7');
  for (const patch of [{ member_status: 'inactive' }, { member_status: 'deleted' },
    { member_status: null }, { notifications_enabled: false }, { has_pending_medical: true },
    { notification_preferences: { medical_certificates: false } }, { fcm_tokens: [] },
    { certificat_medical_date: '2024-01-01' }, { certificat_medical_validite: 'bad' }]) {
    expect(reminderPlan({ ...member, ...patch }, now)).toBeNull();
  }
  expect(reminderPlan(member, new Date('2026-11-20T12:00Z'))).toBeNull();
  expect(reminderPlan(member, new Date('2026-10-01T12:00Z'))).toBeNull();
});

function fixture(data = member) {
  const records = new Map();
  let current = data, queue = Promise.resolve();
  const memberRef = { id: 'fictional-member', get: async () => ({ exists: true, data: () => current }),
    collection: () => ({ doc: key => ({ key, update: async patch => records.set(key, { ...records.get(key), ...patch }) }) }) };
  const db = { runTransaction: fn => {
    const job = queue.then(() => fn({ get: async ref => ref === memberRef
      ? { exists: true, data: () => current } : { exists: records.has(ref.key) },
      create: (ref, data) => records.set(ref.key, data) }));
    queue = job.catch(() => {}); return job;
  } };
  const send = jest.fn(async () => ({ successCount: 1, failureCount: 0 }));
  const run = (date = now) => dispatchMedicalReminder({ db, memberRef, clubId: 'fictional',
    now: date, timestamp: () => 'server-time-fictif', send });
  return { records, memberRef, db, send, run, change: data => { current = data; } };
}
test('repeated and concurrent run sends once per band and never health info on lockscreen', async () => {
  const f = fixture();
  expect(await Promise.all([f.run(), f.run(), f.run()])).toEqual(['sent', 'skipped', 'skipped']);
  expect(await f.run(new Date('2026-11-15T12:00Z'))).toBe('sent');
  expect(f.send).toHaveBeenCalledTimes(2);
  const payload = f.send.mock.calls[0][2];
  expect(payload.data.type).toBe('medical_certificate');
  expect(JSON.stringify(payload.notification)).not.toMatch(/médical|2026|dev-token/);
  expect([...f.records.values()].every(x => x.claimed_at === 'server-time-fictif')).toBe(true);
});
test('ambiguous dispatch or all failures are consumed, never blindly retried', async () => {
  for (const fail of ['throw', 'zero']) {
    const f = fixture();
    if (fail === 'throw') f.send.mockRejectedValue(new Error('private body must not be logged'));
    else f.send.mockResolvedValue({ successCount: 0, failureCount: 1 });
    expect(await f.run()).toBe(fail === 'throw' ? 'unknown_no_retry' : 'failed_no_retry');
    expect(await f.run()).toBe('skipped');
    expect(f.send).toHaveBeenCalledTimes(1);
  }
});
test('renewal/opt-out after claim cancels push', async () => {
  const f = fixture();
  f.memberRef.get = async () => ({ exists: true, data: () => ({ ...member, notifications_enabled: false }) });
  expect(await f.run()).toBe('obsolete'); expect(f.send).not.toHaveBeenCalled();
});
test('pagination reads every page with only projected reminder fields', async () => {
  const select = jest.fn(), startAfter = jest.fn(); let page = 0;
  const pages = [[{ data: () => ({}), ref: {} }, { data: () => ({}), ref: {} }], [{ data: () => ({}), ref: {} }]];
  const query = { orderBy: () => query, limit: () => query,
    select: (...fields) => { select(fields); return query; },
    startAfter: snap => { startAfter(snap); return query; }, get: async () => ({ docs: pages[page++] }) };
  const db = { collection: () => ({ select: () => ({ get: async () => ({ docs: [{ id: 'fictional', ref: { collection: () => query } }] }) }) }) };
  const result = await runMedicalExpiryReminders({ db, now, pageSize: 2, send: jest.fn(), timestamp: jest.fn() });
  expect(result.checked).toBe(3); expect(result.skipped).toBe(3);
  expect(startAfter).toHaveBeenCalledTimes(1);
  expect(select.mock.calls[0][0]).not.toContain('email');
  expect(select.mock.calls[0][0]).not.toContain('documents_medicaux');
});
