#!/usr/bin/env node

/**
 * Script de comparaison Backup JSON vs Firestore Production
 *
 * Usage:
 *   node scripts/compare-firestore.js --backup-dir <path> [options]
 *
 * Options:
 *   --backup-dir PATH : Dossier backup à comparer (obligatoire)
 *   --emulator        : Comparer avec Firebase Emulators
 *
 * Exemple:
 *   node scripts/compare-firestore.js \
 *     --backup-dir ../backups/firestore-backup-2025-10-22T14-30-00
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Parse arguments
const args = process.argv.slice(2);
const backupDirIndex = args.indexOf('--backup-dir');
const useEmulator = args.includes('--emulator');

if (backupDirIndex === -1 || !args[backupDirIndex + 1]) {
  console.error('❌ Erreur: --backup-dir obligatoire');
  console.error('\nUsage:');
  console.error('  node scripts/compare-firestore.js --backup-dir <path>');
  process.exit(1);
}

const BACKUP_DIR = path.resolve(args[backupDirIndex + 1]);
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'firebase-admin-key.json');
const CLUB_ID = 'calypso';

/**
 * Initialise Firebase Admin
 */
function initializeFirebase() {
  if (useEmulator) {
    console.log('🔧 Mode Emulator');
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    initializeApp({ projectId: 'demo-calycompta' });
  } else {
    console.log('🌍 Mode Production');
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      console.error('❌ Erreur: Fichier firebase-admin-key.json introuvable');
      process.exit(1);
    }
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    initializeApp({
      credential: cert(serviceAccount)
    });
  }
  return getFirestore();
}

/**
 * Calcule hash MD5 d'un objet (pour comparer documents)
 */
