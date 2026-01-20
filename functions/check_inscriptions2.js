const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'calycompta'
  });
}

const db = admin.firestore();

async function checkInscriptions() {
  const todiIds = ['3myTg7wd0fOp5UTH2GoZ', '5xrOEICVHdQDvz0FmJ67'];

  for (const opId of todiIds) {
    const opDoc = await db.collection('clubs').doc('calypso').collection('operations').doc(opId).get();
    if (!opDoc.exists) {
      console.log('Operation', opId, 'not found');
      continue;
    }

    const opData = opDoc.data();
    console.log('=== Operation:', opId, '-', opData.titre, '===');

    // Check inscriptions subcollection (what CalyMob uses)
    const inscriptions = await db.collection('clubs').doc('calypso')
      .collection('operations').doc(opId)
      .collection('inscriptions').get();

    console.log('Inscriptions count:', inscriptions.size);
    inscriptions.docs.forEach(p => {
      const data = p.data();
      console.log('  -', p.id.substring(0,8), '|', data.membre_nom, data.membre_prenom, '| paye:', data.paye, '| status:', data.payment_status);
    });

    // Also check participants subcollection (what CalyCompta might use)
    const participants = await db.collection('clubs').doc('calypso')
      .collection('operations').doc(opId)
      .collection('participants').get();

    console.log('Participants count:', participants.size);
    console.log('');
  }
}

checkInscriptions().then(() => process.exit(0));
