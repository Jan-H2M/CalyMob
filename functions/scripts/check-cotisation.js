/**
 * Script om cotisation_validite te controleren voor enkele leden
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'calycompta'
  });
}

const db = admin.firestore();
const CLUB_ID = 'calypso';

async function checkCotisation() {
  const membersRef = db.collection('clubs').doc(CLUB_ID).collection('members');
  const snapshot = await membersRef.limit(5).get();

  console.log('Checking first 5 members:\n');

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const name = `${data.prenom || data.firstName || ''} ${data.nom || data.lastName || ''}`.trim();
    console.log(`👤 ${name}`);
    console.log(`   ID: ${doc.id}`);
    console.log(`   cotisation_validite: ${data.cotisation_validite}`);
    if (data.cotisation_validite) {
      console.log(`   Type: ${data.cotisation_validite.constructor.name}`);
      if (data.cotisation_validite.toDate) {
        console.log(`   As Date: ${data.cotisation_validite.toDate()}`);
      }
    }
    console.log('');
  }
}

checkCotisation().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
