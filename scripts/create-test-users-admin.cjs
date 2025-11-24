#!/usr/bin/env node
/**
 * Create Test Users for Authentication Testing (Admin SDK)
 *
 * Uses Firebase Admin SDK to bypass Firestore rules
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (!serviceAccountKey) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set');
  console.error('💡 Load it from .env.local or export it');
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(serviceAccountKey);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });

  console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error);
  process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();

const CLUB_ID = 'calypso';
const DEFAULT_PASSWORD = 'Calypso2024!';

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
    uid: 'PkA47sGbB2ZLlwQBPf1fSa0iQ803', // Already created
    description: 'Standard USER - limited access, blocked from transactions'
  },
  {
    email: 'validateur@test.caly.be',
    role: 'validateur',
    nom: 'Validateur',
    prenom: 'Test',
    has_app_access: true,
    createAuth: true,
    uid: 'RNA5k97QsOgn5PaqWZM3Cs69BTa2', // Already created
    description: 'VALIDATEUR - full operational access'
  }
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createTestUser(userData) {
  const { email, role, nom, prenom, has_app_access, createAuth, uid, description } = userData;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 Creating: ${email}`);
  console.log(`   Role: ${role}`);
  console.log(`   Description: ${description}`);
  console.log('='.repeat(70));

  try {
    let authUid = uid || `test-${role}-${Date.now()}`;
    const now = admin.firestore.Timestamp.now();

    // Step 1: Create/update Firebase Auth account (if needed)
    if (createAuth && !uid) {
      console.log('🔐 Creating Firebase Auth account...');
      try {
        const authUser = await auth.createUser({
          uid: authUid,
          email: email,
          password: DEFAULT_PASSWORD,
          displayName: `${prenom} ${nom}`,
          emailVerified: false
        });

        console.log(`✅ Firebase Auth created: ${authUser.uid}`);
      } catch (authError) {
        if (authError.code === 'auth/email-already-in-use' || authError.code === 'auth/uid-already-exists') {
          console.log('⚠️  Firebase Auth account already exists - will update Firestore only');
        } else {
          throw authError;
        }
      }
    } else if (uid) {
      console.log(`ℹ️  Using existing Firebase Auth UID: ${uid}`);
    } else {
      console.log('ℹ️  Skipping Firebase Auth (no app access)');
      authUid = `test-membre-${Date.now()}`;
    }

    // Step 2: Set custom claims (if has auth)
    if (createAuth) {
      console.log('🎫 Setting custom claims...');
      try {
        await auth.setCustomUserClaims(authUid, {
          role: role,
          clubId: CLUB_ID,
          isActive: true
        });
        console.log('✅ Custom claims set');
      } catch (error) {
        console.log('⚠️  Could not set custom claims:', error.message);
      }
    }

    // Step 3: Create Firestore member document (using Admin SDK - bypasses rules)
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
      isActive: createAuth,

      // Metadata
      metadata: {
        createdAt: now,
        createdBy: 'test-script-admin',
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

    await db.collection('clubs').doc(CLUB_ID).collection('members').doc(authUid).set(memberData);
    console.log('✅ Firestore member document created');

    console.log('\n✨ SUCCESS!');
    if (createAuth) {
      console.log(`   📧 Email: ${email}`);
      console.log(`   🔑 Password: ${DEFAULT_PASSWORD}`);
      console.log(`   🆔 UID: ${authUid}`);
    } else {
      console.log(`   📧 Email: ${email} (NO LOGIN ACCESS)`);
      console.log(`   🆔 UID: ${authUid}`);
    }

    return { success: true, email, uid: authUid, hasAuth: createAuth };

  } catch (error) {
    console.error(`❌ Error creating ${email}:`, error.message);
    return { success: false, email, error: error.message };
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 CalyCompta Authentication Test User Creation (Admin)');
  console.log('='.repeat(70));
  console.log(`\nClub ID: ${CLUB_ID}`);
  console.log(`Default Password: ${DEFAULT_PASSWORD}`);
  console.log(`\nThis will create ${TEST_USERS.length} test users:\n`);

  TEST_USERS.forEach((user, index) => {
    const accessBadge = user.createAuth ? '✅ CAN LOGIN' : '❌ NO LOGIN';
    console.log(`${index + 1}. ${user.email.padEnd(30)} | ${user.role.padEnd(12)} | ${accessBadge}`);
  });

  console.log('\n⚠️  Using Firebase Admin SDK (bypasses Firestore rules)');
  const proceed = await question('\nProceed? (yes/no): ');

  if (proceed.toLowerCase() !== 'yes') {
    console.log('\n❌ Cancelled');
    rl.close();
    process.exit(0);
  }

  console.log('\n🚀 Starting user creation...');

  const results = [];

  for (const userData of TEST_USERS) {
    const result = await createTestUser(userData);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 CREATION SUMMARY');
  console.log('='.repeat(70));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Created: ${successful.length}/${TEST_USERS.length}`);
  if (successful.length > 0) {
    successful.forEach(r => {
      const badge = r.hasAuth ? '🔐' : '👤';
      console.log(`   ${badge} ${r.email} (${r.uid})`);
    });
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => console.log(`   - ${r.email}: ${r.error}`));
  }

  console.log('\n' + '='.repeat(70));
  console.log('📋 TEST CREDENTIALS');
  console.log('='.repeat(70));
  console.log(`\n🔑 Password: ${DEFAULT_PASSWORD}`);
  console.log('\n✅ Can Login:');
  console.log('   - user@test.caly.be (USER role)');
  console.log('   - validateur@test.caly.be (VALIDATEUR role)');
  console.log('\n❌ Cannot Login:');
  console.log('   - membre@test.caly.be (no app access)');
  console.log('\n💡 Existing accounts for higher roles:');
  console.log('   - Admin: pamrom@yahoo.com');
  console.log('   - Superadmin: jan.andriessens@gmail.com');

  rl.close();
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  rl.close();
  process.exit(1);
});
