#!/usr/bin/env node

/**
 * Script pour configurer l'URL du logo du club dans Firestore
 *
 * Usage:
 *   node scripts/set-logo-url.mjs
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialiser Firebase Admin
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  './calycompta-firebase-adminsdk-service-account.json';

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (error) {
  console.error('❌ Erreur: Impossible de charger le fichier service account');
  console.error('Assurez-vous que le fichier existe à:', serviceAccountPath);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'calycompta.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function setLogoUrl() {
  try {
    const clubId = 'calypso';
    const logoPath = 'clubs/calypso/logo/logo-horizontal.jpg';

    console.log('🔍 Vérification du fichier dans Storage...');

    // Vérifier que le fichier existe
    const file = bucket.file(logoPath);
    const [exists] = await file.exists();

    if (!exists) {
      console.error(`❌ Le fichier ${logoPath} n'existe pas dans Storage`);
      process.exit(1);
    }

    console.log('✅ Fichier trouvé dans Storage');

    // Rendre le fichier public
    console.log('🔓 Rendre le fichier public...');
    await file.makePublic();
    console.log('✅ Fichier rendu public');

    // Générer l'URL publique
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(logoPath)}?alt=media`;

    console.log('📝 URL générée:', publicUrl);

    // Mettre à jour Firestore
    console.log('💾 Mise à jour de Firestore...');
    const settingsRef = db.collection('clubs').doc(clubId).collection('settings').doc('general');

    await settingsRef.set({
      logoUrl: publicUrl,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log('✅ Logo URL configuré avec succès!');
    console.log('\n📋 Résumé:');
    console.log('  - Club ID:', clubId);
    console.log('  - Logo URL:', publicUrl);
    console.log('  - Firestore path: clubs/calypso/settings/general');
    console.log('\n🎉 Le logo apparaîtra maintenant dans les emails!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

setLogoUrl();
