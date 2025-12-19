#!/usr/bin/env node

/**
 * Reset email_sent flag for transactions with accounting codes
 * This allows them to be sent again via the communication system
 *
 * Usage:
 *   node scripts/reset-email-sent-flag.cjs [months]
 *
 * Examples:
 *   node scripts/reset-email-sent-flag.cjs     # Last 2 months (default)
 *   node scripts/reset-email-sent-flag.cjs 1   # Last 1 month
 *   node scripts/reset-email-sent-flag.cjs 6   # Last 6 months
 */

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Initialize Firebase Admin with application default credentials
initializeApp({
  projectId: 'calycompta'
});

const db = getFirestore();

async function resetEmailSentFlags() {
  const clubId = 'calypso';
  const months = parseInt(process.argv[2]) || 2; // Default: 2 months

  console.log(`\n🔄 Resetting email_sent flags for last ${months} month(s)...\n`);

  // Calculate date X months ago
  const dateThreshold = new Date();
  dateThreshold.setMonth(dateThreshold.getMonth() - months);

  console.log(`📅 Looking for transactions since: ${dateThreshold.toLocaleDateString('fr-FR')}\n`);

  try {
    // Query transactions with accounting codes
    const snapshot = await db
      .collection('clubs')
      .doc(clubId)
      .collection('bank_transactions')
      .where('jobcode_comptable', '!=', null)
      .get();

    console.log(`📊 Found ${snapshot.size} transaction(s) with accounting codes\n`);

    if (snapshot.empty) {
      console.log('⚠️  No transactions found with accounting codes');
      process.exit(0);
    }

    // Filter by date and email_sent status
    const transactionsToReset = [];
    const transactionsAlreadyUnsent = [];
    const transactionsOutsideRange = [];

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const txDate = data.date_execution?.toDate?.() || new Date(0);
      const isInRange = txDate >= dateThreshold;
      const hasEmailSent = data.email_sent === true;

      if (isInRange) {
        if (hasEmailSent) {
          transactionsToReset.push({
            id: doc.id,
            numero_sequence: data.numero_sequence,
            date_execution: txDate.toLocaleDateString('fr-FR'),
            jobcode_comptable: data.jobcode_comptable,
            montant: data.montant,
            contrepartie_nom: data.contrepartie_nom,
          });
        } else {
          transactionsAlreadyUnsent.push({
            id: doc.id,
            numero_sequence: data.numero_sequence,
            date_execution: txDate.toLocaleDateString('fr-FR'),
          });
        }
      } else {
        transactionsOutsideRange.push({
          id: doc.id,
          date_execution: txDate.toLocaleDateString('fr-FR'),
        });
      }
    });

    // Display summary
    console.log('📋 Summary:');
    console.log(`   ✅ To reset (in range, already sent): ${transactionsToReset.length}`);
    console.log(`   ⏭️  Already unsent (in range, no flag): ${transactionsAlreadyUnsent.length}`);
    console.log(`   📅 Outside date range: ${transactionsOutsideRange.length}\n`);

    if (transactionsToReset.length === 0) {
      console.log('✅ No transactions need to be reset!\n');
      console.log('💡 Transactions already marked as unsent:');
      transactionsAlreadyUnsent.forEach(tx => {
        console.log(`   - ${tx.numero_sequence} (${tx.date_execution})`);
      });
      process.exit(0);
    }

    // Show transactions that will be reset
    console.log('📝 Transactions that will be reset:\n');
    transactionsToReset.forEach((tx, index) => {
      console.log(`${index + 1}. ${tx.numero_sequence || 'N/A'}`);
      console.log(`   Date: ${tx.date_execution}`);
      console.log(`   Code: ${tx.jobcode_comptable}`);
      console.log(`   Contrepartie: ${tx.contrepartie_nom || 'N/A'}`);
      console.log(`   Montant: ${tx.montant?.toFixed(2) || '0.00'} €\n`);
    });

    // Confirm with user
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      readline.question(`⚠️  Reset email_sent flag for these ${transactionsToReset.length} transaction(s)? (yes/no): `, resolve);
    });

    readline.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('\n❌ Operation cancelled\n');
      process.exit(0);
    }

    // Reset flags
    console.log(`\n🔄 Resetting flags...\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const tx of transactionsToReset) {
      try {
        await db
          .collection('clubs')
          .doc(clubId)
          .collection('bank_transactions')
          .doc(tx.id)
          .update({
            email_sent: FieldValue.delete(),
            email_sent_at: FieldValue.delete(),
          });

        console.log(`   ✓ Reset ${tx.numero_sequence} (${tx.jobcode_comptable})`);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Failed to reset ${tx.numero_sequence}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n✅ Reset complete!`);
    console.log(`   Success: ${successCount}/${transactionsToReset.length}`);
    if (errorCount > 0) {
      console.log(`   Errors: ${errorCount}`);
    }

    console.log('\n💡 Next steps:');
    console.log('   1. Wait for next cron execution (every 15 minutes)');
    console.log('   2. Or trigger manually: ./test-cron-manual.sh YOUR_CRON_SECRET');
    console.log('   3. Check email inbox for new email\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

resetEmailSentFlags();
