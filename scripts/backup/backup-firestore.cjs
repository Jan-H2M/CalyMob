/**
 * Backup Firestore - Export données avant migration
 * Usage: node scripts/backup-firestore.cjs
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const clubId = 'calypso';

async function backupCollection(collectionName) {
  console.log(`\n📦 Backup ${collectionName}...`);

  const collectionRef = db.collection(`clubs/${clubId}/${collectionName}`);
  const snapshot = await collectionRef.get();

  const data = [];
  snapshot.forEach(doc => {
    data.push({
      id: doc.id,
      ...doc.data()
    });
  });

  console.log(`   ✅ ${data.length} documents exportés`);
  return { collection: collectionName, count: data.length, documents: data };
}

async function main() {
  console.log('🔄 BACKUP FIRESTORE - Pré-unification membres');
  console.log('=' .repeat(60));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupDir = path.join(__dirname, '../backups');

  // Créer dossier backups
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  try {
    // Backup collections critiques
    const collections = ['members', 'inventory_members'];
    const backup = {
      timestamp,
      clubId,
      collections: {}
    };

    for (const collectionName of collections) {
      const result = await backupCollection(collectionName);
      backup.collections[collectionName] = result;
    }

    // Sauvegarder JSON
    const backupFile = path.join(backupDir, `firestore-backup-${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log(`✅ BACKUP COMPLET: ${backupFile}`);
    console.log('\n📊 Statistiques:');
    for (const [name, data] of Object.entries(backup.collections)) {
      console.log(`   - ${name}: ${data.count} documents`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur backup:', error);
    process.exit(1);
  }
}

main();
