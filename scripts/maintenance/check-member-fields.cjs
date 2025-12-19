#!/usr/bin/env node
/**
 * Script om alle member velden te controleren
 * Controleert: nom, prenom, email, firstName, lastName
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkMemberFields() {
  console.log('🔍 Checking member fields in Firestore...\n');

  const clubId = 'calypso';

  // Check users collection
  console.log('=== USERS COLLECTION ===');
  const usersSnapshot = await db.collection(`clubs/${clubId}/users`).limit(10).get();

  usersSnapshot.docs.forEach((doc, index) => {
    const data = doc.data();
    console.log(`\n--- User ${index + 1}: ${doc.id} ---`);
    console.log('  nom:', data.nom || '(not set)');
    console.log('  prenom:', data.prenom || '(not set)');
    console.log('  lastName:', data.lastName || '(not set)');
    console.log('  firstName:', data.firstName || '(not set)');
    console.log('  email:', data.email || '(not set)');
    console.log('  displayName:', data.displayName || '(not set)');
  });

  // Check members collection (if exists)
  console.log('\n\n=== MEMBERS COLLECTION ===');
  try {
    const membersSnapshot = await db.collection(`clubs/${clubId}/members`).limit(10).get();

    if (membersSnapshot.empty) {
      console.log('No members collection or empty');
    } else {
      membersSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`\n--- Member ${index + 1}: ${doc.id} ---`);
        console.log('  nom:', data.nom || '(not set)');
        console.log('  prenom:', data.prenom || '(not set)');
        console.log('  lastName:', data.lastName || '(not set)');
        console.log('  firstName:', data.firstName || '(not set)');
        console.log('  email:', data.email || '(not set)');
        console.log('  displayName:', data.displayName || '(not set)');
      });
    }
  } catch (e) {
    console.log('Error reading members:', e.message);
  }

  // Check inscriptions for an event
  console.log('\n\n=== INSCRIPTIONS (checking all events) ===');
  const operationsSnapshot = await db.collection(`clubs/${clubId}/operations`)
    .where('statut', '==', 'ouvert')
    .get();

  console.log(`Found ${operationsSnapshot.size} open events`);

  let foundInscriptions = false;
  for (const opDoc of operationsSnapshot.docs) {
    const inscriptionsSnapshot = await db.collection(`clubs/${clubId}/operations/${opDoc.id}/inscriptions`).get();

    console.log(`\nEvent: ${opDoc.data().titre} (${opDoc.id}) - ${inscriptionsSnapshot.size} inscriptions`);

    if (!inscriptionsSnapshot.empty && !foundInscriptions) {
      foundInscriptions = true;

      inscriptionsSnapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`\n--- Inscription ${index + 1}: ${doc.id} ---`);
        console.log('  membre_nom:', data.membre_nom || '(not set)');
        console.log('  membre_prenom:', data.membre_prenom || '(not set)');
        console.log('  membre_id:', data.membre_id || '(not set)');

        // Show all fields to see what's available
        console.log('  ALL FIELDS:', Object.keys(data).join(', '));
      });
    }
  }

  console.log('\n\n✅ Done!');
  process.exit(0);
}

checkMemberFields().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
