const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();
const CLUB_ID = 'calypso';

async function deleteTestUsers() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🗑️  SUPPRESSION UTILISATEURS TEST                     ║');
  console.log('║     CalyCompta - Gestion des Utilisateurs             ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('📍 Club: calypso');
  console.log('🎯 Cible: Utilisateurs avec emails test-*@calypso-test.be\n');

  // Step 1: List all users from Firebase Authentication
  console.log('🔍 Recherche dans Firebase Authentication...\n');

  const listUsersResult = await auth.listUsers();
  const testAuthUsers = listUsersResult.users.filter(user =>
    user.email && user.email.match(/^test-[a-z]+@calypso-test\.be$/)
  );

  // Step 2: Check if they exist in Firestore members
  console.log('🔍 Vérification dans Firestore /clubs/calypso/members...\n');

  const testUsers = [];

  for (const authUser of testAuthUsers) {
    const memberDoc = await db.collection('clubs').doc(CLUB_ID).collection('members').doc(authUser.uid).get();

    testUsers.push({
      uid: authUser.uid,
      email: authUser.email,
      displayName: authUser.displayName || 'N/A',
      inFirestore: memberDoc.exists,
      firestoreData: memberDoc.exists ? memberDoc.data() : null
    });
  }

  if (testUsers.length === 0) {
    console.log('✅ Aucun utilisateur de test trouvé');
    return;
  }

  console.log(`📊 ${testUsers.length} utilisateurs de test trouvés:\n`);
  testUsers.forEach((user, i) => {
    console.log(`${i + 1}. ${user.displayName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   UID: ${user.uid}`);
    console.log(`   Dans Firestore: ${user.inFirestore ? '✅ Oui' : '❌ Non'}`);
    if (user.inFirestore && user.firestoreData) {
      console.log(`   Rôle: ${user.firestoreData.role || 'N/A'}`);
      console.log(`   Statut: ${user.firestoreData.status || 'N/A'}`);
    }
    console.log('');
  });

  console.log('⚠️  ATTENTION: Tapez DELETE-TEST-USERS puis appuyez sur Entrée pour confirmer\n');
  console.log('Cette commande supprimera ces utilisateurs de Firebase Auth ET Firestore\n');

  // Note: Since we can't use readline in this context, print instructions
  console.log('Pour supprimer ces utilisateurs, relancez le script avec --confirm:');
  console.log('node scripts/delete-calypso-test-users.cjs --confirm\n');

  // Check if --confirm flag is present
  if (process.argv.includes('--confirm')) {
    console.log('\n🚀 Suppression en cours...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const user of testUsers) {
      try {
        // Delete from Firebase Authentication
        await auth.deleteUser(user.uid);
        console.log(`✅ Auth: ${user.email}`);

        // Delete from Firestore if exists
        if (user.inFirestore) {
          await db.collection('clubs').doc(CLUB_ID).collection('members').doc(user.uid).delete();
          console.log(`✅ Firestore: ${user.email}`);
        }

        successCount++;
      } catch (error) {
        console.error(`❌ Erreur pour ${user.email}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  ✅ SUPPRESSION TERMINÉE                              ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log(`📊 Résultats:`);
    console.log(`   ✅ Succès: ${successCount}`);
    console.log(`   ❌ Erreurs: ${errorCount}`);
    console.log(`   📋 Total: ${testUsers.length}\n`);

    console.log('💡 Conseil: Rechargez la page "Utilisateurs & Sécurité" pour voir les changements\n');
  }
}

deleteTestUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Erreur fatale:', err);
    process.exit(1);
  });
