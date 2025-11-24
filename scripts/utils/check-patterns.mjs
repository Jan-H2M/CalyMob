import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDaq2r7_ob0mB1zo3gqJN67pgY0LARBgMk",
  authDomain: "calycompta.firebaseapp.com",
  projectId: "calycompta",
  storageBucket: "calycompta.firebasestorage.app",
  messagingSenderId: "252824724933",
  appId: "1:252824724933:web:b16b5a6d8e5ec72e822e04"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkPatterns() {
  try {
    const patternsRef = collection(db, 'clubs', 'calypso', 'categorization_patterns');
    const q = query(patternsRef, limit(15));
    const snapshot = await getDocs(q);
    
    console.log('\n📊 Patterns stockés dans Firestore:\n');
    console.log('✅ Total patterns trouvés:', snapshot.size);
    console.log('\n--- Exemples de patterns ---\n');
    
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log('🔹 ID:', doc.id);
      console.log('   Contrepartie:', data.contrepartie_normalized);
      console.log('   Catégorie:', data.category);
      console.log('   Code comptable:', data.account_code);
      console.log('   Utilisations:', data.usage_count);
      if (data.last_used) {
        const date = data.last_used.toDate();
        console.log('   Dernière utilisation:', date.toLocaleString('fr-BE'));
      }
      console.log('');
    });
    
    console.log('✅ Vérification terminée!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkPatterns();
