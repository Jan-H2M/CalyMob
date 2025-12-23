/**
 * Script om alle clubStatuten waarden te bekijken
 */

const admin = require('firebase-admin');
const serviceAccount = require('/Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-fbsvc-7981ec9e47.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkAllStatuten() {
  const clubId = 'calypso';

  const membersSnapshot = await db.collection('clubs').doc(clubId).collection('members').get();

  console.log(`📋 Totaal ${membersSnapshot.size} members in database\n`);

  const allStatuten = new Set();
  const membersWithStatuten = [];

  membersSnapshot.forEach(doc => {
    const data = doc.data();
    const clubStatuten = data.clubStatuten || [];
    const isCA = data.isCA;
    const fonction_defaut = data.fonction_defaut;

    if (clubStatuten.length > 0 || isCA || fonction_defaut) {
      membersWithStatuten.push({
        nom: data.nom,
        prenom: data.prenom,
        email: data.email,
        clubStatuten,
        isCA,
        fonction_defaut
      });

      clubStatuten.forEach(s => allStatuten.add(s));
    }
  });

  console.log('🏷️  Alle unieke clubStatuten waarden:');
  console.log([...allStatuten]);

  console.log(`\n📋 Members met clubStatuten, isCA, of fonction_defaut (${membersWithStatuten.length}):\n`);

  for (const m of membersWithStatuten) {
    console.log(`  ${m.prenom} ${m.nom}`);
    console.log(`    clubStatuten: ${JSON.stringify(m.clubStatuten)}`);
    console.log(`    isCA: ${m.isCA}`);
    console.log(`    fonction_defaut: ${m.fonction_defaut}`);
    console.log('');
  }

  process.exit(0);
}

checkAllStatuten().catch(console.error);
