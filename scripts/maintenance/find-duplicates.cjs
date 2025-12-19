const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function findDuplicates() {
  console.log('🔍 Zoeken naar duplicaten in Firestore...\n');

  const snapshot = await db.collection('clubs').doc('calypso').collection('members').get();

  const membersByKey = {};
  const duplicates = [];

  snapshot.forEach(doc => {
    const data = doc.data();

    // Create keys for duplicate detection
    const nameKey = `${data.nom?.toLowerCase()}_${data.prenom?.toLowerCase()}`;
    const emailKey = data.email?.toLowerCase();

    if (!membersByKey[nameKey]) {
      membersByKey[nameKey] = [];
    }
    if (!membersByKey[emailKey]) {
      membersByKey[emailKey] = [];
    }

    membersByKey[nameKey].push({ id: doc.id, ...data });
    if (emailKey && !emailKey.includes('@no-email.local')) {
      membersByKey[emailKey].push({ id: doc.id, ...data });
    }
  });

  console.log('=== Duplicaten op Naam + Voornaam ===\n');
  let nameCount = 0;
  Object.entries(membersByKey).forEach(([key, members]) => {
    if (members.length > 1 && key.includes('_')) {
      console.log(`"${key}" - ${members.length}x:`);
      members.forEach(m => {
        const created = m.createdAt?.toDate?.() || m.createdAt;
        console.log(`  - ${m.lifras_id || 'NO_LIFRAS'} | ${m.email} | ${created}`);
      });
      console.log();
      nameCount += members.length - 1;
    }
  });

  console.log(`\n=== Duplicaten op Email ===\n`);
  let emailCount = 0;
  Object.entries(membersByKey).forEach(([key, members]) => {
    if (members.length > 1 && key.includes('@') && !key.includes('@no-email.local')) {
      console.log(`"${key}" - ${members.length}x:`);
      members.forEach(m => {
        const created = m.createdAt?.toDate?.() || m.createdAt;
        console.log(`  - ${m.prenom} ${m.nom} | ${m.lifras_id || 'NO_LIFRAS'} | ${created}`);
      });
      console.log();
      emailCount += members.length - 1;
    }
  });

  console.log(`\n📊 Totaal:`);
  console.log(`   Naam duplicaten: ${nameCount}`);
  console.log(`   Email duplicaten: ${emailCount}`);
  console.log(`   Totaal members: ${snapshot.size}`);
}

findDuplicates()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Fout:', err);
    process.exit(1);
  });
