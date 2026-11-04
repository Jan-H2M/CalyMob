let mockDb;

jest.mock('firebase-functions/v2/firestore', () => ({ onDocumentCreated: (_options, handler) => handler }));
jest.mock('firebase-admin', () => {
  const firestore = jest.fn(() => mockDb);
  firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  return { firestore };
});
jest.mock('../expenses/expenseSync', () => ({ isLegacyMirrorWrite: () => false }));
jest.mock('../utils/communicationTemplates', () => ({}));
jest.mock('../utils/emailDelivery', () => ({}));
jest.mock('../utils/memberName', () => ({}));

const { onExpenseCreated } = require('./onExpenseCreated');

function fakeDb(documents) {
  const ref = (path) => ({
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id}`),
    get: async () => ({ exists: Object.hasOwn(documents, path), data: () => documents[path] }),
    set: async (data, options) => {
      documents[path] = options?.merge ? { ...documents[path], ...data } : data;
    },
  });
  return {
    collection: (name) => ref(name),
    runTransaction: async (callback) => callback({
      get: (reference) => reference.get(),
      set: (reference, data, options) => reference.set(data, options),
    }),
  };
}

async function createExpense(communication) {
  const base = 'clubs/calypso';
  const legacy = `${base}/demandes_remboursement/expense-1`;
  const canonical = `${base}/expense_claims/expense-1`;
  const demande = { statut: 'brouillon', titre: 'Isabel invoice', date_depense: '2026-11-03',
    ...(communication === undefined ? {} : { communication_qr: communication }) };
  const docs = { [legacy]: { ...demande }, [canonical]: { payment_qr_message: communication ?? null } };
  mockDb = fakeDb(docs);
  await onExpenseCreated({ params: { clubId: 'calypso', demandeId: 'expense-1' }, data: { data: () => demande } });
  return { legacy: docs[legacy], canonical: docs[canonical] };
}

beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('keeps a supplier structured communication exactly as supplied in both copies', async () => {
  const ogm = '+++202/6271/61408+++';
  const result = await createExpense(ogm);
  expect(result.legacy.communication_qr).toBe(ogm);
  expect(result.canonical.payment_qr_message).toBe(ogm);
  expect(result.legacy.payment_reference).toBe('REM-2026-0001');
  expect(result.canonical.payment_reference).toBe('REM-2026-0001');
});

test('keeps caller-supplied free communication without rewriting it', async () => {
  const message = '  Invoice reference 42  ';
  const result = await createExpense(message);
  expect(result.legacy.communication_qr).toBe(message);
  expect(result.canonical.payment_qr_message).toBe(message);
});

test('still generates a REM communication when none was supplied', async () => {
  const result = await createExpense(undefined);
  expect(result.legacy.communication_qr).toBe('+++REM-2026-0001+++ Isabel invoice');
  expect(result.canonical.payment_qr_message).toBe(result.legacy.communication_qr);
});
