jest.mock('firebase-admin', () => ({ firestore: {
  Timestamp: { fromMillis: ms => ({ toMillis: () => ms }) },
  FieldValue: { delete: () => 'delete-field' },
} }));
const { beginPaymentEmailDispatch, endPaymentEmailDispatch, hasPendingDispatch } = require('./paymentEmailDispatch');

function setup(registrations) {
  const updates = [];
  const makeRef = path => ({ path, collection: name => ({ doc: id => makeRef(`${path}/${name}/${id}`) }) });
  const operation = makeRef('clubs/c/operations/o');
  const db = {
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => operation }) }) }),
    runTransaction: async fn => fn({
      get: async ref => {
        const data = registrations[ref.path];
        return { exists: data !== undefined, data: () => data };
      },
      set: (ref, value) => updates.push({ path: ref.path, value }),
    }),
    batch: () => ({ update: (...args) => updates.push(args), commit: async () => {} }),
  };
  return { db, updates };
}
const parentPath = 'clubs/c/operations/o/inscriptions/p';
const guestPath = 'clubs/c/operations/o/inscriptions/g';
const intent = { allocations: [
  { inscription_id: 'p', amount_cents: 1500 },
  { inscription_id: 'g', amount_cents: 600 },
] };

test('a valid dispatch records a short warning marker for parent and guest', async () => {
  const { db, updates } = setup({
    [parentPath]: { prix: 15, registration_status: 'confirmed' },
    [guestPath]: { prix: 6, registration_status: 'confirmed', parent_inscription_id: 'p' },
  });
  const dispatch = await beginPaymentEmailDispatch(db, 'c', 'o', 'p', intent, null);
  expect(updates).toHaveLength(2);
  expect(updates.every(x => hasPendingDispatch(x.value, Date.now()))).toBe(true);
  await endPaymentEmailDispatch(db, dispatch);
  expect(updates).toHaveLength(4);
});

test.each([
  { registration_status: 'canceled', prix: 15 },
  { registration_status: 'confirmed', prix: 20 },
  { registration_status: 'confirmed', prix: 15, paye: true },
])('no email dispatch starts after the registration changed', async parent => {
  const { db, updates } = setup({
    [parentPath]: parent,
    [guestPath]: { prix: 6, registration_status: 'confirmed', parent_inscription_id: 'p' },
  });
  await expect(beginPaymentEmailDispatch(db, 'c', 'o', 'p', intent, null)).rejects.toThrow();
  expect(updates).toHaveLength(0);
});

test('expired dispatches do not produce cancellation warnings', () => {
  expect(hasPendingDispatch({ attempts: { old: { expires_at: { toMillis: () => 100 } } } }, 200)).toBe(false);
});

test('a flat payment for a partially paid plan validates its remaining installments', async () => {
  const { db, updates } = setup({
    [parentPath]: { registration_status: 'confirmed', prix: 25, transaction_id: 'earlier-payment', installment_payments: {
      first: { status: 'paid', amount_due: 10 }, second: { status: 'unpaid', amount_due: 15 },
    } },
  });
  const onlyParent = { allocations: [{ inscription_id: 'p', amount_cents: 1500 }] };
  await beginPaymentEmailDispatch(db, 'c', 'o', 'p', onlyParent, null);
  expect(updates).toHaveLength(1);
});
