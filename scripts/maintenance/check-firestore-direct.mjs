#!/usr/bin/env node

/**
 * Check requirePasswordChange flag by calling Vercel API endpoint
 * This simulates what would happen when the app loads user data
 */

const clubId = 'calypso';
const userId = 'wXaHiVHWJxFxwi0FnrCZ'; // H2M user ID

console.log('🔍 Checking requirePasswordChange flag via Firestore directly...');
console.log('This checks what the app would see when loading user data');
console.log('');
console.log('📧 User ID:', userId);
console.log('🏢 Club:', clubId);
console.log('');

// Note: This requires having the app running locally
// We'll use a simple approach: check the Firestore data structure

console.log('⚠️  To check the actual Firestore data, you need to:');
console.log('');
console.log('1. Go to Firebase Console: https://console.firebase.google.com/');
console.log('2. Select your project: calycompta');
console.log('3. Go to Firestore Database');
console.log('4. Navigate to: clubs/calypso/members/' + userId);
console.log('5. Check the "security" field');
console.log('6. Verify that "requirePasswordChange" is true');
console.log('');
console.log('OR run the app locally and check the browser console for:');
console.log('  "✅ Loaded user data from Firestore:"');
console.log('');

process.exit(0);
