#!/usr/bin/env node
/**
 * Migration script: Fix transaction_matched field for existing inscriptions
 *
 * Problem: Before the fix, linkInscriptionToTransaction in CalyCompta never set
 * transaction_matched: true. CalyMob uses this field to show "Payé" vs "En attente bancaire".
 *
 * This script finds all inscriptions with a transaction_id but without transaction_matched: true,
 * and updates them. It also sets payment_status: 'paid' where missing.
 *
 * Usage: node fix_transaction_matched.cjs [--dry-run]
 */

const path = require('path');

// Load firebase-admin from functions directory
const functionsPath = path.join(__dirname, '../functions');
const admin = require(path.join(functionsPath, 'node_modules/firebase-admin'));

// Initialize Firebase Admin
const possibleServiceAccountPaths = [
  '/Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-fbsvc-7981ec9e47.json',
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(__dirname, '../functions/service-account-key.json')
].filter(Boolean);

let initialized = false;

for (const serviceAccountPath of possibleServiceAccountPaths) {
  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    console.log('✅ Firebase Admin initialized with service account');
    initialized = true;
    break;
  } catch (e) {
    // Try next path
  }
}

if (!initialized) {
  try {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    console.log('✅ Firebase Admin initialized with Application Default Credentials');
    initialized = true;
  } catch (e) {
    console.error('❌ Could not initialize Firebase Admin');
    process.exit(1);
  }
}

const db = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');

async function fixTransactionMatched() {
  console.log(`\n🔧 Fix transaction_matched migration ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));

  // Get all operations for the club
  const clubId = 'calypso';
  const operationsRef = db.collection(`clubs/${clubId}/operations`);
  const operationsSnap = await operationsRef.get();

  console.log(`📋 Found ${operationsSnap.size} operations`);

  let totalInscriptions = 0;
  let fixedCount = 0;
  let alreadyOkCount = 0;
  const fixes = [];

  for (const opDoc of operationsSnap.docs) {
    const opData = opDoc.data();
    const opTitle = opData.titre || opDoc.id;

    // Get all inscriptions for this operation
    const inscriptionsRef = opDoc.ref.collection('inscriptions');
    const inscriptionsSnap = await inscriptionsRef.get();

    for (const inscDoc of inscriptionsSnap.docs) {
      totalInscriptions++;
      const data = inscDoc.data();
      const name = `${data.membre_prenom || ''} ${data.membre_nom || ''}`.trim();

      // Case 1: Has transaction_id but transaction_matched is not true
      if (data.transaction_id && data.transaction_matched !== true) {
        const updates = {
          transaction_matched: true,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        // Also fix payment_status if missing
        if (!data.payment_status || data.payment_status !== 'paid') {
          updates.payment_status = 'paid';
        }

        // Also fix mode_paiement if missing
        if (!data.mode_paiement) {
          updates.mode_paiement = 'bank';
        }

        fixes.push({
          operation: opTitle,
          name,
          inscriptionId: inscDoc.id,
          transactionId: data.transaction_id,
          updates
        });

        if (!DRY_RUN) {
          await inscDoc.ref.update(updates);
        }
        fixedCount++;
        console.log(`  ✏️  ${name} (${opTitle}) — transaction_matched: false → true`);
      }
      // Case 2: paye=true, has no transaction, but payment_status not set
      else if (data.paye && !data.transaction_id && !data.payment_status) {
        const updates = {
          payment_status: 'paid',
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        if (!DRY_RUN) {
          await inscDoc.ref.update(updates);
        }
        fixedCount++;
        console.log(`  ✏️  ${name} (${opTitle}) — payment_status: null → 'paid'`);
      }
      else if (data.paye) {
        alreadyOkCount++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Results:`);
  console.log(`   Total inscriptions scanned: ${totalInscriptions}`);
  console.log(`   Fixed: ${fixedCount}`);
  console.log(`   Already OK: ${alreadyOkCount}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes written)' : 'LIVE (changes applied)'}`);

  if (DRY_RUN && fixedCount > 0) {
    console.log(`\n💡 Run without --dry-run to apply the fixes.`);
  }
}

fixTransactionMatched()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
