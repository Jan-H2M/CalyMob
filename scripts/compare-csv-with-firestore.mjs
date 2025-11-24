/**
 * Script pour comparer le CSV bancaire avec Firestore
 * et identifier les transactions en trop ou manquantes
 *
 * Usage: node scripts/compare-csv-with-firestore.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialiser Firebase Admin
try {
  const serviceAccount = JSON.parse(
    readFileSync(join(__dirname, '../serviceAccountKey.json'), 'utf8')
  );
  initializeApp({
    credential: cert(serviceAccount)
  });
  console.log('✅ Firebase initialisé avec serviceAccountKey.json\n');
} catch (error) {
  console.log('⚠️  serviceAccountKey.json non trouvé');
  console.log('💡 Pour créer le fichier, allez dans Firebase Console > Project Settings > Service Accounts');
  console.log('💡 Générez une nouvelle clé privée et sauvegardez-la comme serviceAccountKey.json\n');
  process.exit(1);
}

const db = getFirestore();

const CLUB_ID = 'calypso';
const FISCAL_YEAR_START = new Date('2025-01-01');
const FISCAL_YEAR_END = new Date('2025-12-31');
const CURRENT_ACCOUNT_IBAN = 'BE26210016070629';
const CSV_PATH = '/Users/jan/Documents/CALYPSO/bank/CSV_2025-11-16-18.12.csv';

async function compareCsvWithFirestore() {
  console.log('=== COMPARAISON CSV vs FIRESTORE ===\n');

  // 1. Lire le CSV
  console.log('📄 Lecture du CSV bancaire...');
  const csvContent = readFileSync(CSV_PATH, 'utf8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());
  const csvHeader = csvLines[0].split(';');

  // Trouver les index des colonnes
  const dateIndex = csvHeader.findIndex(h => h.includes('Date d\'exécution'));
  const montantIndex = csvHeader.findIndex(h => h.includes('Montant'));
  const refIndex = csvHeader.findIndex(h => h.includes('Référence'));
  const contrepartieIndex = csvHeader.findIndex(h => h.includes('Nom de la contrepartie'));

  const csvTransactions = new Map(); // key = référence bancaire

  for (let i = 1; i < csvLines.length; i++) {
    const fields = csvLines[i].split(';');
    if (fields.length < 10) continue;

    const montant = parseFloat(fields[montantIndex].replace(',', '.'));
    const details = fields[fields.length - 3] || ''; // Colonne "Détails"

    // Extraire la référence bancaire du champ "Détails"
    const refMatch = details.match(/REFERENCE BANQUE : (\d+)/);
    const reference = refMatch ? refMatch[1] : null;

    if (reference) {
      csvTransactions.set(reference, {
        date: fields[dateIndex],
        montant,
        contrepartie: fields[contrepartieIndex],
        reference
      });
    }
  }

  console.log(`✅ CSV chargé: ${csvTransactions.size} transactions avec référence bancaire\n`);

  // 2. Charger Firestore
  console.log('🔥 Chargement des transactions Firestore...');
  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const snapshot = await txRef
    .where('date_execution', '>=', Timestamp.fromDate(FISCAL_YEAR_START))
    .where('date_execution', '<=', Timestamp.fromDate(FISCAL_YEAR_END))
    .get();

  console.log(`✅ Firestore chargé: ${snapshot.size} transactions\n`);

  const normalizedCurrentAccount = CURRENT_ACCOUNT_IBAN.replace(/\s/g, '');

  const firestoreTransactions = new Map(); // key = référence bancaire
  const transactionsParents = [];
  const transactionsSansRef = [];
  const transactionsAutresComptes = [];

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const compte = data.numero_compte?.replace(/\s/g, '') || '';
    const reference = data.reference_banque?.replace(/\D/g, '') || null; // Garder que les chiffres

    // Statistiques
    if (data.is_parent) {
      transactionsParents.push({
        id: doc.id,
        date: data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR'),
        montant: data.montant,
        contrepartie: data.nom_contrepartie,
        reference
      });
      return; // Les parents ne doivent pas être comptés
    }

    if (compte !== normalizedCurrentAccount) {
      transactionsAutresComptes.push({
        id: doc.id,
        compte: data.numero_compte,
        montant: data.montant,
        reference
      });
      return;
    }

    if (!reference) {
      transactionsSansRef.push({
        id: doc.id,
        date: data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR'),
        montant: data.montant,
        contrepartie: data.nom_contrepartie
      });
    } else {
      if (!firestoreTransactions.has(reference)) {
        firestoreTransactions.set(reference, []);
      }
      firestoreTransactions.get(reference).push({
        id: doc.id,
        date: data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR'),
        montant: data.montant,
        contrepartie: data.nom_contrepartie,
        reference,
        is_parent: data.is_parent || false,
        parent_id: data.parent_transaction_id || null
      });
    }
  });

  // 3. Afficher les statistiques
  console.log('=== STATISTIQUES ===\n');
  console.log(`📊 Transactions parents (ventilées): ${transactionsParents.length}`);
  console.log(`📊 Transactions autres comptes: ${transactionsAutresComptes.length}`);
  console.log(`📊 Transactions sans référence: ${transactionsSansRef.length}`);
  console.log(`📊 Transactions compte courant avec référence: ${Array.from(firestoreTransactions.values()).flat().length}\n`);

  // 4. Comparer
  console.log('=== COMPARAISON ===\n');

  // Transactions en double dans Firestore (même référence)
  const doublons = [];
  firestoreTransactions.forEach((txs, ref) => {
    if (txs.length > 1) {
      doublons.push({ reference: ref, transactions: txs });
    }
  });

  if (doublons.length > 0) {
    console.log(`⚠️  DOUBLONS DANS FIRESTORE: ${doublons.length} références dupliquées\n`);
    doublons.forEach(({ reference, transactions }) => {
      console.log(`Référence: ${reference} - ${transactions.length} fois`);
      transactions.forEach((tx, i) => {
        console.log(`  ${i + 1}. ID: ${tx.id.substring(0, 20)}...`);
        console.log(`     ${tx.date} | ${tx.montant.toFixed(2)} € | ${tx.contrepartie}`);
      });
      console.log();
    });
  }

  // Transactions dans Firestore mais pas dans CSV
  const surplusFirestore = [];
  firestoreTransactions.forEach((txs, ref) => {
    if (!csvTransactions.has(ref)) {
      surplusFirestore.push(...txs);
    } else if (txs.length > 1) {
      // Garder les doublons (sauf le premier)
      surplusFirestore.push(...txs.slice(1));
    }
  });

  if (surplusFirestore.length > 0) {
    console.log(`\n⚠️  TRANSACTIONS EN TROP DANS FIRESTORE: ${surplusFirestore.length}\n`);
    surplusFirestore.forEach(tx => {
      console.log(`ID: ${tx.id}`);
      console.log(`   ${tx.date} | ${tx.montant.toFixed(2)} € | ${tx.contrepartie}`);
      console.log(`   Ref: ${tx.reference}`);
      console.log();
    });
  }

  // Transactions dans CSV mais pas dans Firestore
  const manquantesFirestore = [];
  csvTransactions.forEach((tx, ref) => {
    if (!firestoreTransactions.has(ref)) {
      manquantesFirestore.push(tx);
    }
  });

  if (manquantesFirestore.length > 0) {
    console.log(`\n⚠️  TRANSACTIONS MANQUANTES DANS FIRESTORE: ${manquantesFirestore.length}\n`);
    manquantesFirestore.forEach(tx => {
      console.log(`${tx.date} | ${tx.montant.toFixed(2)} € | ${tx.contrepartie}`);
      console.log(`Ref: ${tx.reference}\n`);
    });
  }

  // 5. Résumé
  console.log('\n=== RÉSUMÉ ===\n');
  console.log(`CSV: ${csvTransactions.size} transactions`);
  console.log(`Firestore (compte courant, non-parents): ${Array.from(firestoreTransactions.values()).flat().length} transactions`);
  console.log(`Doublons dans Firestore: ${doublons.reduce((sum, d) => sum + (d.transactions.length - 1), 0)}`);
  console.log(`Transactions en trop: ${surplusFirestore.length}`);
  console.log(`Transactions manquantes: ${manquantesFirestore.length}`);
  console.log();
  console.log(`Transactions parents exclues: ${transactionsParents.length}`);
  console.log(`Transactions autres comptes: ${transactionsAutresComptes.length}`);
  console.log(`Transactions sans référence: ${transactionsSansRef.length}`);

  // 6. Proposition de nettoyage
  if (surplusFirestore.length > 0) {
    console.log('\n=== PROPOSITION DE NETTOYAGE ===\n');
    console.log(`Pour supprimer les ${surplusFirestore.length} transactions en trop:`);
    console.log(`node scripts/delete-duplicate-transactions.mjs`);
    console.log('\n⚠️  ATTENTION: Cette opération est irréversible!');
    console.log('Vérifiez d\'abord les IDs des transactions à supprimer.\n');

    // Sauvegarder les IDs dans un fichier
    const idsToDelete = surplusFirestore.map(tx => tx.id);
    const outputPath = join(__dirname, 'transactions-to-delete.json');
    writeFileSync(outputPath, JSON.stringify(idsToDelete, null, 2));
    console.log(`✅ Liste sauvegardée dans: ${outputPath}`);
  }
}

compareCsvWithFirestore()
  .then(() => {
    console.log('\n✅ Analyse terminée');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  });
