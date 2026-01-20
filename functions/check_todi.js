const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'calycompta'
});

const db = admin.firestore();

async function checkTodi() {
  const todiIds = ['3myTg7wd0fOp5UTH2GoZ', '5xrOEICVHdQDvz0FmJ67'];

  for (const opId of todiIds) {
    const opDoc = await db.collection('clubs').doc('calypso').collection('operations').doc(opId).get();
    if (!opDoc.exists) {
      console.log('Operation', opId, 'not found');
      continue;
    }

    const opData = opDoc.data();
    console.log('=== Operation:', opId, '-', opData.titre, '===');

    const participants = await db.collection('clubs').doc('calypso')
      .collection('operations').doc(opId)
      .collection('participants').get();

    console.log('Participants count:', participants.size);
    participants.docs.forEach(p => {
      const data = p.data();
      console.log('  -', p.id.substring(0,8), '|', data.membre_nom, data.membre_prenom, '| paye:', data.paye, '| status:', data.payment_status);
    });
    console.log('');
  }
}

checkTodi().then(() => process.exit(0));
