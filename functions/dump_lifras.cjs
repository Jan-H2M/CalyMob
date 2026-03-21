/**
 * Dump all boutique_lifras items from Firestore
 * Run from CalyMob/functions/: node dump_lifras.cjs
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const CLUB_ID = 'calypso-plongee';

async function dumpLifras() {
  const snapshot = await db.collection(`clubs/${CLUB_ID}/boutique_stock`)
    .where('type', '==', 'boutique_lifras')
    .orderBy('nom', 'asc')
    .get();

  console.log(`\n=== FIRESTORE LIFRAS ITEMS (${snapshot.size} total) ===\n`);

  const items = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    items.push({
      id: doc.id,
      reference: data.reference || null,
      nom: data.nom,
      quantite: data.quantite || 0,
      prix_achat: data.prix_achat || 0,
      prix_vente: data.prix_vente || 0,
      actif: data.actif !== false,
      description: data.description || '',
    });
  });

  // Sort by reference for comparison
  items.sort((a, b) => {
    const refA = a.reference || 'ZZZZ';
    const refB = b.reference || 'ZZZZ';
    return refA.localeCompare(refB);
  });

  items.forEach((item, i) => {
    console.log(`${i+1}. [${item.reference || 'NO-REF'}] ${item.nom}`);
    console.log(`   qty=${item.quantite} | achat=${item.prix_achat}€ | vente=${item.prix_vente}€ | actif=${item.actif}`);
    console.log(`   id=${item.id}`);
  });

  // Output as JSON for comparison
  console.log('\n=== JSON ===');
  console.log(JSON.stringify(items, null, 2));

  process.exit(0);
}

dumpLifras().catch(err => { console.error(err); process.exit(1); });
