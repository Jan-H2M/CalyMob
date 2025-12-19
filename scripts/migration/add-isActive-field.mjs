#!/usr/bin/env node

/**
 * Script to add isActive field to all member documents
 *
 * This script adds the isActive field based on the actif field
 * to ensure compatibility with the AuthContext
 *
 * Usage: node scripts/add-isActive-field.mjs [clubId]
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDEe31T_qH3r6jK0ONYBPuZ8wlvGkfr_kM",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "calycompta.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "calycompta",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "calycompta.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "690832972018",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:690832972018:web:e6b7784b7dfab3e9a4b0f3",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-NTXR0PT9QX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function addIsActiveField(clubId) {
  console.log(`\n🔄 Adding isActive field to members in club: ${clubId}\n`);

  try {
    // Get all members
    const membersRef = collection(db, `clubs/${clubId}/members`);
    const membersSnapshot = await getDocs(membersRef);

    if (membersSnapshot.empty) {
      console.log('⚠️  No members found in this club');
      return;
    }

    console.log(`Found ${membersSnapshot.size} member(s)\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const memberDoc of membersSnapshot.docs) {
      const memberData = memberDoc.data();
      const memberId = memberDoc.id;

      console.log(`\n📄 Processing member: ${memberId}`);
      console.log(`   Email: ${memberData.email || 'N/A'}`);
      console.log(`   Name: ${memberData.nom || memberData.prenom || 'N/A'}`);
      console.log(`   Role: ${memberData.role || 'N/A'}`);
      console.log(`   Current actif: ${memberData.actif}`);
      console.log(`   Current isActive: ${memberData.isActive}`);

      // Check if isActive already exists
      if (memberData.hasOwnProperty('isActive')) {
        console.log('   ⏭️  Skipped (isActive already exists)');
        skipped++;
        continue;
      }

      try {
        // Set isActive based on actif field (default to true if not present)
        const isActive = memberData.actif !== false;

        await updateDoc(doc(db, `clubs/${clubId}/members`, memberId), {
          isActive: isActive
        });

        console.log(`   ✅ Updated: isActive = ${isActive}`);
        updated++;
      } catch (error) {
        console.error(`   ❌ Error updating member ${memberId}:`, error.message);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log('='.repeat(50) + '\n');

    if (updated > 0) {
      console.log('✨ Migration completed successfully!');
      console.log('🔄 Please reload your browser to see the changes.');
    }

  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  }
}

// Main execution
const clubId = process.argv[2] || 'calypso';

console.log('🚀 Starting isActive field migration...');
console.log(`📍 Club ID: ${clubId}`);

addIsActiveField(clubId)
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
