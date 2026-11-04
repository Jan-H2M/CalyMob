let mockDb;
let mockFlags;

jest.mock('firebase-functions/v2/firestore', () => ({ onDocumentWritten: (_options, handler) => handler }));
jest.mock('firebase-admin', () => ({ firestore: () => mockDb }));
jest.mock('./migrationFlags', () => ({ getMigrationFlags: async () => mockFlags }));

const { mirrorLegacyExpenseClaim } = require('./mirrorLegacyExpenseClaim');
const { buildCanonicalFromLegacy } = require('./expenseSync');

const legacyPath = 'clubs/calypso/demandes_remboursement/expense-1';
const canonicalPath = 'clubs/calypso/expense_claims/expense-1';
const ogm = '+++202/6271/61408+++';

function fakeDb(documents, onRetry) {
  const ref = (path) => ({
    path,
    collection: (name) => ref(`${path}/${name}`),
    doc: (id) => ref(`${path}/${id}`),
    get: async () => ({ exists: Object.hasOwn(documents, path), data: () => documents[path] }),
  });
  let writes = 0;
  return {
    collection: (name) => ref(name),
    get writes() { return writes; },
    runTransaction: async (callback) => {
      const run = async () => {
        const pending = [];
        const result = await callback({
          get: (reference) => reference.get(),
          set: (reference, value) => pending.push({ reference, value }),
          delete: (reference) => pending.push({ reference, remove: true }),
        });
        return { result, pending };
      };
      let attempt = await run();
      if (onRetry) { onRetry(documents); attempt = await run(); }
      for (const { reference, value, remove } of attempt.pending) {
        if (remove) delete documents[reference.path];
        else documents[reference.path] = value;
        writes += 1;
      }
      return attempt.result;
    },
  };
}

const event = (data) => ({ params: { clubId: 'calypso', demandeId: 'expense-1' },
  data: { after: { exists: data !== null, data: () => data } } });
const legacy = (communication) => ({ club_id: 'calypso', titre: 'Isabel', description: 'Isabel Ponto',
  montant: 4.84, statut: 'brouillon', communication_qr: communication, payment_reference: 'REM-2026-0397' });

beforeEach(() => {
  mockFlags = { 'sync.enabled': true, 'sync.legacyToCanonical': true };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('a delayed legacy event projects the current OGM and name instead of its old snapshot', async () => {
  const old = legacy('+++REM-2026-0397+++ Isabel');
  const current = legacy(ogm);
  const docs = { [legacyPath]: current, [canonicalPath]: buildCanonicalFromLegacy(old, 'expense-1') };
  mockDb = fakeDb(docs);
  await mirrorLegacyExpenseClaim(event(old));
  expect(docs[canonicalPath].payment_qr_message).toBe(ogm);
  expect(docs[canonicalPath].description).toBe('Isabel Ponto');
  expect(docs[canonicalPath].amount).toBe(4.84);
  expect(docs[canonicalPath].payment_reference).toBe('REM-2026-0397');
});

test('a concurrent update on transaction retry uses the newest documents', async () => {
  const old = legacy('+++REM-2026-0397+++ Isabel');
  const docs = { [legacyPath]: old, [canonicalPath]: buildCanonicalFromLegacy(old, 'expense-1') };
  mockDb = fakeDb(docs, (current) => {
    current[legacyPath] = legacy(ogm);
    current[canonicalPath] = buildCanonicalFromLegacy(current[legacyPath], 'expense-1');
  });
  await mirrorLegacyExpenseClaim(event(old));
  expect(docs[canonicalPath].payment_qr_message).toBe(ogm);
  expect(mockDb.writes).toBe(0);
});

test('a delayed deletion event does not delete a recreated current record', async () => {
  const current = legacy(ogm);
  const docs = { [legacyPath]: current, [canonicalPath]: buildCanonicalFromLegacy(legacy('old'), 'expense-1') };
  mockDb = fakeDb(docs);
  await mirrorLegacyExpenseClaim(event(null));
  expect(docs[canonicalPath].payment_qr_message).toBe(ogm);
});

test('a current deletion still removes the canonical mirror', async () => {
  const docs = { [canonicalPath]: buildCanonicalFromLegacy(legacy(ogm), 'expense-1') };
  mockDb = fakeDb(docs);
  await mirrorLegacyExpenseClaim(event(null));
  expect(docs[canonicalPath]).toBeUndefined();
});

test('reverse-mirror changes and disabled syncing still cause no writes', async () => {
  const current = { ...legacy(ogm), _sync: { origin: 'canonical-mirror' } };
  const docs = { [legacyPath]: current, [canonicalPath]: buildCanonicalFromLegacy(current, 'expense-1') };
  mockDb = fakeDb(docs);
  await mirrorLegacyExpenseClaim(event(legacy('old')));
  expect(mockDb.writes).toBe(0);
  mockFlags['sync.enabled'] = false;
  await mirrorLegacyExpenseClaim(event(null));
  expect(mockDb.writes).toBe(0);
});
