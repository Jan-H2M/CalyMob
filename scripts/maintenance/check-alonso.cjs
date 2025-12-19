const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function checkAlonsoEmail() {
  const snapshot = await db.collection('clubs').doc('calypso').collection('members')
    .where('nom', '==', 'ALONSO MACHIELS')
    .get();

  console.log('=== ALONSO MACHIELS in Firestore ===');
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(JSON.stringify({
      lifras_id: data.lifras_id,
      nom: data.nom,
      prenom: data.prenom,
      email: data.email,
      createdAt: data.createdAt?.toDate?.() || data.createdAt
    }, null, 2));
  });
}

checkAlonsoEmail().then(() => process.exit(0));
