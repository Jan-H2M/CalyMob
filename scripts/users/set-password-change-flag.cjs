/**
 * Script to set requirePasswordChange flag for testing
 * Usage: node scripts/set-password-change-flag.cjs <email>
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const CLUB_ID = 'calypso';

async function setPasswordChangeFlag(email) {
  try {
    console.log(`\n🔍 Recherche de l'utilisateur: ${email}`);

    // Find user by email
    const membersSnapshot = await db
      .collection('clubs')
      .doc(CLUB_ID)
      .collection('members')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (membersSnapshot.empty) {
      console.error(`❌ Utilisateur non trouvé: ${email}`);
      process.exit(1);
    }

    const userDoc = membersSnapshot.docs[0];
    const userData = userDoc.data();

    console.log(`✅ Utilisateur trouvé: ${userData.displayName || userData.email}`);
    console.log(`   ID: ${userDoc.id}`);
    console.log(`   Role: ${userData.role}`);
    console.log(`   Current requirePasswordChange: ${userData.requirePasswordChange || false}`);

    // Set flag
    await userDoc.ref.update({
      requirePasswordChange: true,
      updatedAt: admin.firestore.Timestamp.now()
    });

    console.log(`\n✅ Flag requirePasswordChange défini sur true`);
    console.log(`\n📝 Instructions:`);
    console.log(`   1. Rafraîchir la page (F5)`);
    console.log(`   2. La modal de changement de mot de passe devrait apparaître`);
    console.log(`   3. Changer le mot de passe`);
    console.log(`   4. La modal disparaît et le flag est supprimé\n`);

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
  console.error('Usage: node scripts/set-password-change-flag.cjs <email>');
  process.exit(1);
}

setPasswordChangeFlag(email);
