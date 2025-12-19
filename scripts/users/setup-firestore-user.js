import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCmU-7GABqko2N-2saQNcNNSIyW_BbVCtU",
  authDomain: "calycompta.firebaseapp.com",
  projectId: "calycompta",
  storageBucket: "calycompta.firebasestorage.app",
  messagingSenderId: "328464166969",
  appId: "1:328464166969:web:ee7f4452f92b1b338f5de8"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function setupFirestoreUser() {
  try {
    // Se connecter d'abord
    console.log('Connexion en cours...');
    const userCredential = await signInWithEmailAndPassword(auth, 'demo@calypso.be', 'demo123');
    const user = userCredential.user;
    console.log('✅ Connecté avec succès, UID:', user.uid);

    // Créer le document club
    console.log('Création du club Calypso...');
    const clubRef = doc(db, 'clubs', 'calypso');
    await setDoc(clubRef, {
      nom: 'Calypso Diving Club',
      adresse: 'Rue de la Plongée 42, 1000 Bruxelles',
      created_at: new Date(),
      active: true
    }, { merge: true });
    console.log('✅ Club créé/mis à jour');

    // Créer le document membre
    console.log('Création du membre...');
    const membreRef = doc(db, 'clubs', 'calypso', 'membres', user.uid);
    await setDoc(membreRef, {
      id: user.uid,
      email: 'demo@calypso.be',
      nom: 'Demo',
      prenom: 'User',
      role: 'validateur',
      actif: true,
      created_at: new Date()
    }, { merge: true });
    console.log('✅ Membre créé avec rôle validateur');

    // Créer quelques catégories par défaut
    console.log('Création des catégories...');
    const categories = [
      { nom: 'Transport', couleur: '#3B82F6', icone: 'Car' },
      { nom: 'Matériel', couleur: '#10B981', icone: 'Package' },
      { nom: 'Formation', couleur: '#F59E0B', icone: 'GraduationCap' },
      { nom: 'Administration', couleur: '#8B5CF6', icone: 'FileText' },
      { nom: 'Location', couleur: '#EF4444', icone: 'Home' }
    ];

    for (const cat of categories) {
      const catRef = doc(db, 'clubs', 'calypso', 'categories', cat.nom.toLowerCase());
      await setDoc(catRef, {
        ...cat,
        created_at: new Date()
      }, { merge: true });
    }
    console.log('✅ Catégories créées');

    console.log('\n🎉 Configuration terminée avec succès !');
    console.log('\n📋 Vous pouvez maintenant :');
    console.log('1. Vous connecter sur http://localhost:5173');
    console.log('2. Email: demo@calypso.be');
    console.log('3. Mot de passe: demo123');
    console.log('4. Rôle: Validateur (accès complet aux opérations)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

setupFirestoreUser();