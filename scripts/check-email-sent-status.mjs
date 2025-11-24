import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load Firebase config from .env
const envFile = readFileSync(join(__dirname, '../.env'), 'utf-8');
const getEnvVar = (key) => {
  const line = envFile.split('\n').find(l => l.startsWith(key));
  return line ? line.split('=')[1].trim() : null;
};

const firebaseConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY'),
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnvVar('VITE_FIREBASE_APP_ID')
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkEmailSentStatus() {
  try {
    const clubId = 'calypso-diving-club';

    console.log('🔍 Vérification des transactions avec codes comptables...\n');

    // Get transactions with account codes NOT sent
    const transactionsRef = collection(db, `clubs/${clubId}/transactions`);

    const unsentQuery = query(
      transactionsRef,
      where('account_code_id', '!=', null),
      where('account_code_email_sent', '==', false),
      orderBy('account_code_id'),
      orderBy('date', 'desc')
    );

    const unsentSnapshot = await getDocs(unsentQuery);

    console.log(`❌ Transactions NON envoyées: ${unsentSnapshot.size}\n`);

    if (unsentSnapshot.size > 0) {
      console.log('Détails des transactions non envoyées:\n');
      unsentSnapshot.forEach((doc) => {
        const data = doc.data();
        const date = data.date?.toDate ? data.date.toDate().toLocaleDateString('fr-FR') : 'N/A';
        console.log(`  📋 ${data.numero_sequence || 'N/A'} | ${date} | ${data.contrepartie} | ${data.account_code_id} | ${data.montant}€`);
      });
      console.log('');
    }

    // Get transactions with account codes SENT
    const sentQuery = query(
      transactionsRef,
      where('account_code_id', '!=', null),
      where('account_code_email_sent', '==', true),
      orderBy('account_code_id'),
      orderBy('date', 'desc')
    );

    const sentSnapshot = await getDocs(sentQuery);

    console.log(`✅ Transactions ENVOYÉES: ${sentSnapshot.size}\n`);

    // Show most recent sent transactions
    if (sentSnapshot.size > 0) {
      console.log('Dernières transactions envoyées (max 10):\n');
      let count = 0;
      sentSnapshot.forEach((doc) => {
        if (count < 10) {
          const data = doc.data();
          const date = data.date?.toDate ? data.date.toDate().toLocaleDateString('fr-FR') : 'N/A';
          console.log(`  ✓ ${data.numero_sequence || 'N/A'} | ${date} | ${data.contrepartie} | ${data.account_code_id} | ${data.montant}€`);
          count++;
        }
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log(`TOTAL avec codes comptables: ${unsentSnapshot.size + sentSnapshot.size}`);
    console.log(`  ✅ Envoyées: ${sentSnapshot.size}`);
    console.log(`  ❌ Non envoyées: ${unsentSnapshot.size}`);
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

checkEmailSentStatus();
