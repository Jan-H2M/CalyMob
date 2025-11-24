/**
 * Script pour corriger les transactions enfants orphelines
 *
 * Deux options:
 * 1. Supprimer les enfants orphelins
 * 2. Convertir les enfants orphelins en transactions normales (retirer parent_transaction_id)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialiser Firebase
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../serviceAccountKey.json'), 'utf8')
);
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const CLUB_ID = 'calypso';

// CONFIGURATION: Choisir l'action
const DRY_RUN = true;  // Mettre à false pour exécuter réellement
const ACTION = 'DELETE';  // 'DELETE' ou 'CONVERT'

async function fixOrphanChildren() {
  console.log('🔧 === CORRECTION DES ENFANTS ORPHELINS ===\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (simulation)' : 'EXECUTION RÉELLE'}`);
  console.log(`Action: ${ACTION === 'DELETE' ? 'Suppression' : 'Conversion en transactions normales'}\n`);

  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const snapshot = await txRef
    .where('date_execution', '>=', Timestamp.fromDate(new Date('2025-01-01')))
    .where('date_execution', '<=', Timestamp.fromDate(new Date('2025-12-31')))
    .get();

  // Collecter tous les parents valides
  const validParents = new Set();
  snapshot.docs.forEach(doc => {
    if (doc.data().is_parent) {
      validParents.add(doc.id);
    }
  });

  console.log(`Parents valides trouvés: ${validParents.size}\n`);

  // Trouver les enfants orphelins
  const orphans = [];
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.parent_transaction_id && !validParents.has(data.parent_transaction_id)) {
      orphans.push({
        id: doc.id,
        sequence: data.numero_sequence,
        parent_id: data.parent_transaction_id,
        date: data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR'),
        montant: data.montant,
        contrepartie: data.contrepartie_nom,
        communication: data.communication
      });
    }
  });

  if (orphans.length === 0) {
    console.log('✅ Aucun enfant orphelin trouvé\n');
    return;
  }

  console.log(`⚠️  ${orphans.length} enfants orphelins trouvés:\n`);

  let totalAmount = 0;
  orphans.forEach((orphan, i) => {
    console.log(`${i + 1}. ${orphan.sequence}`);
    console.log(`   Date: ${orphan.date} | Montant: ${orphan.montant} €`);
    console.log(`   Contrepartie: ${orphan.contrepartie || 'N/A'}`);
    console.log(`   Parent manquant: ${orphan.parent_id}`);
    console.log(`   ID: ${orphan.id}`);
    console.log('');
    totalAmount += orphan.montant;
  });

  console.log(`Montant total des orphelins: ${totalAmount.toFixed(2)} €\n`);

  // Exécuter l'action
  if (!DRY_RUN) {
    console.log(`🚀 Exécution de l'action: ${ACTION}...\n`);

    const batch = db.batch();
    let count = 0;

    for (const orphan of orphans) {
      const docRef = txRef.doc(orphan.id);

      if (ACTION === 'DELETE') {
        batch.delete(docRef);
        console.log(`   Suppression: ${orphan.sequence}`);
      } else if (ACTION === 'CONVERT') {
        batch.update(docRef, {
          parent_transaction_id: null,
          updated_at: new Date()
        });
        console.log(`   Conversion: ${orphan.sequence}`);
      }

      count++;

      // Firestore batch limit is 500
      if (count % 500 === 0) {
        await batch.commit();
        console.log(`   Batch de ${count} transactions validé`);
      }
    }

    if (count % 500 !== 0) {
      await batch.commit();
      console.log(`   Batch final de ${count} transactions validé`);
    }

    console.log(`\n✅ ${count} transactions traitées\n`);
  } else {
    console.log('ℹ️  Mode DRY RUN - Aucune modification effectuée\n');
    console.log('Pour exécuter réellement:');
    console.log('1. Ouvrez ce script');
    console.log('2. Changez DRY_RUN = false');
    console.log('3. Choisissez ACTION = "DELETE" ou "CONVERT"');
    console.log('4. Relancez le script\n');
  }

  // Impact sur le solde
  console.log('=== IMPACT SUR LE SOLDE ===');
  if (ACTION === 'DELETE') {
    console.log(`Suppression de ${totalAmount.toFixed(2)} € du solde`);
  } else {
    console.log(`Aucun impact (les transactions restent mais deviennent normales)`);
  }

  console.log(`\nSolde actuel: 6464.98 €`);
  console.log(`Solde attendu: 4741.26 €`);
  console.log(`Écart actuel: 1723.72 €`);
  if (ACTION === 'DELETE') {
    console.log(`Nouvel écart après suppression: ${(1723.72 - totalAmount).toFixed(2)} €`);
  }
}

fixOrphanChildren()
  .then(() => {
    console.log('\n✅ Script terminé');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  });
