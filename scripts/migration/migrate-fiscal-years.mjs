#!/usr/bin/env node

/**
 * Script de migration pour créer les années fiscales depuis les anciennes données
 *
 * Usage:
 *   node scripts/migrate-fiscal-years.mjs [clubId]
 *
 * Exemple:
 *   node scripts/migrate-fiscal-years.mjs calypso
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';

// Configuration Firebase (à adapter selon votre environnement)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "your-api-key",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "your-project.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "your-project-id",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "your-project.appspot.com",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Calculer les soldes d'ouverture en sommant toutes les transactions avant une date
 */
async function calculateOpeningBalances(clubId, beforeDate) {
  console.log(`  Calcul des soldes d'ouverture (transactions avant ${beforeDate.toLocaleDateString()})...`);

  const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
  const q = query(txRef, where('date_execution', '<', Timestamp.fromDate(beforeDate)));
  const snapshot = await getDocs(q);

  let bankCurrent = 0;
  let bankSavings = 0;
  let count = 0;

  snapshot.docs.forEach(doc => {
    const tx = doc.data();
    // Pour l'instant, on additionne toutes les transactions
    // TODO: Améliorer en filtrant par numero_compte
    bankCurrent += tx.montant || 0;
    count++;
  });

  console.log(`  → ${count} transactions trouvées`);
  console.log(`  → Solde calculé compte courant: ${bankCurrent.toFixed(2)} €`);
  console.log(`  → Solde calculé compte épargne: ${bankSavings.toFixed(2)} €`);

  return { bank_current: bankCurrent, bank_savings: bankSavings };
}

/**
 * Créer une année fiscale
 */
async function createFiscalYear(clubId, year, startDate, endDate, openingBalances) {
  const fyId = `FY${year}`;
  const fyRef = doc(db, 'clubs', clubId, 'fiscal_years', fyId);

  // Vérifier si elle existe déjà
  const existing = await getDoc(fyRef);
  if (existing.exists()) {
    console.log(`  ⚠️  L'année fiscale ${year} existe déjà, ignorée`);
    return false;
  }

  const newFiscalYear = {
    year,
    start_date: Timestamp.fromDate(startDate),
    end_date: Timestamp.fromDate(endDate),
    status: 'open',
    opening_balances: openingBalances,
    closing_balances: {
      bank_current: 0,
      bank_savings: 0
    },
    created_at: Timestamp.fromDate(new Date()),
    updated_at: Timestamp.fromDate(new Date()),
    notes: 'Créée automatiquement par le script de migration'
  };

  await setDoc(fyRef, newFiscalYear);
  console.log(`  ✅ Année fiscale ${year} créée avec succès`);
  return true;
}

/**
 * Migrer un club vers le nouveau système d'années fiscales
 */
