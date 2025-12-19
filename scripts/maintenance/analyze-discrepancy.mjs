/**
 * Script pour analyser l'écart entre le CSV et Firestore
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
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

async function analyzeDiscrepancy() {
  console.log('🔍 === ANALYSE DE L\'ÉCART ===\n');

  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const snapshot = await txRef
    .where('date_execution', '>=', Timestamp.fromDate(new Date('2025-01-01')))
    .where('date_execution', '<=', Timestamp.fromDate(new Date('2025-12-31')))
    .get();

  console.log(`📊 Total transactions: ${snapshot.size}\n`);

  const normalizedCurrentAccount = 'BE26210016070629';
  let totalRevenus = 0;
  let totalDepenses = 0;
  let countedTransactions = 0;
  let skippedParents = 0;
  let otherAccounts = 0;

  // Vérifier les hash_dedup
  let withHash = 0;
  let withoutHash = 0;

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const compte = data.numero_compte?.replace(/\s/g, '') || '';

    if (data.hash_dedup) {
      withHash++;
    } else {
      withoutHash++;
    }

    if (data.is_parent) {
      skippedParents++;
      return;
    }

    if (compte !== normalizedCurrentAccount) {
      otherAccounts++;
      return;
    }

    countedTransactions++;
    const montant = data.montant || 0;

    if (montant > 0) {
      totalRevenus += montant;
    } else {
      totalDepenses += Math.abs(montant);
    }
  });

  console.log('=== STATISTIQUES ===');
  console.log(`Transactions avec hash_dedup: ${withHash}`);
  console.log(`Transactions sans hash_dedup: ${withoutHash}`);
  console.log(`Transactions parents ignorées: ${skippedParents}`);
  console.log(`Transactions autres comptes: ${otherAccounts}`);
  console.log(`Transactions comptées (compte courant): ${countedTransactions}\n`);

  console.log('=== TOTAUX FIRESTORE ===');
  console.log(`Revenus: ${totalRevenus.toFixed(2)} €`);
  console.log(`Dépenses: ${totalDepenses.toFixed(2)} €`);
  console.log(`Solde net: ${(totalRevenus - totalDepenses).toFixed(2)} €\n`);

  console.log('=== TOTAUX CSV ===');
  console.log(`Transactions: 955`);
  console.log(`Revenus: 57291.66 €`);
  console.log(`Dépenses: 68559.97 €`);
  console.log(`Solde net: ${(57291.66 - 68559.97).toFixed(2)} €\n`);

  console.log('=== ÉCARTS ===');
  console.log(`Transactions: ${countedTransactions} - 955 = ${countedTransactions - 955}`);
  console.log(`Revenus: ${totalRevenus.toFixed(2)} - 57291.66 = ${(totalRevenus - 57291.66).toFixed(2)} €`);
  console.log(`Dépenses: ${totalDepenses.toFixed(2)} - 68559.97 = ${(totalDepenses - 68559.97).toFixed(2)} €`);

  const soldeFirestore = totalRevenus - totalDepenses;
  const soldeCSV = 57291.66 - 68559.97;
  const ecartSolde = soldeFirestore - soldeCSV;
  console.log(`Solde net: ${soldeFirestore.toFixed(2)} - ${soldeCSV.toFixed(2)} = ${ecartSolde.toFixed(2)} €\n`);

  console.log('=== SOLDES AVEC OPENING BALANCE ===');
  const openingBalance = 16009.57;
  console.log(`Opening balance: ${openingBalance.toFixed(2)} €`);
  console.log(`Solde Firestore: ${openingBalance} + ${soldeFirestore.toFixed(2)} = ${(openingBalance + soldeFirestore).toFixed(2)} €`);
  console.log(`Solde attendu (CSV): ${openingBalance} + ${soldeCSV.toFixed(2)} = ${(openingBalance + soldeCSV).toFixed(2)} €`);
  console.log(`Écart final: ${ecartSolde.toFixed(2)} €`);
}

analyzeDiscrepancy()
  .then(() => {
    console.log('\n✅ Analyse terminée');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  });
