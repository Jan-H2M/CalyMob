/**
 * Fix existing LIFRAS item names to match official Excel.
 * Run: cd CalyMob/functions && node fix_lifras_names.cjs
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CLUB_ID = 'calypso';
const COLLECTION = `clubs/${CLUB_ID}/boutique_stock`;

// Map: reference -> official name + data
const OFFICIAL = {
  'BCAR-044': { nom: 'Carte Prép. Nitrox Instructeur Confirmé  (9,6€)', quantite: 2, prix_achat: 0.00, prix_vente: 12.00 },
  'BKIT-012': { nom: 'Kit Plongeur 1* - Filofax Bleu (90,00 Eur)', quantite: 15, prix_achat: 90.00, prix_vente: 100.00 },
  'BKIT-041': { nom: 'Kit Plongeur Nitrox Basic', quantite: 0, prix_achat: 43.00, prix_vente: 50.00 },
  'BKIT-042': { nom: 'Kit Plongeur Nitrox Confirmé (61,00 Eur)', quantite: 1, prix_achat: 61.00, prix_vente: 70.00 },
  'BKIT-202': { nom: 'Kit Pl. 1* Equiv. "F. Bleu" - Kit pl. 2* (100/100)', quantite: 1, prix_achat: 100.00, prix_vente: 100.00 },
  'BKIT-212': { nom: 'Kit Plongeur 2*', quantite: 3, prix_achat: 95.00, prix_vente: 100.00 },
  'BKIT-310B': { nom: 'Kit Plongeur 3* avec Farde Lifras complète (10€) (92,00 Eur)', quantite: 0, prix_achat: 92.00, prix_vente: 100.00 },
  'BKIT-350': { nom: 'Kit Plongeur 4* (95/100)', quantite: 0, prix_achat: 95.00, prix_vente: 100.00 },
};

async function main() {
  console.log('=== Fix LIFRAS item names ===');

  const snap = await db.collection(COLLECTION)
    .where('type', '==', 'boutique_lifras')
    .get();

  const batch = db.batch();
  let fixed = 0;

  snap.forEach(doc => {
    const d = doc.data();
    const ref = d.reference;
    if (!ref || !OFFICIAL[ref]) return;

    const official = OFFICIAL[ref];
    const changes = {};

    if (d.nom !== official.nom) changes.nom = official.nom;
    if (d.quantite !== official.quantite) changes.quantite = official.quantite;
    if (d.prix_achat !== official.prix_achat) changes.prix_achat = official.prix_achat;
    if ((d.prix_vente || null) !== (official.prix_vente || null)) changes.prix_vente = official.prix_vente || null;

    if (Object.keys(changes).length > 0) {
      changes.updatedAt = admin.firestore.Timestamp.now();
      batch.update(doc.ref, changes);
      console.log(`  [FIX] ${ref}: ${Object.keys(changes).join(', ')}`);
      if (changes.nom) console.log(`         "${d.nom}" → "${official.nom}"`);
      fixed++;
    } else {
      console.log(`  [OK] ${ref}: ${d.nom}`);
    }
  });

  if (fixed > 0) {
    console.log(`\nCommitting ${fixed} fixes...`);
    await batch.commit();
    console.log('✅ Done!');
  } else {
    console.log('\nAll names already correct.');
  }

  process.exit(0);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
