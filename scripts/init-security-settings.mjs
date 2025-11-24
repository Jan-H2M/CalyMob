#!/usr/bin/env node

/**
 * Script pour initialiser les paramètres de sécurité dans Firebase
 *
 * Ce script crée le document /clubs/{clubId}/settings/security avec les valeurs par défaut
 *
 * Usage:
 *   node scripts/init-security-settings.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Configuration
const CLUB_ID = 'calypso';

// Récupérer le chemin du fichier actuel
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialiser Firebase Admin
let app;
try {
  // Chercher le fichier service account dans le répertoire parent
  const serviceAccountPath = join(__dirname, '..', 'serviceAccountKey.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.error('\n❌ Fichier serviceAccountKey.json introuvable !');
    console.log('\n📥 Pour obtenir ce fichier :');
    console.log('1. Aller sur https://console.firebase.google.com/project/calycompta/settings/serviceaccounts/adminsdk');
    console.log('2. Cliquer sur "Générer une nouvelle clé privée"');
    console.log('3. Sauvegarder le fichier JSON téléchargé comme serviceAccountKey.json');
    console.log('\n⚠️  IMPORTANT : Ne JAMAIS committer ce fichier dans Git !');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  app = initializeApp({
    credential: cert(serviceAccount),
    projectId: 'calycompta'
  });

  console.log('✅ Firebase Admin initialisé\n');
} catch (error) {
  console.error('❌ Erreur initialisation Firebase Admin:', error.message);
  process.exit(1);
}

const db = getFirestore(app);

/**
 * Paramètres de sécurité par défaut
 */
const DEFAULT_SECURITY_SETTINGS = {
  autoLogoutEnabled: true,
  idleTimeoutMinutes: 30,
  warningBeforeMinutes: 2,
  updatedAt: Timestamp.now(),
  updatedBy: 'init-script'
};

/**
 * Paramètres généraux par défaut
 */
const DEFAULT_GENERAL_SETTINGS = {
  doubleApprovalThreshold: 650,
  enableDoubleApproval: true,
  clubName: 'Calypso Diving Club',
  fiscalYear: 2025,
  currency: 'EUR',
  updatedAt: Timestamp.now(),
  updatedBy: 'init-script'
};

/**
 * Créer les paramètres de sécurité
 */
async function initSecuritySettings() {
  try {
    const securityRef = db.collection('clubs').doc(CLUB_ID).collection('settings').doc('security');

    // Vérifier si les paramètres existent déjà
    const securityDoc = await securityRef.get();

    if (securityDoc.exists) {
      console.log('ℹ️  Paramètres de sécurité existants :');
      console.log(JSON.stringify(securityDoc.data(), null, 2));

      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      return new Promise((resolve) => {
        rl.question('\n❓ Voulez-vous les écraser ? (oui/non) : ', async (answer) => {
          rl.close();

          if (answer.toLowerCase() === 'oui' || answer.toLowerCase() === 'o') {
            await securityRef.set(DEFAULT_SECURITY_SETTINGS);
            console.log('\n✅ Paramètres de sécurité mis à jour avec succès !');
            console.log(JSON.stringify(DEFAULT_SECURITY_SETTINGS, null, 2));
          } else {
            console.log('\n⏭️  Paramètres de sécurité conservés (non modifiés)');
          }

          resolve();
        });
      });
    } else {
      await securityRef.set(DEFAULT_SECURITY_SETTINGS);
      console.log('✅ Paramètres de sécurité créés avec succès !');
      console.log(JSON.stringify(DEFAULT_SECURITY_SETTINGS, null, 2));
    }
  } catch (error) {
    console.error('❌ Erreur création paramètres de sécurité:', error);
    throw error;
  }
}

/**
 * Créer les paramètres généraux
 */
async function initGeneralSettings() {
  try {
    const generalRef = db.collection('clubs').doc(CLUB_ID).collection('settings').doc('general');

    // Vérifier si les paramètres existent déjà
    const generalDoc = await generalRef.get();

    if (generalDoc.exists) {
      console.log('\nℹ️  Paramètres généraux existants :');
      console.log(JSON.stringify(generalDoc.data(), null, 2));

      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      return new Promise((resolve) => {
        rl.question('\n❓ Voulez-vous les écraser ? (oui/non) : ', async (answer) => {
          rl.close();

          if (answer.toLowerCase() === 'oui' || answer.toLowerCase() === 'o') {
            await generalRef.set(DEFAULT_GENERAL_SETTINGS);
            console.log('\n✅ Paramètres généraux mis à jour avec succès !');
            console.log(JSON.stringify(DEFAULT_GENERAL_SETTINGS, null, 2));
          } else {
            console.log('\n⏭️  Paramètres généraux conservés (non modifiés)');
          }

          resolve();
        });
      });
    } else {
      await generalRef.set(DEFAULT_GENERAL_SETTINGS);
      console.log('\n✅ Paramètres généraux créés avec succès !');
      console.log(JSON.stringify(DEFAULT_GENERAL_SETTINGS, null, 2));
    }
  } catch (error) {
    console.error('❌ Erreur création paramètres généraux:', error);
    throw error;
  }
}

/**
 * Main
 */
async function main() {
  console.log('🔧 Initialisation des paramètres Firebase pour le club:', CLUB_ID);
  console.log('━'.repeat(60));

  try {
    // Créer les paramètres de sécurité
    await initSecuritySettings();

    // Créer les paramètres généraux
    await initGeneralSettings();

    console.log('\n━'.repeat(60));
    console.log('✅ Initialisation terminée avec succès !');
    console.log('\n📍 Vérifier dans Firebase Console :');
    console.log(`https://console.firebase.google.com/project/calycompta/firestore/databases/-default-/data/~2Fclubs~2F${CLUB_ID}~2Fsettings`);

  } catch (error) {
    console.error('\n❌ Erreur lors de l\'initialisation:', error);
    process.exit(1);
  }
}

// Exécuter
main().then(() => {
  console.log('\n👋 Au revoir !');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Erreur fatale:', error);
  process.exit(1);
});
