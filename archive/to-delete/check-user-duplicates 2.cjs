#!/usr/bin/env node

/**
 * Script pour vérifier les doublons d'utilisateurs dans Firebase
 *
 * Vérifie:
 * 1. Firebase Authentication - liste tous les utilisateurs
 * 2. Firestore /clubs/calypso/members - liste tous les documents
 * 3. Compare les deux pour détecter les doublons
 */

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin with application default credentials
initializeApp({
  projectId: 'calycompta'
});

const auth = getAuth();
const db = getFirestore();

async function checkDuplicates() {
  console.log('\n🔍 === VÉRIFICATION DES DOUBLONS UTILISATEUR ===\n');

  try {
    // 1. Récupérer tous les utilisateurs Firebase Auth
    console.log('📋 Récupération des utilisateurs Firebase Auth...');
    const listUsersResult = await auth.listUsers();
    const authUsers = listUsersResult.users;

    console.log(`✅ Trouvé ${authUsers.length} utilisateur(s) dans Firebase Auth\n`);

    console.log('👥 Firebase Auth Users:');
    console.log('─'.repeat(80));
    authUsers.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}`);
      console.log(`   UID: ${user.uid}`);
      console.log(`   Display Name: ${user.displayName || '(non défini)'}`);
      console.log(`   Created: ${user.metadata.creationTime}`);
      console.log(`   Last Sign In: ${user.metadata.lastSignInTime || '(jamais)'}`);
      if (user.customClaims) {
        console.log(`   Custom Claims: ${JSON.stringify(user.customClaims, null, 2)}`);
      }
      console.log('');
    });

    // 2. Récupérer tous les documents Firestore /clubs/calypso/members
    console.log('\n📋 Récupération des membres Firestore...');
    const membersSnapshot = await db.collection('clubs').doc('calypso').collection('members').get();
    const firestoreMembers = [];

    membersSnapshot.forEach(doc => {
      firestoreMembers.push({
        id: doc.id,
        data: doc.data()
      });
    });

    console.log(`✅ Trouvé ${firestoreMembers.length} membre(s) dans Firestore\n`);

    console.log('📁 Firestore Members:');
    console.log('─'.repeat(80));
    firestoreMembers.forEach((member, index) => {
      console.log(`${index + 1}. Document ID: ${member.id}`);
      console.log(`   Email: ${member.data.email || '(non défini)'}`);
      console.log(`   Display Name: ${member.data.displayName || member.data.nom || '(non défini)'}`);
      console.log(`   Role: ${member.data.role || '(non défini)'}`);
      console.log(`   Active: ${member.data.isActive !== false && member.data.actif !== false ? 'Oui' : 'Non'}`);
      console.log(`   Status: ${member.data.status || '(non défini)'}`);
      console.log('');
    });

    // 3. Analyse des correspondances
    console.log('\n🔍 === ANALYSE DES CORRESPONDANCES ===\n');

    // Auth users sans Firestore doc
    console.log('⚠️  Utilisateurs Firebase Auth SANS document Firestore:');
    const authWithoutFirestore = authUsers.filter(authUser =>
      !firestoreMembers.find(member => member.id === authUser.uid)
    );

    if (authWithoutFirestore.length === 0) {
      console.log('   ✅ Aucun (tous les utilisateurs Auth ont un document Firestore)');
    } else {
      authWithoutFirestore.forEach(user => {
        console.log(`   ❌ ${user.email} (UID: ${user.uid})`);
      });
    }

    console.log('');

    // Firestore docs sans Auth user
    console.log('⚠️  Documents Firestore SANS utilisateur Firebase Auth:');
    const firestoreWithoutAuth = firestoreMembers.filter(member =>
      !authUsers.find(authUser => authUser.uid === member.id)
    );

    if (firestoreWithoutAuth.length === 0) {
      console.log('   ✅ Aucun (tous les documents Firestore ont un utilisateur Auth)');
    } else {
      firestoreWithoutAuth.forEach(member => {
        console.log(`   ❌ ${member.data.email} (Doc ID: ${member.id})`);
      });
    }

    console.log('');

    // Doublons par email
    console.log('🔄 Vérification des doublons par email:');
    const emailGroups = {};

    authUsers.forEach(user => {
      if (user.email) {
        if (!emailGroups[user.email]) {
          emailGroups[user.email] = [];
        }
        emailGroups[user.email].push({ type: 'auth', uid: user.uid, data: user });
      }
    });

    firestoreMembers.forEach(member => {
      const email = member.data.email;
      if (email) {
        if (!emailGroups[email]) {
          emailGroups[email] = [];
        }
        emailGroups[email].push({ type: 'firestore', uid: member.id, data: member });
      }
    });

    const duplicateEmails = Object.entries(emailGroups).filter(([email, entries]) => entries.length > 1);

    if (duplicateEmails.length === 0) {
      console.log('   ✅ Aucun doublon détecté');
    } else {
      duplicateEmails.forEach(([email, entries]) => {
        console.log(`\n   ❌ Email en double: ${email}`);
        entries.forEach((entry, index) => {
          console.log(`      ${index + 1}. Type: ${entry.type.toUpperCase()}, UID/ID: ${entry.uid}`);
        });
      });
    }

    // 4. Résumé
    console.log('\n\n📊 === RÉSUMÉ ===\n');
    console.log(`Total utilisateurs Firebase Auth: ${authUsers.length}`);
    console.log(`Total documents Firestore: ${firestoreMembers.length}`);
    console.log(`Utilisateurs Auth sans Firestore: ${authWithoutFirestore.length}`);
    console.log(`Documents Firestore sans Auth: ${firestoreWithoutAuth.length}`);
    console.log(`Emails en double: ${duplicateEmails.length}`);

    if (authWithoutFirestore.length === 0 && firestoreWithoutAuth.length === 0 && duplicateEmails.length === 0) {
      console.log('\n✅ Tout est en ordre! Aucun doublon détecté.\n');
    } else {
      console.log('\n⚠️  Des problèmes ont été détectés. Voir ci-dessus pour les détails.\n');
    }

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  }
}

// Execute
checkDuplicates()
  .then(() => {
    console.log('✅ Vérification terminée\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur:', error);
    process.exit(1);
  });
