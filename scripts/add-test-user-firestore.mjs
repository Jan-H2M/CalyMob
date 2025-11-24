#!/usr/bin/env node
/**
 * Simple script to add Firestore documents for test users
 * Run this as the superadmin user to bypass Firestore rules
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import readline from 'readline';

// Firebase config
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

// Test users data (Auth accounts already created)
const TEST_USERS = [
  {
    uid: 'test-membre-' + Date.now(),
    email: 'membre@test.caly.be',
    role: 'membre',
    nom: 'Membre',
    prenom: 'Test',
    has_app_access: false,
  },
  {
    uid: 'PkA47sGbB2ZLlwQBPf1fSa0iQ803',
    email: 'user@test.caly.be',
    role: 'user',
    nom: 'User',
    prenom: 'Standard',
    has_app_access: true,
  },
  {
    uid: 'RNA5k97QsOgn5PaqWZM3Cs69BTa2',
    email: 'validateur@test.caly.be',
    role: 'validateur',
    nom: 'Validateur',
    prenom: 'Test',
    has_app_access: true,
  }
];

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
  console.log('\n🔐 Please login as SUPERADMIN to create test user documents\n');

  const email = await question('Superadmin email: ');
  const password = await question('Password: ');

  try {
    console.log('\n🔑 Logging in...');
    await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ Logged in successfully\n');

    for (const user of TEST_USERS) {
      console.log(`📝 Creating Firestore document for: ${user.email}`);

      const memberData = {
        id: user.uid,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        displayName: `${user.prenom} ${user.nom}`,
        app_role: user.role,
        has_app_access: user.has_app_access,
        isActive: user.has_app_access,
        metadata: {
          createdAt: new Date(),
          createdBy: 'test-script',
          source: 'authentication-testing',
          isTestUser: true
        },
        lastLogin: null,
        requirePasswordChange: false,
        isTestUser: true,
        testUserDescription: `Test user for ${user.role} role`
      };

      await setDoc(doc(db, `clubs/${CLUB_ID}/members`, user.uid), memberData);
      console.log(`✅ Created: ${user.email} (${user.uid})\n`);
    }

    console.log('='.repeat(70));
    console.log('✨ All test users created successfully!');
    console.log('='.repeat(70));
    console.log('\n📝 Test Credentials:');
    console.log('   Password: Calypso2024!');
    console.log('\n✅ Can Login:');
    console.log('   - user@test.caly.be');
    console.log('   - validateur@test.caly.be');
    console.log('\n❌ Cannot Login (no app access):');
    console.log('   - membre@test.caly.be');

    await auth.signOut();
    rl.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    rl.close();
    process.exit(1);
  }
}

main();
