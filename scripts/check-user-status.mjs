#!/usr/bin/env node

/**
 * Script pour vérifier le statut d'un utilisateur
 * Vérifie si l'utilisateur est supprimé et son statut actif/inactif
 *
 * Usage: node scripts/check-user-status.mjs <email>
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les credentials Firebase
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../serviceAccountKey.json'), 'utf8')
);

// Initialiser Firebase Admin
const app = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(app);
const auth = getAuth(app);

const CLUB_ID = 'calypso';

async function checkUserStatus(email) {
  try {
    console.log(`\n🔍 Recherche de l'utilisateur: ${email}\n`);

    // 1. Vérifier dans Firebase Auth
    console.log('📌 Vérification Firebase Authentication:');
    let authUser = null;
    try {
      authUser = await auth.getUserByEmail(email);
      console.log(`✅ Utilisateur trouvé dans Firebase Auth`);
      console.log(`   - UID: ${authUser.uid}`);
      console.log(`   - Email: ${authUser.email}`);
      console.log(`   - Email vérifié: ${authUser.emailVerified ? 'Oui' : 'Non'}`);
      console.log(`   - Désactivé: ${authUser.disabled ? 'Oui' : 'Non'}`);
      console.log(`   - Créé le: ${new Date(authUser.metadata.creationTime).toLocaleString('fr-FR')}`);
      console.log(`   - Dernière connexion: ${authUser.metadata.lastSignInTime ? new Date(authUser.metadata.lastSignInTime).toLocaleString('fr-FR') : 'Jamais'}`);

      // Custom claims
      if (authUser.customClaims) {
        console.log('   - Custom claims:');
        console.log(`     • role: ${authUser.customClaims.role || 'non défini'}`);
        console.log(`     • status: ${authUser.customClaims.status || 'non défini'}`);
        console.log(`     • isActive: ${authUser.customClaims.isActive !== undefined ? authUser.customClaims.isActive : 'non défini'}`);
        console.log(`     • clubId: ${authUser.customClaims.clubId || 'non défini'}`);
      } else {
        console.log('   - Custom claims: Aucun');
      }
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log(`❌ Utilisateur NON trouvé dans Firebase Auth`);
      } else {
        console.log(`❌ Erreur: ${error.message}`);
      }
    }

    // 2. Vérifier dans Firestore
    console.log(`\n📌 Vérification Firestore (clubs/${CLUB_ID}/members):`);

    if (authUser) {
      // Recherche par UID
      const userDocRef = db.doc(`clubs/${CLUB_ID}/members/${authUser.uid}`);
      const userDoc = await userDocRef.get();

      if (userDoc.exists) {
        const data = userDoc.data();
        console.log(`✅ Document utilisateur trouvé (par UID)`);
        console.log(`   - ID: ${userDoc.id}`);
        console.log(`   - Email: ${data.email}`);
        console.log(`   - Nom: ${data.displayName || data.prenom + ' ' + data.nom || 'Non défini'}`);
        console.log(`   - Rôle: ${data.app_role || data.role || 'Non défini'}`);
        console.log(`   - Statut: ${data.status || data.app_status || data.member_status || 'Non défini'}`);
        console.log(`   - isActive: ${data.isActive !== undefined ? data.isActive : 'Non défini'}`);
        console.log(`   - actif: ${data.actif !== undefined ? data.actif : 'Non défini'}`);
        console.log(`   - has_app_access: ${data.has_app_access !== undefined ? data.has_app_access : 'Non défini'}`);

        if (data.metadata) {
          console.log('   - Métadonnées:');
          if (data.metadata.createdBy) console.log(`     • Créé par: ${data.metadata.createdBy}`);
          if (data.metadata.deletedBy) console.log(`     • Supprimé par: ${data.metadata.deletedBy}`);
          if (data.metadata.deletedAt) console.log(`     • Supprimé le: ${data.metadata.deletedAt.toDate().toLocaleString('fr-FR')}`);
          if (data.metadata.activatedBy) console.log(`     • Activé par: ${data.metadata.activatedBy}`);
          if (data.metadata.deactivatedBy) console.log(`     • Désactivé par: ${data.metadata.deactivatedBy}`);
        }

        // Analyse du statut
        console.log('\n📊 Analyse du statut:');
        const isDeleted = data.status === 'deleted';
        const isActive = data.isActive === true || data.actif === true;
        const canLogin = !isDeleted && isActive && !authUser?.disabled;

        console.log(`   - Est supprimé (status='deleted'): ${isDeleted ? '🔴 OUI' : '🟢 NON'}`);
        console.log(`   - Est actif (isActive/actif): ${isActive ? '🟢 OUI' : '🔴 NON'}`);
        console.log(`   - Peut se connecter: ${canLogin ? '🟢 OUI' : '🔴 NON'}`);

        if (!canLogin) {
          console.log('\n⚠️  Raisons de blocage:');
          if (isDeleted) console.log('   - Statut "deleted" dans Firestore');
          if (!isActive) console.log('   - isActive/actif = false dans Firestore');
          if (authUser?.disabled) console.log('   - Compte désactivé dans Firebase Auth');
        }
      } else {
        console.log(`❌ Document utilisateur NON trouvé dans Firestore`);
      }
    } else {
      // Recherche par email
      const membersRef = db.collection(`clubs/${CLUB_ID}/members`);
      const querySnapshot = await membersRef.where('email', '==', email).get();

      if (!querySnapshot.empty) {
        console.log(`✅ Document(s) trouvé(s) par recherche email (${querySnapshot.size} résultat(s))`);

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          console.log(`\n   Document ID: ${doc.id}`);
          console.log(`   - Email: ${data.email}`);
          console.log(`   - Nom: ${data.displayName || data.prenom + ' ' + data.nom || 'Non défini'}`);
          console.log(`   - Rôle: ${data.app_role || data.role || 'Non défini'}`);
          console.log(`   - Statut: ${data.status || data.app_status || data.member_status || 'Non défini'}`);
          console.log(`   - isActive: ${data.isActive !== undefined ? data.isActive : 'Non défini'}`);

          const isDeleted = data.status === 'deleted';
          console.log(`   - Est supprimé: ${isDeleted ? '🔴 OUI' : '🟢 NON'}`);
        });
      } else {
        console.log(`❌ Aucun document trouvé dans Firestore`);
      }
    }

    // 3. Vérifier les logs d'audit
    console.log(`\n📌 Dernières actions d'audit:`);
    const auditRef = db.collection(`clubs/${CLUB_ID}/audit_logs`);
    const auditQuery = authUser
      ? auditRef.where('targetId', '==', authUser.uid).orderBy('timestamp', 'desc').limit(5)
      : auditRef.where('userEmail', '==', email).orderBy('timestamp', 'desc').limit(5);

    const auditSnapshot = await auditQuery.get();

    if (!auditSnapshot.empty) {
      auditSnapshot.forEach((doc) => {
        const log = doc.data();
        console.log(`   - ${log.action} | ${log.timestamp.toDate().toLocaleString('fr-FR')} | Par: ${log.userId || 'Système'}`);
        if (log.details) console.log(`     Détails: ${JSON.stringify(log.details)}`);
      });
    } else {
      console.log('   Aucun log trouvé');
    }

    console.log('\n✅ Vérification terminée\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error);
  }
}

// Récupérer l'email depuis les arguments
const email = process.argv[2];

if (!email) {
  console.error('❌ Usage: node scripts/check-user-status.mjs <email>');
  process.exit(1);
}

checkUserStatus(email).then(() => process.exit(0));
