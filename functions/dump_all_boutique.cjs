/**
 * Dump ALL boutique_stock items from Firestore (both types)
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const CLUB_ID = 'calypso-plongee';

async function dump() {
  // First check what collections exist
  const clubDoc = await db.doc(`clubs/${CLUB_ID}`).get();
  console.log('Club exists:', clubDoc.exists);

  // Try boutique_stock
  const snapshot = await db.collection(`clubs/${CLUB_ID}/boutique_stock`).get();
  console.log(`\nboutique_stock: ${snapshot.size} items`);
  snapshot.forEach(doc => {
    const d = doc.data();
    console.log(`  [${d.type}] ${d.reference || 'NO-REF'} | ${d.nom} | qty=${d.quantite} | achat=${d.prix_achat} | vente=${d.prix_vente}`);
  });

  // Also check boutique_snapshots
  const snapshots = await db.collection(`clubs/${CLUB_ID}/boutique_snapshots`).get();
  console.log(`\nboutique_snapshots: ${snapshots.size} snapshots`);
  snapshots.forEach(doc => {
    const d = doc.data();
    console.log(`  ${doc.id}: ${d.nom || d.type} | year=${d.year} | statut=${d.statut} | items=${d.total_items} | qty=${d.total_quantite} | value=${d.total_value}`);
  });

  process.exit(0);
}

dump().catch(err => { console.error(err); process.exit(1); });
