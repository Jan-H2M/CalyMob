/**
 * Script de réconciliation complète CSV vs Firestore
 * Calcul exact de TOUS les écarts
 */

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
const CSV_PATH = '/Users/jan/Documents/CALYPSO/bank/CSV_2025-11-16-18.12.csv';
const OPENING_BALANCE = 16009.57;

async function completeReconciliation() {
  console.log('🔍 === RÉCONCILIATION COMPLÈTE ===\n');

  // 1. Charger CSV
  console.log('📄 Chargement du CSV...');
  const csvContent = readFileSync(CSV_PATH, 'utf-8');
  const lines = csvContent.split('\n');
  const headers = lines[0].split(';').map(h => h.trim().replace(/^\ufeff/, ''));

  const csvTransactions = new Map();
  let csvRevenus = 0;
  let csvDepenses = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = lines[i].split(';');
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() || '';
    });

    if (!record['Date d\'exécution']) continue;

    const sequence = record['Nº de séquence'];
    const montantStr = record['Montant'].replace(',', '.');
    const montant = parseFloat(montantStr);

    if (sequence && sequence !== '2025-' && sequence.startsWith('2025-')) {
      csvTransactions.set(sequence, {
        sequence,
        montant,
        date: record['Date d\'exécution'],
        contrepartie: record['Nom de la contrepartie'],
        communication: record['Communication']
      });

      if (montant > 0) csvRevenus += montant;
      else csvDepenses += Math.abs(montant);
    }
  }

  console.log(`✅ CSV: ${csvTransactions.size} transactions`);
  console.log(`   Revenus: ${csvRevenus.toFixed(2)} €`);
  console.log(`   Dépenses: ${csvDepenses.toFixed(2)} €`);
  console.log(`   Net: ${(csvRevenus - csvDepenses).toFixed(2)} €`);
  console.log(`   Solde final: ${(OPENING_BALANCE + csvRevenus - csvDepenses).toFixed(2)} €\n`);

  // 2. Charger Firestore
  console.log('🔥 Chargement de Firestore...');
  const txRef = db.collection('clubs').doc(CLUB_ID).collection('transactions_bancaires');
  const snapshot = await txRef
    .where('date_execution', '>=', Timestamp.fromDate(new Date('2025-01-01')))
    .where('date_execution', '<=', Timestamp.fromDate(new Date('2025-12-31')))
    .get();

  const normalizedCurrentAccount = 'BE26210016070629';

  // Séparer les transactions par type
  const parents = [];
  const validChildren = [];
  const orphanChildren = [];
  const normalTransactions = [];

  let fsRevenus = 0;
  let fsDepenses = 0;

  // Première passe: identifier les parents
  const validParentIds = new Set();
  snapshot.docs.forEach(doc => {
    if (doc.data().is_parent) {
      validParentIds.add(doc.id);
    }
  });

  // Deuxième passe: catégoriser toutes les transactions
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const compte = data.numero_compte?.replace(/\s/g, '') || '';

    if (compte !== normalizedCurrentAccount) return;

    const tx = {
      id: doc.id,
      sequence: data.numero_sequence,
      montant: data.montant,
      date: data.date_execution?.toDate?.()?.toLocaleDateString('fr-FR'),
      contrepartie: data.contrepartie_nom,
      is_parent: data.is_parent || false,
      parent_id: data.parent_transaction_id
    };

    if (data.is_parent) {
      parents.push(tx);
      // Parents sont EXCLUS du calcul
    } else if (data.parent_transaction_id) {
      if (validParentIds.has(data.parent_transaction_id)) {
        validChildren.push(tx);
        // Enfants valides sont INCLUS
        if (tx.montant > 0) fsRevenus += tx.montant;
        else fsDepenses += Math.abs(tx.montant);
      } else {
        orphanChildren.push(tx);
        // Orphelins sont INCLUS (mais ne devraient pas)
        if (tx.montant > 0) fsRevenus += tx.montant;
        else fsDepenses += Math.abs(tx.montant);
      }
    } else {
      normalTransactions.push(tx);
      // Normales sont INCLUSES
      if (tx.montant > 0) fsRevenus += tx.montant;
      else fsDepenses += Math.abs(tx.montant);
    }
  });

  console.log(`✅ Firestore: ${snapshot.size} transactions totales`);
  console.log(`   Parents (EXCLUS): ${parents.length}`);
  console.log(`   Enfants valides (INCLUS): ${validChildren.length}`);
  console.log(`   Enfants orphelins (INCLUS mais erreur): ${orphanChildren.length}`);
  console.log(`   Normales (INCLUS): ${normalTransactions.length}`);
  console.log(`   Revenus comptés: ${fsRevenus.toFixed(2)} €`);
  console.log(`   Dépenses comptées: ${fsDepenses.toFixed(2)} €`);
  console.log(`   Net: ${(fsRevenus - fsDepenses).toFixed(2)} €`);
  console.log(`   Solde final: ${(OPENING_BALANCE + fsRevenus - fsDepenses).toFixed(2)} €\n`);

  // 3. Analyse des écarts
  console.log('=== ANALYSE DES ÉCARTS ===\n');

  // Écart revenus/dépenses
  const ecartRevenus = fsRevenus - csvRevenus;
  const ecartDepenses = fsDepenses - csvDepenses;
  const ecartNet = (fsRevenus - fsDepenses) - (csvRevenus - csvDepenses);

  console.log(`Écart revenus: ${ecartRevenus > 0 ? '+' : ''}${ecartRevenus.toFixed(2)} €`);
  console.log(`Écart dépenses: ${ecartDepenses > 0 ? '+' : ''}${ecartDepenses.toFixed(2)} €`);
  console.log(`Écart net: ${ecartNet > 0 ? '+' : ''}${ecartNet.toFixed(2)} €\n`);

  // Identifier les problèmes
  console.log('=== PROBLÈMES IDENTIFIÉS ===\n');

  let totalImpact = 0;

  // Problème 1: Enfants orphelins
  let orphanImpact = 0;
  orphanChildren.forEach(tx => orphanImpact += tx.montant);
  console.log(`1. ENFANTS ORPHELINS: ${orphanChildren.length} transactions`);
  console.log(`   Impact: +${orphanImpact.toFixed(2)} € (comptés mais ne devraient pas)`);
  orphanChildren.forEach(tx => {
    console.log(`      ${tx.sequence}: ${tx.montant} €`);
  });
  totalImpact += orphanImpact;
  console.log('');

  // Problème 2: Parents dans CSV mais marqués is_parent dans Firestore
  const parentsInCsv = parents.filter(p => csvTransactions.has(p.sequence));
  let parentImpact = 0;
  parentsInCsv.forEach(p => parentImpact += p.montant);
  console.log(`2. PARENTS MAL CONFIGURÉS: ${parentsInCsv.length} transactions`);
  console.log(`   Impact: -${parentImpact.toFixed(2)} € (devraient être comptés)`);
  parentsInCsv.forEach(p => {
    console.log(`      ${p.sequence}: ${p.montant} € (is_parent=true mais dans CSV)`);
  });
  totalImpact -= parentImpact;
  console.log('');

  // Problème 3: Enfants valides dont le parent est dans CSV
  let validChildrenImpact = 0;
  validChildren.forEach(c => validChildrenImpact += c.montant);
  console.log(`3. ENFANTS VALIDES (mais parents dans CSV): ${validChildren.length} transactions`);
  console.log(`   Impact: +${validChildrenImpact.toFixed(2)} € (comptés mais ventilation n'existe pas dans CSV)`);
  validChildren.forEach(c => {
    console.log(`      ${c.sequence}: ${c.montant} €`);
  });
  totalImpact += validChildrenImpact;
  console.log('');

  // Problème 4: Transactions dans CSV mais pas dans Firestore
  const missingInFs = [];
  csvTransactions.forEach((csvTx, seq) => {
    const inNormal = normalTransactions.find(t => t.sequence === seq);
    const inParent = parents.find(t => t.sequence === seq);

    if (!inNormal && !inParent) {
      missingInFs.push(csvTx);
    }
  });

  let missingImpact = 0;
  missingInFs.forEach(tx => missingImpact += tx.montant);
  console.log(`4. TRANSACTIONS MANQUANTES: ${missingInFs.length} dans CSV mais pas dans Firestore`);
  console.log(`   Impact: -${missingImpact.toFixed(2)} € (manquantes)`);
  missingInFs.forEach(tx => {
    console.log(`      ${tx.sequence}: ${tx.montant} € | ${tx.contrepartie}`);
  });
  totalImpact -= missingImpact;
  console.log('');

  // Résumé final
  console.log('=== RÉSUMÉ FINAL ===\n');
  console.log(`Solde CSV (correct): ${(OPENING_BALANCE + csvRevenus - csvDepenses).toFixed(2)} €`);
  console.log(`Solde Firestore (actuel): ${(OPENING_BALANCE + fsRevenus - fsDepenses).toFixed(2)} €`);
  console.log(`Écart total: ${ecartNet > 0 ? '+' : ''}${ecartNet.toFixed(2)} €\n`);

  console.log('Impact des problèmes:');
  console.log(`  Enfants orphelins: +${orphanImpact.toFixed(2)} €`);
  console.log(`  Parents exclus: -${parentImpact.toFixed(2)} €`);
  console.log(`  Enfants valides: +${validChildrenImpact.toFixed(2)} €`);
  console.log(`  Transactions manquantes: -${missingImpact.toFixed(2)} €`);
  console.log(`  Total calculé: ${totalImpact > 0 ? '+' : ''}${totalImpact.toFixed(2)} €`);
  console.log(`  Différence résiduelle: ${(ecartNet - totalImpact).toFixed(2)} €\n`);

  // Actions recommandées
  console.log('=== ACTIONS RECOMMANDÉES ===\n');
  console.log(`1. Supprimer ${orphanChildren.length} enfants orphelins (-${orphanImpact.toFixed(2)} €)`);
  console.log(`2. Supprimer ${validChildren.length} enfants valides (-${validChildrenImpact.toFixed(2)} €)`);
  console.log(`3. Réinitialiser ${parentsInCsv.length} parents (is_parent=false) (+${parentImpact.toFixed(2)} €)`);
  console.log(`4. Réimporter ${missingInFs.length} transactions manquantes (+${missingImpact.toFixed(2)} €)`);
  console.log(`\nImpact net des corrections: ${(-orphanImpact - validChildrenImpact + parentImpact + missingImpact).toFixed(2)} €`);
  console.log(`Nouvel écart après corrections: ${(ecartNet - totalImpact).toFixed(2)} €`);
}

completeReconciliation()
  .then(() => {
    console.log('\n✅ Réconciliation terminée');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Erreur:', error);
    process.exit(1);
  });
