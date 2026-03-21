/**
 * Fix LIFRAS 2025 snapshot (clôture)
 * 1. Delete old snapshot (6 items, wrong data)
 * 2. Create new snapshot from current (updated) live data
 *
 * Run: cd CalyMob/functions && node fix_lifras_snapshot.cjs
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const CLUB_ID = 'calypso';
const OLD_SNAPSHOT_ID = 'TSFU7xlb0njVsWoKnYyK'; // LIFRAS 2025 with only 6 items

async function fixSnapshot() {
  // Step 1: Delete old snapshot and its items
  console.log('=== Step 1: Deleting old LIFRAS 2025 snapshot ===');
  const oldSnapshotRef = db.doc(`clubs/${CLUB_ID}/boutique_snapshots/${OLD_SNAPSHOT_ID}`);
  const oldSnapshot = await oldSnapshotRef.get();

  if (oldSnapshot.exists) {
    const oldData = oldSnapshot.data();
    console.log(`Old snapshot: ${oldData.nom} | ${oldData.total_items} items | ${oldData.total_quantite} qty | €${oldData.total_value}`);

    // Delete items subcollection
    const oldItems = await oldSnapshotRef.collection('items').get();
    console.log(`Deleting ${oldItems.size} items from old snapshot...`);

    const deleteBatch = db.batch();
    oldItems.forEach(doc => deleteBatch.delete(doc.ref));
    deleteBatch.delete(oldSnapshotRef);
    await deleteBatch.commit();
    console.log('Old snapshot deleted.\n');
  } else {
    console.log('Old snapshot not found (already deleted?).\n');
  }

  // Step 2: Get current live LIFRAS data
  console.log('=== Step 2: Reading current LIFRAS live data ===');
  const liveItems = await db.collection(`clubs/${CLUB_ID}/boutique_stock`)
    .where('type', '==', 'boutique_lifras')
    .get();

  const activeItems = [];
  liveItems.forEach(doc => {
    const d = doc.data();
    if (d.actif !== false && d.quantite > 0) {
      activeItems.push({ id: doc.id, ...d });
    }
  });

  console.log(`Active items with stock: ${activeItems.length}`);

  const totalQuantite = activeItems.reduce((sum, item) => sum + (item.quantite || 0), 0);
  const totalValue = activeItems.reduce((sum, item) => sum + ((item.quantite || 0) * (item.prix_achat || 0)), 0);

  console.log(`Total quantité: ${totalQuantite}`);
  console.log(`Total value: €${totalValue.toFixed(2)}\n`);

  // Step 3: Create new snapshot
  console.log('=== Step 3: Creating new LIFRAS 2025 snapshot ===');
  const newSnapshotRef = db.collection(`clubs/${CLUB_ID}/boutique_snapshots`).doc();

  const snapshotData = {
    id: newSnapshotRef.id,
    year: 2025,
    type: 'boutique_lifras',
    nom: 'Boutique LIFRAS 2025',
    snapshot_date: admin.firestore.Timestamp.now(),
    total_items: activeItems.length,
    total_quantite: totalQuantite,
    total_value: Math.round(totalValue * 100) / 100,
    statut: 'en_cours',
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    createdBy: 'script-fix-lifras-snapshot'
  };

  // Use batches (max 500 per batch)
  let batch = db.batch();
  let batchCount = 0;

  batch.set(newSnapshotRef, snapshotData);
  batchCount++;

  for (const item of activeItems) {
    if (batchCount >= 498) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }

    const itemRef = newSnapshotRef.collection('items').doc(item.id);
    const snapshotItem = {
      id: item.id,
      snapshotId: newSnapshotRef.id,
      itemId: item.id,
      nom: item.nom,
      type: item.type,
      reference: item.reference || null,
      quantite: item.quantite,
      prix_achat: item.prix_achat || 0,
      prix_vente: item.prix_vente || null,
      value: (item.quantite || 0) * (item.prix_achat || 0),
      createdAt: admin.firestore.Timestamp.now()
    };

    batch.set(itemRef, snapshotItem);
    batchCount++;

    console.log(`  ✅ [${item.reference || 'NO-REF'}] ${item.nom} | qty=${item.quantite} | €${snapshotItem.value.toFixed(2)}`);
  }

  await batch.commit();
  console.log(`\nNew snapshot created: ${newSnapshotRef.id}`);
  console.log(`  ${activeItems.length} items | ${totalQuantite} pièces | €${totalValue.toFixed(2)} stock value`);

  process.exit(0);
}

fixSnapshot().catch(err => { console.error(err); process.exit(1); });
