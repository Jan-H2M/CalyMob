const admin = require('firebase-admin');
const path = require('path');
const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const CLUB_ID = 'calypso';

async function dump() {
  // All boutique_stock items
  const all = await db.collection(`clubs/${CLUB_ID}/boutique_stock`).get();
  console.log(`Total boutique_stock: ${all.size} items\n`);

  const lifras = [];
  const club = [];
  all.forEach(doc => {
    const d = doc.data();
    const item = { id: doc.id, ...d };
    if (d.type === 'boutique_lifras') lifras.push(item);
    else club.push(item);
  });

  console.log(`Club items: ${club.size || club.length}`);
  console.log(`LIFRAS items: ${lifras.length}\n`);

  // Sort LIFRAS by reference
  lifras.sort((a, b) => (a.reference || 'ZZZZ').localeCompare(b.reference || 'ZZZZ'));

  console.log('=== LIFRAS ITEMS ===');
  lifras.forEach((item, i) => {
    console.log(`${i+1}. [${item.reference || 'NO-REF'}] ${item.nom}`);
    console.log(`   qty=${item.quantite} | achat=${item.prix_achat}€ | vente=${item.prix_vente}€ | actif=${item.actif !== false}`);
    console.log(`   id=${item.id}`);
  });

  // Snapshots
  const snaps = await db.collection(`clubs/${CLUB_ID}/boutique_snapshots`).get();
  console.log(`\n=== SNAPSHOTS (${snaps.size}) ===`);
  for (const doc of snaps.docs) {
    const d = doc.data();
    console.log(`  ${doc.id}: ${d.nom || d.type || 'N/A'} | year=${d.year} | statut=${d.statut} | items=${d.total_items} | qty=${d.total_quantite} | value=${d.total_value}`);
    // Get snapshot items
    const snapItems = await db.collection(`clubs/${CLUB_ID}/boutique_snapshots/${doc.id}/items`).get();
    console.log(`    → ${snapItems.size} items in snapshot`);
  }

  // JSON output for comparison
  console.log('\n=== LIFRAS JSON ===');
  console.log(JSON.stringify(lifras.map(l => ({
    id: l.id, reference: l.reference, nom: l.nom, quantite: l.quantite,
    prix_achat: l.prix_achat, prix_vente: l.prix_vente, actif: l.actif !== false
  })), null, 2));

  process.exit(0);
}
dump().catch(err => { console.error(err); process.exit(1); });
