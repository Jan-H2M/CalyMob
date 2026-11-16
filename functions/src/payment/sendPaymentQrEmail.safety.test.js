const { sendPaymentEmailForMember } = require('./sendPaymentQrEmail');

function fakeDb(parent, guests = [], eventData = {}) {
  const snap = value => ({ exists: value != null, data: () => value });
  const inscriptions = {
    doc: () => ({ get: async () => snap(parent) }),
    where: () => ({ where: () => ({ get: async () => ({
      forEach: fn => guests.forEach((value, i) => fn({ id: `guest-${i}`, data: () => value })),
    }) }) }),
  };
  const operation = {
    get: async () => snap(eventData),
    collection: name => name === 'inscriptions' ? inscriptions : undefined,
  };
  const club = { collection: name => name === 'operations'
    ? { doc: () => operation }
    : { doc: () => ({ get: async () => snap(null) }) } };
  return { collection: () => ({ doc: () => club }) };
}

const input = { clubId: 'test', operationId: 'event', participantId: 'member',
  memberEmail: 'test@example.invalid', operationTitle: 'Test', amount: 15 };

test.each(['canceled', 'waitlisted'])('does not email a QR for a %s registration', async status => {
  await expect(sendPaymentEmailForMember(fakeDb({ registration_status: status, prix: 15 }), input))
    .rejects.toThrow('annulée ou en liste');
});

test('does not include an unpaid cancelled guest without review', async () => {
  const db = fakeDb({ registration_status: 'confirmed', prix: 15 },
    [{ registration_status: 'canceled', prix: 6, paye: false }]);
  await expect(sendPaymentEmailForMember(db, input)).rejects.toThrow('invité annulé');
});

test('does not include a cancelled guest installment without review', async () => {
  const db = fakeDb({ registration_status: 'confirmed', installment_payments: { first: { amount_due: 15, status: 'unpaid' } } },
    [{ registration_status: 'canceled', installment_payments: { first: { amount_due: 6, status: 'unpaid' } } }]);
  await expect(sendPaymentEmailForMember(db, { ...input, installmentId: 'first' })).rejects.toThrow('invité annulé');
});

test('does not fall back to a client amount for a missing installment without a tariff', async () => {
  const db = fakeDb({ registration_status: 'confirmed', prix: 15, installment_payments: {} });
  await expect(sendPaymentEmailForMember(db, { ...input, installmentId: 'missing' })).rejects.toThrow('tranche introuvable');
});

test('refuses a missing installment when the tariff has no amount for that tranche', async () => {
  // COM-168: the event tariff exists but defines no amount for the requested tranche.
  const db = fakeDb(
    { registration_status: 'confirmed', prix: 100, tariff_id: 'tariff1', installment_payments: {} },
    [],
    { event_tariffs: [{ id: 'tariff1', price: 100, installment_amounts: { first: 50 } }] },
  );
  await expect(sendPaymentEmailForMember(db, { ...input, installmentId: 'second', amount: 0 }))
    .rejects.toThrow('tranche introuvable');
});

test('falls back to the tariff amount when the installment line is not yet initialised', async () => {
  // COM-168: member registered before the payment plan was added, so the
  // inscription has no installment_payments[installmentId] entry. The server
  // derives the amount from the event tariff and proceeds to the bank settings
  // check instead of refusing the QR.
  const db = fakeDb(
    { registration_status: 'confirmed', prix: 100, tariff_id: 'tariff1', installment_payments: {} },
    [],
    {
      event_tariffs: [{ id: 'tariff1', price: 100, installment_amounts: { first: 50 } }],
      payment_installments: [{ id: 'first', label: 'Acompte 1' }],
    },
  );
  await expect(sendPaymentEmailForMember(db, { ...input, installmentId: 'first', amount: 0 }))
    .rejects.toThrow('Bank settings not configured');
});

test.each([
  { paye: true },
  { transaction_matched: true },
  { payment_status: 'settled' },
])('tariff fallback never issues a QR for a registration already settled flat (%j)', async flags => {
  // COM-168 review finding: a member who paid before the payment plan existed
  // has no installment line; the tariff fallback must not invite a second payment.
  const db = fakeDb(
    { registration_status: 'confirmed', prix: 100, tariff_id: 'tariff1', installment_payments: {}, ...flags },
    [],
    { event_tariffs: [{ id: 'tariff1', price: 100, installment_amounts: { first: 50 } }] },
  );
  await expect(sendPaymentEmailForMember(db, { ...input, installmentId: 'first', amount: 0 }))
    .rejects.toThrow(/Aucun montant/);
});

test.each([
  { payment_status: 'manual_review' },
  { payment_status: 'pending_bank' },
  { transaction_id: 'tx-1' },
  { amount_paid: 20 },
])('tariff fallback refuses a registration whose payment is under verification (%j)', async flags => {
  const db = fakeDb(
    { registration_status: 'confirmed', prix: 100, tariff_id: 'tariff1', installment_payments: {}, ...flags },
    [],
    { event_tariffs: [{ id: 'tariff1', price: 100, installment_amounts: { first: 50 } }] },
  );
  await expect(sendPaymentEmailForMember(db, { ...input, installmentId: 'first', amount: 0 }))
    .rejects.toThrow('vérifié');
});

test('legacy active parent with no cancellation reaches ordinary payment configuration checks', async () => {
  await expect(sendPaymentEmailForMember(fakeDb({ prix: 15 }), input)).rejects.toThrow('Bank settings not configured');
});

test.each([
  { prix: 15, payment_status: 'settled' },
  { prix: 15, transaction_matched: true },
  { prix: 15, paye: true, installment_payments: { first: { amount_due: 15, status: 'unpaid' } } },
])('does not issue an email QR for a settled registration with stale amount fields', async registration => {
  await expect(sendPaymentEmailForMember(fakeDb(registration), input)).rejects.toThrow('Aucun montant');
});

test('does not email a QR while a bank transaction is under review', async () => {
  await expect(sendPaymentEmailForMember(fakeDb({ prix: 15, payment_status: 'manual_review' }), input)).rejects.toThrow('vérifié');
});
