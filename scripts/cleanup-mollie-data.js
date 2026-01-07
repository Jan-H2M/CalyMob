#!/usr/bin/env node
/**
 * Firestore Cleanup Script: Remove Mollie Payment Data
 *
 * This script removes all Mollie-related data from Firestore:
 * 1. Deletes all documents in clubs/{clubId}/mollie_payments/
 * 2. Deletes all documents in clubs/{clubId}/mollie_logs/
 * 3. Deletes Mollie-related documents in payment_logs/ (where provider === 'mollie')
 * 4. Removes Mollie-specific fields from inscriptions documents
 *
 * Usage:
 *   node cleanup-mollie-data.js [--dry-run]
 *
 * Options:
 *   --dry-run    Preview changes without actually deleting data
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../google-services-admin.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const CLUB_ID = 'calypso'; // Default club ID

// Parse command line arguments
const isDryRun = process.argv.includes('--dry-run');

async function deleteCollection(collectionPath, batchSize = 100) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  let totalDeleted = 0;

  while (true) {
    const snapshot = await query.get();

    if (snapshot.empty) {
      break;
    }

    if (isDryRun) {
      console.log(`  [DRY RUN] Would delete ${snapshot.size} documents from ${collectionPath}`);
      snapshot.forEach(doc => {
        console.log(`    - ${doc.id}`);
      });
      totalDeleted += snapshot.size;
      break; // In dry run, just show first batch
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    totalDeleted += snapshot.size;
    console.log(`  Deleted ${snapshot.size} documents from ${collectionPath}`);
  }

  return totalDeleted;
}

async function cleanupMolliePayments() {
  console.log('\n=== Cleaning up mollie_payments collection ===');
  const path = `clubs/${CLUB_ID}/mollie_payments`;
  const count = await deleteCollection(path);
  console.log(`Total: ${count} documents ${isDryRun ? 'would be ' : ''}deleted from ${path}`);
  return count;
}

async function cleanupMollieLogs() {
  console.log('\n=== Cleaning up mollie_logs collection ===');
  const path = `clubs/${CLUB_ID}/mollie_logs`;
  const count = await deleteCollection(path);
  console.log(`Total: ${count} documents ${isDryRun ? 'would be ' : ''}deleted from ${path}`);
  return count;
}

async function cleanupPaymentLogs() {
  console.log('\n=== Cleaning up Mollie entries in payment_logs ===');

  const logsRef = db.collection('payment_logs');
  const snapshot = await logsRef.where('provider', '==', 'mollie').get();

  if (snapshot.empty) {
    console.log('  No Mollie entries found in payment_logs');
    return 0;
  }

  console.log(`  Found ${snapshot.size} Mollie entries in payment_logs`);

  if (isDryRun) {
    snapshot.forEach(doc => {
      console.log(`  [DRY RUN] Would delete: ${doc.id}`);
    });
    return snapshot.size;
  }

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`  Deleted ${snapshot.size} documents from payment_logs`);
  return snapshot.size;
}

async function cleanupInscriptionFields() {
  console.log('\n=== Cleaning up Mollie fields in inscriptions ===');

  // Get all operations
  const operationsRef = db.collection(`clubs/${CLUB_ID}/operations`);
  const operationsSnapshot = await operationsRef.get();

  let totalUpdated = 0;

  for (const operationDoc of operationsSnapshot.docs) {
    const inscriptionsRef = operationDoc.ref.collection('inscriptions');
    const inscriptionsSnapshot = await inscriptionsRef.get();

    for (const inscriptionDoc of inscriptionsSnapshot.docs) {
      const data = inscriptionDoc.data();

      // Check if this inscription has Mollie-related fields
      const hasMollieFields =
        data.mollie_payment_id ||
        data.payment_provider === 'mollie' ||
        (data.payment_id && data.payment_id.startsWith('mol_'));

      if (hasMollieFields) {
        if (isDryRun) {
          console.log(`  [DRY RUN] Would clean: operations/${operationDoc.id}/inscriptions/${inscriptionDoc.id}`);
          console.log(`    - mollie_payment_id: ${data.mollie_payment_id || 'N/A'}`);
          console.log(`    - payment_provider: ${data.payment_provider || 'N/A'}`);
          console.log(`    - payment_id: ${data.payment_id || 'N/A'}`);
        } else {
          // Remove Mollie-specific fields, keep paye and date_paiement
          const updates = {
            mollie_payment_id: admin.firestore.FieldValue.delete(),
            payment_status: admin.firestore.FieldValue.delete(),
            payment_method: admin.firestore.FieldValue.delete(),
            payment_initiated_at: admin.firestore.FieldValue.delete(),
          };

          // Only remove payment_id if it's a Mollie ID
          if (data.payment_id && data.payment_id.startsWith('mol_')) {
            updates.payment_id = admin.firestore.FieldValue.delete();
          }

          // Only remove payment_provider if it's mollie
          if (data.payment_provider === 'mollie') {
            updates.payment_provider = admin.firestore.FieldValue.delete();
          }

          await inscriptionDoc.ref.update(updates);
          console.log(`  Cleaned: operations/${operationDoc.id}/inscriptions/${inscriptionDoc.id}`);
        }
        totalUpdated++;
      }
    }
  }

  console.log(`Total: ${totalUpdated} inscriptions ${isDryRun ? 'would be ' : ''}cleaned`);
  return totalUpdated;
}

async function main() {
  console.log('=========================================');
  console.log('  Mollie Data Cleanup Script');
  console.log('=========================================');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (data will be deleted)'}`);
  console.log(`Club ID: ${CLUB_ID}`);

  if (!isDryRun) {
    console.log('\n⚠️  WARNING: This will permanently delete data!');
    console.log('    Run with --dry-run first to preview changes.');
    console.log('    Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  try {
    const results = {
      molliePayments: await cleanupMolliePayments(),
      mollieLogs: await cleanupMollieLogs(),
      paymentLogs: await cleanupPaymentLogs(),
      inscriptions: await cleanupInscriptionFields()
    };

    console.log('\n=========================================');
    console.log('  Summary');
    console.log('=========================================');
    console.log(`  mollie_payments: ${results.molliePayments} documents`);
    console.log(`  mollie_logs: ${results.mollieLogs} documents`);
    console.log(`  payment_logs (Mollie): ${results.paymentLogs} documents`);
    console.log(`  inscriptions cleaned: ${results.inscriptions} documents`);
    console.log(`\n  Total: ${Object.values(results).reduce((a, b) => a + b, 0)} items ${isDryRun ? 'would be ' : ''}affected`);

    if (isDryRun) {
      console.log('\n✅ Dry run complete. Run without --dry-run to apply changes.');
    } else {
      console.log('\n✅ Cleanup complete!');
    }

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
