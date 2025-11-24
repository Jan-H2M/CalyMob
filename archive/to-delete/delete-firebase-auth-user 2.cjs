/**
 * Script to delete a user from Firebase Authentication
 * This allows re-testing the activation flow
 * Usage: node scripts/delete-firebase-auth-user.cjs <email>
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const CLUB_ID = 'calypso';

async function deleteFirebaseAuthUser(email) {
  try {
    console.log(`\n🔍 Recherche de l'utilisateur: ${email}`);

    // Find user by email in Firestore
    const membersSnapshot = await db
      .collection('clubs')
      .doc(CLUB_ID)
      .collection('members')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (membersSnapshot.empty) {
      console.error(`❌ Utilisateur non trouvé dans Firestore: ${email}`);
      process.exit(1);
    }

    const userDoc = membersSnapshot.docs[0];
    const userData = userDoc.data();
    const userId = userDoc.id;

    console.log(`✅ Utilisateur trouvé dans Firestore:`);
    console.log(`   ID: ${userId}`);
    console.log(`   Email: ${userData.email}`);
    console.log(`   Name: ${userData.displayName || 'N/A'}`);
    console.log(`   Role: ${userData.role}`);
    console.log(`   Active: ${userData.isActive}`);

    // Check if Firebase Auth account exists
    let authUserExists = false;
    try {
      await admin.auth().getUser(userId);
      authUserExists = true;
      console.log(`\n✅ Compte Firebase Auth trouvé`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log(`\n⚠️  Aucun compte Firebase Auth trouvé`);
      } else {
        throw error;
      }
    }

    // Delete Firebase Auth account if exists
    if (authUserExists) {
      await admin.auth().deleteUser(userId);
      console.log(`✅ Compte Firebase Auth supprimé`);
    }

    // Reset Firestore document to pending state
    await userDoc.ref.update({
      isActive: false,
      requirePasswordChange: admin.firestore.FieldValue.delete(),
      'metadata.pendingActivation': true,
      updatedAt: admin.firestore.Timestamp.now()
    });

    console.log(`✅ Document Firestore réinitialisé (pendingActivation: true, isActive: false)`);

    console.log(`\n✅ Opération terminée avec succès!`);
    console.log(`\n📝 Prochaines étapes:`);
    console.log(`   1. Refresh la page Users dans l'UI`);
    console.log(`   2. L'utilisateur devrait avoir le badge "En attente d'activation"`);
    console.log(`   3. Cliquer sur "Activer Firebase Auth"`);
    console.log(`   4. Se connecter avec le mot de passe "123456"`);
    console.log(`   5. La modal de changement de mot de passe devrait apparaître\n`);

  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Main
const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/delete-firebase-auth-user.cjs <email>');
  process.exit(1);
}

deleteFirebaseAuthUser(email);