function objectHash(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Compare une collection backup vs Firestore
 */
async function compareCollection(db, collectionName, backupFilePath) {
  const collectionPath = `clubs/${CLUB_ID}/${collectionName}`;

  // Lire backup JSON
  if (!fs.existsSync(backupFilePath)) {
    return {
      status: 'missing_backup',
      message: 'Fichier backup introuvable'
    };
  }

  const backupDocs = JSON.parse(fs.readFileSync(backupFilePath, 'utf-8'));
  const backupMap = new Map(backupDocs.map(doc => [doc.id, doc.data]));

  // Lire Firestore
  const snapshot = await db.collection(collectionPath).get();
  const firestoreDocs = [];
  snapshot.forEach(doc => {
    firestoreDocs.push({ id: doc.id, data: doc.data() });
  });
  const firestoreMap = new Map(firestoreDocs.map(doc => [doc.id, doc.data]));

  // Comparer
  const stats = {
    backupCount: backupDocs.length,
    firestoreCount: firestoreDocs.length,
    identical: 0,
    modified: 0,
    addedInFirestore: 0,
    removedFromFirestore: 0,
    modifiedIds: [],
    addedIds: [],
    removedIds: []
  };

  // Documents dans backup
  for (const [docId, backupData] of backupMap.entries()) {
    if (firestoreMap.has(docId)) {
      // Document existe des deux côtés, comparer contenu
      const firestoreData = firestoreMap.get(docId);
      const backupHash = objectHash(backupData);
      const firestoreHash = objectHash(firestoreData);

      if (backupHash === firestoreHash) {
        stats.identical++;
      } else {
        stats.modified++;
        stats.modifiedIds.push(docId);
      }
    } else {
      // Document dans backup mais pas dans Firestore
      stats.removedFromFirestore++;
      stats.removedIds.push(docId);
    }
  }

  // Documents dans Firestore mais pas dans backup
  for (const docId of firestoreMap.keys()) {
    if (!backupMap.has(docId)) {
      stats.addedInFirestore++;
      stats.addedIds.push(docId);
    }
  }

  return stats;
}

/**
 * Exécute la comparaison
 */
async function runComparison() {
  console.log('🔍 COMPARAISON BACKUP vs FIRESTORE');
  console.log('===================================\n');

  // Vérifier backup dir
  if (!fs.existsSync(BACKUP_DIR)) {
    console.error(`❌ Erreur: Dossier backup introuvable: ${BACKUP_DIR}`);
    process.exit(1);
  }

  // Lire métadonnées
  const metadataPath = path.join(BACKUP_DIR, '_metadata.json');
  let metadata = null;
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    console.log('📋 Backup:');
    console.log(`   Date         : ${new Date(metadata.timestamp).toLocaleString('fr-FR')}`);
    console.log(`   Total docs   : ${metadata.totalDocuments}`);
    console.log('');
  }

  // Lister collections
  const collections = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json') && f !== '_metadata.json')
    .map(f => f.replace('.json', ''));

  console.log('🔄 Comparaison en cours...\n');

  // Initialiser Firebase
  const db = initializeFirebase();

  // Comparer chaque collection
  const results = {};
  let totalIdentical = 0;
  let totalModified = 0;
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const collectionName of collections) {
    const backupFilePath = path.join(BACKUP_DIR, `${collectionName}.json`);

    process.stdout.write(`   ${collectionName.padEnd(25, ' ')}... `);

    const stats = await compareCollection(db, collectionName, backupFilePath);
    results[collectionName] = stats;

    if (stats.status === 'missing_backup') {
      console.log(`⚠️  ${stats.message}`);
      continue;
    }

    totalIdentical += stats.identical;
    totalModified += stats.modified;
    totalAdded += stats.addedInFirestore;
    totalRemoved += stats.removedFromFirestore;

    // Affichage résultat
    if (stats.backupCount === stats.firestoreCount && stats.identical === stats.backupCount) {
      console.log(`✅ ${stats.backupCount} docs (100% identiques)`);
    } else {
      console.log(`⚠️  Backup: ${stats.backupCount}, Firestore: ${stats.firestoreCount}`);
      if (stats.modified > 0) {
        console.log(`      ➜ ${stats.modified} modifiés`);
      }
      if (stats.addedInFirestore > 0) {
        console.log(`      ➜ ${stats.addedInFirestore} ajoutés dans Firestore`);
      }
      if (stats.removedFromFirestore > 0) {
        console.log(`      ➜ ${stats.removedFromFirestore} supprimés de Firestore`);
      }
    }
  }

  console.log('\n📊 Résumé Global:');
  console.log(`   Documents identiques     : ${totalIdentical}`);
  console.log(`   Documents modifiés       : ${totalModified}`);
  console.log(`   Documents ajoutés        : ${totalAdded}`);
  console.log(`   Documents supprimés      : ${totalRemoved}`);

  if (totalModified === 0 && totalAdded === 0 && totalRemoved === 0) {
    console.log('\n✅ Backup et Firestore sont IDENTIQUES !');
  } else {
    console.log('\n⚠️  Différences détectées entre backup et Firestore');

    // Afficher détails si peu de différences
    if (totalModified + totalAdded + totalRemoved <= 10) {
      console.log('\n🔍 Détails des différences:');
      for (const [collectionName, stats] of Object.entries(results)) {
        if (stats.status === 'missing_backup') continue;

        if (stats.modifiedIds.length > 0) {
          console.log(`\n   ${collectionName} - Modifiés:`);
          stats.modifiedIds.slice(0, 5).forEach(id => console.log(`      - ${id}`));
          if (stats.modifiedIds.length > 5) {
            console.log(`      ... et ${stats.modifiedIds.length - 5} autres`);
          }
        }

        if (stats.addedIds.length > 0) {
          console.log(`\n   ${collectionName} - Ajoutés:`);
          stats.addedIds.slice(0, 5).forEach(id => console.log(`      - ${id}`));
          if (stats.addedIds.length > 5) {
            console.log(`      ... et ${stats.addedIds.length - 5} autres`);
          }
        }

        if (stats.removedIds.length > 0) {
          console.log(`\n   ${collectionName} - Supprimés:`);
          stats.removedIds.slice(0, 5).forEach(id => console.log(`      - ${id}`));
          if (stats.removedIds.length > 5) {
            console.log(`      ... et ${stats.removedIds.length - 5} autres`);
          }
        }
      }
    }
  }

  console.log('\n✅ Comparaison terminée.');
}

// Exécution
if (require.main === module) {
  runComparison()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erreur fatale:', error);
      process.exit(1);
    });
}

module.exports = { runComparison };
