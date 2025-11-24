#!/usr/bin/env node

/**
 * Script de migration : Événements → Opérations
 *
 * Migrations effectuées :
 * 1. Collection 'evenements' → 'operations' (ajoute type='evenement', renomme budget_prevu_revenus → montant_prevu)
 * 2. Collection 'event_registrations' → 'operation_participants' (renomme evenement_id → operation_id, ajoute operation_type)
 * 3. Mise à jour 'bank_transactions' (ajoute operation_id depuis evenement_id)
 * 4. Mise à jour 'expense_claims' (ajoute operation_id depuis evenement_id)
 *
 * Usage:
 *   node scripts/migrate-to-operations.js [options]
 *
 * Options:
 *   --dry-run    : Simulation sans écriture
 *   --emulator   : Utilise Firebase Emulators
 *
 * IMPORTANT: Fait un backup AVANT d'exécuter !
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { runBackup } = require('./backup-firestore');
const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const useEmulator = args.includes('--emulator');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'firebase-admin-key.json');
const CLUB_ID = 'calypso';

/**
 * Initialise Firebase Admin
 */
function initializeFirebase() {
  if (useEmulator) {
    console.log('🔧 Mode Emulator');
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    initializeApp({ projectId: 'demo-calycompta' });
  } else {
    console.log('🌍 Mode Production');
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      console.error('❌ Erreur: Fichier firebase-admin-key.json introuvable');
      console.error(`   Chemin attendu: ${SERVICE_ACCOUNT_PATH}`);
      process.exit(1);
    }
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    initializeApp({
      credential: cert(serviceAccount)
    });
  }
  return getFirestore();
}

/**
 * Migration 1: evenements → operations
 */
async function migrateEvenementsToOperations(db) {
  console.log('\n📦 Étape 1/4: Migration evenements → operations');
  console.log('==========================================\n');

  const evenementsRef = db.collection('clubs').doc(CLUB_ID).collection('evenements');
  const operationsRef = db.collection('clubs').doc(CLUB_ID).collection('operations');

  const snapshot = await evenementsRef.get();
  console.log(`   📊 ${snapshot.size} événements à migrer`);

  if (dryRun) {
    console.log('   🔍 DRY-RUN: Aucune écriture Firestore\n');
    return snapshot.size;
  }

  let migratedCount = 0;
  const batch = db.batch();

  snapshot.forEach(doc => {
    const data = doc.data();

    // Transformer en Operation
    const operation = {
      ...data,
      type: 'evenement',  // NOUVEAU champ
      montant_prevu: data.budget_prevu_revenus || 0  // Renommer champ
      // Note: budget_prevu_depenses supprimé (pas dans Operation)
    };

    const operationRef = operationsRef.doc(doc.id);
    batch.set(operationRef, operation);

    migratedCount++;
  });

  await batch.commit();
  console.log(`   ✅ ${migratedCount} événements migrés vers operations\n`);

  return migratedCount;
}

/**
 * Migration 2: event_registrations → operation_participants
 */
async function migrateRegistrationsToParticipants(db) {
  console.log('\n📦 Étape 2/4: Migration event_registrations → operation_participants');
  console.log('================================================================\n');

  const registrationsRef = db.collection('clubs').doc(CLUB_ID).collection('event_registrations');
  const participantsRef = db.collection('clubs').doc(CLUB_ID).collection('operation_participants');

  const snapshot = await registrationsRef.get();
  console.log(`   📊 ${snapshot.size} inscriptions à migrer`);

  if (dryRun) {
    console.log('   🔍 DRY-RUN: Aucune écriture Firestore\n');
    return snapshot.size;
  }

  let migratedCount = 0;

  // Batch par groupe de 500 (limite Firestore)
  const BATCH_SIZE = 500;
  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const batchDocs = snapshot.docs.slice(i, i + BATCH_SIZE);

    batchDocs.forEach(doc => {
      const data = doc.data();

      // Transformer en ParticipantOperation
      const participant = {
        ...data,
        operation_id: data.evenement_id,  // Renommer champ
        operation_titre: data.evenement_titre,
        operation_type: 'evenement'  // NOUVEAU champ
        // evenement_id gardé pour rétrocompatibilité
      };

      const participantRef = participantsRef.doc(doc.id);
      batch.set(participantRef, participant);

      migratedCount++;
    });

    await batch.commit();

    if (snapshot.docs.length > BATCH_SIZE) {
      process.stdout.write(`\r   Progression: ${migratedCount}/${snapshot.size} inscriptions...`);
    }
  }

  if (snapshot.docs.length > BATCH_SIZE) {
    process.stdout.write('\r');
  }

  console.log(`   ✅ ${migratedCount} inscriptions migrées vers operation_participants\n`);

  return migratedCount;
}

/**
 * Migration 3: Mise à jour bank_transactions
 */
