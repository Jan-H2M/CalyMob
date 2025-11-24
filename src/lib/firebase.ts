import { initializeApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import {
  getStorage,
  connectStorageEmulator
} from 'firebase/storage';
import {
  getFunctions,
  connectFunctionsEmulator
} from 'firebase/functions';

// Configuration Firebase depuis les variables d'environnement
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCmU-7GABqko2N-2saQNcNNSIyW_BbVCtU',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'calycompta.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'calycompta',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'calycompta.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '328464166969',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:328464166969:web:ee7f4452f92b1b338f5de8',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);

// Mode développement : connecter aux émulateurs
const shouldUseEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_PROD !== 'true';

// Services Firebase
export const auth = getAuth(app);

// Initialiser Firestore avec cache persistant multi-onglet
// Note: On doit initialiser Firestore AVANT de connecter l'émulateur
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Connecter Firestore à l'émulateur si nécessaire (APRÈS initializeFirestore)
if (shouldUseEmulator) {
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.log('✅ Firestore emulator connected');
  } catch (e) {
    console.log('⚠️ Firestore emulator already connected');
  }
}

export const storage = getStorage(app);
export const functions = getFunctions(app);

// Vérifier si déjà connecté (pour éviter les erreurs lors du hot reload)
const isAuthConnected = (auth as any)._canInitEmulator === false;
const isStorageConnected = (storage as any)._protocol === 'http' && (storage as any)._host === 'localhost:9199';
const isFunctionsConnected = (functions as any)._customDomain === 'http://localhost:5001';

if (shouldUseEmulator) {
  if (!isAuthConnected) {
    try {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      console.log('✅ Auth emulator connected');
    } catch (e) {
      console.log('⚠️ Auth emulator already connected');
    }
  }

  if (!isStorageConnected) {
    try {
      connectStorageEmulator(storage, 'localhost', 9199);
      console.log('✅ Storage emulator connected');
    } catch (e) {
      console.log('⚠️ Storage emulator already connected');
    }
  }

  if (!isFunctionsConnected) {
    try {
      connectFunctionsEmulator(functions, 'localhost', 5001);
      console.log('✅ Functions emulator connected');
    } catch (e) {
      console.log('⚠️ Functions emulator already connected');
    }
  }
}

// Note: La persistance est maintenant configurée via initializeFirestore()
// avec persistentLocalCache et persistentMultipleTabManager
// (plus besoin de enableIndexedDbPersistence qui est déprécié)

// Fonctions d'authentification
export const signIn = (email: string, password: string) => 
  signInWithEmailAndPassword(auth, email, password);

export const signUp = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password);

export const signOut = () => firebaseSignOut(auth);

export const sendPasswordReset = (email: string) =>
  sendPasswordResetEmail(auth, email);

// Observer l'état d'authentification
export const onAuthChange = (callback: (user: User | null) => void) =>
  onAuthStateChanged(auth, callback);

// ID du club par défaut
export const DEFAULT_CLUB_ID = import.meta.env.VITE_CLUB_ID || 'calypso';

export default app;