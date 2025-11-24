#!/usr/bin/env node

/**
 * Script de restore Firestore depuis backup JSON
 *
 * ⚠️ ATTENTION: Ce script ÉCRASE les collections existantes !
 *
 * Usage:
 *   node scripts/restore-firestore.js --backup-dir <path> [options]
 *
 * Options:
 *   --backup-dir PATH : Dossier backup à restaurer (obligatoire)
 *   --collections X,Y : Collections spécifiques (ou "all" pour toutes)
 *   --dry-run         : Simulation sans écriture Firestore
 *   --emulator        : Restore vers Firebase Emulators
 *
 * Exemples:
 *   node scripts/restore-firestore.js \
 *     --backup-dir ../backups/firestore-backup-2025-10-22T14-30-00 \
 *     --collections all
 *
 *   node scripts/restore-firestore.js \
 *     --backup-dir ../backups/firestore-backup-2025-10-22T14-30-00 \
 *     --collections evenements,event_registrations \
 *     --dry-run
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const backupDirIndex = args.indexOf('--backup-dir');
const collectionsIndex = args.indexOf('--collections');
const dryRun = args.includes('--dry-run');
const useEmulator = args.includes('--emulator');

if (backupDirIndex === -1 || !args[backupDirIndex + 1]) {
  console.error('❌ Erreur: --backup-dir obligatoire');
  console.error('\nUsage:');
  console.error('  node scripts/restore-firestore.js --backup-dir <path> [options]');
  process.exit(1);
}

const BACKUP_DIR = path.resolve(args[backupDirIndex + 1]);
const COLLECTIONS_ARG = collectionsIndex !== -1 && args[collectionsIndex + 1]
  ? args[collectionsIndex + 1]
  : 'all';
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
 * Désérialise un objet JSON (reconvertit timestamps)
 */
function deserializeTimestamp(obj) {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'object' && obj._type === 'timestamp') {
    return new Timestamp(obj._seconds, obj._nanoseconds);
  }

  if (typeof obj === 'object' && obj._type === 'date') {
    return new Date(obj._value);
  }

  if (Array.isArray(obj)) {
    return obj.map(deserializeTimestamp);
  }

  if (typeof obj === 'object') {
    const deserialized = {};
    for (const [key, value] of Object.entries(obj)) {
      deserialized[key] = deserializeTimestamp(value);
    }
    return deserialized;
  }

  return obj;
}

/**
 * Restaure une collection depuis JSON
 */
async function restoreCollection(db, collectionName, backupFilePath, dryRun) {
  if (!fs.existsSync(backupFilePath)) {
    console.log(`   ⚠️  Fichier ${collectionName}.json introuvable, ignoré`);
    return 0;
  }

  const jsonContent = fs.readFileSync(backupFilePath, 'utf-8');
  const documents = JSON.parse(jsonContent);

  if (dryRun) {
    console.log(`   🔍 DRY-RUN: ${documents.length} docs seraient restaurés`);
    return documents.length;
  }

  const collectionPath = `clubs/${CLUB_ID}/${collectionName}`;
  const collectionRef = db.collection(collectionPath);

  // Batch writes (max 500 docs par batch)
  const BATCH_SIZE = 500;
  let totalRestored = 0;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const batchDocs = documents.slice(i, i + BATCH_SIZE);

    for (const doc of batchDocs) {
      const docRef = collectionRef.doc(doc.id);
      const data = deserializeTimestamp(doc.data);
      batch.set(docRef, data, { merge: false }); // Écrase document existant
    }

    await batch.commit();
    totalRestored += batchDocs.length;

    if (documents.length > BATCH_SIZE) {
      process.stdout.write(`\r   Progression: ${totalRestored}/${documents.length} docs...`);
    }
  }

  if (documents.length > BATCH_SIZE) {
    process.stdout.write('\r');
  }

  return totalRestored;
}

/**
 * Exécute le restore
 */
async function runRestore() {
  console.log('🔄 RESTORE FIRESTORE');
  console.log('====================\n');

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
    console.log('📋 Métadonnées backup:');
    console.log(`   Date         : ${new Date(metadata.timestamp).toLocaleString('fr-FR')}`);
    console.log(`   Mode         : ${metadata.mode}`);
    console.log(`   Club ID      : ${metadata.clubId}`);
    console.log(`   Total docs   : ${metadata.totalDocuments}`);
    console.log('');
  }

  // Déterminer collections à restaurer
  let collectionsToRestore = [];
  if (COLLECTIONS_ARG === 'all') {
    if (metadata && metadata.collections) {
      collectionsToRestore = Object.keys(metadata.collections);
    } else {
      // Fallback: lister fichiers .json
      collectionsToRestore = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.json') && f !== '_metadata.json')
        .map(f => f.replace('.json', ''));
    }
  } else {
    collectionsToRestore = COLLECTIONS_ARG.split(',').map(c => c.trim());
  }

  console.log('🎯 Collections à restaurer:');
  collectionsToRestore.forEach(c => console.log(`   - ${c}`));
  console.log('');

  if (dryRun) {
    console.log('🔍 MODE DRY-RUN: Aucune écriture Firestore\n');
  } else {
    console.log('⚠️  ATTENTION: Les collections existantes seront ÉCRASÉES !');
    console.log('   Appuyez sur Ctrl+C pour annuler dans les 3 secondes...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Initialiser Firebase
  const db = initializeFirebase();

  // Restaurer collections
  console.log('🔄 Restore en cours...\n');

  const stats = {
    totalRestored: 0,
    collections: {}
  };

  for (const collectionName of collectionsToRestore) {
    const backupFilePath = path.join(BACKUP_DIR, `${collectionName}.json`);

    process.stdout.write(`   ${collectionName.padEnd(25, ' ')}... `);

    const restoredCount = await restoreCollection(db, collectionName, backupFilePath, dryRun);

    stats.collections[collectionName] = restoredCount;
    stats.totalRestored += restoredCount;

    console.log(`✅ ${restoredCount} docs restaurés`);
  }

  console.log('\n📊 Statistiques:');
  console.log(`   Total documents restaurés : ${stats.totalRestored}`);
  console.log(`   Collections               : ${Object.keys(stats.collections).length}`);

  if (dryRun) {
    console.log('\n🔍 DRY-RUN terminé. Aucune modification Firestore.');
  } else {
    console.log('\n✅ Restore terminé avec succès !');
  }
}

// Exécution
if (require.main === module) {
  runRestore()
    .then(() => {
      console.log('\n🎉 Processus terminé.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erreur fatale:', error);
      process.exit(1);
    });
}

module.exports = { runRestore };
