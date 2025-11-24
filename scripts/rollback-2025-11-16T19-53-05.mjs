
/**
 * Script de ROLLBACK - Généré automatiquement le 2025-11-16T19-53-05
 *
 * ATTENTION: Ce script restaure les transactions à leur état avant correction
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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
  console.log('🔄 ROLLBACK - Restauration des données...\n');

  const backup = JSON.parse(readFileSync('/Users/jan/Documents/GitHub/CalyCompta/scripts/backup-2025-11-16T19-53-05.json', 'utf8'));
  const log = JSON.parse(readFileSync('/Users/jan/Documents/GitHub/CalyCompta/scripts/fix-log-2025-11-16T19-53-05.json', 'utf8'));

  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const batch = db.batch();
  let count = 0;

  // Restaurer les transactions supprimées
  for (const deletion of log.deletions) {
    const originalData = backup.find(b => b.id === deletion.id);
    if (originalData) {
      batch.set(txRef.doc(deletion.id), originalData.data);
      count++;
      console.log(`Restauration: ${deletion.sequence}`);
    }
  }

  // Restaurer les transactions modifiées
  for (const update of log.updates) {
    const originalData = backup.find(b => b.id === update.id);
    if (originalData) {
      batch.set(txRef.doc(update.id), originalData.data);
      count++;
      console.log(`Restauration: ${update.sequence}`);
    }
  }

  await batch.commit();
  console.log(`\n✅ ${count} transactions restaurées`);
}

rollback()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erreur:', error);
    process.exit(1);
  });
