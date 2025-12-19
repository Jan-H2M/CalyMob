/**
 * Script de nettoyage des transactions en double
 *
 * Ce script identifie et supprime les transactions dupliquées dans Firestore.
 *
 * Stratégie de nettoyage:
 * 1. Grouper les transactions par numero_sequence
 * 2. Pour chaque groupe de doublons (2+ transactions):
 *    - GARDER la transaction réconciliée (si elle existe)
 *    - GARDER la transaction la plus récente (created_at)
 *    - SUPPRIMER toutes les autres
 *
 * Usage:
 *   node scripts/clean-duplicates.js              # Dry-run (simulation)
 *   node scripts/clean-duplicates.js --execute    # Exécution réelle
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Erreur: Fichier serviceAccountKey.json introuvable');
  console.error('   Placez le fichier dans le dossier scripts/');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const CLUB_ID = 'calypso';

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');

console.log('🔍 Script de nettoyage des transactions en double');
console.log('================================================\n');

if (DRY_RUN) {
  console.log('⚠️  MODE SIMULATION (DRY-RUN)');
  console.log('   Aucune suppression ne sera effectuée.');
  console.log('   Utilisez --execute pour effectuer les suppressions.\n');
} else {
  console.log('🚨 MODE EXÉCUTION RÉELLE');
  console.log('   Les doublons seront DÉFINITIVEMENT supprimés.\n');
}

async function cleanDuplicates() {
  try {
    console.log('📥 Chargement des transactions depuis Firestore...');
    const transactionsRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
    const snapshot = await transactionsRef.get();

    console.log(`✅ ${snapshot.size} transactions chargées\n`);

    // Group transactions by numero_sequence
    console.log('🔄 Groupement des transactions par numéro de séquence...');
    const groups = new Map();

    snapshot.docs.forEach(doc => {
      const tx = { id: doc.id, ...doc.data() };
      const key = tx.numero_sequence;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(tx);
    });

    // Find duplicate groups (2+ transactions with same numero_sequence)
    const duplicateGroups = new Map();
    groups.forEach((txList, key) => {
      if (txList.length >= 2) {
        duplicateGroups.set(key, txList);
      }
    });

    console.log(`✅ ${duplicateGroups.size} groupes de doublons trouvés\n`);

    if (duplicateGroups.size === 0) {
      console.log('🎉 Aucun doublon à nettoyer !');
      return;
    }

    // Statistics
    let totalToDelete = 0;
    let totalReconciled = 0;
    let totalUnreconciled = 0;
    const deletionLog = [];

    console.log('📊 Analyse des doublons...\n');

    // Process each duplicate group
    duplicateGroups.forEach((txList, numeroSequence) => {
      // Sort transactions by priority:
      // 1. Reconciled transactions first
      // 2. Then by created_at (most recent first)
      const sorted = txList.sort((a, b) => {
        // Priority 1: Reconciled transactions
        if (a.reconcilie && !b.reconcilie) return -1;
        if (!a.reconcilie && b.reconcilie) return 1;

        // Priority 2: Most recent created_at
        const dateA = a.created_at?.toDate?.() || new Date(a.created_at || 0);
        const dateB = b.created_at?.toDate?.() || new Date(b.created_at || 0);
        return dateB - dateA;
      });

      // Keep the first one (highest priority), delete the rest
      const toKeep = sorted[0];
      const toDelete = sorted.slice(1);

      toDelete.forEach(tx => {
        totalToDelete++;
        if (tx.reconcilie) {
          totalReconciled++;
        } else {
          totalUnreconciled++;
        }

        deletionLog.push({
          numero_sequence: numeroSequence,
          id: tx.id,
          date_execution: tx.date_execution?.toDate?.() || tx.date_execution,
          montant: tx.montant,
          contrepartie_nom: tx.contrepartie_nom,
          reconcilie: tx.reconcilie || false,
          created_at: tx.created_at?.toDate?.() || tx.created_at,
          kept_id: toKeep.id,
          kept_reconcilie: toKeep.reconcilie || false,
          kept_created_at: toKeep.created_at?.toDate?.() || toKeep.created_at
        });
      });
    });

    console.log('📋 RÉSUMÉ');
    console.log('=========');
    console.log(`Total de transactions à supprimer: ${totalToDelete}`);
    console.log(`  - Réconciliées: ${totalReconciled}`);
    console.log(`  - Non réconciliées: ${totalUnreconciled}`);
    console.log(`Transactions qui seront conservées: ${duplicateGroups.size}\n`);

    // Show sample of deletions (first 10)
    console.log('📄 EXEMPLES DE SUPPRESSIONS (10 premiers):');
    console.log('===========================================');
    deletionLog.slice(0, 10).forEach((log, idx) => {
      console.log(`\n${idx + 1}. N° ${log.numero_sequence}`);
      console.log(`   À SUPPRIMER: ${log.id.substring(0, 8)}... | ${log.contrepartie_nom} | ${log.montant}€ | Réconcilié: ${log.reconcilie ? 'OUI' : 'NON'}`);
      console.log(`   À GARDER:    ${log.kept_id.substring(0, 8)}... | Réconcilié: ${log.kept_reconcilie ? 'OUI' : 'NON'}`);
    });

    if (deletionLog.length > 10) {
      console.log(`\n   ... et ${deletionLog.length - 10} autres suppressions`);
    }

    // Save full deletion log to file
    const logFilePath = path.join(__dirname, 'deletion-log.json');
    fs.writeFileSync(logFilePath, JSON.stringify(deletionLog, null, 2));
    console.log(`\n💾 Log complet sauvegardé: ${logFilePath}`);

    // Execute deletions if not dry-run
    if (!DRY_RUN) {
      console.log('\n🗑️  SUPPRESSION EN COURS...');

      let deleted = 0;
      for (const log of deletionLog) {
        await transactionsRef.doc(log.id).delete();
        deleted++;

        if (deleted % 50 === 0) {
          console.log(`   ${deleted}/${totalToDelete} suppressions effectuées...`);
        }
      }

      console.log(`\n✅ ${deleted} transactions supprimées avec succès !`);
      console.log('🎉 Nettoyage terminé !');
    } else {
      console.log('\n⚠️  MODE SIMULATION: Aucune suppression effectuée');
      console.log('   Lancez avec --execute pour effectuer les suppressions réelles.');
    }

  } catch (error) {
    console.error('\n❌ ERREUR:', error);
    process.exit(1);
  }
}

// Run the script
cleanDuplicates()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
