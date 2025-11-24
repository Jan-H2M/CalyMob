const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, limit } = require('firebase/firestore');

// Configuration Firebase (depuis .env)
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDaq2r7_ob0mB1zo3gqJN67pgY0LARBgMk",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "calycompta.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "calycompta",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "calycompta.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "252824724933",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:252824724933:web:b16b5a6d8e5ec72e822e04"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkPatterns() {
  try {
    const patternsRef = collection(db, 'clubs', 'calypso', 'categorization_patterns');
    const q = query(patternsRef, limit(10));
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
        console.log('   Dernière utilisation:', data.last_used.toDate());
      }
      console.log('');
    });
    
    console.log('✅ Vérification terminée!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

checkPatterns();
