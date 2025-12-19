const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();

async function listAllUsers() {
  console.log('📋 Liste de TOUS les utilisateurs Firebase Authentication:\n');

  const listUsersResult = await auth.listUsers();

  console.log(`Total: ${listUsersResult.users.length} utilisateurs\n`);

  listUsersResult.users.forEach((user, i) => {
    console.log(`${i + 1}. ${user.displayName || 'N/A'}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   UID: ${user.uid}`);
    console.log(`   Créé le: ${user.metadata.creationTime}`);
    console.log(`   Dernière connexion: ${user.metadata.lastSignInTime || 'Jamais'}`);
    console.log('');
  });
}

listAllUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erreur:', err);
    process.exit(1);
  });
