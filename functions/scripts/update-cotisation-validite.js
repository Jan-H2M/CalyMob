/**
 * Script om cotisation_validite voor alle leden op 31/01/2026 te zetten
 *
 * Gebruik:
 *   1. Zorg dat je bent ingelogd bij Firebase: firebase login
 *   2. Run: node scripts/update-cotisation-validite.js
 *
 * Of via Firebase Functions Shell:
 *   firebase functions:shell
 *   > require('./scripts/update-cotisation-validite.js')
 */

const admin = require('firebase-admin');

// Initialiseer Firebase Admin (gebruikt automatisch default credentials via gcloud/firebase)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'calycompta'
  });
}

const db = admin.firestore();

// Configuration
const CLUB_ID = 'calypso';
const NEW_COTISATION_DATE = new Date('2026-01-31T00:00:00');

async function updateCotisationValidite() {
  try {
    console.log('📋 Récupération des membres...');
    const membersRef = db.collection('clubs').doc(CLUB_ID).collection('members');
    const snapshot = await membersRef.get();

    if (snapshot.empty) {
      console.log('⚠️  Aucun membre trouvé dans la collection');
      return;
    }

    console.log(`   Trouvé ${snapshot.size} membres`);

    // Préparer le batch update
    const cotisationTimestamp = admin.firestore.Timestamp.fromDate(NEW_COTISATION_DATE);
    let batch = db.batch();
    let batchCount = 0;
    let totalUpdated = 0;

    console.log(`\n🔄 Mise à jour de cotisation_validite vers: 31/01/2026`);

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const memberName = `${data.prenom || data.firstName || ''} ${data.nom || data.lastName || ''}`.trim() || docSnap.id;

      // Ajouter au batch
      batch.update(docSnap.ref, {
        cotisation_validite: cotisationTimestamp,
        updatedAt: admin.firestore.Timestamp.now()
      });

      batchCount++;
      totalUpdated++;

      // Firebase limite à 500 opérations par batch
      if (batchCount >= 500) {
        console.log(`   Committing batch de ${batchCount} membres...`);
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Commit le dernier batch
    if (batchCount > 0) {
      console.log(`   Committing dernier batch de ${batchCount} membres...`);
      await batch.commit();
    }

    console.log(`\n✅ Mise à jour terminée avec succès!`);
    console.log(`   ${totalUpdated} membres mis à jour`);
    console.log(`   Nouvelle date de cotisation: 31/01/2026`);

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    throw error;
  }
}

// Run als dit direct wordt uitgevoerd
if (require.main === module) {
  updateCotisationValidite()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = updateCotisationValidite;
