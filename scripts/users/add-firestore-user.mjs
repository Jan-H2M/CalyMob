import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
import readline from 'readline';

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function addFirestoreUser() {
  console.log('🚀 Add Firestore User Document');
  console.log('━'.repeat(60));

  try {
    const uid = await question('User UID (from Firebase Auth): ');
    const email = await question('Email: ');
    const displayName = await question('Display Name: ');
    const firstName = await question('First Name: ');
    const lastName = await question('Last Name: ');

    console.log('\nSelect Role:');
    console.log('  1. user');
    console.log('  2. validateur');
    console.log('  3. admin');
    console.log('  4. superadmin');
    const roleChoice = await question('Role [1-4]: ');

    const roleMap = {
      '1': 'user',
      '2': 'validateur',
      '3': 'admin',
      '4': 'superadmin'
    };
    const role = roleMap[roleChoice] || 'user';

    const clubId = (await question('Club ID [calypso]: ')) || 'calypso';

    console.log('\n' + '━'.repeat(60));
    console.log('Creating Firestore document with:');
    console.log(`  UID: ${uid}`);
    console.log(`  Email: ${email}`);
    console.log(`  Name: ${displayName}`);
    console.log(`  Role: ${role}`);
    console.log(`  Club: ${clubId}`);
    console.log('━'.repeat(60));

    const confirm = await question('\nConfirm? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      console.log('❌ Cancelled');
      rl.close();
      process.exit(0);
    }

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
        createdBy: 'add-firestore-user-script'
      }
    };

    await setDoc(userRef, userData);

    console.log('✅ Firestore document created successfully!');
    console.log(`   Path: clubs/${clubId}/members/${uid}`);
    console.log('\n' + '━'.repeat(60));
    console.log('User is ready to login!');
    console.log(`  Email: ${email}`);
    console.log(`  Role: ${role}`);
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('\n❌ Error creating Firestore document:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
  } finally {
    rl.close();
    process.exit(0);
  }
}

addFirestoreUser();
