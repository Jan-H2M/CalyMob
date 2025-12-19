const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function checkMembers() {
  const snapshot = await db.collection('clubs').doc('calypso').collection('members').get();

  console.log('=== Huidige members ===');
  console.log('Totaal:', snapshot.size);

  let withLifras = 0;
  let withoutLifras = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.lifras_id) {
      withLifras++;
    } else {
      withoutLifras++;
    }
  });

  console.log('Met LifrasID:', withLifras);
  console.log('Zonder LifrasID:', withoutLifras);

  console.log('\n=== Eerste 5 zonder LifrasID ===');
  let count = 0;
  snapshot.forEach(doc => {
    if (count < 5) {
      const data = doc.data();
      if (!data.lifras_id) {
        console.log(`  ${data.prenom} ${data.nom} - ${data.email}`);
        count++;
      }
    }
  });
}

checkMembers().then(() => process.exit(0));
