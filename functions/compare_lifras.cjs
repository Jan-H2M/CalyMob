/**
 * Compare official LIFRAS data with Firestore data field by field
 */
const fs = require('fs');
const path = require('path');

// Official data from Excel
const officialRaw = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'CalyCompta', 'lifras_items.json'), 'utf8'
));

// Only catalog items (not transactions, not empty, not repeated headers)
const official = officialRaw.filter(item =>
  item.category !== 'Transaction' &&
  item.nom !== '' &&
  item.nom !== 'DESCRIPTION'
);

// Firestore data (copied from dump output)
const firestore = [
  { reference: "BCAR-020", nom: "Carte préparation Assistant Moniteur", quantite: 1, prix_achat: 9.6, prix_vente: 12, actif: true },
  { reference: "BCAR-021", nom: "Carte préparation Moniteur Club", quantite: 1, prix_achat: 9.6, prix_vente: 12, actif: true },
  { reference: "BCAR-044", nom: "Carte Prép. Nitrox Instructeur Confirmé  (9,6€)", quantite: 2, prix_achat: 0, prix_vente: 12, actif: true },
  { reference: "BKIT-012", nom: "Kit Plongeur 1* - Filofax Bleu (90,00 Eur)", quantite: 15, prix_achat: 90, prix_vente: 100, actif: true },
  { reference: "BKIT-041", nom: "Kit Plongeur Nitrox Basic", quantite: 0, prix_achat: 43, prix_vente: 50, actif: false },
  { reference: "BKIT-042", nom: "Kit Plongeur Nitrox Confirmé (61,00 Eur)", quantite: 1, prix_achat: 61, prix_vente: 70, actif: true },
  { reference: "BKIT-052", nom: "Kit Plongée Profonde à l'Air", quantite: 1, prix_achat: 47, prix_vente: 50, actif: true },
  { reference: "BKIT-081", nom: "Kit table 2016 (9,6€)", quantite: 1, prix_achat: 0, prix_vente: 9, actif: true },
  { reference: "BKIT-102", nom: "Kit apnée S1 (2024)", quantite: 0, prix_achat: 78, prix_vente: 90, actif: true },
  { reference: "BKIT-103", nom: "Kit apnée S2 (2024)", quantite: 0, prix_achat: 85, prix_vente: 85, actif: true },
  { reference: "BKIT-202", nom: 'Kit Pl. 1* Equiv. "F. Bleu" - Kit pl. 2* (100/100)', quantite: 1, prix_achat: 100, prix_vente: 100, actif: true },
  { reference: "BKIT-212", nom: "Kit Plongeur 2*", quantite: 3, prix_achat: 95, prix_vente: 100, actif: true },
  { reference: "BKIT-231", nom: 'Kit Plongeur 2* Equiv. "F. Bleu" (Nom du membre à nous communiquer) 70,00', quantite: 0, prix_achat: 59, prix_vente: 70, actif: true },
  { reference: "BKIT-310A", nom: "Kit Plongeur 3* (sans farde)", quantite: 0, prix_achat: 82, prix_vente: 90, actif: true },
  { reference: "BKIT-310B", nom: "Kit Plongeur 3* avec Farde Lifras complète (10€) (92,00 Eur)", quantite: 0, prix_achat: 92, prix_vente: 100, actif: false },
  { reference: "BKIT-311B", nom: 'Kit Plongeur 3* Equiv. "F. Noir" + farde Lifras', quantite: 0, prix_achat: 69, prix_vente: 69, actif: true },
  { reference: "BKIT-350", nom: "Kit Plongeur 4* (95/100)", quantite: 0, prix_achat: 95, prix_vente: 100, actif: true },
  { reference: "BMAN-011", nom: "Manuel Plongeur 1*", quantite: 0, prix_achat: 10.4, prix_vente: 13, actif: true },
  { reference: "BMAN-012", nom: "Manuel Plongeur 2*", quantite: 0, prix_achat: 12, prix_vente: 15, actif: true },
  { reference: "BMAN-013", nom: "Manuel Plongeur 3*", quantite: 1, prix_achat: 13.6, prix_vente: 17, actif: true },
  { reference: "BMAN-030", nom: "Farde Lifras complète", quantite: 0, prix_achat: 20, prix_vente: 20, actif: true },
  { reference: "BMAN-033", nom: "mise à jour farde lifras 2016", quantite: 4, prix_achat: 12, prix_vente: 12, actif: true },
  { reference: "BMAN-502", nom: 'Manuel "La biologie expliquée aux plongeurs "', quantite: 7, prix_achat: 5, prix_vente: 5, actif: true },
  { reference: "BPLO-014", nom: "Feuillet Plongée Découverte", quantite: 5, prix_achat: 0, prix_vente: null, actif: true },
  { reference: "BPLO-024", nom: 'Classeur "Filofax" Iceblue', quantite: 0, prix_achat: 21, prix_vente: 21, actif: true },
  { reference: null, nom: "Frais de livraison 10302", quantite: 0, prix_achat: 9.07, prix_vente: null, actif: true },
  { reference: null, nom: "Livre La vie marine du Var (30,00 Eur)", quantite: 0, prix_achat: 30, prix_vente: 30, actif: true },
];

console.log(`Official items: ${official.length}`);
console.log(`Firestore items: ${firestore.length}`);
console.log('');

let diffs = 0;
let perfect = 0;

// Match by reference (or name for items without reference)
for (const off of official) {
  const key = off.reference || off.nom;
  const fs_item = off.reference
    ? firestore.find(f => f.reference === off.reference)
    : firestore.find(f => f.nom === off.nom);

  if (!fs_item) {
    console.log(`❌ MISSING IN FIRESTORE: [${off.reference}] ${off.nom}`);
    diffs++;
    continue;
  }

  const issues = [];

  // Compare nom
  if (off.nom !== fs_item.nom) {
    issues.push(`  nom: "${off.nom}" vs "${fs_item.nom}"`);
  }

  // Compare quantite
  if (off.quantite !== fs_item.quantite) {
    issues.push(`  quantite: ${off.quantite} vs ${fs_item.quantite}`);
  }

  // Compare prix_achat
  if (off.prix_achat !== fs_item.prix_achat) {
    issues.push(`  prix_achat: ${off.prix_achat} vs ${fs_item.prix_achat}`);
  }

  // Compare prix_vente (handle null)
  const offPV = off.prix_vente;
  const fsPV = fs_item.prix_vente;
  if (offPV !== fsPV) {
    issues.push(`  prix_vente: ${offPV} vs ${fsPV}`);
  }

  if (issues.length > 0) {
    console.log(`⚠️  [${off.reference || 'NO-REF'}] ${off.nom}`);
    issues.forEach(i => console.log(i));
    diffs++;
  } else {
    perfect++;
    // console.log(`✅ [${off.reference || 'NO-REF'}] ${off.nom}`);
  }
}

// Check for items in Firestore not in official
for (const fs_item of firestore) {
  const key = fs_item.reference || fs_item.nom;
  const off_item = fs_item.reference
    ? official.find(o => o.reference === fs_item.reference)
    : official.find(o => o.nom === fs_item.nom);

  if (!off_item) {
    console.log(`❌ EXTRA IN FIRESTORE (not in official): [${fs_item.reference}] ${fs_item.nom}`);
    diffs++;
  }
}

console.log(`\n=== SUMMARY: ${perfect} perfect, ${diffs} with differences ===`);
