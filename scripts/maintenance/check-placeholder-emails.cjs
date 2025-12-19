const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkSpecificMembers() {
  const snapshot = await db.collection('clubs').doc('calypso').collection('members').get();

  const placeholders = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.email && data.email.includes('@no-email.local')) {
      placeholders.push({
        lifras_id: data.lifras_id,
        nom: data.nom,
        prenom: data.prenom,
        email: data.email
      });
    }
  });

  console.log('=== Membres avec placeholder emails ===');
  console.log('Total:', placeholders.length);
  console.log('\nPremiers 10:');
  placeholders.slice(0, 10).forEach(m => {
    console.log(`  ${m.lifras_id} - ${m.prenom} ${m.nom} - ${m.email}`);
  });
}

checkSpecificMembers().then(() => process.exit(0)).catch(err => {
  console.error('Erreur:', err);
  process.exit(1);
});
