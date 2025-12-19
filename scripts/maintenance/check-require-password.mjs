#!/usr/bin/env node

/**
 * Check requirePasswordChange flag in Firestore
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load service account from environment or file
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    console.log('✅ Using FIREBASE_SERVICE_ACCOUNT_KEY from environment');
  } catch (error) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', error.message);
    process.exit(1);
  }
} else {
  // Fallback to local service account file
  try {
    const serviceAccountPath = join(__dirname, '../serviceAccountKey.json');
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    console.log('✅ Using local serviceAccountKey.json');
  } catch (error) {
    console.error('❌ No service account configuration found');
    console.error('Set FIREBASE_SERVICE_ACCOUNT_KEY environment variable or create serviceAccountKey.json');
    process.exit(1);
  }
}

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const clubId = 'calypso';
const userId = 'wXaHiVHWJxFxwi0FnrCZ'; // H2M user ID

console.log('🔍 Checking requirePasswordChange flag in Firestore...');
console.log('📧 User:', userId);
console.log('🏢 Club:', clubId);
console.log('');

try {
  const userDoc = await db.collection('clubs').doc(clubId).collection('members').doc(userId).get();

  if (!userDoc.exists) {
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

  process.exit(0);
} catch (error) {
  console.error('❌ FAILED!', error.message);
  process.exit(1);
}
