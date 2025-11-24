#!/usr/bin/env node

/**
 * Script eenmalig: Vind en fix transacties met meer dan 1 link in matched_entities
 * Gebruikt Firebase Client SDK (geen Admin SDK vereist)
 *
 * Gebruik:
 *   node scripts/find-multi-linked-transactions-client.mjs [--fix]
 *
 * Modes:
 *   - Zonder --fix: Rapporteert alleen (dry-run)
 *   - Met --fix:    Verwijdert dubbele links automatisch
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';

const CLUB_ID = 'calypso';
const FIX_MODE = process.argv.includes('--fix');

// Firebase config (production)
const firebaseConfig = {
  apiKey: "AIzaSyD-xQxbUwB0kR4wNM_yx6EjGHCcDsPYmfk",
  authDomain: "calycompta.firebaseapp.com",
  projectId: "calycompta",
  storageBucket: "calycompta.firebasestorage.app",
  messagingSenderId: "340296945359",
  appId: "1:340296945359:web:6d41bbbbaab22b0e70ce10",
  measurementId: "G-PXLZ6Z7FQ2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Detecteer dubbele links in matched_entities array
 */
function findDuplicateLinks(matchedEntities) {
  const seen = new Map();
  const duplicates = [];

  matchedEntities.forEach((entity, index) => {
    const key = `${entity.entity_type}:${entity.entity_id}`;

    if (seen.has(key)) {
      seen.get(key).push(index);
    } else {
      seen.set(key, [index]);
    }
  });

  seen.forEach((indices, key) => {
    if (indices.length > 1) {
      duplicates.push({
        key: key,
        indices: indices,
        count: indices.length
      });
    }
  });

  return duplicates;
}

/**
 * Verwijder dubbele links (behoud eerste occurrence)
 */
function removeDuplicateLinks(matchedEntities) {
  const seen = new Set();
  const cleaned = [];

  matchedEntities.forEach(entity => {
    const key = `${entity.entity_type}:${entity.entity_id}`;

    if (!seen.has(key)) {
      seen.add(key);
      cleaned.push(entity);
    }
  });

  return cleaned;
}

