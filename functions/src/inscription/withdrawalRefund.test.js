jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
}));
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(), {
    Timestamp: { now: () => ({ toDate: () => new Date('2026-11-12T12:00:00Z'),
      toMillis: () => Date.parse('2026-11-12T12:00:00Z') }) },
    FieldValue: { serverTimestamp: () => 'server-time' },
  }),
}));
const admin = require('firebase-admin');
const { unregisterFromEvent } = require('./eventWaitlist');
const base = 'clubs/demo-com166';
const eventPath = `${base}/operations/event`;
const insPath = `${eventPath}/inscriptions`;
const person = { membre_id: 'member', membre_prenom: 'Alice', membre_nom: 'Example',
  registration_status: 'confirmed', prix: 20, paye: true, transaction_id: 'bank' };
const account = 'BE68539007547034'; // Public synthetic IBAN, never a real member fixture.
function receipt(id = 'member', amount = 20, extra = {}) {
  return { montant: amount, contrepartie_iban: account, contrepartie_nom: 'Alice Example',
    numero_sequence: '2026-01234', fiscal_year_id: 'FY26',
    matched_entities: [{ entity_type: 'event', entity_id: 'event' },
      { entity_type: 'inscription', entity_id: id }], ...extra };
}
function fixture(extra = {}, { retry = false, failRead = null } = {}) {
  const records = new Map(Object.entries({
    [`${base}/members/member`]: { prenom: 'Alice', nom: 'Example', email: 'alice@example.invalid',
      iban: account, app_role: 'membre' },
    [eventPath]: { titre: 'Sortie exemple', event_number: 'S-2026-99', lieu: 'Lieu test',
      date_debut: new Date('2026-12-20T12:00:00Z'), allow_waitlist: false,
      event_category: 'sortie', fiscal_year_id: 'FY26' },
    [`${insPath}/member`]: person,
    [`${base}/transactions_bancaires/bank`]: receipt(),
    ...extra,
  }).filter(([, value]) => value !== null));
  const snapshot = path => ({ id: path.split('/').at(-1), ref: ref(path),
    exists: records.has(path), data: () => records.get(path), get: key => records.get(path)?.[key] });
  const ref = path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path),
    collection: name => collection(`${path}/${name}`) });
  let generated = 0;
  const collection = path => ({ path, doc: id => ref(`${path}/${id || `auto-${++generated}`}`),
    where: (key, op, value) => ({ path, filters: [[key, op, value]] }) });
  const transactions = [];
  const db = { doc: ref, collection,
    runTransaction: async callback => {
      let result;
      for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
        const writes = [];
        const transaction = {
          get: async target => {
            if (writes.length) throw new Error('Firestore: read after write');
            if (failRead && target.path.includes(failRead)) throw new Error('synthetic read failure');
            if (target.filters || !target.get) {
              const docs = [...records.keys()].filter(path => path.startsWith(`${target.path}/`)
                && !path.slice(target.path.length + 1).includes('/'))
                .filter(path => (target.filters || []).every(([key, op, value]) => {
                  const actual = records.get(path)[key];
                  if (op === 'in') return value.includes(actual);
                  if (op === 'array-contains') return Array.isArray(actual) && actual.includes(value);
                  return actual === value;
                })).map(snapshot);
              return { docs, empty: docs.length === 0 };
            }
            return snapshot(target.path);
          },
          set: (target, value, options) => writes.push({ path: target.path, value, merge: options?.merge }),
          update: (target, value) => writes.push({ path: target.path, value, merge: true }),
        };
        result = await callback(transaction);
        transactions.push(writes);
        if (retry && attempt === 0) continue;
        for (const write of writes) records.set(write.path, write.merge
          ? { ...records.get(write.path), ...write.value } : write.value);
      }
      return result;
    } };
  admin.firestore.mockReturnValue(db);
  const cancel = (data = {}, uid = 'member') => unregisterFromEvent({ auth: { uid },
    data: { clubId: 'demo-com166', operationId: 'event', inscriptionId: 'member', ...data } });
  const claims = (canonical = false) => [...records.entries()]
    .filter(([path]) => path.startsWith(`${base}/${canonical ? 'expense_claims' : 'demandes_remboursement'}/`))
    .map(([path, value]) => ({ id: path.split('/').at(-1), ...value }));
  return { records, cancel, claims, transactions };
}

