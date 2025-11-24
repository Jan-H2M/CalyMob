// Script to create test users in Firebase Auth Emulator
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { 
  getFirestore, 
  connectFirestoreEmulator,
  doc,
  setDoc,
  collection,
  serverTimestamp
} from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCmU-7GABqko2N-2saQNcNNSIyW_BbVCtU",
  authDomain: "calycompta.firebaseapp.com",
  projectId: "calycompta",
  storageBucket: "calycompta.firebasestorage.app",
  messagingSenderId: "328464166969",
  appId: "1:328464166969:web:ee7f4452f92b1b338f5de8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Connect to emulators
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
connectFirestoreEmulator(db, 'localhost', 8080);

// Test users to create
const testUsers = [
  {
    email: 'admin@calypso.be',
    password: 'admin123',
    displayName: 'Admin Principal',
    role: 'admin'
  },
  {
    email: 'validateur@calypso.be',
    password: 'validateur123',
    displayName: 'Marie Lambert',
    role: 'validateur'
  },
  {
    email: 'membre@calypso.be',
    password: 'membre123',
    displayName: 'Jean Dupont',
    role: 'membre'
  }
];

async function setupTestUsers() {
  console.log('🚀 Setting up test users...\n');

  // First, create the club document
  const clubRef = doc(db, 'clubs', 'calypso');
  await setDoc(clubRef, {
    nom: 'Calypso Diving Club',
    adresse: 'Rue de la Plongée 1, 5000 Namur',
    iban: 'BE26210016070629',
    bic: 'GEBABEBB',
    email_contact: 'info@calypso.be',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  console.log('✅ Club "calypso" created');

  // Create test users
  for (const userData of testUsers) {
    try {
      // Create authentication user
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        userData.email, 
        userData.password
      );
      
      // Update display name
      await updateProfile(userCredential.user, {
        displayName: userData.displayName
      });

      // Create user profile in Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: userData.email,
        displayName: userData.displayName,
        role: userData.role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Add user as club member
      await setDoc(doc(db, 'clubs', 'calypso', 'members', userCredential.user.uid), {
        email: userData.email,
        nom: userData.displayName.split(' ')[1] || '',
        prenom: userData.displayName.split(' ')[0] || '',
        role: userData.role,
        actif: true,
        can_approve_expenses: userData.role === 'validateur' || userData.role === 'admin',
        date_inscription: serverTimestamp(),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });

      console.log(`✅ User created: ${userData.email} (${userData.role})`);
      console.log(`   Password: ${userData.password}`);
      console.log(`   UID: ${userCredential.user.uid}\n`);
      
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        console.log(`⚠️  User ${userData.email} already exists\n`);
      } else {
        console.error(`❌ Error creating ${userData.email}:`, error.message, '\n');
      }
    }
  }

  // Create some test data
  console.log('📊 Creating test data...\n');

  // Add a test expense claim
  const demandeRef = doc(collection(db, 'clubs', 'calypso', 'demandes_remboursement'));
  await setDoc(demandeRef, {
    demandeur_id: 'test_user_membre',
    demandeur_nom: 'Jean Dupont',
    montant: 80.00,
    description: 'Achat matériel plongée - détendeur',
    statut: 'soumis',
    date_soumission: serverTimestamp(),
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  console.log('✅ Test expense claim created (80€)');

  // Add a test bank transaction
  const transactionRef = doc(collection(db, 'clubs', 'calypso', 'transactions_bancaires'));
  await setDoc(transactionRef, {
    numero_sequence: '2025-TEST-001',
    date_execution: new Date('2025-01-02'),
    montant: -80.00,
    devise: 'EUR',
    numero_compte: 'BE26210016070629',
    type_transaction: 'Virement',
    contrepartie_nom: 'DUPONT JEAN',
    communication: 'Remboursement matériel plongée',
    reconcilie: false,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  console.log('✅ Test bank transaction created (-80€)');

  console.log('\n🎉 Setup complete!\n');
  console.log('You can now log in with:');
  console.log('  📧 admin@calypso.be / admin123 (Admin)');
  console.log('  📧 validateur@calypso.be / validateur123 (Validateur)');
  console.log('  📧 membre@calypso.be / membre123 (Membre)');
  
  process.exit(0);
}

// Run setup
setupTestUsers().catch(console.error);