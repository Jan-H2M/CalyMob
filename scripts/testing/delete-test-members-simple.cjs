const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function deleteTestMembers() {
  console.log('🗑️  Suppression des 5 utilisateurs test de Firestore...\n');

  const testIds = ['TEST-member-1', 'TEST-member-2', 'TEST-member-3', 'TEST-member-4', 'TEST-member-5'];

  for (const id of testIds) {
    try {
      await db.collection('clubs').doc('calypso').collection('members').doc(id).delete();
      console.log(`✅ Supprimé: ${id}`);
    } catch (error) {
      console.error(`❌ Erreur pour ${id}:`, error.message);
    }
  }

  console.log('\n✅ Terminé! Rechargez la page Utilisateurs & Sécurité pour voir les changements.');
}

deleteTestMembers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Erreur:', err);
    process.exit(1);
  });
