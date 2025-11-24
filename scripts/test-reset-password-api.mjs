#!/usr/bin/env node
/**
 * Test /api/reset-password endpoint
 *
 * This script tests the password reset API by:
 * 1. Getting an admin/superadmin auth token
 * 2. Calling the API to reset a test user's password
 * 3. Verifying the user can login with new password
 */

import { initializeApp } from 'firebase/app';
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
const auth = getAuth(app);

const API_URL = 'https://caly.club/api/reset-password';
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
  console.log('\n' + '='.repeat(70));
  console.log('🧪 Testing /api/reset-password Endpoint');
  console.log('='.repeat(70));

  // Step 1: Login as admin/superadmin
  console.log('\n📝 Step 1: Login as admin/superadmin to get auth token\n');
  const adminEmail = await question('Admin/Superadmin email: ');
  const adminPassword = await question('Password: ');

  let adminToken;
  try {
    console.log('\n🔐 Logging in...');
    const userCredential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    adminToken = await userCredential.user.getIdToken();
    console.log('✅ Logged in successfully');
    console.log(`   Token: ${adminToken.substring(0, 20)}...`);
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    rl.close();
    process.exit(1);
  }

  // Step 2: Choose test user to reset
  console.log('\n📝 Step 2: Choose test user to reset password\n');
  console.log('Available test users:');
  console.log('  1. user@test.caly.be (UID: PkA47sGbB2ZLlwQBPf1fSa0iQ803)');
  console.log('  2. validateur@test.caly.be (UID: RNA5k97QsOgn5PaqWZM3Cs69BTa2)');

  const choice = await question('\nSelect user [1-2]: ');

  const users = {
    '1': { email: 'user@test.caly.be', uid: 'PkA47sGbB2ZLlwQBPf1fSa0iQ803' },
    '2': { email: 'validateur@test.caly.be', uid: 'RNA5k97QsOgn5PaqWZM3Cs69BTa2' }
  };

  const targetUser = users[choice];
  if (!targetUser) {
    console.error('❌ Invalid choice');
    rl.close();
    process.exit(1);
  }

  console.log(`\n✓ Selected: ${targetUser.email}`);

  // Step 3: Call reset password API
  console.log('\n📝 Step 3: Calling /api/reset-password\n');

  const newPassword = '123456'; // Default password from API
  const requestBody = {
    userId: targetUser.uid,
    clubId: CLUB_ID,
    requirePasswordChange: true
  };

  console.log('Request:');
  console.log('  URL:', API_URL);
  console.log('  Body:', JSON.stringify(requestBody, null, 2));
  console.log('  Auth: Bearer token included');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();

    console.log(`\nResponse Status: ${response.status}`);
    console.log('Response Body:', JSON.stringify(responseData, null, 2));

    if (response.ok) {
      console.log('\n✅ Password reset successful!');
      console.log(`   New password: ${newPassword}`);
      console.log(`   requirePasswordChange: true`);

      // Step 4: Test login with new password
      console.log('\n📝 Step 4: Testing login with new password\n');

      // Logout admin first
      await auth.signOut();

      try {
        await signInWithEmailAndPassword(auth, targetUser.email, newPassword);
        console.log('✅ Login with new password successful!');
        console.log('   User should be prompted to change password on next login');
        await auth.signOut();
      } catch (loginError) {
        console.error('❌ Login with new password failed:', loginError.message);
      }

    } else {
      console.error('\n❌ Password reset failed');
      console.error('   Error:', responseData.error || responseData.message);
    }

  } catch (error) {
    console.error('\n❌ API request failed:', error.message);
  }

  console.log('\n' + '='.repeat(70));
  console.log('🏁 Test Complete');
  console.log('='.repeat(70));

  rl.close();
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Test failed:', error);
  rl.close();
  process.exit(1);
});
