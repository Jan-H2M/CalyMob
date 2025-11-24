/**
 * Script pour trouver les transactions dans Firestore qui ne sont PAS dans le CSV
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
const CSV_PATH = '/Users/jan/Documents/CALYPSO/bank/CSV_2025-11-16-18.12.csv';

// Fonction pour créer un hash à partir d'une transaction CSV
function createTransactionHash(date, montant, communication, contrepartieIBAN) {
  const normalized = `${date}|${montant}|${communication || ''}|${contrepartieIBAN || ''}`.toLowerCase();
  return normalized;
}

async function findExtraTransactions() {
  console.log('🔍 === RECHERCHE DES TRANSACTIONS EN TROP ===\n');

  // 1. Charger toutes les transactions du CSV
  console.log('📄 Chargement du CSV...\n');
  const csvTransactions = new Map();

  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const lines = csvContent.split('\n');
  const headers = lines[0].split(';');

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = lines[i].split(';');
    const record = {};
    headers.forEach((header, index) => {
      record[header.trim()] = values[index]?.trim() || '';
    });

    if (!record['Date d\'exécution']) continue;

    const hash = createTransactionHash(
      record['Date d\'exécution'],
      record['Montant'],
      record['Communication'],
      record['Compte contrepartie']
    );
    csvTransactions.set(hash, {
      date: record['Date d\'exécution'],
      montant: parseFloat(record['Montant'].replace(',', '.')),
      communication: record['Communication'],
      contrepartie: record['Nom contrepartie']
    });
  }

  console.log(`✅ CSV chargé: ${csvTransactions.size} transactions\n`);

  // 2. Charger toutes les transactions de Firestore
  console.log('🔥 Chargement de Firestore...\n');
  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const snapshot = await txRef
    .where('date_execution', '>=', Timestamp.fromDate(new Date('2025-01-01')))
    .where('date_execution', '<=', Timestamp.fromDate(new Date('2025-12-31')))
    .get();

  const normalizedCurrentAccount = 'BE26210016070629';
  const firestoreTransactions = [];
  const extraTransactions = [];

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const compte = data.numero_compte?.replace(/\s/g, '') || '';

    // Ignorer les parents et autres comptes
    if (data.is_parent || compte !== normalizedCurrentAccount) {
      return;
    }

    const date = data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).replace(/\//g, '/') || '';

    const hash = createTransactionHash(
      date,
      data.montant?.toString().replace('.', ','),
      data.communication,
      data.contrepartie_iban
    );

    const tx = {
      id: doc.id,
      sequence: data.numero_sequence,
      date,
      montant: data.montant,
      communication: data.communication,
      contrepartie: data.contrepartie_nom,
      hash_dedup: data.hash_dedup,
      hash
    };

    firestoreTransactions.push(tx);

    // Vérifier si cette transaction existe dans le CSV
    if (!csvTransactions.has(hash)) {
      extraTransactions.push(tx);
    }
  });

  console.log(`✅ Firestore chargé: ${firestoreTransactions.length} transactions\n`);

  // 3. Afficher les transactions en trop
  if (extraTransactions.length === 0) {
    console.log('✅ Aucune transaction en trop trouvée\n');
    return;
  }

  console.log(`⚠️  ${extraTransactions.length} TRANSACTIONS EN TROP DANS FIRESTORE:\n`);

  let totalImpact = 0;
  extraTransactions.forEach((tx, i) => {
    console.log(`${i + 1}. ${tx.date} | ${tx.montant} € | ${tx.contrepartie || 'N/A'}`);
    console.log(`   Seq: ${tx.sequence} | ID: ${tx.id}`);
    console.log(`   Communication: ${tx.communication || 'N/A'}`);
    console.log('');
    totalImpact += tx.montant;
  });

  console.log('=== RÉSUMÉ ===');
  console.log(`Transactions en trop: ${extraTransactions.length}`);
  console.log(`Impact total: ${totalImpact.toFixed(2)} €\n`);

  console.log('=== VÉRIFICATION ===');
  console.log(`CSV: ${csvTransactions.size} transactions`);
  console.log(`Firestore: ${firestoreTransactions.length} transactions`);
  console.log(`Différence: ${firestoreTransactions.length - csvTransactions.size}`);
  console.log(`Après suppression: ${firestoreTransactions.length - extraTransactions.length} transactions`);
}

findExtraTransactions()
  .then(() => {
    console.log('\n✅ Analyse terminée');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  });
