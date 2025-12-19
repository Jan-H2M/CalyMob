#!/usr/bin/env node

/**
 * Set requirePasswordChange flag for a user
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load service account
const serviceAccountPath = join(__dirname, '../serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const clubId = 'calypso';
const userId = 'wXaHiVHWJxFxwi0FnrCZ'; // H2M user ID
const adminId = 'nvDVlhglO1eGXPBVRd7NbJ2Uevn2'; // Your admin ID

console.log('🔐 Setting requirePasswordChange flag...');
console.log('📧 User:', userId);
console.log('🏢 Club:', clubId);
console.log('');

try {
  await db.collection('clubs').doc(clubId).collection('members').doc(userId).update({
    'security.requirePasswordChange': true,
    'security.passwordSetAt': new Date(),
    'security.passwordSetBy': adminId,
  });

  console.log('✅ SUCCESS! requirePasswordChange flag set');
  console.log('');
  console.log('The user will now be forced to change their password on next login.');
  process.exit(0);
} catch (error) {
  console.error('❌ FAILED!', error.message);
  process.exit(1);
}
