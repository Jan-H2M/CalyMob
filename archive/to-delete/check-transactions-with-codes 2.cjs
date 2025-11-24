#!/usr/bin/env node

/**
 * Check how many transactions have accounting codes assigned
 */

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin with application default credentials
initializeApp({
  projectId: 'calycompta'
});

const db = getFirestore();

async function checkTransactions() {
  console.log('\n🔍 Checking transactions with accounting codes...\n');

  try {
    const clubId = 'calypso';

    // Get all transactions with code_comptable
    const snapshot = await db
      .collection('clubs')
      .doc(clubId)
      .collection('bank_transactions')
      .where('code_comptable', '!=', null)
      .limit(50)
      .get();

    console.log(`📊 Found ${snapshot.size} transaction(s) with code_comptable field\n`);

    if (snapshot.empty) {
      console.log('❌ No transactions found with code_comptable assigned');
      console.log('\n💡 You need to assign accounting codes to transactions via the app:');
      console.log('   1. Go to https://calycompta.vercel.app/transactions');
      console.log('   2. Select a transaction');
      console.log('   3. Assign an accounting code (ex: 618-00-732)');
      console.log('   4. Save\n');
      process.exit(0);
    }

    // Display transactions
    console.log('✅ Transactions with codes:\n');
    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      const date = data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR') || 'N/A';

      console.log(`${index + 1}. ${data.numero_sequence || 'N/A'}`);
      console.log(`   Date: ${date}`);
      console.log(`   Contrepartie: ${data.contrepartie_nom || 'N/A'}`);
      console.log(`   Code: ${data.code_comptable}`);
      console.log(`   Montant: ${data.montant?.toFixed(2) || '0.00'} €`);
      console.log(`   Email sent: ${data.email_sent === true ? 'YES' : 'NO'}`);
      console.log('');
    });

    // Count by email_sent status
    const notSent = snapshot.docs.filter(doc => doc.data().email_sent !== true);
    const sent = snapshot.docs.filter(doc => doc.data().email_sent === true);

    console.log('📈 Summary:');
    console.log(`   Total with codes: ${snapshot.size}`);
    console.log(`   Not sent yet: ${notSent.length}`);
    console.log(`   Already sent: ${sent.length}\n`);

    if (notSent.length > 0) {
      console.log('✅ Ready to send email with these transactions!');
      console.log('   Run: curl -X POST https://calycompta.vercel.app/api/run-communication-jobs \\');
      console.log('        -H "Authorization: Bearer YOUR_CRON_SECRET"\n');
    } else {
      console.log('⚠️  All transactions with codes have already been sent');
      console.log('   To re-send, you need to reset the email_sent flag\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

checkTransactions();
