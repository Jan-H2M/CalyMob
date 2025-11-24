#!/usr/bin/env node

/**
 * Script de Nettoyage de Données de Test - Module Inventaire CalyCompta
 *
 * Supprime TOUTES les données de test créées par generate-inventory-test-data.js
 *
 * SÉCURITÉ:
 * - Liste toutes les données avant suppression
 * - Demande confirmation explicite (taper "DELETE-TEST-DATA")
 * - Mode --dry-run disponible (simulation sans suppression)
 *
 * Usage:
 *   node scripts/cleanup-inventory-test-data.js
 *   node scripts/cleanup-inventory-test-data.js --dry-run  (simulation)
 */

const admin = require('firebase-admin');
const path = require('path');
const readline = require('readline');

// Configuration
const TEST_PREFIX = 'TEST-';
const CLUB_ID = 'calypso';
const DRY_RUN = process.argv.includes('--dry-run');

// Initialiser Firebase Admin
let serviceAccount;
try {
  const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  serviceAccount = require(serviceAccountPath);
} catch (error) {
  console.error('❌ Erreur: serviceAccountKey.json introuvable!');
  console.error('   Placez votre clé de service Firebase dans serviceAccountKey.json');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// ===========================================
// FONCTIONS DE SCAN
// ===========================================

/**
 * Scanner une collection pour trouver les documents de test
 */
async function scanCollection(collectionPath, filterField = 'isTestData') {
  const testDocs = [];

  try {
    const snapshot = await db.collection(collectionPath).get();

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Vérifier si c'est un document de test (plusieurs méthodes)
      const isTest =
        data[filterField] === true ||
        doc.id.startsWith(TEST_PREFIX) ||
        (data.nom && data.nom.includes(TEST_PREFIX)) ||
        (data.prenom && data.prenom.includes(TEST_PREFIX)) ||
        (data.reference && data.reference.startsWith(TEST_PREFIX)) ||
        (data.numero_serie && data.numero_serie.startsWith(TEST_PREFIX)) ||
        (data.email && data.email.includes('calypso-test.be'));

      if (isTest) {
        testDocs.push({
          id: doc.id,
          path: `${collectionPath}/${doc.id}`,
          data: data
        });
      }
    }
  } catch (error) {
    console.error(`   ⚠️  Erreur scan ${collectionPath}:`, error.message);
  }

  return testDocs;
}

/**
 * Trouver toutes les données de test dans Firestore
 */
async function findAllTestData() {
  console.log('🔍 Scan des collections Firestore...\n');

  const collections = [
    { path: `clubs/${CLUB_ID}/item_types`, name: 'Types de matériel' },
    { path: `clubs/${CLUB_ID}/checklists`, name: 'Checklists' },
    { path: `clubs/${CLUB_ID}/members`, name: 'Membres' },
    { path: `clubs/${CLUB_ID}/inventory_items`, name: 'Matériel unitaire' },
    { path: `clubs/${CLUB_ID}/stock_products`, name: 'Produits en stock' },
    { path: `clubs/${CLUB_ID}/loans`, name: 'Prêts' },
    { path: `clubs/${CLUB_ID}/sales`, name: 'Ventes' }
  ];

  const testData = {};
  let totalCount = 0;

  for (const collection of collections) {
    process.stdout.write(`   Scan ${collection.name}...`);
    const docs = await scanCollection(collection.path);
    testData[collection.name] = docs;
    totalCount += docs.length;
    console.log(` ${docs.length} trouvé(s)`);
  }

  console.log('');
  return { testData, totalCount };
}

// ===========================================
// FONCTIONS DE SUPPRESSION
// ===========================================

/**
 * Supprimer les données de test en batch
 */
async function deleteTestData(testData) {
  console.log('\n🗑️  Suppression des données de test...\n');

  let deletedCount = 0;

  for (const [collectionName, docs] of Object.entries(testData)) {
    if (docs.length === 0) continue;

    console.log(`   Suppression ${collectionName}...`);

    // Supprimer par batch de 500 (limite Firestore)
    const batchSize = 500;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      const batchDocs = docs.slice(i, i + batchSize);

      for (const doc of batchDocs) {
        const docRef = db.doc(doc.path);
        batch.delete(docRef);
      }

      if (!DRY_RUN) {
        await batch.commit();
      }

      deletedCount += batchDocs.length;
      console.log(`      ✅ ${batchDocs.length} documents supprimés (total: ${deletedCount}/${docs.length})`);
    }
  }

  return deletedCount;
}

