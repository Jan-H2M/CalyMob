/**
 * Script pour analyser les transactions ventilées et vérifier la cohérence
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

async function analyzeVentilatedTransactions() {
  console.log('🔍 === ANALYSE DES TRANSACTIONS VENTILÉES ===\n');

  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const snapshot = await txRef
    .where('date_execution', '>=', Timestamp.fromDate(new Date('2025-01-01')))
    .where('date_execution', '<=', Timestamp.fromDate(new Date('2025-12-31')))
    .get();

  // Grouper les transactions par parent
  const parentMap = new Map();
  const childrenByParent = new Map();
  const allTransactions = new Map();

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    allTransactions.set(doc.id, { id: doc.id, ...data });

    if (data.is_parent) {
      parentMap.set(doc.id, {
        id: doc.id,
        sequence: data.numero_sequence,
        date: data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR'),
        montant: data.montant,
        child_count: data.child_count,
        contrepartie: data.contrepartie_nom,
        communication: data.communication
      });
    }

    if (data.parent_transaction_id) {
      if (!childrenByParent.has(data.parent_transaction_id)) {
        childrenByParent.set(data.parent_transaction_id, []);
      }
      childrenByParent.get(data.parent_transaction_id).push({
        id: doc.id,
        sequence: data.numero_sequence,
        montant: data.montant,
        categorie: data.categorie_depense_id || data.categorie_revenus_id,
        communication: data.communication
      });
    }
  });

  console.log(`Total transactions: ${snapshot.size}`);
  console.log(`Parents: ${parentMap.size}`);
  console.log(`Total children: ${Array.from(childrenByParent.values()).flat().length}\n`);

  // Analyser chaque parent et ses enfants
  console.log('=== DÉTAIL DES VENTILATIONS ===\n');

  let totalInconsistencies = 0;
  let totalDifference = 0;

  parentMap.forEach((parent, parentId) => {
    const children = childrenByParent.get(parentId) || [];

    console.log(`📋 Parent: ${parent.sequence}`);
    console.log(`   Date: ${parent.date}`);
    console.log(`   Montant parent: ${parent.montant} €`);
    console.log(`   Contrepartie: ${parent.contrepartie || 'N/A'}`);
    console.log(`   Communication: ${parent.communication || 'N/A'}`);
    console.log(`   Nombre d'enfants déclaré: ${parent.child_count}`);
    console.log(`   Nombre d'enfants trouvé: ${children.length}`);

    if (children.length > 0) {
      console.log(`   Enfants:`);
      let sumChildren = 0;
      children.forEach((child, i) => {
        console.log(`      ${i + 1}. ${child.sequence}: ${child.montant} € (Cat: ${child.categorie || 'N/A'})`);
        sumChildren += child.montant;
      });

      console.log(`   Somme des enfants: ${sumChildren.toFixed(2)} €`);

      const difference = Math.abs(parent.montant - sumChildren);
      if (difference > 0.01) {
        console.log(`   ⚠️  INCOHÉRENCE: Différence de ${difference.toFixed(2)} €`);
        totalInconsistencies++;
        totalDifference += difference;
      } else {
        console.log(`   ✅ Cohérent`);
      }
    } else {
      console.log(`   ⚠️  ATTENTION: Parent sans enfants!`);
      totalInconsistencies++;
    }

    if (parent.child_count !== children.length) {
      console.log(`   ⚠️  ATTENTION: child_count (${parent.child_count}) != nombre réel (${children.length})`);
    }

    console.log('');
  });

  // Vérifier s'il y a des enfants orphelins
  console.log('=== VÉRIFICATION DES ENFANTS ORPHELINS ===\n');

  let orphans = 0;
  allTransactions.forEach((tx) => {
    if (tx.parent_transaction_id && !parentMap.has(tx.parent_transaction_id)) {
      console.log(`⚠️  Enfant orphelin: ${tx.numero_sequence} (parent: ${tx.parent_transaction_id})`);
      console.log(`   Montant: ${tx.montant} €`);
      orphans++;
    }
  });

  if (orphans === 0) {
    console.log('✅ Aucun enfant orphelin trouvé\n');
  } else {
    console.log(`\n⚠️  Total enfants orphelins: ${orphans}\n`);
  }

  // Résumé
  console.log('=== RÉSUMÉ ===');
  console.log(`Groupes de ventilation: ${parentMap.size}`);
  console.log(`Incohérences détectées: ${totalInconsistencies}`);
  console.log(`Différence totale: ${totalDifference.toFixed(2)} €\n`);

  // Impact sur le calcul
  console.log('=== IMPACT SUR LE CALCUL DU SOLDE ===');

  let totalParentAmounts = 0;
  let totalChildAmounts = 0;

  parentMap.forEach((parent, parentId) => {
    totalParentAmounts += parent.montant;
    const children = childrenByParent.get(parentId) || [];
    children.forEach(child => {
      totalChildAmounts += child.montant;
    });
  });

  console.log(`Montant total des parents: ${totalParentAmounts.toFixed(2)} €`);
  console.log(`Montant total des enfants: ${totalChildAmounts.toFixed(2)} €`);
  console.log(`\nLes parents sont EXCLUS du calcul (is_parent=true)`);
  console.log(`Les enfants sont INCLUS dans le calcul`);
  console.log(`\nSi la somme des enfants != somme des parents, cela crée un écart de:`);
  console.log(`${(totalChildAmounts - totalParentAmounts).toFixed(2)} €`);
}

analyzeVentilatedTransactions()
  .then(() => {
    console.log('\n✅ Analyse terminée');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  });
