const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
const XLSX = require('xlsx');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function findMergeable() {
  console.log('🔍 Zoeken naar mergeable members...\n');

  // Load existing members WITHOUT LifrasID
  const snapshot = await db.collection('clubs').doc('calypso').collection('members').get();
  const withoutLifras = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data.lifras_id && data.email && !data.email.includes('@no-email.local')) {
      withoutLifras.push({
        id: doc.id,
        nom: data.nom,
        prenom: data.prenom,
        email: data.email
      });
    }
  });

  console.log(`📊 Members zonder LifrasID: ${withoutLifras.length}\n`);

  // Load Excel data
  const workbook = XLSX.readFile('/Users/jan/Documents/CALYPSO/export.xls');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const headers = data[0];
  const email2Index = headers.indexOf('Email 2');
  const lifrasIndex = headers.indexOf('LifrasID');
  const nomIndex = headers.indexOf('Nom');
  const prenomIndex = headers.indexOf('Prenom');

  console.log('=== Mergeable members (in beide systemen) ===\n');

  let mergeCount = 0;

  for (const member of withoutLifras) {
    // Search in Excel by email
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const excelEmail = row[email2Index];

      if (excelEmail && excelEmail.toLowerCase().trim() === member.email.toLowerCase().trim()) {
        const lifrasId = row[lifrasIndex];
        const nom = row[nomIndex];
        const prenom = row[prenomIndex];

        console.log(`🔀 MERGE kandidaat:`);
        console.log(`   Firestore: ${member.prenom} ${member.nom} - ${member.email}`);
        console.log(`   Excel:     ${prenom} ${nom} - LifrasID: ${lifrasId}`);
        console.log(`   → Zou LifrasID krijgen: ${lifrasId}\n`);
        mergeCount++;
        break;
      }
    }
  }

  console.log(`\n📊 Totaal mergeable: ${mergeCount}/${withoutLifras.length}`);
}

findMergeable().then(() => process.exit(0)).catch(err => {
  console.error('❌ Fout:', err);
  process.exit(1);
});
