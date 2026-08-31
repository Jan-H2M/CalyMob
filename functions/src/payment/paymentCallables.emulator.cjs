// Explicit opt-in; localhost emulator only, synthetic data, no production fallback.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const { recordOnSitePayment } = require('./recordOnSitePayment');
const { recordInstallmentPayment } = require('./recordInstallmentPayment');
const { recordPaymentCommunication } = require('./recordPaymentCommunication');

test('real Firestore callable contention preserves bank receipt and tranche provenance', async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/,
    'This test requires an explicitly selected local emulator');
  const app = admin.initializeApp({ projectId: 'demo-payment-repair' });
  const db = admin.firestore();
  const clubId = `callables-${randomUUID()}`;
  const club = db.collection('clubs').doc(clubId);
  const operation = club.collection('operations').doc('event');
  const ref = operation.collection('inscriptions').doc('member');
  const request = (extra = {}) => ({ auth: { uid: 'organizer' }, data: {
    clubId, operationId: 'event', participantId: 'member', ...extra,
  } });
  try {
    await club.collection('members').doc('organizer').set({ clubStatuten: ['O'] });
    await operation.set({ payment_required: true, allowed_payment_methods: ['on_site', 'qr_email'] });
    await ref.set({ prix: 30, paye: false, membre_id: 'member' });
    await Promise.all([recordOnSitePayment.run(request()), recordOnSitePayment.run(request())]);
    assert.equal((await ref.get()).data().payment_source, 'on_site_qr');
    // Model the separate bank transaction committing during another confirmation.
    await Promise.all([
      recordOnSitePayment.run(request()),
      db.runTransaction(async (tx) => {
        await tx.get(ref);
        tx.update(ref, { paye: true, payment_status: 'paid', transaction_matched: true,
          transaction_id: 'bank', payment_source: 'bank_transfer' });
      }),
      recordPaymentCommunication.run(request({ status: 'qr_email_sent' })),
    ]);
    assert.equal((await ref.get()).data().payment_source, 'bank_transfer');
    assert.equal((await ref.get()).data().payment_status, 'paid');
    assert.equal((await ref.get()).data().transaction_id, 'bank');

    const trancheRef = operation.collection('inscriptions').doc('tranches');
    await trancheRef.set({ paye: false, installment_payments: {
      first: { status: 'pending', amount_due: 10 }, second: { status: 'pending', amount_due: 20 },
    } });
    await Promise.all(['first', 'second', 'first'].map((installmentId) =>
      recordInstallmentPayment.run(request({ participantId: 'tranches', installmentId }))));
    const final = (await trancheRef.get()).data();
    assert.equal(final.paye, true);
    assert.equal(final.transaction_matched, false);
    for (const payment of Object.values(final.installment_payments)) {
      assert.equal(payment.status, 'paid');
      assert.equal(payment.payment_confirmed_by, 'organizer');
      assert.equal(payment.payment_source, 'on_site_qr');
      assert.ok(payment.payment_confirmed_at.toMillis() > 0);
    }
  } finally {
    await db.terminate();
    await app.delete();
  }
});
