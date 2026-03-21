/**
 * Revert LIFRAS quantities back to OPENING stock (beginning of 2025)
 * The official Excel shows opening quantities in the main catalog section.
 * We incorrectly updated to closing quantities.
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const CLUB_ID = 'calypso';

// Revert to opening stock quantities
const openingQuantities = {
  'BCAR-020': { quantite: 1 },   // was changed to 3, revert to 1
  'BKIT-012': { quantite: 15 },  // was changed to 14, revert to 15
  'BKIT-102': { quantite: 0 },   // was changed to 1, revert to 0
  'BKIT-202': { quantite: 1 },   // was changed to 3, revert to 1
  'BKIT-212': { quantite: 3 },   // was changed to 10, revert to 3
  'BKIT-231': { quantite: 0 },   // was changed to 1, revert to 0
  'BKIT-310B': { quantite: 0, actif: false },  // was changed to 6/true, revert to 0/false
  'BKIT-350': { quantite: 0 },   // was changed to 1, revert to 0
};

async function revert() {
  const snapshot = await db.collection(`clubs/${CLUB_ID}/boutique_stock`)
    .where('type', '==', 'boutique_lifras')
    .get();

  const batch = db.batch();
  let updates = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const ref = data.reference;

    if (ref && openingQuantities[ref]) {
      const update = { ...openingQuantities[ref], updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      batch.update(doc.ref, update);
      console.log(`⏪ [${ref}] ${data.nom}: qty ${data.quantite} → ${openingQuantities[ref].quantite}`);
      updates++;
    }
  }

  if (updates > 0) {
    await batch.commit();
    console.log(`\nReverted ${updates} items to opening stock.`);
  }

  // Now fix the snapshot too — delete the one we just created and make a new one with opening data
  console.log('\n=== Fixing snapshot ===');

  // Find and delete our recent snapshot
  const snapshots = await db.collection(`clubs/${CLUB_ID}/boutique_snapshots`)
    .where('type', '==', 'boutique_lifras')
    .where('year', '==', 2025)
    .get();

  for (const snapDoc of snapshots.docs) {
    const snapData = snapDoc.data();
    console.log(`Deleting snapshot: ${snapDoc.id} (${snapData.nom}, ${snapData.total_items} items, €${snapData.total_value})`);

    // Delete items subcollection
    const items = await snapDoc.ref.collection('items').get();
    const delBatch = db.batch();
    items.forEach(item => delBatch.delete(item.ref));
    delBatch.delete(snapDoc.ref);
    await delBatch.commit();
  }

  // Re-read current (reverted) live data to create snapshot
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

  const totalQty = activeItems.reduce((sum, i) => sum + (i.quantite || 0), 0);
  const totalVal = activeItems.reduce((sum, i) => sum + ((i.quantite || 0) * (i.prix_achat || 0)), 0);

  console.log(`\nCreating new snapshot: ${activeItems.length} items, ${totalQty} pcs, €${totalVal.toFixed(2)}`);

  const newRef = db.collection(`clubs/${CLUB_ID}/boutique_snapshots`).doc();
  const newBatch = db.batch();

  newBatch.set(newRef, {
    id: newRef.id, year: 2025, type: 'boutique_lifras',
    nom: 'Boutique LIFRAS 2025', snapshot_date: admin.firestore.Timestamp.now(),
    total_items: activeItems.length, total_quantite: totalQty,
    total_value: Math.round(totalVal * 100) / 100, statut: 'en_cours',
    createdAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now(),
    createdBy: 'script-revert-opening'
  });

  for (const item of activeItems) {
    const itemRef = newRef.collection('items').doc(item.id);
    newBatch.set(itemRef, {
      id: item.id, snapshotId: newRef.id, itemId: item.id,
      nom: item.nom, type: item.type, reference: item.reference || null,
      quantite: item.quantite, prix_achat: item.prix_achat || 0,
      prix_vente: item.prix_vente || null,
      value: (item.quantite || 0) * (item.prix_achat || 0),
      createdAt: admin.firestore.Timestamp.now()
    });
    console.log(`  ✅ [${item.reference}] ${item.nom}: qty=${item.quantite}, val=€${((item.quantite||0) * (item.prix_achat||0)).toFixed(2)}`);
  }

  await newBatch.commit();
  console.log(`\nNew snapshot: ${newRef.id} — ${activeItems.length} items, ${totalQty} pcs, €${totalVal.toFixed(2)}`);

  process.exit(0);
}

revert().catch(err => { console.error(err); process.exit(1); });
