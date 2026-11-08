jest.mock('firebase-admin', () => ({ firestore: { FieldValue: { serverTimestamp: () => 'now' } } }));
const { markInstallmentQrSent } = require('./markInstallmentQrSent');

function fixture(value) {
  const update = jest.fn();
  const db = { runTransaction: async fn => fn({
    get: async () => ({ exists: value != null, data: () => value }), update,
  }) };
  return { db, update };
}
const open = { registration_status: 'confirmed', paye: false,
  installment_payments: { first: { status: 'unpaid', amount_due: 15 } } };

test('records a QR only for the same open installment', async () => {
  const { db, update } = fixture(open);
  expect(await markInstallmentQrSent(db, 'ref', 'first', 15, 'message')).toBe(true);
  expect(update).toHaveBeenCalledWith('ref', expect.objectContaining({
    'installment_payments.first.status': 'qr_sent',
    'installment_payments.first.payment_email_id': 'message',
  }));
});

test.each([
  { ...open, registration_status: 'canceled' },
  { ...open, paye: true },
  { ...open, payment_status: 'settled' },
  { ...open, payment_status: 'manual_review' },
  { ...open, transaction_matched: true },
  { ...open, installment_payments: { first: { status: 'paid', amount_due: 15, transaction_id: 'bank' } } },
  { ...open, installment_payments: { first: { status: 'waived', amount_due: 15 } } },
  { ...open, installment_payments: { first: { status: 'unpaid', amount_due: 20 } } },
  { ...open, installment_payments: {} },
  null,
])('does not overwrite a canceled, paid, changed or missing registration', async value => {
  const { db, update } = fixture(value);
  expect(await markInstallmentQrSent(db, 'ref', 'first', 15, 'message')).toBe(false);
  expect(update).not.toHaveBeenCalled();
});
