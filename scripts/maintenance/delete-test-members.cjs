#!/usr/bin/env node
/**
 * Script om test/standaard members te vinden en te verwijderen
 * Verwijdert members met voornaam: "Standard", "Test"
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

// Namen die verwijderd moeten worden
const TEST_NAMES = ['Standard', 'Test', 'test', 'standard'];

async function deleteTestMembers() {
  console.log('🔍 Zoeken naar test members in Firestore...\n');

  const clubId = 'calypso';
  const membersRef = db.collection(`clubs/${clubId}/members`);
  const snapshot = await membersRef.get();

  const toDelete = [];

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const prenom = data.prenom || '';
    const nom = data.nom || '';

    if (TEST_NAMES.includes(prenom) || TEST_NAMES.includes(nom)) {
      toDelete.push({
        id: doc.id,
        prenom: prenom,
        nom: nom,
        email: data.email || '(geen email)'
      });
    }
  });

  if (toDelete.length === 0) {
    console.log('✅ Geen test members gevonden.');
    process.exit(0);
  }

  console.log(`📋 Gevonden ${toDelete.length} test member(s):\n`);
  toDelete.forEach((member, i) => {
    console.log(`  ${i + 1}. ${member.prenom} ${member.nom} (${member.email})`);
    console.log(`     ID: ${member.id}`);
  });

  // Vraag om bevestiging
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('\n⚠️  Wil je deze members verwijderen? (ja/nee): ', async (answer) => {
    if (answer.toLowerCase() === 'ja' || answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      console.log('\n🗑️  Verwijderen...\n');

      for (const member of toDelete) {
        await membersRef.doc(member.id).delete();
        console.log(`  ✅ Verwijderd: ${member.prenom} ${member.nom} (${member.id})`);
      }

      console.log(`\n🎉 ${toDelete.length} test member(s) verwijderd.`);
    } else {
      console.log('\n❌ Geannuleerd. Geen members verwijderd.');
    }

    rl.close();
    process.exit(0);
  });
}

deleteTestMembers().catch((error) => {
  console.error('❌ Fout:', error);
  process.exit(1);
});