test('paid full withdrawal creates the linked prefilled draft in both expense collections atomically', async () => {
  const f = fixture();
  const result = await f.cancel();
  const [claim] = f.claims();
  expect(result).toMatchObject({ status: 'canceled', refundClaimIds: [claim.id], refundReviewRequired: false });
  expect(claim).toMatchObject({ statut: 'brouillon', montant: 20, demandeur_id: 'member',
    demandeur_nom: 'Alice Example', demandeur_email: 'alice@example.invalid',
    operation_id: 'event', code_comptable: '619-00-633', fiscal_year_id: 'FY26',
    source_transaction_id: 'bank', source_transaction_ref: '2026-01234',
    payment_reference: 'REM-2026-0001', source: 'event_withdrawal', send_confirmation_email: false });
  expect(claim.communication_qr).toContain('+++REM-2026-0001+++ Remb. qui ann. la trans. 2026-01234 S-2026-99 Lieu test');
  expect(f.claims(true)).toEqual([expect.objectContaining({ id: claim.id, status: 'draft', amount: 20,
    requester_id: 'member', source_transaction_id: 'bank', operation_id: 'event' })]);
  expect(f.records.get(`${insPath}/member`)).toMatchObject({ registration_status: 'canceled',
    paye: true, transaction_id: 'bank', withdrawal_refund_claim_ids: [claim.id] });
  expect(f.records.get(`${base}/transactions_bancaires/bank`)).toEqual(receipt());
});

test.each([null, receipt('member', -20)])('a missing or outgoing bank line cannot turn a paid checkbox into a refund', async bank => {
  const f = fixture({ [`${base}/transactions_bancaires/bank`]: bank });
  const result = await f.cancel();
  expect(result.refundReviewRequired).toBe(true);
  expect(f.claims()).toHaveLength(0);
  expect(f.records.get(`${insPath}/member`).registration_status).toBe('canceled');
});

test('unpaid/cash/waitlist cancellations create no financial documents', async () => {
  for (const registration of [{ ...person, paye: false, transaction_id: null },
    { ...person, mode_paiement: 'cash', transaction_id: null },
    { ...person, registration_status: 'waitlisted' }]) {
    const f = fixture({ [`${insPath}/member`]: registration });
    await f.cancel();
    expect(f.claims()).toHaveLength(0);
  }
});

function groupedFixture() {
  return {
    [`${insPath}/member`]: { ...person, transaction_id: 'child-member' },
    [`${insPath}/guest`]: { ...person, membre_id: 'guest', is_guest: true,
      added_by: 'member', parent_inscription_id: 'member', transaction_id: 'child-guest', prix: 10 },
    [`${base}/transactions_bancaires/bank`]: receipt('unused', 30, { is_parent: true,
      matched_entities: [{ entity_type: 'event', entity_id: 'event' }] }),
    [`${base}/transactions_bancaires/child-member`]: receipt('member', 20, { parent_transaction_id: 'bank' }),
    [`${base}/transactions_bancaires/child-guest`]: receipt('guest', 10, { parent_transaction_id: 'bank' }),
  };
}
test('retained/transferred guest share is not refunded', async () => {
  const f = fixture(groupedFixture());
  await f.cancel({ guestAction: 'transfer' });
  expect(f.claims()).toEqual([expect.objectContaining({ montant: 20 })]);
  expect(f.records.get(`${insPath}/guest`).registration_status).toBe('confirmed');
});
test('canceling member and guest refunds their sum once against the real receipt', async () => {
  const f = fixture(groupedFixture());
  await f.cancel({ guestAction: 'delete' });
  expect(f.claims()).toEqual([expect.objectContaining({ montant: 30, source_transaction_id: 'bank' })]);
  expect(f.claims(true)).toHaveLength(1);
});
test('guest alone refunds only the guest and keeps the member registered', async () => {
  const f = fixture(groupedFixture());
  await f.cancel({ inscriptionId: 'guest' });
  expect(f.claims()).toEqual([expect.objectContaining({ montant: 10 })]);
  expect(f.records.get(`${insPath}/member`).registration_status).toBe('confirmed');
});

