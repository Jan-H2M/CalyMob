#!/usr/bin/env node

/**
 * Script de backup complet Firestore
 *
 * Usage:
 *   node scripts/backup-firestore.js [options]
 *
 * Options:
 *   --emulator    : Backup depuis Firebase Emulators (localhost:8080)
 *   --label TEXT  : Label personnalisé pour le backup (ex: "post-migration")
 *
 * Exemple:
 *   node scripts/backup-firestore.js
 *   node scripts/backup-firestore.js --emulator
 *   node scripts/backup-firestore.js --label "post-migration"
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Parse arguments
const args = process.argv.slice(2);
const useEmulator = args.includes('--emulator');
const labelIndex = args.indexOf('--label');
const customLabel = labelIndex !== -1 && args[labelIndex + 1] ? args[labelIndex + 1] : '';

// Configuration
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'firebase-admin-key.json');
const BACKUPS_DIR = path.join(__dirname, '..', '..', 'backups');
const CLUB_ID = 'calypso';

// Collections à sauvegarder
const COLLECTIONS = [
  'evenements',
  'event_registrations',
  'bank_transactions',
  'expense_claims',
  'members',
  'inventory_members', // ← AJOUTÉ pour backup pré-unification
  'settings',
  'fiscal_years',
  'audit_logs'
];

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
      console.error(`   Chemin attendu: ${SERVICE_ACCOUNT_PATH}`);
      console.error('\n📋 Pour créer ce fichier:');
      console.error('   1. Firebase Console → Project Settings → Service Accounts');
      console.error('   2. Generate New Private Key');
      console.error('   3. Sauvegarder comme firebase-admin-key.json dans calycompta-app/');
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
 * Convertit un Timestamp Firestore en ISO string pour JSON
 */
function serializeTimestamp(obj) {
  if (obj === null || obj === undefined) return obj;

  if (obj instanceof Timestamp) {
    return { _type: 'timestamp', _seconds: obj.seconds, _nanoseconds: obj.nanoseconds };
  }

  if (obj instanceof Date) {
    return { _type: 'date', _value: obj.toISOString() };
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeTimestamp);
  }

  if (typeof obj === 'object') {
    const serialized = {};
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeTimestamp(value);
    }
    return serialized;
  }

  return obj;
}

/**
 * Sauvegarde une collection complète
 */
async function backupCollection(db, collectionPath, outputPath) {
  try {
    const collectionRef = db.collection(collectionPath);
    const snapshot = await collectionRef.get();

    const documents = [];
    snapshot.forEach(doc => {
      documents.push({
        id: doc.id,
        data: serializeTimestamp(doc.data())
      });
    });

    // Écriture JSON
    fs.writeFileSync(outputPath, JSON.stringify(documents, null, 2), 'utf-8');

    return documents.length;
  } catch (error) {
    console.error(`   ❌ Erreur backup ${collectionPath}:`, error.message);
    return 0;
  }
}

/**
 * Calcule checksum MD5 d'un fichier
 */
function calculateChecksum(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Exécute le backup complet
 */
async function runBackup() {
  console.log('📦 BACKUP FIRESTORE');
  console.log('==================\n');

  // Créer dossier backups si inexistant
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    console.log(`✅ Dossier créé: ${BACKUPS_DIR}\n`);
  }

  // Créer dossier backup avec timestamp
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const label = customLabel ? `-${customLabel}` : '';
  const backupDirName = `firestore-backup-${timestamp}${label}`;
  const backupDir = path.join(BACKUPS_DIR, backupDirName);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`📂 Dossier backup: ${backupDirName}\n`);

  // Initialiser Firebase
  const db = initializeFirebase();

  // Statistiques
  const stats = {
    timestamp: new Date().toISOString(),
    mode: useEmulator ? 'emulator' : 'production',
    clubId: CLUB_ID,
    collections: {},
    totalDocuments: 0
  };

  // Backup chaque collection
  console.log('🔄 Backup collections...\n');

  for (const collectionName of COLLECTIONS) {
    const collectionPath = `clubs/${CLUB_ID}/${collectionName}`;
    const outputPath = path.join(backupDir, `${collectionName}.json`);

    process.stdout.write(`   ${collectionName.padEnd(25, ' ')}... `);

    const docCount = await backupCollection(db, collectionPath, outputPath);

    if (docCount > 0) {
      const checksum = calculateChecksum(outputPath);
      stats.collections[collectionName] = {
        documentCount: docCount,
        filePath: path.relative(BACKUPS_DIR, outputPath),
        checksum: checksum,
        size: fs.statSync(outputPath).size
      };
      stats.totalDocuments += docCount;
      console.log(`✅ ${docCount} docs (${checksum.substring(0, 8)}...)`);
    } else {
      // Collection vide, supprimer fichier JSON vide
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      console.log(`⚠️  0 docs (collection vide)`);
    }
  }

  // Sauvegarder métadonnées
  const metadataPath = path.join(backupDir, '_metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(stats, null, 2), 'utf-8');

  console.log('\n📊 Statistiques:');
  console.log(`   Total documents : ${stats.totalDocuments}`);
  console.log(`   Collections     : ${Object.keys(stats.collections).length}`);
  console.log(`   Taille totale   : ${formatBytes(getTotalSize(backupDir))}`);

  console.log('\n✅ Backup terminé avec succès !');
  console.log(`📁 Emplacement: ${backupDir}`);

  return backupDir;
}

/**
 * Calcule taille totale d'un dossier
 */
function getTotalSize(dirPath) {
  let totalSize = 0;
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      totalSize += stats.size;
    }
  });
  return totalSize;
}

/**
 * Formate bytes en Ko/Mo/Go
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Exécution
if (require.main === module) {
  runBackup()
    .then(() => {
      console.log('\n🎉 Processus terminé.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erreur fatale:', error);
      process.exit(1);
    });
}

module.exports = { runBackup };
