#!/usr/bin/env node

/**
 * Test if a password works for a user in Firebase Auth
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCmU-7GABqko2N-2saQNcNNSIyW_BbVCtU",
  authDomain: "calypso-diving-club.firebaseapp.com",
  projectId: "calypso-diving-club",
  storageBucket: "calypso-diving-club.firebasestorage.app",
  messagingSenderId: "829936299938",
  appId: "1:829936299938:web:3f0bbf2ba2a3fb8f6bc4d0",
  measurementId: "G-C9SD6YGEEG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const email = 'jan@h2m.ai';
const password = 'CalyCompta2025-11';

console.log('🔐 Testing Firebase Auth login...');
console.log('📧 Email:', email);
console.log('🔑 Password:', password);
console.log('');

try {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  console.log('✅ SUCCESS! Password is correct in Firebase Auth');
  console.log('👤 User ID:', userCredential.user.uid);
  console.log('📧 Email:', userCredential.user.email);
  console.log('✉️ Email verified:', userCredential.user.emailVerified);

  // Get the ID token to check custom claims
  const token = await userCredential.user.getIdToken();
  const idTokenResult = await userCredential.user.getIdTokenResult();
  console.log('🎭 Custom claims:', idTokenResult.claims);

  process.exit(0);
} catch (error) {
  console.error('❌ FAILED! Password does NOT match Firebase Auth');
  console.error('Error code:', error.code);
  console.error('Error message:', error.message);

  if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
    console.error('');
    console.error('🔍 This means:');
    console.error('   - The password in Firebase Auth is different from the one in the email');
    console.error('   - The /api/update-user-password endpoint may not have been called');
    console.error('   - Or the update failed silently');
  }

  process.exit(1);
}