test('existing partial refund, including its canonical mirror, is deducted once', async () => {
  const f = fixture({
    [`${base}/demandes_remboursement/prior`]: { source_transaction_id: 'bank', montant: 5, statut: 'rembourse' },
    [`${base}/expense_claims/prior`]: { source_transaction_id: 'bank', amount: 5, status: 'reimbursed' },
  });
  const result = await f.cancel();
  const claim = f.claims().find(c => c.id === result.refundClaimIds[0]);
  expect(claim.montant).toBe(15);
  expect(claim.withdrawal_refund_allocations).toEqual([{ inscription_id: 'member', amount_cents: 1500 }]);
});
test('a prior draft reserves money; a rejected request does not', async () => {
  for (const [statut, expected] of [['brouillon', 0], ['refuse', 20]]) {
    const f = fixture({ [`${base}/demandes_remboursement/prior`]: { source_transaction_id: 'bank', montant: 20, statut } });
    const result = await f.cancel();
    expect(result.refundClaimIds).toHaveLength(expected ? 1 : 0);
  }
});
test('legacy edit refund without bank link is deducted too', async () => {
  const f = fixture({ [`${base}/demandes_remboursement/edit`]: {
    operation_id: 'event', inscription_id: 'member', montant: 3, statut: 'soumis',
  } });
  const result = await f.cancel();
  expect(f.claims().find(c => c.id === result.refundClaimIds[0]).montant).toBe(17);
});
test('bank-confirmed partial installments create distinct drafts and REM references', async () => {
  const f = fixture({
    [`${insPath}/member`]: { ...person, paye: false, transaction_id: 'bank2',
      installment_payments: { deposit: { transaction_id: 'bank', amount_paid: 10 },
        balance: { transaction_id: 'bank2', amount_paid: 5 } } },
    [`${base}/transactions_bancaires/bank`]: receipt('member', 10),
    [`${base}/transactions_bancaires/bank2`]: receipt('member', 5),
  });
  await f.cancel();
  expect(f.claims().map(c => c.montant).sort((a,b) => a-b)).toEqual([5, 10]);
  expect(new Set(f.claims().map(c => c.payment_reference)).size).toBe(2);
});
test('canonical-only receipt works without relying on a legacy mirror', async () => {
  const f = fixture({ [`${base}/transactions_bancaires/bank`]: null,
    [`${base}/bank_transactions/bank`]: receipt() });
  await f.cancel();expect(f.claims()).toHaveLength(1);
});
test('ambiguous old group cascade is left for review instead of refunding the whole group', async () => {
  const f = fixture({ [`${insPath}/guest`]: { ...person, membre_id: 'guest', is_guest: true,
    parent_inscription_id: 'member' }, [`${base}/transactions_bancaires/bank`]: receipt('member', 30) });
  const result = await f.cancel({ guestAction: 'transfer' });
  expect(f.claims()).toHaveLength(0);expect(result.refundReviewRequired).toBe(true);
});
test('settled allocations prove the member share of a grouped receipt', async () => {
  const f = fixture({ [`${base}/transactions_bancaires/bank`]: receipt('member', 30, { is_parent: true }),
    [`${base}/payment_allocations/one`]: { receipt_id: 'bank', operation_id: 'event', inscription_id: 'member', amount_cents: 2000, status: 'settled' },
    [`${base}/payment_allocations/two`]: { receipt_id: 'bank', operation_id: 'event', inscription_id: 'other', amount_cents: 1000, status: 'settled' },
  });
  await f.cancel();expect(f.claims()[0].montant).toBe(20);
});
test('a child without its real positive bank receipt cannot prove money received', async () => {
  const f = fixture({ [`${base}/transactions_bancaires/bank`]: receipt('member', 20, { parent_transaction_id: 'missing' }) });
  const result = await f.cancel();expect(f.claims()).toHaveLength(0);expect(result.refundReviewRequired).toBe(true);
});
test('original bank payer is prefilled as a supplier if different from a known member', async () => {
  const f = fixture({ [`${base}/members/member`]: { prenom: 'Alice', nom: 'Example', app_role: 'membre' } });
  await f.cancel();const claim = f.claims()[0];
  expect(claim.beneficiaire_type).toBe('fournisseur');
  expect(f.records.get(`${base}/fournisseurs/${claim.fournisseur_id}`)).toMatchObject({ iban: account, nom: 'Alice Example' });
});
test('admin cancellation refunds the participant, never the admin actor', async () => {
  const f = fixture({ [`${base}/members/admin`]: { app_role: 'admin', prenom: 'Admin' } });
  await f.cancel({}, 'admin');expect(f.claims()[0]).toMatchObject({ demandeur_id: 'member', created_by: 'admin' });
});
test('a repeated cancellation returns the same claim without allocating another REM', async () => {
  const f = fixture();const first = await f.cancel();const second = await f.cancel();
  expect(second.refundClaimIds).toEqual(first.refundClaimIds);
  expect(f.claims()).toHaveLength(1);
  expect(f.records.get(`${base}/settings/rem_reference_counter_2026`).counter).toBe(1);
});
test('transaction retry commits cancellation, draft and reference only once', async () => {
  const f = fixture({}, { retry: true });await f.cancel();
  expect(f.claims()).toHaveLength(1);
  expect(f.records.get(`${base}/settings/rem_reference_counter_2026`).counter).toBe(1);
});
test('financial read failure rolls back the whole withdrawal', async () => {
  const f = fixture({}, { failRead: '/payment_allocations' });
  await expect(f.cancel()).rejects.toThrow('synthetic read failure');
  expect(f.records.get(`${insPath}/member`).registration_status).toBe('confirmed');
  expect(f.claims()).toHaveLength(0);
});
test('a different member cannot trigger another person’s cancellation/refund', async () => {
  const f = fixture({ [`${base}/members/other`]: { app_role: 'membre' } });
  await expect(f.cancel({}, 'other')).rejects.toMatchObject({ code: 'permission-denied' });
  expect(f.claims()).toHaveLength(0);
});
