const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
const XLSX = require('xlsx');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function simulateMerge() {
  console.log('🔍 Simulatie van merge logica...\n');

  // Load existing members from Firestore
  const snapshot = await db.collection('clubs').doc('calypso').collection('members').get();
  const existingByEmail = new Map();
  const existingByNameKey = new Map();

  snapshot.forEach(doc => {
    const data = doc.data();

    // Index by email
    if (data.email && !data.email.includes('@no-email.local')) {
      const emailKey = data.email.toLowerCase().trim();
      existingByEmail.set(emailKey, { id: doc.id, ...data });
    }

    // Index by name
    if (data.nom && data.prenom) {
      const nameKey = `${data.nom.toLowerCase().trim()}_${data.prenom.toLowerCase().trim()}`;
      existingByNameKey.set(nameKey, { id: doc.id, ...data });
    }
  });

  // Load Excel data
  const workbook = XLSX.readFile('/Users/jan/Documents/CALYPSO/export.xls');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const headers = data[0];
  const email2Index = headers.indexOf('Email 2');
  const lifrasIndex = headers.indexOf('LifrasID');
  const nomIndex = headers.indexOf('Nom');
  const prenomIndex = headers.indexOf('Prenom');

  console.log('=== Potentiële MERGES (email/naam match + LifrasID verschil) ===\n');

  let mergeCount = 0;

  for (let i = 1; i < Math.min(data.length, 20); i++) {
    const row = data[i];
    const email = row[email2Index];
    const lifrasId = row[lifrasIndex]?.toString();
    const nom = row[nomIndex];
    const prenom = row[prenomIndex];

    if (!email || !lifrasId || !nom || !prenom) continue;

    const emailKey = email.toLowerCase().trim();
    const nameKey = `${nom.toLowerCase().trim()}_${prenom.toLowerCase().trim()}`;

    // Check email match
    let existing = existingByEmail.get(emailKey);
    let matchReason = existing ? 'email' : null;

    // Check name match if no email match
    if (!existing) {
      existing = existingByNameKey.get(nameKey);
      matchReason = existing ? 'nom+prenom' : null;
    }

    if (existing && existing.lifras_id !== lifrasId) {
      console.log(`🔀 MERGE via ${matchReason}:`);
      console.log(`   Bestaand: ${existing.prenom} ${existing.nom} - LifrasID: ${existing.lifras_id || 'geen'} - Email: ${existing.email}`);
      console.log(`   Excel:    ${prenom} ${nom} - LifrasID: ${lifrasId} - Email: ${email}`);
      console.log(`   → LifrasID ${existing.lifras_id || 'geen'} → ${lifrasId}\n`);
      mergeCount++;
    }
  }

  console.log(`\n📊 Totaal potentiële merges (eerste 20 rows): ${mergeCount}`);
}

simulateMerge().then(() => process.exit(0)).catch(err => {
  console.error('❌ Fout:', err);
  process.exit(1);
});
