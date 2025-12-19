
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
  console.log('🔄 ROLLBACK - Restauration des dates...\n');

  const backup = JSON.parse(readFileSync('/Users/jan/Documents/GitHub/CalyCompta/scripts/backup-dates-2025-11-16T20-06-01.json', 'utf8'));
  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const batch = db.batch();

  for (const item of backup) {
    const docRef = txRef.doc(item.id);
    batch.update(docRef, {
      date_execution: Timestamp.fromDate(new Date(item.old_date))
    });
    console.log(`Restauration: ${item.numero_sequence} → ${item.old_date}`);
  }

  await batch.commit();
  console.log(`\n✅ ${backup.length} dates restaurées`);
}

rollback()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Erreur:', error);
    process.exit(1);
  });
