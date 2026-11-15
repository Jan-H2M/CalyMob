/**
 * Safety tests for sendPaymentEmailForMember.
 *
 * These tests use a lightweight fake db that never touches Firebase and are
 * deliberately shallow: they verify that the guard rails (amount validation,
 * installment fallback, guest aggregation) work before the email/bank
 * configuration is reached.
 */

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
}));
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: () => 'now' },
  }),
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));

const { sendPaymentEmailForMember } = require('./sendPaymentQrEmail');

const input = {
  clubId: 'club1',
  operationId: 'op1',
  participantId: 'p1',
  memberEmail: 'jan@example.test',
  memberFirstName: 'Jan',
  memberLastName: 'Dupont',
  amount: 50,
  operationTitle: 'Gozo Trip',
  operationNumber: 'PAAAB',
};

function snap(value) {
  return { exists: value != null, data: () => value };
}

/**
 * Build a minimal Firestore-shaped fake.
 *
 * @param {object} parent      - inscription doc data
 * @param {object[]} guests    - guest inscription docs
 * @param {object} eventData   - operation doc data (for tariff fallback)
 */
function fakeDb(parent, guests = [], eventData = {}) {
  const guestResults = {
    get: async () => ({
      forEach: fn => guests.forEach((value, i) => fn({ id: `guest-${i}`, data: () => value })),
    }),
  };
  guestResults.where = jest.fn(() => guestResults);
  const inscriptions = {
    doc: () => ({ get: async () => snap(parent) }),
    where: jest.fn(() => guestResults),
  };
  const operationDoc = {
    get: async () => snap(eventData),
    collection: name => name === 'inscriptions' ? inscriptions : undefined,
  };
  const club = {
    collection: name => name === 'operations'
      ? { doc: () => operationDoc }
      : { doc: () => ({ get: async () => snap(null) }) },
  };
  return { collection: () => ({ doc: () => club }) };
}

test('legacy active parent with no installment reaches bank settings check', async () => {
  await expect(sendPaymentEmailForMember(fakeDb({ prix: 15 }), input))
    .rejects.toThrow('Bank settings not configured');
});

test('refuses when the total amount is zero (already paid)', async () => {
  const db = fakeDb({ prix: 0, paye: true });
  await expect(sendPaymentEmailForMember(db, { ...input, amount: 0 }))
    .rejects.toThrow(/Aucun montant/);
});

test('falls back to tariff amount when installment_payments line is not yet initialised', async () => {
  // Scenario: member registered before the payment plan was added, so their
  // inscription has no installment_payments[installmentId] entry.
  // The server should derive the amount from the event tariff so the admin
  // can still issue a QR without manually initialising the payment plan lines.
  const db = fakeDb(
    { prix: 100, tariff_id: 'tariff1', installment_payments: {} },
    [],
    {
      event_tariffs: [{ id: 'tariff1', price: 100, installment_amounts: { first: 50 } }],
      payment_installments: [{ id: 'first', label: 'Acompte 1' }],
    },
  );
  // With the tariff fallback the function proceeds past the installment check
  // and reaches the bank settings validation (not configured in fakeDb).
  await expect(sendPaymentEmailForMember(db, { ...input, installmentId: 'first', amount: 0 }))
    .rejects.toThrow('Bank settings not configured');
});

test('refuses when installment not found and no tariff fallback is available', async () => {
  const db = fakeDb(
    { prix: 100, tariff_id: 'tariff1', installment_payments: {} },
    [],
    { event_tariffs: [] },
  );
  await expect(sendPaymentEmailForMember(db, { ...input, installmentId: 'missing', amount: 0 }))
    .rejects.toThrow(/Aucun montant/);
});
