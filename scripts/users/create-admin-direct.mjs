import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';

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

async function createAdmin() {
  console.log('🚀 Creating Admin User Document');
  console.log('━'.repeat(60));

  const uid = 'nvDVlhglO1eGXPBVRd7NbJ2Uevn2';
  const email = 'jan.andriessens@gmail.com';
  const displayName = 'Jan Andriessens';
  const firstName = 'Jan';
  const lastName = 'Andriessens';
  const role = 'admin';
  const clubId = 'calypso';

  try {
    console.log('Creating Firestore document with:');
    console.log(`  UID: ${uid}`);
    console.log(`  Email: ${email}`);
    console.log(`  Name: ${displayName}`);
    console.log(`  Role: ${role}`);
    console.log(`  Club: ${clubId}`);
    console.log('━'.repeat(60));

    // Create Firestore document
    console.log('\n📝 Creating Firestore document...');
    const userRef = doc(db, `clubs/${clubId}/members/${uid}`);

    const userData = {
      id: uid,
      email: email,
      displayName: displayName,
      firstName: firstName,
      lastName: lastName,
      role: role,
      status: 'active',
      isActive: true,
      actif: true,
      clubId: clubId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      metadata: {
        createdBy: 'create-admin-direct-script'
      }
    };

    await setDoc(userRef, userData);

    console.log('✅ Firestore document created successfully!');
    console.log(`   Path: clubs/${clubId}/members/${uid}`);
    console.log('\n' + '━'.repeat(60));
    console.log('✅ Admin user is ready to login!');
    console.log(`   Email: ${email}`);
    console.log(`   Role: ${role}`);
    console.log('━'.repeat(60));

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error creating Firestore document:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    process.exit(1);
  }
}

createAdmin();