async function updateBankTransactions(db) {
  console.log('\n📦 Étape 3/4: Mise à jour bank_transactions');
  console.log('==========================================\n');

  const transactionsRef = db.collection('clubs').doc(CLUB_ID).collection('bank_transactions');
  const snapshot = await transactionsRef.get();

  console.log(`   📊 ${snapshot.size} transactions à vérifier`);

  const toUpdate = snapshot.docs.filter(doc => doc.data().evenement_id);
  console.log(`   📊 ${toUpdate.length} transactions avec evenement_id`);

  if (dryRun) {
    console.log('   🔍 DRY-RUN: Aucune écriture Firestore\n');
    return toUpdate.length;
  }

  let updatedCount = 0;
  const batch = db.batch();

  toUpdate.forEach(doc => {
    const data = doc.data();

    batch.update(doc.ref, {
      operation_id: data.evenement_id  // Copier evenement_id vers operation_id
      // evenement_id gardé pour rétrocompatibilité
    });

    updatedCount++;
  });

  if (updatedCount > 0) {
    await batch.commit();
  }

  console.log(`   ✅ ${updatedCount} transactions mises à jour\n`);

  return updatedCount;
}

/**
 * Migration 4: Mise à jour expense_claims
 */
async function updateExpenseClaims(db) {
  console.log('\n📦 Étape 4/4: Mise à jour expense_claims');
  console.log('======================================\n');

  const claimsRef = db.collection('clubs').doc(CLUB_ID).collection('expense_claims');
  const snapshot = await claimsRef.get();

  console.log(`   📊 ${snapshot.size} demandes à vérifier`);

  const toUpdate = snapshot.docs.filter(doc => doc.data().evenement_id);
  console.log(`   📊 ${toUpdate.length} demandes avec evenement_id`);

  if (dryRun) {
    console.log('   🔍 DRY-RUN: Aucune écriture Firestore\n');
    return toUpdate.length;
  }

  let updatedCount = 0;
  const batch = db.batch();

  toUpdate.forEach(doc => {
    const data = doc.data();

    batch.update(doc.ref, {
      operation_id: data.evenement_id,  // Copier evenement_id vers operation_id
      operation_titre: data.evenement_titre
      // evenement_id gardé pour rétrocompatibilité
    });

    updatedCount++;
  });

  if (updatedCount > 0) {
    await batch.commit();
  }

  console.log(`   ✅ ${updatedCount} demandes mises à jour\n`);

  return updatedCount;
}

/**
 * Exécute la migration complète
 */
async function runMigration() {
  console.log('🚀 MIGRATION ÉVÉNEMENTS → OPÉRATIONS');
  console.log('====================================\n');

  if (dryRun) {
    console.log('🔍 MODE DRY-RUN: Simulation sans écriture Firestore\n');
  } else {
    console.log('⚠️  MODE PRODUCTION: Modifications Firestore RÉELLES\n');
  }

  // Étape 0: Backup automatique (seulement en production)
  if (!dryRun && !useEmulator) {
    console.log('📦 Étape 0: Backup pré-migration');
    console.log('================================\n');

    try {
      const backupDir = await runBackup();
      console.log(`\n✅ Backup créé : ${backupDir}\n`);
    } catch (error) {
      console.error('❌ Erreur lors du backup:', error.message);
      console.error('\n⚠️  Migration annulée. Créez un backup manuel avant de continuer.');
      process.exit(1);
    }
  }

  // Initialiser Firebase
  const db = initializeFirebase();

  // Exécuter migrations
  const stats = {
    events: 0,
    registrations: 0,
    transactions: 0,
    claims: 0
  };

  try {
    stats.events = await migrateEvenementsToOperations(db);
    stats.registrations = await migrateRegistrationsToParticipants(db);
    stats.transactions = await updateBankTransactions(db);
    stats.claims = await updateExpenseClaims(db);

    // Résumé
    console.log('\n📊 RÉSUMÉ MIGRATION');
    console.log('==================\n');
    console.log(`   Événements → Opérations         : ${stats.events}`);
    console.log(`   Inscriptions → Participants     : ${stats.registrations}`);
    console.log(`   Transactions mises à jour       : ${stats.transactions}`);
    console.log(`   Demandes remboursement maj      : ${stats.claims}`);
    console.log(`\n   📈 TOTAL documents traités      : ${stats.events + stats.registrations + stats.transactions + stats.claims}`);

    if (dryRun) {
      console.log('\n🔍 DRY-RUN terminé. Aucune modification Firestore.');
      console.log('\n💡 Pour exécuter la migration réelle:');
      console.log('   node scripts/migrate-to-operations.js');
    } else {
      console.log('\n✅ Migration terminée avec succès !');

      // Backup post-migration
      if (!useEmulator) {
        console.log('\n📦 Création backup post-migration...');
        const postBackupDir = await runBackup();
        console.log(`✅ Backup post-migration: ${postBackupDir}`);
      }

      console.log('\n📋 PROCHAINES ÉTAPES:');
      console.log('   1. Déployer Firestore rules mises à jour:');
      console.log('      cd calycompta-app && firebase deploy --only firestore:rules');
      console.log('   2. Déployer Storage rules:');
      console.log('      firebase deploy --only storage:rules');
      console.log('   3. Tester application en production');
      console.log('\n⚠️  Les anciennes collections (evenements, event_registrations) sont');
      console.log('   conservées pour rollback. Supprimez-les après 30 jours si tout OK.');
    }
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error);
    console.error('\n⚠️  Migration échouée. Restaurez depuis backup si nécessaire.');
    process.exit(1);
  }
}

// Exécution
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('\n🎉 Processus terminé.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erreur fatale:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };
