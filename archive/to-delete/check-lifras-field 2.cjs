const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function checkLifrasField() {
  const snapshot = await db.collection('clubs').doc('calypso').collection('members').limit(10).get();

  console.log('=== Checking members in Firestore ===\n');

  snapshot.forEach(doc => {
    const data = doc.data();
    console.log('Member:', data.prenom, data.nom);
    console.log('  Email:', data.email);
    console.log('  lifras_id:', data.lifras_id);
    console.log('  Fields with "lifras":', Object.keys(data).filter(k => k.toLowerCase().includes('lifras')));
    console.log();
  });

  console.log('\n=== Summary ===');
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

  console.log('Met lifras_id:', withLifras);
  console.log('Zonder lifras_id:', withoutLifras);
}

checkLifrasField().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