async function findMultiLinkedTransactions() {
  console.log('🔍 Zoeken naar transacties met meerdere links...');
  console.log(`   Mode: ${FIX_MODE ? '🔧 FIX MODE (schrijft naar database)' : '📋 DRY-RUN (alleen rapporteren)'}\n`);

  try {
    const transactionsRef = collection(db, 'clubs', CLUB_ID, 'bank_transactions');
    const snapshot = await getDocs(transactionsRef);

    if (snapshot.empty) {
      console.log('Geen transacties gevonden.');
      return;
    }

    const multiLinked = [];
    const withDuplicates = [];
    let totalTransactions = 0;
    let transactionsWithLinks = 0;
    let fixedCount = 0;

    snapshot.forEach(docSnap => {
      totalTransactions++;
      const data = docSnap.data();
      const matchedEntities = data.matched_entities || [];

      if (matchedEntities.length > 0) {
        transactionsWithLinks++;
      }

      if (matchedEntities.length > 1) {
        const duplicates = findDuplicateLinks(matchedEntities);
        const hasDuplicates = duplicates.length > 0;

        multiLinked.push({
          id: docSnap.id,
          docRef: docSnap.ref,
          numeroSequence: data.numero_sequence,
          montant: data.montant,
          dateExecution: data.date_execution?.toDate ? data.date_execution.toDate() : data.date_execution,
          contrepartieName: data.contrepartie_nom,
          communication: data.communication,
          matchedCount: matchedEntities.length,
          matchedEntities: matchedEntities,
          duplicates: duplicates,
          hasDuplicates: hasDuplicates
        });

        if (hasDuplicates) {
          withDuplicates.push(multiLinked[multiLinked.length - 1]);
        }
      }
    });

    // FIX MODE: Clean duplicates
    if (FIX_MODE && withDuplicates.length > 0) {
      console.log(`\n🔧 FIXING ${withDuplicates.length} transacties met duplicaten...\n`);

      for (const tx of withDuplicates) {
        const cleanedEntities = removeDuplicateLinks(tx.matchedEntities);
        const removedCount = tx.matchedEntities.length - cleanedEntities.length;

        console.log(`   ✓ ${tx.numeroSequence}: ${tx.matchedEntities.length} → ${cleanedEntities.length} links (${removedCount} verwijderd)`);

        await updateDoc(tx.docRef, {
          matched_entities: cleanedEntities
        });

        fixedCount++;
      }

      console.log(`\n✅ ${fixedCount} transacties gefixed!\n`);
    }

    // Statistieken
    console.log('📊 STATISTIEKEN:');
    console.log(`   Total transacties:               ${totalTransactions}`);
    console.log(`   Transacties met links:           ${transactionsWithLinks}`);
    console.log(`   Transacties met >1 link:         ${multiLinked.length}`);
    console.log(`   Transacties met duplicaten:      ${withDuplicates.length}`);
    if (FIX_MODE) {
      console.log(`   Gefixte transacties:             ${fixedCount}`);
    }
    console.log('');

    if (multiLinked.length === 0) {
      console.log('✅ Geen transacties met meerdere links gevonden.\n');
      return;
    }

    // Sort by hasDuplicates first, then by aantal links
    multiLinked.sort((a, b) => {
      if (a.hasDuplicates !== b.hasDuplicates) {
        return a.hasDuplicates ? -1 : 1;
      }
      return b.matchedCount - a.matchedCount;
    });

    // Print details
    console.log('🔗 TRANSACTIES MET MEERDERE LINKS:\n');
    console.log('='.repeat(120));

    multiLinked.forEach((tx, index) => {
      const duplicateFlag = tx.hasDuplicates ? ' ⚠️ DUPLICATEN' : '';

      console.log(`\n[${index + 1}] Transaction ID: ${tx.id}${duplicateFlag}`);
      console.log(`    Nummer:       ${tx.numeroSequence}`);
      console.log(`    Montant:      ${tx.montant}€`);
      console.log(`    Datum:        ${tx.dateExecution}`);
      console.log(`    Contrepartie: ${tx.contrepartieName || '(geen)'}`);
      console.log(`    Communicatie: ${tx.communication || '(geen)'}`);
      console.log(`    Aantal links: ${tx.matchedCount}`);

      if (tx.hasDuplicates) {
        console.log(`    ⚠️  DUPLICATEN GEVONDEN:`);
        tx.duplicates.forEach(dup => {
          console.log(`        - ${dup.key} verschijnt ${dup.count}x (indices: ${dup.indices.join(', ')})`);
        });
      }

      console.log(`    Link details:`);
      tx.matchedEntities.forEach((entity, idx) => {
        console.log(`       [${idx + 1}] Type: ${entity.entity_type.padEnd(12)} | ID: ${entity.entity_id} | Name: ${entity.entity_name || '(geen naam)'}`);
      });

      console.log('-'.repeat(120));
    });

    console.log('\n✅ Klaar!\n');

    // Export naar JSON bestand
    const outputPath = './multi-linked-transactions.json';

    const exportData = multiLinked.map(tx => {
      const { docRef, ...rest } = tx;
      return rest;
    });

    fs.writeFileSync(outputPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      mode: FIX_MODE ? 'fix' : 'dry-run',
      statistics: {
        totalTransactions,
        transactionsWithLinks,
        multiLinked: multiLinked.length,
        withDuplicates: withDuplicates.length,
        fixed: FIX_MODE ? fixedCount : 0
      },
      transactions: exportData
    }, null, 2));

    console.log(`💾 Resultaten ook opgeslagen in: ${outputPath}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run script
findMultiLinkedTransactions()
  .then(() => {
    console.log('Script voltooid.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
