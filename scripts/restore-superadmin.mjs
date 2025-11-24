import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, getDoc, Timestamp } from 'firebase/firestore';

// Firebase config for calycompta project
const firebaseConfig = {
  apiKey: "AIzaSyCmU-7GABqko2N-2saQNcNNSIyW_BbVCtU",
  authDomain: "calycompta.firebaseapp.com",
  projectId: "calycompta",
  storageBucket: "calycompta.firebasestorage.app",
  messagingSenderId: "328464166969",
  appId: "1:328464166969:web:ee7f4452f92b1b338f5de8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function restoreSuperadmin() {
  console.log('🔧 Restoring Superadmin Role');
  console.log('━'.repeat(60));

  // Chercher l'utilisateur par email
  const clubId = 'calypso';
  const email = 'yannandreessens@gmail.com'; // L'email que vous avez mentionné

  try {
    // Note: Firestore ne permet pas de query directement par email dans cette structure
    // On va devoir vérifier manuellement. Donnez-moi votre UID si vous l'avez

    console.log('❓ Avez-vous l\'UID de l\'utilisateur yannandreessens@gmail.com?');
    console.log('   Vous pouvez le trouver dans Firebase Console → Authentication');
    console.log('\nSinon, lancez ce script avec l\'UID en argument:');
    console.log('   node scripts/restore-superadmin.mjs <UID>');

    const uid = process.argv[2];

    if (!uid) {
      console.log('\n⚠️  Aucun UID fourni. Usage:');
      console.log('   node scripts/restore-superadmin.mjs <UID>');
      process.exit(1);
    }

    console.log(`\n🔍 Vérification de l'utilisateur ${uid}...`);

    const userRef = doc(db, `clubs/${clubId}/members/${uid}`);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      console.error(`❌ Utilisateur ${uid} introuvable dans Firestore`);
      console.log(`   Path: clubs/${clubId}/members/${uid}`);
      process.exit(1);
    }

    const userData = userDoc.data();
    console.log('\n📋 Utilisateur trouvé:');
    console.log(`   Email: ${userData.email}`);
    console.log(`   Nom: ${userData.displayName || userData.nom + ' ' + userData.prenom}`);
    console.log(`   Rôle actuel: ${userData.role}`);
    console.log(`   Statut: ${userData.status}`);

    if (userData.role === 'superadmin') {
      console.log('\n✅ L\'utilisateur est déjà superadmin!');
      process.exit(0);
    }

    console.log('\n🔄 Mise à jour du rôle vers superadmin...');

    await updateDoc(userRef, {
      role: 'superadmin',
      updatedAt: Timestamp.now(),
      'metadata.roleRestoredBy': 'restore-superadmin-script',
      'metadata.roleRestoredAt': Timestamp.now(),
      'metadata.previousRole': userData.role
    });

    console.log('✅ Rôle mis à jour vers superadmin!');
    console.log(`   Path: clubs/${clubId}/members/${uid}`);
    console.log('\n' + '━'.repeat(60));
    console.log('✅ L\'utilisateur a maintenant le rôle superadmin');
    console.log('   Reconnectez-vous pour que les changements prennent effet.');
    console.log('━'.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    if (error.code) {
      console.error(`   Code erreur: ${error.code}`);
    }
    process.exit(1);
  }
}

restoreSuperadmin();
