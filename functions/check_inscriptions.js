const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'calycompta'
  });
}

const db = admin.firestore();

async function checkAllInscriptions() {
  // Check if there's an inscriptions collection at root level
  const rootInscriptions = await db.collection('inscriptions').limit(10).get();
  console.log('Root inscriptions collection:', rootInscriptions.size);
  
  // Check club level inscriptions
  const clubInscriptions = await db.collection('clubs').doc('calypso').collection('inscriptions').limit(10).get();
  console.log('Club inscriptions collection:', clubInscriptions.size);
  if (clubInscriptions.size > 0) {
    clubInscriptions.docs.forEach(d => {
      console.log('  -', d.id, d.data());
    });
  }
  
  // Check all operations for participants
  const allOps = await db.collection('clubs').doc('calypso').collection('operations').get();
  console.log('\nAll operations with participant counts:');
  
  for (const op of allOps.docs) {
    const participants = await db.collection('clubs').doc('calypso')
      .collection('operations').doc(op.id)
      .collection('participants').get();
    
    if (participants.size > 0 || op.data().titre.toLowerCase().includes('todi')) {
      console.log('  -', op.data().titre, '| participants:', participants.size);
    }
  }
  
  // Check if there's evenement_inscriptions
  const evtInscriptions = await db.collection('clubs').doc('calypso').collection('evenement_inscriptions').limit(10).get();
  console.log('\nevenement_inscriptions collection:', evtInscriptions.size);
  if (evtInscriptions.size > 0) {
    evtInscriptions.docs.forEach(d => {
      const data = d.data();
      console.log('  -', d.id, '| op:', data.operation_id || data.evenement_id, '| membre:', data.membre_nom);
    });
  }
}

checkAllInscriptions().then(() => process.exit(0));
