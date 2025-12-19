#!/usr/bin/env node
/**
 * Check existing expense claims to prepare for scoped access testing
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import readline from 'readline';

const firebaseConfig = {
  apiKey: "AIzaSyCmU-7GABqko2N-2saQNcNNSIyW_BbVCtU",
  authDomain: "calycompta.firebaseapp.com",
  projectId: "calycompta",
  storageBucket: "calycompta.firebasestorage.app",
  messagingSenderId: "328464166969",
  appId: "1:328464166969:web:ee7f4452f92b1b338f5de8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const CLUB_ID = 'calypso';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n🔍 Checking Expense Claims in Firestore\n');

  const email = await question('Login as (superadmin/admin): ');
  const password = await question('Password: ');

  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ Logged in\n');

    // Check both possible collection names
    const collections = ['demandes_remboursement', 'expense_claims'];

    for (const collectionName of collections) {
      console.log(`\n📂 Checking: clubs/${CLUB_ID}/${collectionName}`);

      const claimsRef = collection(db, `clubs/${CLUB_ID}/${collectionName}`);
      const q = query(claimsRef, limit(5));
      const snapshot = await getDocs(q);

      console.log(`   Found ${snapshot.size} claims (showing first 5)`);

      if (!snapshot.empty) {
        snapshot.forEach(doc => {
          const data = doc.data();
          console.log(`\n   ID: ${doc.id}`);
          console.log(`   demandeur_id: ${data.demandeur_id || 'N/A'}`);
          console.log(`   titre: ${data.titre || data.title || 'N/A'}`);
          console.log(`   montant: ${data.montant || data.amount || 'N/A'}€`);
          console.log(`   statut: ${data.statut || data.status || 'N/A'}`);
        });
      }
    }

    await auth.signOut();
    console.log('\n✅ Check complete');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  rl.close();
  process.exit(0);
}

main();
