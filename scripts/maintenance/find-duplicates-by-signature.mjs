/**
 * Script pour trouver les doublons par signature (date + montant + contrepartie)
 * au lieu de la référence bancaire
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialiser Firebase
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../serviceAccountKey.json'), 'utf8')
);
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const CLUB_ID = 'calypso';

async function findDuplicates() {
  console.log('🔍 === RECHERCHE DE DOUBLONS PAR SIGNATURE ===\n');

  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const snapshot = await txRef
    .where('date_execution', '>=', Timestamp.fromDate(new Date('2025-01-01')))
    .where('date_execution', '<=', Timestamp.fromDate(new Date('2025-12-31')))
    .get();

  console.log(`📊 Total transactions: ${snapshot.size}\n`);

  // Grouper par signature (date + montant + contrepartie)
  const signatureMap = new Map();
  const parents = [];
  let compteCourant = 0;

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const compte = data.numero_compte?.replace(/\s/g, '') || '';

    // Ignorer les parents
    if (data.is_parent) {
      parents.push({
        id: doc.id,
        date: data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR'),
        montant: data.montant,
        contrepartie: data.contrepartie_nom || data.nom_contrepartie
      });
      return;
    }

    // Ne garder que le compte courant
    if (compte !== 'BE26210016070629') return;

    compteCourant++;

    // Utiliser hash_dedup si disponible, sinon créer une signature
    const hash = data.hash_dedup;

    if (hash) {
      if (!signatureMap.has(hash)) {
        signatureMap.set(hash, []);
      }

      signatureMap.get(hash).push({
        id: doc.id,
        date: data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR') || '',
        montant: data.montant,
        contrepartie: data.contrepartie_nom || data.nom_contrepartie,
        sequence: data.numero_sequence,
        hash: hash
      });
    }
  });

  console.log(`✅ Transactions parents: ${parents.length}`);
  console.log(`✅ Transactions compte courant: ${compteCourant}\n`);

  // Trouver les doublons
  const doublons = Array.from(signatureMap.entries()).filter(([_, txs]) => txs.length > 1);

  if (doublons.length === 0) {
    console.log('✅ Aucun doublon trouvé\n');
    return;
  }

  console.log(`⚠️  ${doublons.length} DOUBLONS TROUVÉS:\n`);

  let totalImpact = 0;
  const idsToDelete = [];

  doublons.forEach(([hash, txs]) => {
    const first = txs[0];
    console.log(`📋 ${first.date} | ${first.montant} € | ${first.contrepartie || 'N/A'}`);
    console.log(`   Hash: ${hash}`);
    console.log(`   ${txs.length} occurrences:\n`);

    txs.forEach((tx, i) => {
      console.log(`   ${i + 1}. Seq: ${tx.sequence} | ID: ${tx.id.substring(0, 20)}...`);

      // Garder le premier, supprimer les autres
      if (i > 0) {
        idsToDelete.push(tx.id);
        totalImpact += tx.montant;
      }
    });
    console.log('');
  });

  console.log('=== RÉSUMÉ ===\n');
  console.log(`Groupes de doublons: ${doublons.length}`);
  console.log(`Transactions à supprimer: ${idsToDelete.length}`);
  console.log(`Impact total: ${totalImpact.toFixed(2)} €\n`);

  console.log('=== COMPARAISON ===\n');
  console.log(`CSV: 955 transactions`);
  console.log(`Firestore: ${compteCourant} transactions`);
  console.log(`Après nettoyage: ${compteCourant - idsToDelete.length} transactions`);
  console.log(`Écart restant: ${(compteCourant - idsToDelete.length) - 955}\n`);

  // Sauvegarder les IDs
  const outputPath = join(__dirname, 'transactions-to-delete.json');
  writeFileSync(outputPath, JSON.stringify(idsToDelete, null, 2));
  console.log(`✅ IDs sauvegardés dans: ${outputPath}\n`);

  console.log('IDs à supprimer:');
  idsToDelete.forEach(id => console.log(id));
}

findDuplicates()
  .then(() => {
    console.log('\n✅ Analyse terminée');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  });
