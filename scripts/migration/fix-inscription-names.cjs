#!/usr/bin/env node
/**
 * Script om inscription namen te fixen
 * Zoekt de correcte nom/prenom van het member en update de inscriptie
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

async function fixInscriptionNames() {
  const clubId = 'calypso';
  const dryRun = process.argv.includes('--dry-run');

  console.log(`🔧 Fixing inscription names... ${dryRun ? '(DRY RUN)' : ''}\n`);

  // Get all members for lookup
  const membersSnapshot = await db.collection(`clubs/${clubId}/members`).get();
  const membersMap = new Map();

  membersSnapshot.docs.forEach(doc => {
    const data = doc.data();
    membersMap.set(doc.id, {
      nom: data.nom || data.lastName || '',
      prenom: data.prenom || data.firstName || '',
      email: data.email || ''
    });
  });

  console.log(`📋 Loaded ${membersMap.size} members for lookup\n`);

  // Get all open events
  const operationsSnapshot = await db.collection(`clubs/${clubId}/operations`)
    .where('statut', '==', 'ouvert')
    .get();

  let totalFixed = 0;
  let totalSkipped = 0;

  for (const opDoc of operationsSnapshot.docs) {
    const inscriptionsSnapshot = await db.collection(`clubs/${clubId}/operations/${opDoc.id}/inscriptions`).get();

    if (inscriptionsSnapshot.empty) continue;

    console.log(`\n📅 Event: ${opDoc.data().titre}`);

    for (const inscDoc of inscriptionsSnapshot.docs) {
      const inscData = inscDoc.data();
      const membreId = inscData.membre_id;
      const currentNom = inscData.membre_nom || '';
      const currentPrenom = inscData.membre_prenom || '';

      // Check if nom looks like an email
      const nomIsEmail = currentNom.includes('@');

      // Get member data
      const memberData = membersMap.get(membreId);

      if (!memberData) {
        console.log(`  ⚠️  Member not found: ${membreId}`);
        totalSkipped++;
        continue;
      }

      // Check if update is needed
      const needsUpdate = nomIsEmail ||
                          (memberData.nom && currentNom !== memberData.nom) ||
                          (memberData.prenom && currentPrenom !== memberData.prenom);

      if (!needsUpdate) {
        console.log(`  ✓ ${currentPrenom} ${currentNom} - OK`);
        totalSkipped++;
        continue;
      }

      console.log(`  🔄 ${currentPrenom} ${currentNom} → ${memberData.prenom} ${memberData.nom}`);

      if (!dryRun) {
        await inscDoc.ref.update({
          membre_nom: memberData.nom,
          membre_prenom: memberData.prenom,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      totalFixed++;
    }
  }

  console.log(`\n\n✅ Done!`);
  console.log(`   Fixed: ${totalFixed}`);
  console.log(`   Skipped: ${totalSkipped}`);

  if (dryRun) {
    console.log(`\n⚠️  This was a DRY RUN. Run without --dry-run to apply changes.`);
  }

  process.exit(0);
}

fixInscriptionNames().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
