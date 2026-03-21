/**
 * Import LIFRAS boutique items from official Excel data into Firestore.
 * 
 * Run from: CalyMob/functions/  →  node import_lifras.cjs
 * 
 * This imports the 25 catalog items (BCAR/BKIT/BMAN/BPLO) + 2 misc items
 * from the official accountant's Excel into clubs/calypso/boutique_stock/
 * with type='boutique_lifras'.
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CLUB_ID = 'calypso';
const COLLECTION = `clubs/${CLUB_ID}/boutique_stock`;

// Items extracted from official Excel "Boutk LIFRAS - fin 2025"
// First section: catalog items (opening inventory 31/12/2024)
const LIFRAS_ITEMS = [
  { reference: 'BCAR-020', nom: 'Carte préparation Assistant Moniteur', quantite: 1, prix_achat: 9.60, prix_vente: 12.00 },
  { reference: 'BCAR-021', nom: 'Carte préparation Moniteur Club', quantite: 1, prix_achat: 9.60, prix_vente: 12.00 },
  { reference: 'BCAR-044', nom: 'Carte Prép. Nitrox Instructeur Confirmé  (9,6€)', quantite: 2, prix_achat: 0.00, prix_vente: 12.00 },
  { reference: 'BKIT-012', nom: 'Kit Plongeur 1* - Filofax Bleu (90,00 Eur)', quantite: 15, prix_achat: 90.00, prix_vente: 100.00 },
  { reference: 'BKIT-041', nom: 'Kit Plongeur Nitrox Basic', quantite: 0, prix_achat: 43.00, prix_vente: 50.00 },
  { reference: 'BKIT-042', nom: 'Kit Plongeur Nitrox Confirmé (61,00 Eur)', quantite: 1, prix_achat: 61.00, prix_vente: 70.00 },
  { reference: 'BKIT-052', nom: 'Kit Plongée Profonde à l\'Air', quantite: 1, prix_achat: 47.00, prix_vente: 50.00 },
  { reference: 'BKIT-081', nom: 'Kit table 2016 (9,6€)', quantite: 1, prix_achat: 0.00, prix_vente: 9.00 },
  { reference: 'BKIT-102', nom: 'Kit apnée S1 (2024)', quantite: 0, prix_achat: 78.00, prix_vente: 90.00 },
  { reference: 'BKIT-103', nom: 'Kit apnée S2 (2024)', quantite: 0, prix_achat: 85.00, prix_vente: 85.00 },
  { reference: 'BKIT-202', nom: 'Kit Pl. 1* Equiv. "F. Bleu" - Kit pl. 2* (100/100)', quantite: 1, prix_achat: 100.00, prix_vente: 100.00 },
  { reference: 'BKIT-212', nom: 'Kit Plongeur 2*', quantite: 3, prix_achat: 95.00, prix_vente: 100.00 },
  { reference: 'BKIT-231', nom: 'Kit Plongeur 2* Equiv. "F. Bleu" (Nom du membre à nous communiquer) 70,00', quantite: 0, prix_achat: 59.00, prix_vente: 70.00 },
  { reference: 'BKIT-310A', nom: 'Kit Plongeur 3* (sans farde)', quantite: 0, prix_achat: 82.00, prix_vente: 90.00 },
  { reference: 'BKIT-310B', nom: 'Kit Plongeur 3* avec Farde Lifras complète (10€) (92,00 Eur)', quantite: 0, prix_achat: 92.00, prix_vente: 100.00 },
  { reference: 'BKIT-311B', nom: 'Kit Plongeur 3* Equiv. "F. Noir" + farde Lifras', quantite: 0, prix_achat: 69.00, prix_vente: 69.00 },
  { reference: 'BKIT-350', nom: 'Kit Plongeur 4* (95/100)', quantite: 0, prix_achat: 95.00, prix_vente: 100.00 },
  { reference: 'BMAN-011', nom: 'Manuel Plongeur 1*', quantite: 0, prix_achat: 10.40, prix_vente: 13.00 },
  { reference: 'BMAN-012', nom: 'Manuel Plongeur 2*', quantite: 0, prix_achat: 12.00, prix_vente: 15.00 },
  { reference: 'BMAN-013', nom: 'Manuel Plongeur 3*', quantite: 1, prix_achat: 13.60, prix_vente: 17.00 },
  { reference: 'BMAN-030', nom: 'Farde Lifras complète', quantite: 0, prix_achat: 20.00, prix_vente: 20.00 },
  { reference: 'BMAN-033', nom: 'mise à jour farde lifras 2016', quantite: 4, prix_achat: 12.00, prix_vente: 12.00 },
  { reference: 'BMAN-502', nom: 'Manuel "La biologie expliquée aux plongeurs "', quantite: 7, prix_achat: 5.00, prix_vente: 5.00 },
  { reference: 'BPLO-014', nom: 'Feuillet Plongée Découverte', quantite: 5, prix_achat: 0.00, prix_vente: null },
  { reference: 'BPLO-024', nom: 'Classeur "Filofax" Iceblue', quantite: 0, prix_achat: 21.00, prix_vente: 21.00 },
  // Misc items (no standard reference)
  { reference: null, nom: 'Livre La vie marine du Var (30,00 Eur)', quantite: 0, prix_achat: 30.00, prix_vente: 30.00 },
  { reference: null, nom: 'Frais de livraison 10302', quantite: 0, prix_achat: 9.07, prix_vente: null },
];

async function main() {
  console.log('=== LIFRAS Boutique Import ===');
  console.log(`Target: ${COLLECTION}`);
  console.log(`Items to import: ${LIFRAS_ITEMS.length}`);

  // First, check existing LIFRAS items
  const existingSnap = await db.collection(COLLECTION)
    .where('type', '==', 'boutique_lifras')
    .get();

  const existingRefs = new Set();
  const existingNames = new Set();
  existingSnap.forEach(doc => {
    const d = doc.data();
    if (d.reference) existingRefs.add(d.reference);
    existingNames.add(d.nom);
  });

  console.log(`\nExisting LIFRAS items: ${existingSnap.size}`);
  existingSnap.forEach(doc => {
    const d = doc.data();
    console.log(`  [EXISTS] ${doc.id}: ${d.reference || '-'} | ${d.nom}`);
  });

  // Import new items (skip duplicates)
  const batch = db.batch();
  let added = 0;
  let skipped = 0;

  for (const item of LIFRAS_ITEMS) {
    // Check for duplicates by reference or name
    if (item.reference && existingRefs.has(item.reference)) {
      console.log(`  [SKIP] ${item.reference} - already exists`);
      skipped++;
      continue;
    }
    if (existingNames.has(item.nom)) {
      console.log(`  [SKIP] "${item.nom}" - already exists by name`);
      skipped++;
      continue;
    }

    const docRef = db.collection(COLLECTION).doc();
    const now = admin.firestore.Timestamp.now();

    batch.set(docRef, {
      type: 'boutique_lifras',
      nom: item.nom,
      description: null,
      quantite: item.quantite,
      prix_achat: item.prix_achat,
      prix_vente: item.prix_vente || null,
      date_achat: now,
      fournisseur: 'LIFRAS',
      reference: item.reference || null,
      photo_url: null,
      actif: true,
      createdAt: now,
      updatedAt: now,
      createdBy: 'import_lifras_script'
    });

    console.log(`  [ADD] ${item.reference || 'no-ref'} | ${item.nom} | qty=${item.quantite} | €${item.prix_achat}`);
    added++;
  }

  if (added > 0) {
    console.log(`\nCommitting batch: ${added} new items...`);
    await batch.commit();
    console.log('✅ Import complete!');
  } else {
    console.log('\nNothing to import - all items already exist.');
  }

  console.log(`\nSummary: ${added} added, ${skipped} skipped`);
  console.log(`Total LIFRAS items now: ${existingSnap.size + added}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
