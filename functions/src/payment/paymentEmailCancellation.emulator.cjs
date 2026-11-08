// Synthetic records only; never connect this test to a real project.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const { beginPaymentEmailDispatch, endPaymentEmailDispatch } = require('./paymentEmailDispatch');
const { unregisterFromEvent } = require('../inscription/eventWaitlist');

test('cancellation stays immediate and warns while an email dispatch is active', async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const app = admin.initializeApp({ projectId: 'demo-email-cancellation' });
  const db = admin.firestore();
  const clubId = `qa-${randomUUID()}`;
  const club = db.collection('clubs').doc(clubId);
  const operation = club.collection('operations').doc('event');
  const registration = operation.collection('inscriptions').doc('member');
  try {
    await club.collection('members').doc('member').set({ app_role: 'membre', notifications_enabled: false });
    await operation.set({ type: 'evenement', statut: 'ouvert', allow_waitlist: false,
      date_debut: admin.firestore.Timestamp.fromMillis(Date.now() + 864000000), titre: 'Test' });
    await registration.set({ membre_id: 'member', registration_status: 'confirmed', prix: 15, paye: false });
    const intent = { allocations: [{ inscription_id: 'member', amount_cents: 1500 }] };
    // Hold the marker open to model a provider that has not returned yet.
    const dispatch = await beginPaymentEmailDispatch(db, clubId, 'event', 'member', intent, null);
    const result = await unregisterFromEvent.run({ auth: { uid: 'member' }, data: {
      clubId, operationId: 'event', inscriptionId: 'member',
    } });
    assert.equal(result.status, 'canceled');
    assert.equal(result.paymentEmailMayHaveBeenSent, true);
    assert.equal((await registration.get()).get('registration_status'), 'canceled');
    await endPaymentEmailDispatch(db, dispatch);
    // In the inverse ordering, cancellation already won: no dispatch starts.
    await assert.rejects(beginPaymentEmailDispatch(db, clubId, 'event', 'member', intent, null),
      /annulée ou modifiée/);
  } finally {
    await db.recursiveDelete(club);
    await db.terminate();
    await app.delete();
  }
});
