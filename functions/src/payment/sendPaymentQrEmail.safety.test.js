const { sendPaymentEmailForMember } = require('./sendPaymentQrEmail');

function fakeDb(parent, guests = []) {
  const snap = value => ({ exists: value != null, data: () => value });
  const inscriptions = {
    doc: () => ({ get: async () => snap(parent) }),
    where: () => ({ where: () => ({ get: async () => ({
      forEach: fn => guests.forEach((value, i) => fn({ id: `guest-${i}`, data: () => value })),
    }) }) }),
  };
  const operation = { collection: name => name === 'inscriptions' ? inscriptions : undefined };
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

test('does not fall back to a client amount for a missing installment', async () => {
  const db = fakeDb({ registration_status: 'confirmed', prix: 15, installment_payments: {} });
  await expect(sendPaymentEmailForMember(db, { ...input, installmentId: 'missing' })).rejects.toThrow('tranche introuvable');
});

test('legacy active parent with no cancellation reaches ordinary payment configuration checks', async () => {
  await expect(sendPaymentEmailForMember(fakeDb({ prix: 15 }), input)).rejects.toThrow('Bank settings not configured');
});
