const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

exports.expirePendingRegistrations = onSchedule(
  { schedule: 'every 60 minutes', region: 'europe-west1', timeZone: 'Europe/Brussels' },
  async () => {
    const db = admin.firestore();
    const snapshot = await db.collectionGroup('inscriptions')
      .where('registration_status', '==', 'pending_payment')
      .where('payment_expires_at', '<=', admin.firestore.Timestamp.now())
      .get();

    let batch = db.batch();
    let writes = 0;
    for (const doc of snapshot.docs) {
      if (doc.data().paye === true) continue;
      batch.update(doc.ref, {
        registration_status: 'canceled',
        payment_status: 'expired',
        canceled_reason: 'payment_deadline_expired',
        canceled_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      writes += 1;
      if (writes % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (writes % 400 !== 0) await batch.commit();
    console.log(`[expirePendingRegistrations] canceled ${writes} inscription(s)`);
  },
);
