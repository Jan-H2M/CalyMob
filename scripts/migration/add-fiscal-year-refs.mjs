#!/usr/bin/env node

/**
 * Script de migration : Ajouter fiscal_year_id aux documents existants
 *
 * Usage:
 *   node scripts/add-fiscal-year-refs.mjs [clubId] [--dry-run]
 *
 * Exemples:
 *   node scripts/add-fiscal-year-refs.mjs --dry-run           # Simulation avec calypso-dc
 *   node scripts/add-fiscal-year-refs.mjs calypso-dc          # Exécution réelle
 *   node scripts/add-fiscal-year-refs.mjs autre-club --dry-run
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, query, orderBy } from 'firebase/firestore';

// ============================================================================
// CONFIGURATION
// ============================================================================

const firebaseConfig = {
  apiKey: "AIzaSyCmU-7GABqko2N-2saQNcNNSIyW_BbVCtU",
  authDomain: "calycompta.firebaseapp.com",
  projectId: "calycompta",
  storageBucket: "calycompta.firebasestorage.app",
  messagingSenderId: "328464166969",
  appId: "1:328464166969:web:ee7f4452f92b1b338f5de8"
};

// Parse arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CLUB_ID = args.find(arg => !arg.startsWith('--')) || 'calypso';

console.log('🚀 Migration fiscal_year_id');
console.log('━'.repeat(60));
console.log(`📦 Club: ${CLUB_ID}`);
console.log(`🔧 Mode: ${DRY_RUN ? 'SIMULATION (--dry-run)' : 'EXÉCUTION RÉELLE'}`);
console.log('━'.repeat(60));
console.log('');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================================================
// HELPER: CHARGER ANNÉES FISCALES
// ============================================================================

async function loadFiscalYears(clubId) {
  console.log('📅 Chargement des années fiscales...');

  const fyRef = collection(db, 'clubs', clubId, 'fiscal_years');
  const q = query(fyRef, orderBy('year', 'desc'));
  const snapshot = await getDocs(q);

  const fiscalYears = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      year: data.year,
      status: data.status,
      start_date: data.start_date?.toDate ? data.start_date.toDate() : new Date(data.start_date),
      end_date: data.end_date?.toDate ? data.end_date.toDate() : new Date(data.end_date)
    };
  });

  console.log(`✅ ${fiscalYears.length} année(s) fiscale(s) trouvée(s)\n`);
  fiscalYears.forEach(fy => {
    console.log(`   - ${fy.year}: ${formatDate(fy.start_date)} → ${formatDate(fy.end_date)} (${fy.status})`);
  });
  console.log('');

  return fiscalYears;
}

// ============================================================================
// HELPER: TROUVER ANNÉE FISCALE POUR UNE DATE
// ============================================================================

function findFiscalYearForDate(date, fiscalYears) {
  if (!date || !(date instanceof Date) || isNaN(date)) return null;

  return fiscalYears.find(fy => {
    const start = new Date(fy.start_date);
    const end = new Date(fy.end_date);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return date >= start && date <= end;
  });
}

// ============================================================================
// HELPER: MIGRER UNE COLLECTION
// ============================================================================

async function migrateCollection(clubId, collectionName, dateField, fiscalYears) {
  console.log(`\n📦 Migration collection: ${collectionName}`);
  console.log(`   Champ date: ${dateField}`);
  console.log('━'.repeat(60));

  const collectionRef = collection(db, 'clubs', clubId, collectionName);
  const snapshot = await getDocs(collectionRef);
  console.log(`   📊 ${snapshot.size} document(s) trouvé(s)\n`);

  const stats = {
    total: snapshot.size,
    updated: 0,
    skipped: 0,
    noDate: 0,
    noFiscalYear: 0,
    errors: 0
  };

  for (const docSnapshot of snapshot.docs) {
    const docId = docSnapshot.id;
    const data = docSnapshot.data();

    // Skip si déjà migré
    if (data.fiscal_year_id) {
      console.log(`   ⏭️  ${docId}: Déjà migré (fiscal_year_id=${data.fiscal_year_id})`);
      stats.skipped++;
      continue;
    }

    // Extraire la date
    const dateValue = data[dateField];
    if (!dateValue) {
      console.log(`   ⚠️  ${docId}: Pas de ${dateField}`);
      stats.noDate++;
      continue;
    }

    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);

    // Vérifier date valide
    if (isNaN(date)) {
      console.log(`   ⚠️  ${docId}: Date invalide (${dateField}=${dateValue})`);
      stats.noDate++;
      continue;
    }

    // Trouver année fiscale
    const fiscalYear = findFiscalYearForDate(date, fiscalYears);

    if (!fiscalYear) {
      console.log(`   ⚠️  ${docId}: Aucune année fiscale trouvée pour ${formatDate(date)}`);
      stats.noFiscalYear++;
      continue;
    }

    // Mise à jour
    if (DRY_RUN) {
      console.log(`   🔍 ${docId}: SIMULATION - fiscal_year_id=${fiscalYear.id} (${formatDate(date)} → ${fiscalYear.year})`);
      stats.updated++;
    } else {
      try {
        await updateDoc(docSnapshot.ref, { fiscal_year_id: fiscalYear.id });
        console.log(`   ✅ ${docId}: fiscal_year_id=${fiscalYear.id} (année ${fiscalYear.year})`);
        stats.updated++;
      } catch (error) {
        console.error(`   ❌ ${docId}: Erreur - ${error.message}`);
        stats.errors++;
      }
    }
  }

  // Rapport
  console.log('\n   📊 RAPPORT:');
  console.log(`   ├─ Total: ${stats.total}`);
  console.log(`   ├─ Mis à jour: ${stats.updated}`);
  console.log(`   ├─ Déjà migrés: ${stats.skipped}`);
  console.log(`   ├─ Sans date: ${stats.noDate}`);
  console.log(`   ├─ Hors périodes: ${stats.noFiscalYear}`);
  console.log(`   └─ Erreurs: ${stats.errors}`);

  return stats;
}

// ============================================================================
// HELPER: FORMATER DATE
// ============================================================================

function formatDate(date) {
  if (!date) return 'N/A';
  return date.toLocaleDateString('fr-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    // 1. Charger années fiscales
    const fiscalYears = await loadFiscalYears(CLUB_ID);

    if (fiscalYears.length === 0) {
      console.error('❌ Aucune année fiscale trouvée. Créez-en une d\'abord.');
      console.log('\nCréez une année fiscale via l\'UI: Paramètres → Années fiscales');
      process.exit(1);
    }

    // 2. Migrer collections
    const collections = [
      { name: 'transactions_bancaires', dateField: 'date_execution' },
      { name: 'demandes_remboursement', dateField: 'date_depense' },
      { name: 'operations', dateField: 'date_debut' }
    ];

    const allStats = {
      total: 0,
      updated: 0,
      skipped: 0,
      noDate: 0,
      noFiscalYear: 0,
      errors: 0
    };

    for (const collection of collections) {
      const stats = await migrateCollection(
        CLUB_ID,
        collection.name,
        collection.dateField,
        fiscalYears
      );

      Object.keys(allStats).forEach(key => {
        allStats[key] += stats[key];
      });
    }

    // 3. Rapport global
    console.log('\n\n');
    console.log('━'.repeat(60));
    console.log('📊 RAPPORT GLOBAL');
    console.log('━'.repeat(60));
    console.log(`Total documents: ${allStats.total}`);
    console.log(`✅ Mis à jour: ${allStats.updated}`);
    console.log(`⏭️  Déjà migrés: ${allStats.skipped}`);
    console.log(`⚠️  Sans date: ${allStats.noDate}`);
    console.log(`⚠️  Hors périodes: ${allStats.noFiscalYear}`);
    console.log(`❌ Erreurs: ${allStats.errors}`);
    console.log('━'.repeat(60));

    if (DRY_RUN) {
      console.log('\n⚠️  MODE SIMULATION - Aucune donnée modifiée');
      console.log('   Exécutez sans --dry-run pour appliquer');
    } else {
      console.log('\n✅ Migration terminée!');
    }

    if (allStats.noFiscalYear > 0) {
      console.log('\n⚠️  ATTENTION:');
      console.log(`   ${allStats.noFiscalYear} document(s) hors périodes.`);
      console.log('   Créez les années fiscales manquantes et ré-exécutez.');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERREUR CRITIQUE:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
