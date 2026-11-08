// Isolated synthetic Firestore records only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const { issueDirectEventQr } = require('./eventDirectQr');
const { prepareEventPaymentIntent, markEventPaymentIntentIssued } = require('./eventPaymentIntent');

test('direct QR records the authoritative group and rejects canceled or ambiguous payments', async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const app = admin.initializeApp({ projectId: 'demo-event-direct-qr' });
  const db = admin.firestore();
  const clubId = `qa-${randomUUID()}`;
  const club = db.collection('clubs').doc(clubId);
  const op = club.collection('operations').doc('event');
  const member = op.collection('inscriptions').doc('member');
  const guest = op.collection('inscriptions').doc('guest');
  const input = { clubId, operationId: 'event', participantId: 'member', uid: 'member' };
  try {
    await club.collection('members').doc('member').set({ app_role: 'membre' });
    await club.collection('members').doc('stranger').set({ app_role: 'membre' });
    await club.collection('settings').doc('bank').set({ iban: 'BE68539007547034', beneficiaryName: 'Example' });
    await op.set({ type: 'evenement', statut: 'ouvert', event_number: 'SAAAB', titre: 'Test', payment_required: true, allowed_payment_methods: ['qr_immediate'] });
    await member.set({ membre_id: 'member', membre_prenom: 'Test', membre_nom: 'Member', registration_status: 'confirmed', prix: 15, paye: false });
    await guest.set({ is_guest: true, parent_inscription_id: 'member', membre_prenom: 'Test', membre_nom: 'Guest', registration_status: 'confirmed', prix: 8, paye: false });
    await assert.rejects(issueDirectEventQr(db, { ...input, uid: 'stranger' }), /autorisé/);
    const result = await issueDirectEventQr(db, input);
    assert.equal(result.amount, 23);
    assert.deepEqual(result.allocations.map(a => a.inscription_id).sort(), ['guest', 'member']);
    const ref = club.collection('event_payment_intents').doc(result.intentId);
    const intent = (await ref.get()).data();
    assert.equal(intent.status, 'issued');
    assert.equal(intent.expected_amount_cents, 2300);
    assert.deepEqual(intent.allocations.map(a => a.inscription_id).sort(), ['guest', 'member']);
    assert.equal(intent.communication, result.communication);
    await op.update({ titre: 'Titre modifié' });
    assert.equal((await issueDirectEventQr(db, input)).communication, result.communication);
    const emailIntent = await prepareEventPaymentIntent(db, {
      clubId, operationId: 'event', participantId: 'member', amount: 23,
      memberFirstName: 'Test', memberLastName: 'Member', eventNumber: 'SAAAB',
      communication: 'NOUVELLE RÉFÉRENCE',
      flatAggregation: { parentAmount: 15, guests: [{ inscriptionId: 'guest', name: 'Test Guest', prix: 8 }] },
    });
    assert.equal(emailIntent.communication, result.communication);
    await guest.update({ registration_status: 'canceled' });
    await assert.rejects(issueDirectEventQr(db, input), /invité annulé/);
    assert.equal((await ref.get()).get('status'), 'issued');
    await guest.update({ prix: 0 });
    assert.equal((await issueDirectEventQr(db, input)).amount, 15);
    await member.update({ registration_status: 'canceled' });
    await assert.rejects(issueDirectEventQr(db, input), /annulée/);

    // Race a cancellation with issuing the QR. Either issuance fails or the
    // issued intent records the complete, still-active group at commit time.
    for (let i = 0; i < 5; i++) {
      const id = `race-${i}`;
      const registration = op.collection('inscriptions').doc(id);
      await registration.set({ membre_id: 'member', registration_status: 'confirmed', prix: 15 });
      const [issued] = await Promise.allSettled([
        issueDirectEventQr(db, { ...input, participantId: id }),
        registration.update({ registration_status: 'canceled' }),
      ]);
      if (issued.status === 'fulfilled') {
        const recorded = await club.collection('event_payment_intents').doc(issued.value.intentId).get();
        assert.equal(recorded.get('expected_amount_cents'), 1500);
        assert.equal(recorded.get('allocations')[0].inscription_id, id);
      } else {
        assert.match(issued.reason.message, /annulée/);
      }
      assert.equal((await registration.get()).get('registration_status'), 'canceled');
    }
    await ref.update({ status: 'settled' });
    await markEventPaymentIntentIssued(emailIntent, 'synthetic-message');
    assert.equal((await ref.get()).get('status'), 'settled');

    await op.update({ payment_installments: [{ id: 'first', label: 'Acompte' }], allowed_payment_methods: ['qr_immediate', 'on_site'] });
    await member.update({ registration_status: 'confirmed', installment_payments: { first: { status: 'paid', amount_due: 15 } } });
    await guest.update({ registration_status: 'confirmed', installment_payments: { first: { status: 'unpaid', amount_due: 8 } } });
    const installment = await issueDirectEventQr(db, { ...input, installmentId: 'first' });
    assert.equal(installment.amount, 8);
    assert.equal((await club.collection('event_payment_intents').doc(installment.intentId).get()).get('allocations')[0].inscription_id, 'guest');
    await assert.rejects(issueDirectEventQr(db, { ...input, installmentId: 'first', asOrganizer: true }), /autorisé/);
    await club.collection('members').doc('organizer').set({ clubStatuten: ['O'] });
    assert.equal((await issueDirectEventQr(db, { ...input, uid: 'organizer', installmentId: 'first', asOrganizer: true })).amount, 8);
    await op.update({ allowed_payment_methods: ['qr_email'] });
    await assert.rejects(issueDirectEventQr(db, { ...input, installmentId: 'first' }), /pas autorisé/);
    assert.equal((await issueDirectEventQr(db, { ...input, installmentId: 'first', manualTransfer: true })).amount, 8);
  } finally {
    await db.recursiveDelete(club);
    await db.terminate();
    await app.delete();
  }
});
