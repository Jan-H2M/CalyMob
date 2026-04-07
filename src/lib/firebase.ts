import { initializeApp } from 'firebase/app';
import { logger } from '@/utils/logger';
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
// SECURITY: Alle Firebase config moet via environment variables komen
const requiredEnvVars = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check for missing required environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  throw new Error(
    `❌ Missing required Firebase environment variables: ${missingVars.join(', ')}\n` +
    `Please create a .env file with these variables or set them in your deployment environment.\n` +
    `See .env.example for the required format.`
  );
}

const firebaseConfig = {
  apiKey: requiredEnvVars.VITE_FIREBASE_API_KEY,
  authDomain: requiredEnvVars.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: requiredEnvVars.VITE_FIREBASE_PROJECT_ID,
  storageBucket: requiredEnvVars.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: requiredEnvVars.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: requiredEnvVars.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID // Optional
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);

// Mode développement : connecter aux émulateurs
const shouldUseEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_PROD !== 'true';

// Export pour UI indicator
export const isTestEnvironment = shouldUseEmulator;

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
    logger.debug('✅ Firestore emulator connected');
  } catch (e) {
    logger.debug('⚠️ Firestore emulator already connected');
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
      logger.debug('✅ Auth emulator connected');
    } catch (e) {
      logger.debug('⚠️ Auth emulator already connected');
    }
  }

  if (!isStorageConnected) {
    try {
      connectStorageEmulator(storage, 'localhost', 9199);
      logger.debug('✅ Storage emulator connected');
    } catch (e) {
      logger.debug('⚠️ Storage emulator already connected');
    }
  }

  if (!isFunctionsConnected) {
    try {
      connectFunctionsEmulator(functions, 'localhost', 5001);
      logger.debug('✅ Functions emulator connected');
    } catch (e) {
      logger.debug('⚠️ Functions emulator already connected');
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

// Password reset - uses Firebase default handler
// To use custom handler, add your domain to Firebase Console:
// Authentication → Settings → Authorized domains
export const sendPasswordReset = (email: string) =>
  sendPasswordResetEmail(auth, email);

// Observer l'état d'authentification
export const onAuthChange = (callback: (user: User | null) => void) =>
  onAuthStateChanged(auth, callback);

// ID du club par défaut
export const DEFAULT_CLUB_ID = import.meta.env.VITE_CLUB_ID || 'calypso';

export default app;
