/**
 * Correction des dates des transactions 2025-00001 et 2025-00002
 *
 * Problème: Dates stockées à 2024-12-31 23:00 UTC au lieu de 2025-01-01 00:00 UTC
 * Solution: Ajouter 1 heure pour corriger le timezone
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../serviceAccountKey.json'), 'utf8')
);
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const CLUB_ID = 'calypso';

// CONFIGURATION
const DRY_RUN = false;  // Mettre à false pour exécuter réellement

async function fixTransactionDates() {
  console.log('🔧 === CORRECTION DES DATES ===\n');
  console.log(`Mode: ${DRY_RUN ? '⚠️  DRY RUN (simulation)' : '🚀 EXECUTION RÉELLE'}\n`);

  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const backupFile = join(__dirname, `backup-dates-${timestamp}.json`);

  const backup = [];
  const updates = [];

  try {
    const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');

    // Chercher les 2 transactions
    const q1 = await txRef.where('numero_sequence', '==', '2025-00001').get();
    const q2 = await txRef.where('numero_sequence', '==', '2025-00002').get();

    const transactions = [...q1.docs, ...q2.docs];

    console.log('Transactions trouvées:', transactions.length);
    console.log('');

    for (const doc of transactions) {
      const data = doc.data();
      const oldDate = data.date_execution.toDate();

      backup.push({
        id: doc.id,
        numero_sequence: data.numero_sequence,
        old_date: oldDate.toISOString(),
        data: { ...data }
      });

      // Nouvelle date: 2025-01-01 00:00:00 UTC
      const newDate = new Date('2025-01-01T00:00:00.000Z');

      console.log(`Transaction: ${data.numero_sequence}`);
      console.log(`  Montant: ${data.montant} €`);
      console.log(`  Date actuelle: ${oldDate.toISOString()}`);
      console.log(`  Nouvelle date: ${newDate.toISOString()}`);
      console.log('');

      updates.push({
        id: doc.id,
        numero_sequence: data.numero_sequence,
        montant: data.montant,
        old_date: oldDate.toISOString(),
        new_date: newDate.toISOString(),
        newTimestamp: Timestamp.fromDate(newDate)
      });
    }

    // Sauvegarder le backup
    console.log(`💾 Sauvegarde dans ${backupFile}...`);
    writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    console.log('');

    if (!DRY_RUN) {
      console.log('🚀 EXÉCUTION DES MODIFICATIONS...\n');

      const batch = db.batch();

      for (const update of updates) {
        const docRef = txRef.doc(update.id);
        batch.update(docRef, {
          date_execution: update.newTimestamp,
          updated_at: new Date(),
          fix_applied_at: new Date(),
          fix_reason: 'Correction timezone - date décalée de 1h'
        });
        console.log(`✓ ${update.numero_sequence}: ${update.old_date} → ${update.new_date}`);
      }

      await batch.commit();
      console.log(`\n✅ ${updates.length} dates corrigées`);

      // Créer le rollback
      const rollbackScript = `
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../serviceAccountKey.json'), 'utf8')
);
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const CLUB_ID = 'calypso';

async function rollback() {
  console.log('🔄 ROLLBACK - Restauration des dates...\\n');

  const backup = JSON.parse(readFileSync('${backupFile}', 'utf8'));
  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const batch = db.batch();

  for (const item of backup) {
    const docRef = txRef.doc(item.id);
    batch.update(docRef, {
      date_execution: Timestamp.fromDate(new Date(item.old_date))
    });
    console.log(\`Restauration: \${item.numero_sequence} → \${item.old_date}\`);
  }

  await batch.commit();
  console.log(\`\\n✅ \${backup.length} dates restaurées\`);
}

rollback()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erreur:', error);
    process.exit(1);
  });
`;

      const rollbackFile = join(__dirname, `rollback-dates-${timestamp}.mjs`);
      writeFileSync(rollbackFile, rollbackScript);
      console.log(`\n🔄 Script de rollback créé: ${rollbackFile}`);

    } else {
      console.log('ℹ️  MODE DRY RUN - Aucune modification effectuée\n');
      console.log('Pour exécuter réellement:');
      console.log('1. Vérifiez le backup: ' + backupFile);
      console.log('2. Ouvrez ce script');
      console.log('3. Changez DRY_RUN = false');
      console.log('4. Relancez le script\n');
    }

    console.log('=== RÉSUMÉ ===\n');
    console.log(`Transactions à corriger: ${updates.length}`);
    console.log(`Backup sauvegardé: ${backupFile}`);
    console.log('');

  } catch (error) {
    console.error('❌ ERREUR:', error);
    throw error;
  }
}

fixTransactionDates()
  .then(() => {
    console.log('✅ Script terminé avec succès');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erreur fatale:', error);
    process.exit(1);
  });
