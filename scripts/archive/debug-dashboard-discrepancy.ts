/**
 * Script de diagnostic pour identifier l'écart entre le CSV bancaire et le dashboard
 *
 * Écart identifié :
 * - Revenus CSV: 57 291,66 € vs Dashboard: 57 998,66 € (diff: +707,00 €)
 * - Dépenses CSV: 68 559,97 € vs Dashboard: 66 993,25 € (diff: -1 566,72 €)
 * - Solde final: 4 741,26 € vs Dashboard: 7 014,98 € (diff: +2 273,72 €)
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { startOfDay, endOfDay } from 'date-fns';

// Configuration Firebase (à adapter selon votre config)
const firebaseConfig = {
  // Copier depuis votre fichier de config
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CLUB_ID = 'votre-club-id'; // À remplacer
const FISCAL_YEAR_START = new Date('2025-01-01');
const FISCAL_YEAR_END = new Date('2025-12-31');
const CURRENT_ACCOUNT_IBAN = 'BE26210016070629';

async function debugDashboardDiscrepancy() {
  console.log('=== DIAGNOSTIC DES ÉCARTS DASHBOARD ===\n');

  const normalizedCurrentAccount = CURRENT_ACCOUNT_IBAN.replace(/\s/g, '');

  // Charger toutes les transactions de la période
  const txRef = collection(db, 'clubs', CLUB_ID, 'transactions_bancaires');
  const q = query(
    txRef,
    where('date_execution', '>=', Timestamp.fromDate(startOfDay(FISCAL_YEAR_START))),
    where('date_execution', '<=', Timestamp.fromDate(endOfDay(FISCAL_YEAR_END)))
  );

  const snapshot = await getDocs(q);
  console.log(`Total transactions dans Firestore (période fiscale): ${snapshot.size}\n`);

  let revenus_dashboard = 0;
  let depenses_dashboard = 0;
  let count_dashboard = 0;

  let revenus_excluded = 0;
  let depenses_excluded = 0;
  let count_excluded = 0;

  const excluded_transactions: any[] = [];
  const counted_transactions: any[] = [];

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const montant = data.montant || 0;

    // Reproduire la logique du dashboard
    let shouldExclude = false;
    let exclusionReason = '';

    // 1. Exclure les transactions ventilées (parents)
    if (data.is_parent) {
      shouldExclude = true;
      exclusionReason = 'Transaction parent (ventilée)';
    }

    // 2. Filtrer par compte courant
    if (!shouldExclude && normalizedCurrentAccount) {
      const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';
      if (normalizedTxAccount !== normalizedCurrentAccount) {
        shouldExclude = true;
        exclusionReason = `Mauvais compte: ${data.numero_compte}`;
      }
    }

    if (shouldExclude) {
      count_excluded++;
      if (montant > 0) {
        revenus_excluded += montant;
      } else if (montant < 0) {
        depenses_excluded += Math.abs(montant);
      }

      excluded_transactions.push({
        id: doc.id,
        date: data.date_execution?.toDate()?.toLocaleDateString('fr-FR'),
        montant,
        compte: data.numero_compte,
        contrepartie: data.nom_contrepartie,
        reason: exclusionReason
      });
    } else {
      count_dashboard++;
      if (montant > 0) {
        revenus_dashboard += montant;
      } else if (montant < 0) {
        depenses_dashboard += Math.abs(montant);
      }

      counted_transactions.push({
        id: doc.id,
        date: data.date_execution?.toDate()?.toLocaleDateString('fr-FR'),
        montant,
        compte: data.numero_compte,
        contrepartie: data.nom_contrepartie
      });
    }
  });

  console.log('=== RÉSULTATS DASHBOARD (recalculés) ===');
  console.log(`Transactions comptées: ${count_dashboard}`);
  console.log(`Revenus: ${revenus_dashboard.toFixed(2)} €`);
  console.log(`Dépenses: ${depenses_dashboard.toFixed(2)} €`);
  console.log(`Solde net: ${(revenus_dashboard - depenses_dashboard).toFixed(2)} €`);
  console.log();

  console.log('=== RÉSULTATS CSV (attendus) ===');
  console.log('Transactions: 955');
  console.log('Revenus: 57 291,66 €');
  console.log('Dépenses: 68 559,97 €');
  console.log('Solde net: -11 268,31 €');
  console.log();

  console.log('=== ÉCARTS ===');
  console.log(`Revenus: ${(revenus_dashboard - 57291.66).toFixed(2)} €`);
  console.log(`Dépenses: ${(depenses_dashboard - 68559.97).toFixed(2)} €`);
  console.log(`Solde: ${((revenus_dashboard - depenses_dashboard) - (-11268.31)).toFixed(2)} €`);
  console.log();

  console.log('=== TRANSACTIONS EXCLUES ===');
  console.log(`Nombre: ${count_excluded}`);
  console.log(`Revenus exclus: ${revenus_excluded.toFixed(2)} €`);
  console.log(`Dépenses exclues: ${depenses_excluded.toFixed(2)} €`);
  console.log();

  if (excluded_transactions.length > 0) {
    console.log('Détail des transactions exclues (premières 20):');
    excluded_transactions.slice(0, 20).forEach(tx => {
      console.log(`- ${tx.date} | ${tx.montant.toFixed(2)} € | ${tx.contrepartie} | ${tx.compte}`);
      console.log(`  Raison: ${tx.reason}`);
    });
  }

  console.log('\n=== ANALYSE ===');
  console.log(`Nombre de transactions dans Firestore: ${snapshot.size}`);
  console.log(`Nombre de transactions dans CSV: 955`);
  console.log(`Différence: ${snapshot.size - 955}`);

  if (snapshot.size > 955) {
    console.log(`\n⚠️ Il y a ${snapshot.size - 955} transactions EN PLUS dans Firestore`);
    console.log('Cela pourrait expliquer les écarts.');
  } else if (snapshot.size < 955) {
    console.log(`\n⚠️ Il y a ${955 - snapshot.size} transactions EN MOINS dans Firestore`);
    console.log('Certaines transactions du CSV n\'ont pas été importées.');
  }
}

debugDashboardDiscrepancy().catch(console.error);
