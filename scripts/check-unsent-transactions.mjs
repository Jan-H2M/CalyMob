import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find Firebase service account JSON file
const files = readdirSync(join(__dirname, '..'));
const serviceAccountFile = files.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));

if (!serviceAccountFile) {
  console.error('❌ No Firebase service account file found');
  process.exit(1);
}

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', serviceAccountFile), 'utf-8')
);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function checkUnsentTransactions() {
  try {
    const clubId = 'calypso-diving-club';

    // Get all transactions with account codes that haven't been emailed
    const transactionsRef = db.collection(`clubs/${clubId}/transactions`);

    const snapshot = await transactionsRef
      .where('account_code_id', '!=', null)
      .where('account_code_email_sent', '==', false)
      .get();

    console.log(`\n📊 Transactions avec codes comptables NON envoyées: ${snapshot.size}`);

    if (snapshot.size > 0) {
      console.log('\n❌ Transactions non marquées comme envoyées:\n');
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`- ${doc.id}: ${data.date?.toDate().toLocaleDateString('fr-FR')} | ${data.contrepartie} | ${data.account_code_id} | ${data.montant}€`);
      });
    } else {
      console.log('\n✅ Toutes les transactions avec codes comptables sont marquées comme envoyées!');
    }

    // Also check sent transactions count
    const sentSnapshot = await transactionsRef
      .where('account_code_id', '!=', null)
      .where('account_code_email_sent', '==', true)
      .get();

    console.log(`\n✅ Transactions avec codes comptables ENVOYÉES: ${sentSnapshot.size}`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkUnsentTransactions();
