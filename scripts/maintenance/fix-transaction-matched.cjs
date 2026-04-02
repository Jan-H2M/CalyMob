/**
 * fix-transaction-matched.cjs
 *
 * Eenmalige fix voor overgangsfase: zet transaction_matched=true
 * voor alle inscriptions waar paye=true maar transaction_matched ontbreekt of false is.
 *
 * Dit fixt de "En attente bancaire" status in CalyMob voor leden die al betaald hebben
 * via het oude systeem (CalyCompta/Calypso) maar waar de bank-reconciliatie niet
 * is doorgevoerd in het nieuwe systeem.
 *
 * Gebruik: node scripts/maintenance/fix-transaction-matched.cjs [--dry-run]
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../functions/service-account-calycompta.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');
const CLUB_ID = 'calypso';

async function fixTransactionMatched() {
  console.log(`\n=== Fix transaction_matched voor betaalde inschrijvingen ===`);
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (geen wijzigingen)' : '✏️  LIVE (wijzigingen worden doorgevoerd)'}\n`);

  let totalFixed = 0;
  let totalAlreadyOk = 0;
  let batch = db.batch();
  let batchCount = 0;

  async function commitBatchIfNeeded(force = false) {
    if (batchCount > 0 && (force || batchCount >= 450)) {
      if (!DRY_RUN) {
        await batch.commit();
        console.log(`  (batch van ${batchCount} gecommit)`);
      }
      batch = db.batch();
      batchCount = 0;
    }
  }

  // 1. Get all operations
  console.log('--- Stap 1: Alle operaties ophalen ---');
  const operationsSnap = await db.collection('clubs').doc(CLUB_ID)
    .collection('operations').get();
  console.log(`  Gevonden: ${operationsSnap.size} operaties\n`);

  // 2. Per operatie: check inscriptions subcollection
  console.log('--- Stap 2: Inscriptions per operatie checken ---');
  for (const opDoc of operationsSnap.docs) {
    const opData = opDoc.data();
    const opName = opData.nom || opData.title || opDoc.id;

    const inscSnap = await db.collection('clubs').doc(CLUB_ID)
      .collection('operations').doc(opDoc.id)
      .collection('inscriptions')
      .where('paye', '==', true)
      .get();

    if (inscSnap.empty) continue;

    let opFixed = 0;
    let opOk = 0;

    for (const doc of inscSnap.docs) {
      const data = doc.data();
      if (data.transaction_matched === true) {
        opOk++;
        continue;
      }

      opFixed++;
      console.log(`  [${opName}] FIX: ${data.prenom || ''} ${data.nom || ''} - transaction_matched=${data.transaction_matched ?? 'undefined'}`);

      if (!DRY_RUN) {
        batch.update(doc.ref, { transaction_matched: true });
        batchCount++;
        await commitBatchIfNeeded();
      }
    }

    if (opFixed > 0 || opOk > 0) {
      console.log(`  [${opName}] OK: ${opOk}, Te fixen: ${opFixed}`);
    }

    totalFixed += opFixed;
    totalAlreadyOk += opOk;
  }

  // 3. Check operation_participants collection
  console.log('\n--- Stap 3: operation_participants collection checken ---');
  const opParticipantsSnap = await db.collection('clubs').doc(CLUB_ID)
    .collection('operation_participants')
    .where('paye', '==', true)
    .get();

  let fixCount2 = 0;
  let alreadyOkCount2 = 0;

  for (const doc of opParticipantsSnap.docs) {
    const data = doc.data();
    if (data.transaction_matched === true) {
      alreadyOkCount2++;
      continue;
    }

    fixCount2++;
    console.log(`  FIX: ${data.prenom || ''} ${data.nom || ''} (op: ${data.operation_id || '?'}) - transaction_matched=${data.transaction_matched ?? 'undefined'}`);

    if (!DRY_RUN) {
      batch.update(doc.ref, { transaction_matched: true });
      batchCount++;
      await commitBatchIfNeeded();
    }
  }

  // Commit remaining
  await commitBatchIfNeeded(true);

  // Summary
  console.log('\n=== SAMENVATTING ===');
  console.log(`Inscriptions (per operatie):`);
  console.log(`  Al OK (transaction_matched=true): ${totalAlreadyOk}`);
  console.log(`  Gefixed: ${totalFixed}`);
  console.log(`Operation_participants (collection):`);
  console.log(`  Al OK (transaction_matched=true): ${alreadyOkCount2}`);
  console.log(`  Gefixed: ${fixCount2}`);
  console.log(`\nTotaal gefixed: ${totalFixed + fixCount2}`);

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN - geen wijzigingen doorgevoerd.');
    console.log('Voer uit zonder --dry-run om de fix toe te passen.');
  } else {
    console.log('\n✅ Alle wijzigingen doorgevoerd!');
  }
}

fixTransactionMatched()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('FOUT:', err);
    process.exit(1);
  });
