const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const crypto = require('crypto');
const readline = require('readline');

// Initialize Firebase Admin
initializeApp({
  projectId: 'calycompta'
});

const db = getFirestore();
const storage = getStorage().bucket('calycompta.firebasestorage.app');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

/**
 * Calcule le hash SHA-256 d'un buffer
 */
function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Télécharge un fichier depuis Firebase Storage et calcule son hash
 */
async function downloadAndHash(url) {
  try {
    // Extract path from URL
    // Format: https://firebasestorage.googleapis.com/v0/b/[bucket]/o/[path]?alt=media&token=[token]
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/o\/(.+)/);
    if (!pathMatch) {
      throw new Error(`Invalid Firebase Storage URL: ${url}`);
    }

    const encodedPath = pathMatch[1];
    const filePath = decodeURIComponent(encodedPath);

    console.log(`    📥 Downloading: ${filePath.substring(0, 60)}...`);

    // Download file
    const file = storage.file(filePath);
    const [buffer] = await file.download();

    // Calculate hash
    const hash = hashBuffer(buffer);
    console.log(`    ✅ Hash: ${hash.substring(0, 16)}...`);

    return hash;
  } catch (error) {
    console.error(`    ❌ Error downloading file:`, error.message);
    return null;
  }
}

/**
 * Migre les documents d'une dépense
 */
async function migrateDemandeDocs(demande, clubId, dryRun = false) {
  const docs = demande.documents_justificatifs || [];

  if (docs.length === 0) {
    return { processed: 0, updated: 0, skipped: 0, errors: 0 };
  }

  console.log(`\n  📄 Dépense: ${demande.description || demande.id}`);
  console.log(`     Documents: ${docs.length}`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const updatedDocs = [];

  for (const doc of docs) {
    processed++;
    console.log(`\n  [${processed}/${docs.length}] ${doc.nom_original}`);

    // Check if already has hash
    if (doc.file_hash) {
      console.log(`    ⏭️  Already has hash, skipping`);
      skipped++;
      updatedDocs.push(doc);
      continue;
    }

    // Download and hash
    const hash = await downloadAndHash(doc.url);

    if (!hash) {
      errors++;
      updatedDocs.push(doc);
      continue;
    }

    // Add hash to document
    const updatedDoc = { ...doc, file_hash: hash };
    updatedDocs.push(updatedDoc);
    updated++;
  }

  // Update Firestore (if not dry run and something changed)
  if (!dryRun && updated > 0) {
    try {
      const demandeRef = db.collection('clubs').doc(clubId).collection('demandes_remboursement').doc(demande.id);
      await demandeRef.update({
        documents_justificatifs: updatedDocs
      });
      console.log(`  💾 Firestore updated`);
    } catch (error) {
      console.error(`  ❌ Error updating Firestore:`, error.message);
      errors++;
    }
  }

  return { processed, updated, skipped, errors };
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🔧 Migration: Add SHA-256 Hash to Document Justificatifs');
  console.log('━'.repeat(70));

  try {
    const clubId = (await question('Club ID [calypso]: ')) || 'calypso';
    const dryRunInput = await question('Dry run? (y/n) [n]: ');
    const dryRun = dryRunInput.toLowerCase() === 'y';

    if (dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No changes will be written to Firestore\n');
    }

    console.log('\n━'.repeat(70));
    console.log(`📊 Fetching all demandes for club: ${clubId}...`);

    // Get all demandes
    const demandesRef = db.collection('clubs').doc(clubId).collection('demandes_remboursement');
    const snapshot = await demandesRef.get();

    console.log(`✅ Found ${snapshot.size} demandes`);

    if (snapshot.size === 0) {
      console.log('No demandes to process');
      rl.close();
      return;
    }

    // Count total documents
    let totalDocs = 0;
    let docsWithHash = 0;
    let docsWithoutHash = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const docs = data.documents_justificatifs || [];
      totalDocs += docs.length;
      docs.forEach(d => {
        if (d.file_hash) {
          docsWithHash++;
        } else {
          docsWithoutHash++;
        }
      });
    });

    console.log(`\n📈 Statistics:`);
    console.log(`   Total documents: ${totalDocs}`);
    console.log(`   With hash: ${docsWithHash}`);
    console.log(`   Without hash: ${docsWithoutHash}`);

    if (docsWithoutHash === 0) {
      console.log('\n✨ All documents already have hashes!');
      rl.close();
      return;
    }

    console.log('\n━'.repeat(70));
    const confirm = await question(`\n${dryRun ? 'Preview' : 'Process'} ${docsWithoutHash} documents? (y/n): `);
    if (confirm.toLowerCase() !== 'y') {
      console.log('❌ Cancelled');
      rl.close();
      return;
    }

    console.log('\n🚀 Starting migration...\n');

    // Process each demande
    let globalStats = {
      demandesProcessed: 0,
      docsProcessed: 0,
      docsUpdated: 0,
      docsSkipped: 0,
      docsErrors: 0
    };

    for (const docSnap of snapshot.docs) {
      const demande = { id: docSnap.id, ...docSnap.data() };

      const stats = await migrateDemandeDocs(demande, clubId, dryRun);

      globalStats.demandesProcessed++;
      globalStats.docsProcessed += stats.processed;
      globalStats.docsUpdated += stats.updated;
      globalStats.docsSkipped += stats.skipped;
      globalStats.docsErrors += stats.errors;
    }

    // Final report
    console.log('\n' + '━'.repeat(70));
    console.log('✅ Migration Complete!');
    console.log('━'.repeat(70));
    console.log(`📊 Final Statistics:`);
    console.log(`   Demandes processed: ${globalStats.demandesProcessed}`);
    console.log(`   Documents processed: ${globalStats.docsProcessed}`);
    console.log(`   Documents updated: ${globalStats.docsUpdated}`);
    console.log(`   Documents skipped: ${globalStats.docsSkipped}`);
    console.log(`   Errors: ${globalStats.docsErrors}`);

    if (dryRun) {
      console.log(`\n⚠️  This was a DRY RUN - no changes were made to Firestore`);
      console.log(`   Run again without dry run to apply changes`);
    } else {
      console.log(`\n✨ All changes have been written to Firestore!`);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error(error.stack);
  } finally {
    rl.close();
  }
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
