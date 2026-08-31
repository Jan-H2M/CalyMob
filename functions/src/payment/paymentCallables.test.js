jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
}));
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(), {
    Timestamp: { now: () => 'now' }, FieldValue: { serverTimestamp: () => 'now' },
  }),
}));
const admin = require('firebase-admin');
const { recordOnSitePayment: onsite } = require('./recordOnSitePayment');
const { recordInstallmentPayment: installment } = require('./recordInstallmentPayment');
const { recordPaymentCommunication: communicate } = require('./recordPaymentCommunication');

const memberPath = 'clubs/c/members/u';
const operationPath = 'clubs/c/operations/o';
const inscriptionPath = `${operationPath}/inscriptions/i`;
let docs;
let writes;
let beforeTransaction;
const request = (extra = {}) => ({ auth: { uid: 'u' }, data: {
  clubId: 'c', operationId: 'o', participantId: 'i', installmentId: 'first', status: 'qr_on_site', ...extra,
} });
function ref(path) {
  return { path, collection: (id) => ref(`${path}/${id}`), doc: (id) => ref(`${path}/${id}`),
    get: async () => snapshot(path) };
}
function snapshot(path) {
  return { exists: docs[path] !== undefined, data: () => structuredClone(docs[path]),
    get: (key) => docs[path]?.[key], ref: ref(path) };
}
beforeEach(() => {
  docs = {
    [memberPath]: { app_role: 'admin' },
    [operationPath]: { payment_required: true },
    [inscriptionPath]: { membre_id: 'u', prix: 30, paye: false },
  };
  writes = [];
  beforeTransaction = () => {};
  admin.firestore.mockReturnValue({ collection: (id) => ref(id), runTransaction: async (fn) => {
    beforeTransaction();
    return fn({ get: async (r) => snapshot(r.path), update: (r, update) => {
      writes.push(update);
      for (const [key, value] of Object.entries(update)) {
        const parts = key.split('.');
        let target = docs[r.path];
        for (const part of parts.slice(0, -1)) target = target[part] ||= {};
        target[parts.at(-1)] = value;
      }
    } });
  } });
});

describe.each([['onsite', onsite], ['installment', installment], ['communication', communicate]])('%s authorization and policy', (_name, call) => {
  beforeEach(() => { docs[inscriptionPath].installment_payments = { first: { status: 'pending', amount_due: 30 } }; });
  test('authentication required', async () => {
    await expect(call({ data: request().data })).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(writes).toHaveLength(0);
  });
  test('unauthorized member cannot edit another registration', async () => {
    docs[memberPath] = { app_role: 'membre' };
    docs[inscriptionPath].membre_id = 'someone-else';
    await expect(call(request())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test('revoked authorization is rechecked in transaction', async () => {
    beforeTransaction = () => { docs[memberPath] = { app_role: 'membre' }; docs[inscriptionPath].membre_id = 'other'; };
    await expect(call(request())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test.each([{ payment_required: false }, { payment_required: true, allowed_payment_methods: ['qr_email'] }])('rejects disallowed method %j', async (policy) => {
    docs[operationPath] = policy;
    await expect(call(request())).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(writes).toHaveLength(0);
  });
  test('canceled registration stays untouched', async () => {
    docs[inscriptionPath].registration_status = 'canceled';
    await expect(call(request())).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(writes).toHaveLength(0);
  });
});

test('full onsite confirmation is provisional and repeat is a no-op', async () => {
  await onsite(request());
  await onsite(request());
  expect(writes).toHaveLength(1);
  expect(docs[inscriptionPath]).toMatchObject({ paye: true, payment_source: 'on_site_qr', paye_method: 'epc_qr_onsite', transaction_matched: false });
});
test('full call cannot bypass open tranches', async () => {
  docs[inscriptionPath].installment_payments = { first: { amount_due: 30 } };
  await expect(onsite(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(writes).toHaveLength(0);
});
test.each([NaN, Infinity, -1, 0])('invalid amount %s rejected', async (amount) => {
  docs[inscriptionPath].prix = amount;
  await expect(onsite(request())).rejects.toMatchObject({ code: 'failed-precondition' });
});
test('paid bank receipt is never replaced with provisional status', async () => {
  Object.assign(docs[inscriptionPath], { paye: true, transaction_id: 'bank', transaction_matched: true });
  await onsite(request());
  expect(writes).toHaveLength(0);
});
test('mixed bank and onsite tranches retain separate evidence', async () => {
  docs[inscriptionPath].installment_payments = {
    bank: { status: 'paid', amount_due: 20, transaction_id: 'bank-1' },
    first: { status: 'pending', amount_due: 30 },
  };
  await installment(request());
  await installment(request());
  expect(writes).toHaveLength(1);
  expect(docs[inscriptionPath]).toMatchObject({ paye: true, transaction_matched: false, paye_method: 'epc_qr_onsite',
    installment_payments: { bank: { transaction_id: 'bank-1' }, first: {
      status: 'paid', amount_paid: 30, payment_source: 'on_site_qr', payment_confirmed_by: 'u', payment_confirmed_at: 'now',
    } } });
});
test('one tranche does not close remaining tranches', async () => {
  docs[inscriptionPath].installment_payments = { first: { amount_due: 30 }, later: { amount_due: 20 } };
  await installment(request());
  expect(docs[inscriptionPath].paye).toBe(false);
  expect(docs[inscriptionPath].installment_payments.later.status).toBeUndefined();
});
test('installment cannot alter globally settled receipt', async () => {
  Object.assign(docs[inscriptionPath], { paye: true, installment_payments: { first: { amount_due: 30 } } });
  await expect(installment(request())).rejects.toMatchObject({ code: 'failed-precondition' });
});
test('installment field-path injection rejected', async () => {
  await expect(installment(request({ installmentId: 'first.status' }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
test('owner communication records message without downgrading bank payment', async () => {
  docs[memberPath] = { app_role: 'membre' };
  Object.assign(docs[inscriptionPath], { paye: true, payment_status: 'paid', transaction_id: 'bank' });
  await communicate(request());
  expect(docs[inscriptionPath]).toMatchObject({ paye: true, payment_status: 'paid', transaction_id: 'bank', payment_communication_status: 'qr_on_site' });
});
test('communication cannot accept accounting status', async () => {
  await expect(communicate(request({ status: 'paid' }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
test('waived parent cannot be overwritten by onsite confirmation', async () => {
  docs[inscriptionPath].payment_status = 'waived';
  await onsite(request());
  expect(writes).toHaveLength(0);
  docs[inscriptionPath].installment_payments = { first: { amount_due: 30 } };
  await expect(installment(request())).rejects.toMatchObject({ code: 'failed-precondition' });
});
test.each([{ transaction_id: 'bank' }, { transaction_matched: true }, { payment_status: 'waived' }])('communication preserves closed evidence %j', async (evidence) => {
  Object.assign(docs[inscriptionPath], evidence);
  await communicate(request());
  expect(writes[0]).not.toHaveProperty('payment_status');
  expect(docs[inscriptionPath]).toMatchObject(evidence);
});
