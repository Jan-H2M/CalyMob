#!/usr/bin/env node

/**
 * Check and fix Firebase custom claims for a user
 *
 * This script:
 * 1. Checks current custom claims in Firebase Auth
 * 2. Checks Firestore member document
 * 3. Fixes mismatched custom claims (syncs with Firestore)
 *
 * Usage: node check-fix-user-claims.cjs <email>
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function checkAndFixUserClaims(email) {
  try {
    console.log('\n🔍 Checking user:', email);
    console.log('='.repeat(60));

    // 1. Get user from Firebase Auth
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log('\n✅ Found user in Firebase Auth:');
    console.log('   UID:', userRecord.uid);
    console.log('   Email:', userRecord.email);
    console.log('   Display Name:', userRecord.displayName || '(none)');

    // 2. Check current custom claims
    console.log('\n📋 Current Custom Claims:');
    if (userRecord.customClaims && Object.keys(userRecord.customClaims).length > 0) {
      console.log(JSON.stringify(userRecord.customClaims, null, 2));
    } else {
      console.log('   ⚠️  No custom claims set!');
    }

    // 3. Check Firestore member document
    console.log('\n📄 Checking Firestore document...');
    const clubId = 'calypso'; // Default club
    const memberRef = admin.firestore()
      .collection('clubs')
      .doc(clubId)
      .collection('members')
      .doc(userRecord.uid);

    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
      console.log('   ❌ Member document NOT found in Firestore!');
      console.log(`   Path: clubs/${clubId}/members/${userRecord.uid}`);
      return;
    }

    const memberData = memberDoc.data();
    console.log('   ✅ Found member document:');
    console.log('   Role (app_role):', memberData.app_role || memberData.role || '(none)');
    console.log('   Status (app_status):', memberData.app_status || memberData.status || '(none)');
    console.log('   Active (isActive):', memberData.isActive);
    console.log('   Display Name:', memberData.displayName || '(none)');

    // 4. Compare and suggest fixes
    const currentRole = userRecord.customClaims?.role;
    const firestoreRole = memberData.app_role || memberData.role;

    const currentStatus = userRecord.customClaims?.status;
    const firestoreStatus = memberData.app_status || memberData.status;

    console.log('\n🔍 Comparison:');
    console.log('   Custom Claims Role:  ', currentRole || '(none)');
    console.log('   Firestore Role:      ', firestoreRole || '(none)');
    console.log('   ➜ Match:', currentRole === firestoreRole ? '✅ YES' : '❌ NO - NEEDS FIX!');

    console.log('\n   Custom Claims Status:', currentStatus || '(none)');
    console.log('   Firestore Status:    ', firestoreStatus || '(none)');
    console.log('   ➜ Match:', currentStatus === firestoreStatus ? '✅ YES' : '❌ NO - NEEDS FIX!');

    // 5. Ask if user wants to fix
    if (currentRole !== firestoreRole || currentStatus !== firestoreStatus) {
      console.log('\n⚠️  Mismatch detected! Custom claims are out of sync with Firestore.');
      console.log('\nProposed fix:');
      console.log('   Set custom claims to:');
      console.log('   {');
      console.log(`     role: "${firestoreRole}",`);
      console.log(`     status: "${firestoreStatus}",`);
      console.log(`     clubId: "${clubId}",`);
      console.log(`     isActive: ${memberData.isActive !== false}`);
      console.log('   }');

      const answer = await question('\n❓ Apply this fix? (yes/no): ');

      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        // Apply fix
        await admin.auth().setCustomUserClaims(userRecord.uid, {
          role: firestoreRole,
          status: firestoreStatus,
          clubId: clubId,
          isActive: memberData.isActive !== false
        });

        console.log('\n✅ Custom claims updated successfully!');
        console.log('   ➜ User needs to log out and log back in for changes to take effect.');
        console.log('   ➜ Or refresh the page and the new token will be fetched automatically.');
      } else {
        console.log('\n❌ Fix cancelled.');
      }
    } else {
      console.log('\n✅ Custom claims are in sync with Firestore. No fix needed!');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'auth/user-not-found') {
      console.log('   User does not exist in Firebase Auth.');
    }
  }
}

async function main() {
  console.log('🔧 Firebase Custom Claims Checker & Fixer');
  console.log('==========================================\n');

  // Get email from command line argument or ask
  let email = process.argv[2];

  if (!email) {
    email = await question('Enter user email: ');
  }

  if (!email || !email.trim()) {
    console.log('❌ Email is required.');
    rl.close();
    process.exit(1);
  }

  await checkAndFixUserClaims(email.trim());

  rl.close();
  process.exit(0);
}

main();
