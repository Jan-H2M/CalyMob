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

function fakeDb(documents, onRetry) {
  const ref = (path) => ({
    path,
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id}`),
    get: async () => ({ exists: Object.hasOwn(documents, path), data: () => documents[path] }),
    set: async (data, options) => {
      documents[path] = options?.merge ? { ...documents[path], ...data } : data;
    },
  });
  return {
    collection: (name) => ref(name),
    runTransaction: async (callback) => {
      const run = async () => {
        const writes = [];
        const result = await callback({
          get: (reference) => reference.get(),
          set: (reference, data, options) => writes.push({ reference, data, options }),
        });
        return { result, writes };
      };
      let attempt = await run();
      if (onRetry) {
        onRetry(documents);
        attempt = await run();
      }
      for (const { reference, data, options } of attempt.writes) await reference.set(data, options);
      return attempt.result;
    },
  };
}

async function createExpense(communication, { currentCommunication = communication, onRetry, repeat = false } = {}) {
  const base = 'clubs/calypso';
  const legacy = `${base}/demandes_remboursement/expense-1`;
  const canonical = `${base}/expense_claims/expense-1`;
  const demande = { statut: 'brouillon', titre: 'Isabel invoice', date_depense: '2026-11-03',
    ...(communication === undefined ? {} : { communication_qr: communication }) };
  const docs = { [legacy]: { ...demande, communication_qr: currentCommunication ?? null }, [canonical]: { payment_qr_message: currentCommunication ?? null } };
  mockDb = fakeDb(docs, onRetry);
  const event = { params: { clubId: 'calypso', demandeId: 'expense-1' }, data: { data: () => demande } };
  await onExpenseCreated(event);
  if (repeat) { mockDb = fakeDb(docs); await onExpenseCreated(event); }
  return { legacy: docs[legacy], canonical: docs[canonical], counter: docs[`${base}/settings/rem_reference_counter_2026`] };
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

test('a delayed creation event preserves communication edited after the event snapshot', async () => {
  const ogm = '+++202/6271/61408+++';
  const result = await createExpense(undefined, { currentCommunication: ogm });
  expect(result.legacy.communication_qr).toBe(ogm);
  expect(result.canonical.payment_qr_message).toBe(ogm);
  expect(result.counter.counter).toBe(1);
});

test('a Firestore transaction retry rereads a concurrent OGM and increments the counter once', async () => {
  const ogm = '+++202/6271/61408+++';
  const result = await createExpense(undefined, { onRetry: (docs) => {
    docs['clubs/calypso/demandes_remboursement/expense-1'].communication_qr = ogm;
    docs['clubs/calypso/expense_claims/expense-1'].payment_qr_message = ogm;
  } });
  expect(result.legacy.communication_qr).toBe(ogm);
  expect(result.canonical.payment_qr_message).toBe(ogm);
  expect(result.legacy.payment_reference).toBe('REM-2026-0001');
  expect(result.canonical.payment_reference).toBe('REM-2026-0001');
  expect(result.counter.counter).toBe(1);
});

test('repeated event delivery reuses the reference rather than incrementing the counter again', async () => {
  const result = await createExpense('+++202/6271/61408+++', { repeat: true });
  expect(result.legacy.payment_reference).toBe('REM-2026-0001');
  expect(result.canonical.payment_reference).toBe('REM-2026-0001');
  expect(result.counter.counter).toBe(1);
});

test('keeps both existing communications when the two copies differ', async () => {
  const legacyMessage = '+++202/6271/61408+++';
  const canonicalMessage = 'Existing canonical communication';
  const result = await createExpense(undefined, { onRetry: (docs) => {
    docs['clubs/calypso/demandes_remboursement/expense-1'].communication_qr = legacyMessage;
    docs['clubs/calypso/expense_claims/expense-1'].payment_qr_message = canonicalMessage;
  } });
  expect(result.legacy.communication_qr).toBe(legacyMessage);
  expect(result.canonical.payment_qr_message).toBe(canonicalMessage);
});

test('copies an existing communication into a missing mirror without generating an REM message', async () => {
  const message = '+++202/6271/61408+++';
  const result = await createExpense(undefined, { onRetry: (docs) => {
    docs['clubs/calypso/expense_claims/expense-1'].payment_qr_message = message;
  } });
  expect(result.legacy.communication_qr).toBe(message);
  expect(result.canonical.payment_qr_message).toBe(message);
});
