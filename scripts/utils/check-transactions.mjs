import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBWLRh8ct46av79sz0aSqPGW-F8DOpIQVg",
  authDomain: "calycompta.firebaseapp.com",
  projectId: "calycompta",
  storageBucket: "calycompta.firebasestorage.app",
  messagingSenderId: "720857963537",
  appId: "1:720857963537:web:dc1c57e93a0f79c866e5b5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkTransactions() {
  const txRef = collection(db, 'clubs', 'calypso', 'transactions_bancaires');

  // Count total
  const allSnapshot = await getDocs(txRef);
  console.log(`\n📊 Total transactions in Firestore: ${allSnapshot.size}`);

  // Count with fiscal_year_id
  let withFiscalYear = 0;
  let withoutFiscalYear = 0;
  let fy2024 = 0;
  let fy2025 = 0;

  allSnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.fiscal_year_id) {
      withFiscalYear++;
      if (data.fiscal_year_id === 'FY2024') fy2024++;
      if (data.fiscal_year_id === 'FY2025') fy2025++;
    } else {
      withoutFiscalYear++;
    }
  });

  console.log(`\n✅ With fiscal_year_id: ${withFiscalYear}`);
  console.log(`   - FY2024: ${fy2024}`);
  console.log(`   - FY2025: ${fy2025}`);
  console.log(`❌ Without fiscal_year_id: ${withoutFiscalYear}`);

  // Show sample without fiscal_year_id
  console.log(`\n🔍 Sample transaction without fiscal_year_id:`);
  const sampleWithout = allSnapshot.docs.find(doc => !doc.data().fiscal_year_id);
  if (sampleWithout) {
    const data = sampleWithout.data();
    const dateStr = data.date_execution && data.date_execution.toDate ? data.date_execution.toDate().toLocaleDateString() : 'Unknown';
    console.log(`   Numero: ${data.numero_sequence}`);
    console.log(`   Date: ${dateStr}`);
    console.log(`   Montant: ${data.montant}€`);
  }

  // Show sample with fiscal_year_id
  console.log(`\n🔍 Sample transaction WITH fiscal_year_id:`);
  const sampleWith = allSnapshot.docs.find(doc => doc.data().fiscal_year_id);
  if (sampleWith) {
    const data = sampleWith.data();
    const dateStr = data.date_execution && data.date_execution.toDate ? data.date_execution.toDate().toLocaleDateString() : 'Unknown';
    console.log(`   Numero: ${data.numero_sequence}`);
    console.log(`   Date: ${dateStr}`);
    console.log(`   Montant: ${data.montant}€`);
    console.log(`   Fiscal Year: ${data.fiscal_year_id}`);
  }
}

checkTransactions().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
