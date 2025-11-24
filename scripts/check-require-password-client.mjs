#!/usr/bin/env node

/**
 * Check requirePasswordChange flag in Firestore using Firebase Client SDK
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { readFileSync } from 'fs';

// Firebase config (from your app)
const firebaseConfig = {
  apiKey: "AIzaSyBDBcC3vqxLb0J6vTp5nQg8aGqxLzYXpH4",
  authDomain: "calycompta.firebaseapp.com",
  projectId: "calycompta",
  storageBucket: "calycompta.firebasestorage.app",
  messagingSenderId: "559664814992",
  appId: "1:559664814992:web:8e54b39dd43838d4c9c58c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const clubId = 'calypso';
const userId = 'wXaHiVHWJxFxwi0FnrCZ'; // H2M user ID

console.log('🔍 Checking requirePasswordChange flag in Firestore...');
console.log('📧 User ID:', userId);
console.log('🏢 Club:', clubId);
console.log('');

// You need to sign in first with an admin account
const adminEmail = 'jan@h2m.ai';
const adminPassword = process.argv[2];

if (!adminPassword) {
  console.error('❌ Please provide your admin password as argument');
  console.error('Usage: node check-require-password-client.mjs YOUR_PASSWORD');
  process.exit(1);
}

try {
  // Sign in as admin
  console.log('🔐 Signing in as admin...');
  await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
  console.log('✅ Signed in successfully');
  console.log('');

  // Get the user document
  const userDocRef = doc(db, 'clubs', clubId, 'members', userId);
  const userDoc = await getDoc(userDocRef);

  if (!userDoc.exists()) {
    console.error('❌ User document does NOT exist in Firestore');
    process.exit(1);
  }

  const userData = userDoc.data();
  console.log('✅ User document found');
  console.log('');
  console.log('📋 Full user data:');
  console.log(JSON.stringify(userData, null, 2));
  console.log('');
  console.log('🔐 Security field:');
  console.log(JSON.stringify(userData.security, null, 2));
  console.log('');
  console.log('🎯 requirePasswordChange value:', userData?.security?.requirePasswordChange);

  if (userData?.security?.requirePasswordChange === true) {
    console.log('✅ requirePasswordChange is TRUE (correct!)');
  } else {
    console.log('❌ requirePasswordChange is FALSE or missing (WRONG!)');
  }

  await auth.signOut();
  process.exit(0);
} catch (error) {
  console.error('❌ FAILED!', error.message);
  process.exit(1);
}
