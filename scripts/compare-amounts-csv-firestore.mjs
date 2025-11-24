/**
 * Script pour comparer les montants transaction par transaction entre CSV et Firestore
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

async function compareAmounts() {
  console.log('🔍 === COMPARAISON DES MONTANTS CSV vs FIRESTORE ===\n');

  // 1. Charger le CSV
  console.log('📄 Chargement du CSV...\n');
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const lines = csvContent.split('\n');
  const headers = lines[0].split(';');

  const csvBySequence = new Map();

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = lines[i].split(';');
    const record = {};
    headers.forEach((header, index) => {
      record[header.trim().replace(/^\ufeff/, '')] = values[index]?.trim() || '';
    });

    const sequence = record['Nº de séquence'];
    if (sequence && sequence !== '2025-' && sequence.startsWith('2025-')) {
      const montantStr = record['Montant'].replace(',', '.');
      const montant = parseFloat(montantStr);

      csvBySequence.set(sequence, {
        sequence,
        montant,
        date: record['Date d\'exécution'],
        contrepartie: record['Nom de la contrepartie']
      });
    }
  }

  console.log(`✅ CSV: ${csvBySequence.size} transactions chargées\n`);

  // 2. Charger Firestore
  console.log('🔥 Chargement de Firestore...\n');
  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const snapshot = await txRef
    .where('date_execution', '>=', Timestamp.fromDate(new Date('2025-01-01')))
    .where('date_execution', '<=', Timestamp.fromDate(new Date('2025-12-31')))
    .get();

  const firestoreBySequence = new Map();
  const normalizedCurrentAccount = 'BE26210016070629';

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const compte = data.numero_compte?.replace(/\s/g, '') || '';

    // Ignorer parents, enfants, et autres comptes
    if (data.is_parent || data.parent_transaction_id || compte !== normalizedCurrentAccount) {
      return;
    }

    const sequence = data.numero_sequence;
    if (sequence && sequence !== '2025-') {
      firestoreBySequence.set(sequence, {
        id: doc.id,
        sequence,
        montant: data.montant,
        date: data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR'),
        contrepartie: data.contrepartie_nom
      });
    }
  });

  console.log(`✅ Firestore: ${firestoreBySequence.size} transactions chargées\n`);

  // 3. Comparer les montants
  const differences = [];
  const csvOnly = [];
  const firestoreOnly = [];

  csvBySequence.forEach((csvTx, sequence) => {
    const fsTx = firestoreBySequence.get(sequence);

    if (!fsTx) {
      csvOnly.push(csvTx);
    } else if (Math.abs(csvTx.montant - fsTx.montant) > 0.01) {
      differences.push({
        sequence,
        csvMontant: csvTx.montant,
        fsMontant: fsTx.montant,
        difference: fsTx.montant - csvTx.montant,
        csvData: csvTx,
        fsData: fsTx
      });
    }
  });

  firestoreBySequence.forEach((fsTx, sequence) => {
    if (!csvBySequence.has(sequence)) {
      firestoreOnly.push(fsTx);
    }
  });

  // Afficher les résultats
  if (differences.length > 0) {
    console.log(`⚠️  ${differences.length} DIFFÉRENCES DE MONTANTS TROUVÉES:\n`);

    let totalDiff = 0;
    differences.forEach((diff, i) => {
      console.log(`${i + 1}. ${diff.sequence}`);
      console.log(`   CSV:       ${diff.csvMontant.toFixed(2)} €`);
      console.log(`   Firestore: ${diff.fsMontant.toFixed(2)} €`);
      console.log(`   Différence: ${diff.difference > 0 ? '+' : ''}${diff.difference.toFixed(2)} €`);
      console.log(`   Contrepartie: ${diff.csvData.contrepartie || 'N/A'}`);
      console.log('');
      totalDiff += diff.difference;
    });

    console.log(`Impact total des différences: ${totalDiff > 0 ? '+' : ''}${totalDiff.toFixed(2)} €\n`);
  } else {
    console.log('✅ Aucune différence de montant trouvée\n');
  }

  if (csvOnly.length > 0) {
    console.log(`⚠️  ${csvOnly.length} TRANSACTIONS DANS CSV MAIS PAS DANS FIRESTORE:\n`);
    csvOnly.forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.sequence} | ${tx.date} | ${tx.montant} € | ${tx.contrepartie || 'N/A'}`);
    });
    console.log('');
  }

  if (firestoreOnly.length > 0) {
    console.log(`⚠️  ${firestoreOnly.length} TRANSACTIONS DANS FIRESTORE MAIS PAS DANS CSV:\n`);
    firestoreOnly.forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.sequence} | ${tx.date} | ${tx.montant} € | ${tx.contrepartie || 'N/A'}`);
      console.log(`   ID: ${tx.id}`);
    });
    console.log('');
  }

  // Résumé
  console.log('=== RÉSUMÉ ===');
  console.log(`Différences de montants: ${differences.length}`);
  console.log(`Manquantes dans Firestore: ${csvOnly.length}`);
  console.log(`En trop dans Firestore: ${firestoreOnly.length}\n`);
}

compareAmounts()
  .then(() => {
    console.log('✅ Analyse terminée');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  });
