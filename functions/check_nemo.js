const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'calycompta'
  });
}

const db = admin.firestore();

async function checkNemo() {
  // Find NEMO operations
  const allOps = await db.collection('clubs').doc('calypso').collection('operations').get();
  
  const nemoOps = allOps.docs.filter(d => {
    const titre = d.data().titre || '';
    return titre.toLowerCase().includes('nemo');
  });
  
  console.log('Found', nemoOps.length, 'NEMO operations:\n');
  
  for (const op of nemoOps) {
    const opData = op.data();
    console.log('=== Operation:', op.id, '-', opData.titre, '===');
    console.log('Date:', opData.date_debut?.toDate?.() || opData.date_debut);

    const inscriptions = await db.collection('clubs').doc('calypso')
      .collection('operations').doc(op.id)
      .collection('inscriptions').get();

    console.log('Inscriptions count:', inscriptions.size);
    inscriptions.docs.forEach(p => {
      const data = p.data();
      console.log('  -', data.membre_nom, data.membre_prenom, '| paye:', data.paye, '| status:', data.payment_status);
    });
    console.log('');
  }
}

checkNemo().then(() => process.exit(0));
