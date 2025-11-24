#!/usr/bin/env node
/**
 * Create Test Users for Authentication Testing
 *
 * This script creates complete test users with both Firestore documents
 * and Firebase Auth accounts for systematic authentication testing.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import readline from 'readline';

// Firebase config for calycompta project
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
const DEFAULT_PASSWORD = 'Calypso2024!';  // Same as activate-user API default

// Test users to create
const TEST_USERS = [
  {
    email: 'membre@test.caly.be',
    role: 'membre',
    nom: 'Membre',
    prenom: 'Test',
    has_app_access: false,
    createAuth: false,
    description: 'Member WITHOUT app access - should NOT be able to login'
  },
  {
    email: 'user@test.caly.be',
    role: 'user',
    nom: 'User',
    prenom: 'Standard',
    has_app_access: true,
    createAuth: true,
    description: 'Standard USER - limited access, blocked from transactions'
  },
  {
    email: 'validateur@test.caly.be',
    role: 'validateur',
    nom: 'Validateur',
    prenom: 'Test',
    has_app_access: true,
    createAuth: true,
    description: 'VALIDATEUR - full operational access'
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

async function checkExistingUser(email) {
  try {
    const membersRef = collection(db, `clubs/${CLUB_ID}/members`);
    const q = query(membersRef, where('email', '==', email));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking existing user:', error);
    return false;
  }
}

async function createTestUser(userData) {
  const { email, role, nom, prenom, has_app_access, createAuth, description } = userData;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 Creating: ${email}`);
  console.log(`   Role: ${role}`);
  console.log(`   Description: ${description}`);
  console.log('='.repeat(70));

  try {
    // Check if user already exists in Firestore
    const exists = await checkExistingUser(email);
    if (exists) {
      console.log(`⚠️  User ${email} already exists in Firestore - skipping`);
      return { success: false, email, reason: 'already_exists' };
    }

    // Generate unique ID
    const userId = `test-${role}-${Date.now()}`;
    const now = new Date();

    // Step 1: Create Firebase Auth account (if needed)
    let authUid = userId;
    if (createAuth) {
      console.log('🔐 Creating Firebase Auth account...');
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, DEFAULT_PASSWORD);
        authUid = userCredential.user.uid;
        console.log(`✅ Firebase Auth created with UID: ${authUid}`);

        // Sign out immediately
        await auth.signOut();
      } catch (authError) {
        if (authError.code === 'auth/email-already-in-use') {
          console.log('⚠️  Firebase Auth account already exists - will use existing');
          // You'll need to manually get the UID or use Firebase Admin SDK
        } else {
          throw authError;
        }
      }
    } else {
      console.log('ℹ️  Skipping Firebase Auth (no app access)');
    }

    // Step 2: Create Firestore member document
    console.log('📄 Creating Firestore member document...');
    const memberData = {
      // Identity
      id: authUid,
      email: email,
      nom: nom,
      prenom: prenom,
      displayName: `${prenom} ${nom}`,

      // Role and access
      app_role: role,
      has_app_access: has_app_access,
      isActive: createAuth, // Active if has auth, inactive if no auth

      // Metadata
      metadata: {
        createdAt: now,
        createdBy: 'test-script',
        source: 'authentication-testing',
        isTestUser: true
      },

      // Session
      lastLogin: null,
      requirePasswordChange: false,

      // Test flags
      isTestUser: true,
      testUserDescription: description
    };

    await setDoc(doc(db, `clubs/${CLUB_ID}/members`, authUid), memberData);
    console.log('✅ Firestore member document created');

    console.log('\n✨ SUCCESS!');
    if (createAuth) {
      console.log(`   📧 Email: ${email}`);
      console.log(`   🔑 Password: ${DEFAULT_PASSWORD}`);
      console.log(`   🆔 UID: ${authUid}`);
    } else {
      console.log(`   📧 Email: ${email} (NO LOGIN ACCESS)`);
    }

    return { success: true, email, uid: authUid, hasAuth: createAuth };

  } catch (error) {
    console.error(`❌ Error creating ${email}:`, error.message);
    return { success: false, email, error: error.message };
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 CalyCompta Authentication Test User Creation');
  console.log('='.repeat(70));
  console.log(`\nClub ID: ${CLUB_ID}`);
  console.log(`Default Password: ${DEFAULT_PASSWORD}`);
  console.log(`\nThis will create ${TEST_USERS.length} test users:\n`);

  TEST_USERS.forEach((user, index) => {
    const accessBadge = user.createAuth ? '✅ CAN LOGIN' : '❌ NO LOGIN';
    console.log(`${index + 1}. ${user.email.padEnd(30)} | ${user.role.padEnd(12)} | ${accessBadge}`);
  });

  console.log('\n⚠️  WARNING: Creating users in PRODUCTION Firebase!');
  const proceed = await question('\nProceed? (yes/no): ');

  if (proceed.toLowerCase() !== 'yes') {
    console.log('\n❌ Cancelled by user');
    rl.close();
    process.exit(0);
  }

  console.log('\n🚀 Starting user creation...');

  const results = [];

  for (const userData of TEST_USERS) {
    const result = await createTestUser(userData);
    results.push(result);

    // Wait between operations
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 CREATION SUMMARY');
  console.log('='.repeat(70));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const skipped = results.filter(r => !r.success && r.reason === 'already_exists');

  console.log(`\n✅ Created: ${successful.length}/${TEST_USERS.length}`);
  if (successful.length > 0) {
    successful.forEach(r => {
      const badge = r.hasAuth ? '🔐' : '👤';
      console.log(`   ${badge} ${r.email}`);
    });
  }

  if (skipped.length > 0) {
    console.log(`\n⏭️  Skipped (already exist): ${skipped.length}`);
    skipped.forEach(r => console.log(`   - ${r.email}`));
  }

  if (failed.length > 0 && failed.length !== skipped.length) {
    console.log(`\n❌ Failed: ${failed.filter(f => f.reason !== 'already_exists').length}`);
    failed.filter(f => f.reason !== 'already_exists').forEach(r => {
      console.log(`   - ${r.email}: ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('📋 NEXT STEPS');
  console.log('='.repeat(70));
  console.log('\n1. Start dev server: npm run dev');
  console.log('2. Test login flows for each user type');
  console.log('3. Verify permissions and Firestore rules');
  console.log('\n📝 Login Credentials (for users with auth):');
  console.log(`   Password: ${DEFAULT_PASSWORD}`);
  console.log('   Users: user@test.caly.be, validateur@test.caly.be');
  console.log('\n⚠️  Note: membre@test.caly.be should NOT be able to login (has_app_access: false)');
  console.log('\n💡 Use existing accounts for admin/superadmin testing:');
  console.log('   - Admin: pamrom@yahoo.com');
  console.log('   - Superadmin: jan.andriessens@gmail.com');

  rl.close();
  process.exit(0);
}

// Run
main().catch(error => {
  console.error('❌ Script failed:', error);
  rl.close();
  process.exit(1);
});
