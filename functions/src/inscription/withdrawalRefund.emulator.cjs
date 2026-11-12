// Only synthetic data in an explicitly local, disposable demo project.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const { unregisterFromEvent } = require('./eventWaitlist');

test('COM-166 withdrawal and expense drafts are atomic and retry-safe in Firestore', async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-com166');
  const app = admin.initializeApp({ projectId: 'demo-com166' });
  const db = admin.firestore();
  const club = db.collection('clubs').doc(`qa-${randomUUID()}`);
  const event = club.collection('operations').doc('event');
  const registration = event.collection('inscriptions').doc('member');
  const iban = 'BE68539007547034';
  const cancel = data => unregisterFromEvent.run({ auth: { uid: 'member' }, data: {
    clubId: club.id, operationId: 'event', inscriptionId: 'member', ...data,
  } });
  try {
    await club.collection('members').doc('member').set({ app_role: 'membre', prenom: 'Alice',
      nom: 'Synthetic', iban, email: 'alice@example.invalid', notifications_enabled: false });
    await event.set({ titre: 'Synthetic event', event_number: 'S-TEST', event_category: 'sortie',
      date_debut: admin.firestore.Timestamp.fromMillis(Date.now() + 864000000), allow_waitlist: false });
    await registration.set({ membre_id: 'member', registration_status: 'confirmed', prix: 20,
      paye: true, transaction_id: 'bank' });
    await club.collection('transactions_bancaires').doc('bank').set({ montant: 20,
      contrepartie_iban: iban, contrepartie_nom: 'Alice Synthetic', numero_sequence: 'TEST-1',
      matched_entities: [{ entity_type: 'event', entity_id: 'event' },
        { entity_type: 'inscription', entity_id: 'member' }] });
    await club.collection('demandes_remboursement').doc('prior').set({ montant: 5,
      statut: 'rembourse', source_transaction_id: 'bank' });
    await club.collection('expense_claims').doc('prior').set({ amount: 5,
      status: 'reimbursed', source_transaction_id: 'bank' });
    let ids;
    await t.test('two simultaneous withdrawals reserve one remaining15EUR draft and one REM', async () => {
      const results = await Promise.all([cancel(), cancel()]);
      assert.deepEqual(results[0].refundClaimIds, results[1].refundClaimIds);
      ids = results[0].refundClaimIds;
      assert.equal(ids.length, 1);
      const [reg, legacy, canonical, counter] = await Promise.all([
        registration.get(), club.collection('demandes_remboursement').doc(ids[0]).get(),
        club.collection('expense_claims').doc(ids[0]).get(),
        club.collection('settings').doc(`rem_reference_counter_${new Date().getFullYear()}`).get(),
      ]);
      assert.equal(reg.get('registration_status'), 'canceled');
      assert.equal(reg.get('transaction_id'), 'bank');
      assert.equal(reg.get('paye'), true);
      assert.equal(legacy.get('montant'), 15);
      assert.equal(legacy.get('statut'), 'brouillon');
      assert.equal(canonical.get('amount'), 15);
      assert.equal(canonical.get('status'), 'draft');
      assert.equal(counter.get('counter'), 1);
      assert.equal(legacy.get('source'), 'event_withdrawal');
      assert.equal(legacy.get('send_confirmation_email'), false);
      assert.equal(legacy.get('demandeur_id'), 'member');
      assert.equal((await club.collection('transactions_bancaires').doc('bank').get()).get('montant'), 20);
    });
    await t.test('subsequent transport retry returns the stored claim, not a second refund', async () => {
      assert.deepEqual((await cancel()).refundClaimIds, ids);
      assert.equal((await club.collection('demandes_remboursement').get()).size, 2);
      assert.equal((await club.collection('expense_claims').get()).size, 2);
    });
    await t.test('unreceived payment declaration produces no draft', async () => {
      await event.collection('inscriptions').doc('unverified').set({ membre_id: 'member',
        registration_status: 'confirmed', prix: 20, paye: true, transaction_id: 'missing-bank' });
      const result = await cancel({ inscriptionId: 'unverified' });
      assert.deepEqual(result.refundClaimIds, []);
      assert.equal(result.refundReviewRequired, true);
      assert.equal((await club.collection('demandes_remboursement').get()).size, 2);
    });
  } finally {
    await db.recursiveDelete(club);
    await db.terminate();
    await app.delete();
  }
});
