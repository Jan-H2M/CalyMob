/**
 * Check welke clubs er zijn en hoeveel members
 */

const admin = require('firebase-admin');
const serviceAccount = require('/Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-fbsvc-7981ec9e47.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkClubs() {
  console.log('🔍 Zoeken naar clubs...\n');

  const clubsSnapshot = await db.collection('clubs').get();

  console.log(`📋 Gevonden ${clubsSnapshot.size} clubs:\n`);

  for (const clubDoc of clubsSnapshot.docs) {
    console.log(`Club: ${clubDoc.id}`);

    const membersSnapshot = await db.collection('clubs').doc(clubDoc.id).collection('members').get();
    console.log(`  Members: ${membersSnapshot.size}`);

    // Toon eerste 3 members
    let count = 0;
    membersSnapshot.forEach(doc => {
      if (count < 3) {
        const d = doc.data();
        console.log(`    - ${d.prenom} ${d.nom} (${d.email})`);
        count++;
      }
    });
    console.log('');
  }

  process.exit(0);
}

checkClubs().catch(console.error);