async function migrateClub(clubId) {
  console.log(`\n🔄 Migration du club: ${clubId}`);
  console.log('━'.repeat(60));

  try {
    // 1. Charger les paramètres généraux
    console.log('\n1️⃣  Chargement des paramètres généraux...');
    const settingsRef = doc(db, 'clubs', clubId, 'settings', 'general');
    const settingsDoc = await getDoc(settingsRef);

    if (!settingsDoc.exists()) {
      console.log('  ⚠️  Aucun paramètre général trouvé, utilisation de l\'année courante');
      const currentYear = new Date().getFullYear();

      const startDate = new Date(currentYear, 0, 1); // 1er janvier
      const endDate = new Date(currentYear, 11, 31); // 31 décembre

      const openingBalances = await calculateOpeningBalances(clubId, startDate);
      await createFiscalYear(clubId, currentYear, startDate, endDate, openingBalances);

      console.log('\n✅ Migration terminée avec succès!');
      return;
    }

    const settings = settingsDoc.data();

    if (!settings.fiscalYear || typeof settings.fiscalYear !== 'number') {
      console.log('  ⚠️  Pas d\'ancien fiscalYear trouvé, utilisation de l\'année courante');
      settings.fiscalYear = new Date().getFullYear();
    }

    const year = settings.fiscalYear;
    console.log(`  → Année fiscale actuelle: ${year}`);

    // 2. Vérifier si une année fiscale existe déjà
    console.log('\n2️⃣  Vérification des années fiscales existantes...');
    const fyRef = collection(db, 'clubs', clubId, 'fiscal_years');
    const fySnapshot = await getDocs(fyRef);

    if (!fySnapshot.empty) {
      console.log(`  ℹ️  ${fySnapshot.docs.length} année(s) fiscale(s) déjà présente(s):`);
      fySnapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`     - ${data.year} (${data.status})`);
      });

      const hasOpen = fySnapshot.docs.some(doc => doc.data().status === 'open');
      if (hasOpen) {
        console.log('\n  ✅ Une année fiscale ouverte existe déjà, pas de migration nécessaire');
        return;
      }
    }

    // 3. Créer l'année fiscale actuelle
    console.log('\n3️⃣  Création de l\'année fiscale...');
    const startDate = new Date(year, 0, 1); // 1er janvier
    const endDate = new Date(year, 11, 31); // 31 décembre

    console.log(`  → Période: ${startDate.toLocaleDateString()} → ${endDate.toLocaleDateString()}`);

    // Calculer les soldes d'ouverture
    const openingBalances = await calculateOpeningBalances(clubId, startDate);

    // Créer l'année fiscale
    const created = await createFiscalYear(clubId, year, startDate, endDate, openingBalances);

    if (created) {
      console.log('\n4️⃣  Création des années précédentes (optionnel)...');

      // Optionnel: créer les 2 années précédentes si des transactions existent
      for (let prevYear = year - 1; prevYear >= year - 2; prevYear--) {
        const prevStartDate = new Date(prevYear, 0, 1);
        const prevEndDate = new Date(prevYear, 11, 31);

        // Vérifier s'il y a des transactions pour cette année
        const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
        const txQuery = query(
          txRef,
          where('date_execution', '>=', Timestamp.fromDate(prevStartDate)),
          where('date_execution', '<=', Timestamp.fromDate(prevEndDate))
        );
        const txSnapshot = await getDocs(txQuery);

        if (txSnapshot.empty) {
          console.log(`  ⏭️  Pas de transactions pour ${prevYear}, ignorée`);
          continue;
        }

        console.log(`  → Année ${prevYear} (${txSnapshot.docs.length} transactions)...`);

        // Calculer soldes d'ouverture
        const prevOpeningBalances = await calculateOpeningBalances(clubId, prevStartDate);

        // Calculer soldes de clôture
        let closingCurrent = prevOpeningBalances.bank_current;
        let closingSavings = prevOpeningBalances.bank_savings;

        txSnapshot.docs.forEach(doc => {
          const tx = doc.data();
          closingCurrent += tx.montant || 0;
        });

        // Créer l'année précédente (status = closed)
        const prevFyId = `FY${prevYear}`;
        const prevFyRef = doc(db, 'clubs', clubId, 'fiscal_years', prevFyId);

        await setDoc(prevFyRef, {
          year: prevYear,
          start_date: Timestamp.fromDate(prevStartDate),
          end_date: Timestamp.fromDate(prevEndDate),
          status: 'closed',
          opening_balances: prevOpeningBalances,
          closing_balances: {
            bank_current: closingCurrent,
            bank_savings: closingSavings
          },
          created_at: Timestamp.fromDate(new Date()),
          updated_at: Timestamp.fromDate(new Date()),
          closed_at: Timestamp.fromDate(new Date()),
          notes: 'Créée automatiquement par le script de migration (année passée)'
        });

        console.log(`    ✅ Année ${prevYear} créée (clôturée)`);
        console.log(`       Solde de clôture: ${closingCurrent.toFixed(2)} €`);
      }
    }

    console.log('\n' + '━'.repeat(60));
    console.log('✅ Migration terminée avec succès!');
    console.log('\n📊 Résumé:');

    // Afficher un résumé
    const finalFySnapshot = await getDocs(fyRef);
    console.log(`   Total d'années fiscales: ${finalFySnapshot.docs.length}`);
    finalFySnapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`   - ${data.year}: ${data.status}`);
    });

  } catch (error) {
    console.error('\n❌ Erreur lors de la migration:', error);
    throw error;
  }
}

/**
 * Point d'entrée principal
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   Script de Migration vers le Système d\'Années Fiscales   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const clubId = process.argv[2] || 'calypso';

  if (!clubId) {
    console.error('\n❌ Erreur: Vous devez spécifier un clubId');
    console.log('\nUsage: node scripts/migrate-fiscal-years.mjs [clubId]');
    console.log('Exemple: node scripts/migrate-fiscal-years.mjs calypso');
    process.exit(1);
  }

  try {
    await migrateClub(clubId);
    console.log('\n✨ Migration complétée!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 La migration a échoué:', error);
    process.exit(1);
  }
}

// Exécuter le script
main();
