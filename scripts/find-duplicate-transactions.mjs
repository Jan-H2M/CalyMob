/**
 * Script pour identifier les transactions en double dans Firestore
 *
 * Usage: node scripts/find-duplicate-transactions.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialiser Firebase Admin
// Essayer d'abord avec serviceAccountKey.json, sinon utiliser les variables d'environnement
try {
  const serviceAccount = JSON.parse(
    readFileSync(join(__dirname, '../serviceAccountKey.json'), 'utf8')
  );
  initializeApp({
    credential: cert(serviceAccount)
  });
  console.log('✅ Firebase initialisé avec serviceAccountKey.json\n');
} catch (error) {
  console.log('⚠️  serviceAccountKey.json non trouvé, utilisation des variables d\'environnement');
  console.log('💡 Pour créer le fichier, allez dans Firebase Console > Project Settings > Service Accounts');
  console.log('💡 Ou utilisez: GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json node script.mjs\n');
  process.exit(1);
}

const db = getFirestore();

const CLUB_ID = 'uvQWCNTmCGg7sZC5UvOa'; // Votre club ID
const FISCAL_YEAR_START = new Date('2025-01-01');
const FISCAL_YEAR_END = new Date('2025-12-31');
const CURRENT_ACCOUNT_IBAN = 'BE26210016070629';

async function findDuplicates() {
  console.log('=== RECHERCHE DE DOUBLONS ===\n');

  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const snapshot = await txRef
    .where('date_execution', '>=', Timestamp.fromDate(FISCAL_YEAR_START))
    .where('date_execution', '<=', Timestamp.fromDate(FISCAL_YEAR_END))
    .get();

  console.log(`Total transactions dans Firestore: ${snapshot.size}\n`);

  const normalizedCurrentAccount = CURRENT_ACCOUNT_IBAN.replace(/\s/g, '');

  // Grouper les transactions par clé unique (date + montant + contrepartie)
  const transactionGroups = new Map();
  const parentTransactions = [];
  const childTransactions = [];
  let countedTransactions = 0;

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const date = data.date_execution?.toDate?.().toLocaleDateString('fr-FR') || 'N/A';
    const montant = data.montant || 0;
    const contrepartie = data.nom_contrepartie || 'N/A';
    const compte = data.numero_compte?.replace(/\s/g, '') || '';

    // Statistiques sur les flags
    if (data.is_parent) {
      parentTransactions.push({
        id: doc.id,
        date,
        montant,
        contrepartie,
        compte,
        child_count: data.child_count || 0
      });
    }

    if (data.parent_transaction_id) {
      childTransactions.push({
        id: doc.id,
        parent_id: data.parent_transaction_id,
        date,
        montant,
        contrepartie,
        compte
      });
    }

    // Ne compter que les transactions du compte courant qui ne sont PAS des parents
    if (compte === normalizedCurrentAccount && !data.is_parent) {
      countedTransactions++;

      // Créer une clé unique basée sur date + montant + contrepartie
      const key = `${date}|${montant.toFixed(2)}|${contrepartie}`;

      if (!transactionGroups.has(key)) {
        transactionGroups.set(key, []);
      }

      transactionGroups.get(key).push({
        id: doc.id,
        date,
        montant,
        contrepartie,
        compte,
        is_parent: data.is_parent || false,
        parent_transaction_id: data.parent_transaction_id || null,
        reference_banque: data.reference_banque || 'N/A'
      });
    }
  });

  console.log('=== STATISTIQUES ===');
  console.log(`Transactions parents (is_parent=true): ${parentTransactions.length}`);
  console.log(`Transactions enfants (avec parent_transaction_id): ${childTransactions.length}`);
  console.log(`Transactions comptées (compte courant, non parents): ${countedTransactions}`);
  console.log();

  // Afficher les transactions parents
  if (parentTransactions.length > 0) {
    console.log('=== TRANSACTIONS PARENTS (ventilées) ===');
    parentTransactions.slice(0, 10).forEach(tx => {
      console.log(`${tx.date} | ${tx.montant.toFixed(2)} € | ${tx.contrepartie}`);
      console.log(`  ID: ${tx.id} | Enfants: ${tx.child_count}`);
    });
    if (parentTransactions.length > 10) {
      console.log(`... et ${parentTransactions.length - 10} autres\n`);
    }
    console.log();
  }

  // Trouver les doublons
  const duplicates = [];
  transactionGroups.forEach((txs, key) => {
    if (txs.length > 1) {
      duplicates.push({ key, transactions: txs });
    }
  });

  if (duplicates.length > 0) {
    console.log(`⚠️  DOUBLONS TROUVÉS: ${duplicates.length} groupes\n`);

    duplicates.slice(0, 20).forEach((dup, idx) => {
      console.log(`\n--- Doublon ${idx + 1} ---`);
      console.log(`Clé: ${dup.key}`);
      console.log(`Nombre: ${dup.transactions.length} transactions identiques\n`);

      dup.transactions.forEach((tx, i) => {
        console.log(`  ${i + 1}. ID: ${tx.id}`);
        console.log(`     Ref banque: ${tx.reference_banque}`);
        console.log(`     Parent: ${tx.is_parent ? 'OUI' : 'NON'}`);
        console.log(`     Parent ID: ${tx.parent_transaction_id || 'N/A'}`);
      });
    });

    if (duplicates.length > 20) {
      console.log(`\n... et ${duplicates.length - 20} autres groupes de doublons`);
    }
  } else {
    console.log('✅ Aucun doublon trouvé basé sur date+montant+contrepartie\n');
  }

  // Calculer les totaux
  let totalRevenus = 0;
  let totalDepenses = 0;

  transactionGroups.forEach(txs => {
    // Prendre la première transaction de chaque groupe (pour éviter le double comptage)
    const tx = txs[0];
    if (tx.montant > 0) {
      totalRevenus += tx.montant;
    } else {
      totalDepenses += Math.abs(tx.montant);
    }
  });

  console.log('\n=== TOTAUX (sans doublons) ===');
  console.log(`Groupes uniques de transactions: ${transactionGroups.size}`);
  console.log(`Revenus: ${totalRevenus.toFixed(2)} €`);
  console.log(`Dépenses: ${totalDepenses.toFixed(2)} €`);
  console.log(`Solde net: ${(totalRevenus - totalDepenses).toFixed(2)} €`);
  console.log();

  console.log('=== COMPARAISON AVEC CSV ===');
  console.log(`CSV - Transactions: 955`);
  console.log(`CSV - Revenus: 57291.66 €`);
  console.log(`CSV - Dépenses: 68559.97 €`);
  console.log();
  console.log(`Écart transactions: ${transactionGroups.size - 955}`);
  console.log(`Écart revenus: ${(totalRevenus - 57291.66).toFixed(2)} €`);
  console.log(`Écart dépenses: ${(totalDepenses - 68559.97).toFixed(2)} €`);
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
