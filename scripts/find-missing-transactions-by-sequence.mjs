/**
 * Script pour identifier les transactions dans Firestore qui ne sont PAS dans le CSV
 * en utilisant les numéros de séquence
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
const CSV_PATH = '/Users/jan/Documents/CALYPSO/bank/CSV_2025-11-16-18.12.csv';

async function findMissingTransactions() {
  console.log('🔍 === RECHERCHE DES TRANSACTIONS EN TROP ===\n');

  // 1. Charger tous les numéros de séquence du CSV
  console.log('📄 Chargement du CSV...\n');
  const csvSequences = new Set();

  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const lines = csvContent.split('\n');

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = lines[i].split(';');
    const sequence = values[0]?.trim();

    // Ignorer les séquences vides ou invalides
    if (sequence && sequence !== '2025-' && sequence.startsWith('2025-')) {
      csvSequences.add(sequence);
    }
  }

  console.log(`✅ CSV: ${csvSequences.size} numéros de séquence valides\n`);

  // 2. Charger toutes les transactions de Firestore
  console.log('🔥 Chargement de Firestore...\n');
  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const snapshot = await txRef
    .where('date_execution', '>=', Timestamp.fromDate(new Date('2025-01-01')))
    .where('date_execution', '<=', Timestamp.fromDate(new Date('2025-12-31')))
    .get();

  const normalizedCurrentAccount = 'BE26210016070629';
  const extraTransactions = [];
  const missingInCsv = [];
  let parentCount = 0;
  let childCount = 0;
  let normalCount = 0;

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const compte = data.numero_compte?.replace(/\s/g, '') || '';
    const sequence = data.numero_sequence;

    // Statistiques
    if (data.is_parent) {
      parentCount++;
      return; // Ignorer les parents
    }
    if (data.parent_transaction_id) {
      childCount++;
      // Les enfants ne sont pas dans le CSV, donc on ne les compare pas
      return;
    }

    // Ignorer les autres comptes
    if (compte !== normalizedCurrentAccount) {
      return;
    }

    normalCount++;

    // Vérifier si cette transaction existe dans le CSV
    if (!csvSequences.has(sequence)) {
      missingInCsv.push({
        id: doc.id,
        sequence: sequence,
        date: data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR') || '',
        montant: data.montant,
        contrepartie: data.contrepartie_nom,
        communication: data.communication,
        source: data.source_file,
        created_at: data.created_at?.toDate?.()?.toLocaleDateString('fr-FR') || ''
      });
    }
  });

  console.log('=== STATISTIQUES FIRESTORE ===');
  console.log(`Total transactions: ${snapshot.size}`);
  console.log(`Parents (exclus): ${parentCount}`);
  console.log(`Enfants (exclus): ${childCount}`);
  console.log(`Normales (compte courant): ${normalCount}\n`);

  console.log('=== COMPARAISON ===');
  console.log(`CSV: ${csvSequences.size} transactions`);
  console.log(`Firestore (normales): ${normalCount} transactions`);
  console.log(`Différence: ${normalCount - csvSequences.size}\n`);

  if (missingInCsv.length === 0) {
    console.log('✅ Aucune transaction en trop trouvée\n');
    return;
  }

  console.log(`⚠️  ${missingInCsv.length} TRANSACTIONS EN TROP DANS FIRESTORE:\n`);

  let totalImpact = 0;
  const idsToDelete = [];

  missingInCsv.forEach((tx, i) => {
    console.log(`${i + 1}. ${tx.date} | ${tx.montant} € | ${tx.contrepartie || 'N/A'}`);
    console.log(`   Seq: ${tx.sequence}`);
    console.log(`   Communication: ${tx.communication || 'N/A'}`);
    console.log(`   Source: ${tx.source || 'N/A'}`);
    console.log(`   Created: ${tx.created_at}`);
    console.log(`   ID: ${tx.id}`);
    console.log('');

    totalImpact += tx.montant;
    idsToDelete.push(tx.id);
  });

  console.log('=== RÉSUMÉ ===');
  console.log(`Transactions en trop: ${missingInCsv.length}`);
  console.log(`Impact total: ${totalImpact.toFixed(2)} €\n`);

  console.log('=== IMPACT SUR LE SOLDE ===');
  const currentBalance = 6464.98;
  const expectedBalance = 4741.26;
  const currentDiscrepancy = currentBalance - expectedBalance;
  const newDiscrepancy = currentDiscrepancy - totalImpact;

  console.log(`Solde actuel (Firestore): ${currentBalance.toFixed(2)} €`);
  console.log(`Solde attendu (CSV): ${expectedBalance.toFixed(2)} €`);
  console.log(`Écart actuel: ${currentDiscrepancy.toFixed(2)} €`);
  console.log(`Impact de la suppression: ${totalImpact.toFixed(2)} €`);
  console.log(`Nouvel écart après suppression: ${newDiscrepancy.toFixed(2)} €\n`);

  // Sauvegarder les IDs
  const outputPath = join(__dirname, 'transactions-to-delete.json');
  writeFileSync(outputPath, JSON.stringify({
    ids: idsToDelete,
    details: missingInCsv
  }, null, 2));
  console.log(`✅ IDs sauvegardés dans: ${outputPath}\n`);
}

findMissingTransactions()
  .then(() => {
    console.log('✅ Analyse terminée');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  });
