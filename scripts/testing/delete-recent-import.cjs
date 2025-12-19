const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function deleteRecentImport() {
  console.log('🔍 Zoeken naar recent geïmporteerde members (05 Nov 2025 ~15:09)...\n');

  const snapshot = await db.collection('clubs').doc('calypso').collection('members').get();

  // Target: members created on 2025-11-05 between 15:00 and 15:15
  const targetDate = new Date('2025-11-05T15:00:00+01:00');
  const targetDateEnd = new Date('2025-11-05T15:15:00+01:00');

  const toDelete = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const createdAt = data.createdAt?.toDate?.() || data.createdAt;

    if (createdAt && createdAt >= targetDate && createdAt <= targetDateEnd) {
      toDelete.push({
        id: doc.id,
        lifras_id: data.lifras_id,
        nom: data.nom,
        prenom: data.prenom,
        email: data.email,
        createdAt
      });
    }
  });

  console.log(`📊 Gevonden: ${toDelete.length} recent geïmporteerde members\n`);

  if (toDelete.length === 0) {
    console.log('✅ Geen members om te verwijderen');
    return;
  }

  console.log('🗑️  Te verwijderen members:');
  toDelete.forEach(m => {
    console.log(`   ${m.lifras_id} - ${m.prenom} ${m.nom} - ${m.email}`);
  });

  console.log(`\n⏳ Verwijderen gestart...\n`);

  // Batch delete (max 500 per batch)
  const batchSize = 500;
  let deleted = 0;

  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = db.batch();
    const chunk = toDelete.slice(i, i + batchSize);

    chunk.forEach(member => {
      const ref = db.collection('clubs').doc('calypso').collection('members').doc(member.id);
      batch.delete(ref);
    });

    await batch.commit();
    deleted += chunk.length;
    console.log(`   ✓ ${deleted}/${toDelete.length} verwijderd`);
  }

  console.log(`\n✅ Klaar! ${deleted} members succesvol verwijderd`);
}

deleteRecentImport()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Fout:', err);
    process.exit(1);
  });