// ===========================================
// INTERFACE UTILISATEUR
// ===========================================

/**
 * Afficher un résumé des données trouvées
 */
function displaySummary(testData, totalCount) {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  📊 DONNÉES DE TEST TROUVÉES                          ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');

  for (const [collectionName, docs] of Object.entries(testData)) {
    if (docs.length > 0) {
      console.log(`📁 ${collectionName}: ${docs.length} document(s)`);

      // Afficher les IDs (max 5)
      const idsToShow = docs.slice(0, 5).map(d => d.id);
      console.log(`   ${idsToShow.join(', ')}${docs.length > 5 ? ` ... (+${docs.length - 5})` : ''}`);
      console.log('');
    }
  }

  console.log(`📊 TOTAL: ${totalCount} documents à supprimer\n`);
}

/**
 * Demander confirmation à l'utilisateur
 */
async function askConfirmation(totalCount) {
  if (DRY_RUN) {
    console.log('🔍 MODE DRY-RUN: Aucune suppression ne sera effectuée.\n');
    return true;
  }

  console.log('⚠️  ATTENTION: Cette action est IRRÉVERSIBLE!\n');
  console.log(`🗑️  ${totalCount} documents de test vont être DÉFINITIVEMENT SUPPRIMÉS.\n`);
  console.log('Pour confirmer, tapez exactement: DELETE-TEST-DATA\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Votre réponse: ', (answer) => {
      rl.close();
      console.log('');

      if (answer.trim() === 'DELETE-TEST-DATA') {
        console.log('✅ Confirmation reçue. Suppression en cours...\n');
        resolve(true);
      } else {
        console.log('❌ Confirmation incorrecte. Opération annulée.\n');
        resolve(false);
      }
    });
  });
}

// ===========================================
// FONCTION PRINCIPALE
// ===========================================

async function cleanup() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🧹 NETTOYAGE DONNÉES DE TEST - MODULE INVENTAIRE     ║');
  console.log('║     CalyCompta - Calypso Diving Club                  ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📍 Club: ${CLUB_ID}`);
  console.log(`🏷️  Prefix: ${TEST_PREFIX}`);

  if (DRY_RUN) {
    console.log('🔍 MODE: DRY-RUN (simulation)');
  }

  console.log('');

  try {
    // 1. Scanner toutes les collections
    const { testData, totalCount } = await findAllTestData();

    if (totalCount === 0) {
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║  ℹ️  AUCUNE DONNÉE DE TEST TROUVÉE                     ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('✅ Rien à nettoyer. Le système est déjà propre.');
      console.log('');
      process.exit(0);
    }

    // 2. Afficher résumé
    displaySummary(testData, totalCount);

    // 3. Demander confirmation
    const confirmed = await askConfirmation(totalCount);

    if (!confirmed) {
      console.log('ℹ️  Opération annulée par l\'utilisateur.');
      console.log('');
      process.exit(0);
    }

    // 4. Supprimer les données
    const deletedCount = await deleteTestData(testData);

    // 5. Afficher résultat final
    console.log('');
    console.log('╔════════════════════════════════════════════════════════╗');

    if (DRY_RUN) {
      console.log('║  🔍 DRY-RUN TERMINÉ (aucune suppression réelle)       ║');
    } else {
      console.log('║  ✅ NETTOYAGE TERMINÉ!                                 ║');
    }

    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`📊 ${deletedCount} documents ${DRY_RUN ? 'auraient été supprimés' : 'supprimés avec succès'}`);
    console.log('');

    if (!DRY_RUN) {
      console.log('✅ Toutes les données de test ont été supprimées de Firestore.');
      console.log('');
      console.log('💡 Pour regénérer les données:');
      console.log('   node scripts/generate-inventory-test-data.js');
      console.log('');
    } else {
      console.log('💡 Pour exécuter réellement la suppression:');
      console.log('   node scripts/cleanup-inventory-test-data.js');
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ ERREUR lors du nettoyage:');
    console.error(error);
    console.error('');
    console.error('💡 Vérifiez:');
    console.error('   - Votre serviceAccountKey.json est valide');
    console.error('   - Vous avez les permissions Firebase Admin');
    console.error('   - Les règles Firestore autorisent la suppression');
    console.error('');
    process.exit(1);
  }
}

// Lancer le script
cleanup();
