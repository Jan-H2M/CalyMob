/**
 * Update LIFRAS items to end-of-2025 closing quantities
 *
 * The official Excel "Boutk LIFRAS - fin 2025" has:
 * 1. Opening stock (27 catalog items) = beginning of 2025
 * 2. Transactions (43 sales during 2025)
 * 3. Closing inventory (9 items with changed quantities)
 *
 * Items in closing section have UPDATED quantities.
 * Items NOT in closing section keep their opening quantities.
 *
 * Run: cd CalyMob/functions && node update_lifras_closing.cjs
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const CLUB_ID = 'calypso';

// Closing inventory from official Excel (end of 2025)
// These items have CHANGED quantities compared to opening stock
const closingUpdates = {
  'BCAR-020': { quantite: 3 },   // was 1, bought 2
  // BCAR-021: stays 1 (unchanged, in closing but same qty)
  'BKIT-012': { quantite: 14 },  // was 15, sold 1
  'BKIT-102': { quantite: 1 },   // was 0, bought 1
  'BKIT-202': { quantite: 3 },   // was 1, bought 2
  'BKIT-212': { quantite: 10 },  // was 3, bought 7
  'BKIT-231': { quantite: 1 },   // was 0, bought 1
  'BKIT-310B': { quantite: 6, actif: true },  // was 0 (was actif=false!), bought 6
  'BKIT-350': { quantite: 1 },   // was 0, bought 1
};

async function updateClosing() {
  const snapshot = await db.collection(`clubs/${CLUB_ID}/boutique_stock`)
    .where('type', '==', 'boutique_lifras')
    .get();

  console.log(`Found ${snapshot.size} LIFRAS items in Firestore\n`);

  const batch = db.batch();
  let updates = 0;
  let unchanged = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const ref = data.reference;

    if (ref && closingUpdates[ref]) {
      const update = closingUpdates[ref];
      const changes = {};

      for (const [field, newValue] of Object.entries(update)) {
        if (data[field] !== newValue) {
          changes[field] = newValue;
        }
      }

      if (Object.keys(changes).length > 0) {
        changes.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        batch.update(doc.ref, changes);
        console.log(`✏️  [${ref}] ${data.nom}`);
        for (const [field, newValue] of Object.entries(changes)) {
          if (field !== 'updatedAt') {
            console.log(`   ${field}: ${data[field]} → ${newValue}`);
          }
        }
        updates++;
      } else {
        console.log(`✅ [${ref}] ${data.nom} — already correct`);
        unchanged++;
      }
    } else {
      // Not in closing updates → keep opening stock quantities
      console.log(`➡️  [${ref || 'NO-REF'}] ${data.nom} — unchanged (qty=${data.quantite})`);
      unchanged++;
    }
  }

  if (updates > 0) {
    console.log(`\nCommitting ${updates} updates...`);
    await batch.commit();
    console.log('Done!');
  } else {
    console.log('\nNo updates needed.');
  }

  console.log(`\nSummary: ${updates} updated, ${unchanged} unchanged`);

  // Calculate new totals
  const snapshot2 = await db.collection(`clubs/${CLUB_ID}/boutique_stock`)
    .where('type', '==', 'boutique_lifras')
    .get();

  let totalQty = 0;
  let totalValue = 0;
  let activeCount = 0;

  snapshot2.forEach(doc => {
    const d = doc.data();
    if (d.actif !== false && d.quantite > 0) {
      activeCount++;
      totalQty += d.quantite;
      totalValue += (d.quantite || 0) * (d.prix_achat || 0);
    }
  });

  console.log(`\nNew totals: ${activeCount} items with stock, ${totalQty} pièces, €${totalValue.toFixed(2)} stock value`);

  process.exit(0);
}

updateClosing().catch(err => { console.error(err); process.exit(1); });
