/**
 * Script de recalcul du solde - Méthode de référence
 *
 * Ce script recalcule le solde exactement comme le fait l'application
 * en appliquant les mêmes règles que dashboardService.ts
 *
 * Utilisation:
 *   node scripts/recalculate-balance.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../serviceAccountKey.json'), 'utf8')
);
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const CLUB_ID = 'calypso';

async function recalculateBalance() {
  console.log('🧮 === RECALCUL DU SOLDE (Méthode Application) ===\n');

  try {
    // 1. Charger l'année fiscale courante (2025)
    const fiscalYearDoc = await db.collection('clubs').doc(CLUB_ID).collection('fiscal_years').doc('FY2025').get();

    if (!fiscalYearDoc.exists) {
      console.error('❌ Année fiscale 2025 non trouvée');
      process.exit(1);
    }

    const fiscalYear = fiscalYearDoc.data();
    const opening_balance = fiscalYear.opening_balances?.bank_current || 0;
    const account_number = fiscalYear.account_numbers?.bank_current;
    const normalizedAccount = account_number?.replace(/\s/g, '');

    console.log('📅 Année fiscale:', fiscalYear.year);
    console.log('📊 Opening Balance:', opening_balance.toFixed(2), '€');
    console.log('🏦 Compte courant:', account_number);
    console.log('');

    // 2. Charger toutes les transactions de l'année fiscale
    const start_date = fiscalYear.start_date?.toDate ? fiscalYear.start_date.toDate() : new Date(fiscalYear.start_date);
    const end_date = fiscalYear.end_date?.toDate ? fiscalYear.end_date.toDate() : new Date(fiscalYear.end_date);

    const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
    const snapshot = await txRef
      .where('date_execution', '>=', Timestamp.fromDate(start_date))
      .where('date_execution', '<=', Timestamp.fromDate(end_date))
      .get();

    console.log('📦 Total transactions chargées:', snapshot.size);

    // 3. Appliquer la logique de calcul exacte de l'application
    let total_revenus = 0;
    let total_depenses = 0;
    let nombre_revenus = 0;
    let nombre_depenses = 0;
    let nombre_transactions = 0;

    // Compteurs de débogage
    let excluded_parent = 0;
    let excluded_wrong_account = 0;
    let excluded_child = 0;
    let included_normal = 0;
    let included_child = 0;

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const montant = data.montant || 0;

      // RÈGLE 1: Exclure les transactions parentes (is_parent=true)
      // Ces transactions sont remplacées par leurs enfants
      if (data.is_parent) {
        excluded_parent++;
        return;
      }

      // RÈGLE 2: Ne compter QUE les transactions du compte courant
      // Évite le double comptage des virements internes
      if (normalizedAccount) {
        const normalizedTxAccount = data.numero_compte?.replace(/\s/g, '') || '';
        if (normalizedTxAccount !== normalizedAccount) {
          excluded_wrong_account++;
          return;
        }
      }

      // Transaction valide - compter
      nombre_transactions++;

      // Identifier le type
      if (data.parent_transaction_id) {
        included_child++;
      } else {
        included_normal++;
      }

      // Calculer revenus/dépenses
      if (montant > 0) {
        total_revenus += montant;
        nombre_revenus++;
      } else if (montant < 0) {
        total_depenses += Math.abs(montant);
        nombre_depenses++;
      }
    });

    // 4. Calculer le solde final
    const solde_net = total_revenus - total_depenses;
    const solde_final = opening_balance + solde_net;

    // 5. Afficher les résultats
    console.log('=== ANALYSE DES TRANSACTIONS ===\n');
    console.log('Transactions chargées:', snapshot.size);
    console.log('  ✅ Incluses (normales):', included_normal);
    console.log('  ✅ Incluses (enfants):', included_child);
    console.log('  ❌ Exclues (parents):', excluded_parent);
    console.log('  ❌ Exclues (autre compte):', excluded_wrong_account);
    console.log('  📊 Total comptées:', nombre_transactions);
    console.log('');

    console.log('=== RÉSULTATS FINANCIERS ===\n');
    console.log('💰 Revenus:');
    console.log('   Nombre:', nombre_revenus);
    console.log('   Montant:', total_revenus.toFixed(2), '€');
    console.log('');
    console.log('💸 Dépenses:');
    console.log('   Nombre:', nombre_depenses);
    console.log('   Montant:', total_depenses.toFixed(2), '€');
    console.log('');
    console.log('📊 Solde Net:', solde_net.toFixed(2), '€');
    console.log('');
    console.log('=== SOLDE FINAL ===\n');
    console.log('🏁 Opening Balance:', opening_balance.toFixed(2), '€');
    console.log('➕ Revenus:', total_revenus.toFixed(2), '€');
    console.log('➖ Dépenses:', total_depenses.toFixed(2), '€');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 SOLDE FINAL:', solde_final.toFixed(2), '€');
    console.log('');

    // 6. Vérification de cohérence
    console.log('=== VÉRIFICATIONS ===\n');

    // Vérifier les orphelins (enfants sans parent)
    const parentIds = new Set();
    snapshot.docs.forEach(doc => {
      if (doc.data().is_parent) {
        parentIds.add(doc.id);
      }
    });

    let orphans = 0;
    let orphans_montant = 0;
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.parent_transaction_id && !parentIds.has(data.parent_transaction_id)) {
        orphans++;
        orphans_montant += data.montant || 0;
      }
    });

    if (orphans > 0) {
      console.log('⚠️  ORPHELINS DÉTECTÉS:', orphans, 'transactions');
      console.log('   Impact sur solde:', orphans_montant.toFixed(2), '€');
      console.log('   Action: Exécuter fix-all-discrepancies.mjs');
    } else {
      console.log('✅ Aucun orphelin détecté');
    }

    // Vérifier les parents mal configurés
    const bad_parents = snapshot.docs.filter(doc => doc.data().is_parent).length;
    if (bad_parents > 0) {
      console.log('⚠️  PARENTS DÉTECTÉS:', bad_parents, 'transactions');
      console.log('   Ces transactions sont EXCLUES du solde');
      console.log('   Si elles sont dans le CSV bancaire, c\'est une erreur!');
    } else {
      console.log('✅ Aucun parent mal configuré');
    }

    console.log('');
    console.log('✅ Recalcul terminé avec succès');

    return {
      opening_balance,
      total_revenus,
      total_depenses,
      solde_final,
      nombre_transactions
    };
  } catch (error) {
    console.error('❌ ERREUR:', error);
    throw error;
  }
}

// Exécuter
recalculateBalance()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\\n❌ Erreur fatale:', error);
    process.exit(1);
  });
