/**
 * Script to manually create a Firestore session for testing
 * This bypasses the permission deadlock during testing
 * Usage: node scripts/create-session.cjs <email>
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const CLUB_ID = 'calypso';

async function createSession(email) {
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
    const userId = userDoc.id;
    const userData = userDoc.data();

    console.log(`✅ Utilisateur trouvé: ${userData.displayName || email}`);
    console.log(`   ID: ${userId}`);

    // Create session in Firestore
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
    );

    await db
      .collection('clubs')
      .doc(CLUB_ID)
      .collection('sessions')
      .doc(userId)
      .set({
        userId: userId,
        email: email,
        clubId: CLUB_ID,
        createdAt: now,
        lastActivity: now,
        expiresAt: expiresAt,
        isActive: true,
      });

    console.log(`\n✅ Session créée avec succès!`);
    console.log(`   Expire le: ${expiresAt.toDate().toLocaleString('fr-FR')}`);

    // Also update lastLogin in member document
    await userDoc.ref.update({
      lastLogin: now,
      updatedAt: now,
    });

    console.log(`✅ lastLogin mis à jour`);

    console.log(`\n📝 Instructions:`);
    console.log(`   1. Rafraîchir la page dans le navigateur`);
    console.log(`   2. Les erreurs de permissions devraient disparaître`);
    console.log(`   3. La modal de changement de mot de passe devrait apparaître\n`);

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
  console.error('Usage: node scripts/create-session.cjs <email>');
  process.exit(1);
}

createSession(email);
