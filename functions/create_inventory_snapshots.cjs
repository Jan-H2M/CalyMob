/**
 * Script: Create inventory value snapshots for FY2024 and FY2025
 *
 * Since there are no historical snapshots and the matériel is "pour mémoire",
 * we create snapshots based on the current inventory data with amortization.
 */
const admin = require('firebase-admin');
const path = require('path');

// Init Firebase Admin
const sa = require(path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const CLUB_ID = 'calypso';

/**
 * Simple linear amortization calculation
 * Mirrors AmortizationService.getItemCurrentValue logic
 */
function calculateCurrentValue(item, itemType, referenceDate) {
  const purchaseValue = item.valeur_achat || 0;
  if (purchaseValue === 0) return 0;

  const dureAmort = itemType?.duree_amortissement || 0;
  if (dureAmort === 0) return purchaseValue; // No depreciation configured

  const residuelPct = itemType?.valeur_residuelle_pct || 0;
  const residuelValue = purchaseValue * (residuelPct / 100);
  const depreciableAmount = purchaseValue - residuelValue;

  // Get purchase date
  let purchaseDate;
  if (item.date_achat && item.date_achat._seconds) {
    purchaseDate = new Date(item.date_achat._seconds * 1000);
  } else if (item.date_achat) {
    purchaseDate = new Date(item.date_achat);
  } else {
    return purchaseValue; // No purchase date, no depreciation
  }

  // Calculate years since purchase
  const yearsSincePurchase = (referenceDate.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  if (yearsSincePurchase <= 0) return purchaseValue;
  if (yearsSincePurchase >= dureAmort) return residuelValue;

  // Linear depreciation
  const annualDepreciation = depreciableAmount / dureAmort;
  const totalDepreciation = annualDepreciation * yearsSincePurchase;

  return Math.round((purchaseValue - totalDepreciation) * 100) / 100;
}

async function createInventorySnapshot(year, statut, referenceDate) {
  console.log(`\n=== Creating inventory snapshot for ${year} (${statut}) ===`);
  console.log(`  Reference date: ${referenceDate.toISOString()}`);

  // Check if snapshot already exists
  const existingSnap = await db.collection(`clubs/${CLUB_ID}/inventory_value_snapshots`)
    .where('year', '==', year).get();
  if (!existingSnap.empty) {
    console.log(`  ⚠️ Snapshot for ${year} already exists! Skipping.`);
    return;
  }

  // Load inventory items
  const itemsSnap = await db.collection(`clubs/${CLUB_ID}/inventory_items`).get();
  console.log(`  Loaded ${itemsSnap.size} items`);

  // Load item types
  const typesSnap = await db.collection(`clubs/${CLUB_ID}/inventory_item_types`).get();
  const typesMap = {};
  typesSnap.forEach(d => { typesMap[d.id] = d.data(); });
  console.log(`  Loaded ${typesSnap.size} item types`);

  // Calculate values for each item
  let totalItems = 0;
  let totalPurchaseValue = 0;
  let totalCurrentValue = 0;
  let totalAccumulatedDepreciation = 0;
  const snapshotItems = [];

  itemsSnap.forEach(d => {
    const item = d.data();
    const itemType = typesMap[item.typeId];

    const purchaseValue = item.valeur_achat || 0;
    const currentValue = calculateCurrentValue(item, itemType, referenceDate);
    const accDepreciation = Math.round((purchaseValue - currentValue) * 100) / 100;

    totalItems++;
    totalPurchaseValue += purchaseValue;
    totalCurrentValue += currentValue;
    totalAccumulatedDepreciation += accDepreciation;

    snapshotItems.push({
      id: d.id,
      itemId: d.id,
      code: item.code || item.numero_serie || d.id,
      nom: item.nom || `${itemType?.nom || 'Item'} ${item.numero_serie || ''}`,
      typeId: item.typeId,
      typeName: itemType?.nom || 'Type inconnu',
      valeur_achat: purchaseValue,
      accumulated_depreciation: accDepreciation,
      current_value: currentValue,
      etat: item.etat || null,
      statut: item.statut || null,
      createdAt: admin.firestore.Timestamp.now()
    });
  });

  // Round totals
  totalPurchaseValue = Math.round(totalPurchaseValue * 100) / 100;
  totalCurrentValue = Math.round(totalCurrentValue * 100) / 100;
  totalAccumulatedDepreciation = Math.round(totalAccumulatedDepreciation * 100) / 100;

  console.log(`  Total items: ${totalItems}`);
  console.log(`  Total purchase value: €${totalPurchaseValue.toFixed(2)}`);
  console.log(`  Total current value: €${totalCurrentValue.toFixed(2)}`);
  console.log(`  Total depreciation: €${totalAccumulatedDepreciation.toFixed(2)}`);

  // Create snapshot document
  const snapshotRef = db.collection(`clubs/${CLUB_ID}/inventory_value_snapshots`).doc();
  const snapshotData = {
    id: snapshotRef.id,
    year,
    nom: `Clôture matériel ${year}`,
    snapshot_date: admin.firestore.Timestamp.fromDate(referenceDate),
    total_items: totalItems,
    total_purchase_value: totalPurchaseValue,
    total_current_value: totalCurrentValue,
    total_accumulated_depreciation: totalAccumulatedDepreciation,
    statut,
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    createdBy: 'system-script'
  };

  if (statut === 'verrouille') {
    snapshotData.date_verrouillage = admin.firestore.Timestamp.now();
  }

  await snapshotRef.set(snapshotData);
  console.log(`  ✅ Snapshot document created: ${snapshotRef.id}`);

  // Create snapshot items in batches
  const batchSize = 500;
  for (let i = 0; i < snapshotItems.length; i += batchSize) {
    const batch = db.batch();
    const batchItems = snapshotItems.slice(i, i + batchSize);
    for (const item of batchItems) {
      const itemRef = db.doc(`clubs/${CLUB_ID}/inventory_value_snapshots/${snapshotRef.id}/items/${item.id}`);
      batch.set(itemRef, item);
    }
    await batch.commit();
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${batchItems.length} items written`);
  }

  console.log(`  ✅ All ${snapshotItems.length} items written`);

  // Also update bilan_values for this year
  const fyId = `FY${year}`;
  const bilanRef = db.doc(`clubs/${CLUB_ID}/fiscal_years/${fyId}/data/bilan_values`);
  const bilanSnap = await bilanRef.get();
  if (bilanSnap.exists) {
    const values = bilanSnap.data().values || [];
    const idx = values.findIndex(v => v.bilanCodeId === '01.01');
    if (idx >= 0) {
      values[idx].closingValue = totalCurrentValue;
      values[idx].isManualClosing = false;
      if (values[idx].closingStatus) {
        values[idx].closingStatus = {
          hasSnapshot: true,
          isLocked: statut === 'verrouille',
          source: statut === 'verrouille' ? 'snapshot_locked' : 'snapshot_provisional'
        };
      }
      await bilanRef.update({ values, updatedAt: new Date().toISOString() });
      console.log(`  ✅ Updated ${fyId} bilan_values 01.01 closing = €${totalCurrentValue.toFixed(2)}`);
    }
  }

  return totalCurrentValue;
}

async function main() {
  console.log('Creating inventory value snapshots...\n');

  // FY2024: reference date = 31 dec 2024 (verrouillé)
  const fy2024Value = await createInventorySnapshot(
    2024,
    'verrouille',
    new Date('2024-12-31T23:59:59Z')
  );

  // FY2025: reference date = 31 dec 2025 (en_cours)
  const fy2025Value = await createInventorySnapshot(
    2025,
    'en_cours',
    new Date('2025-12-31T23:59:59Z')
  );

  // Update FY2025 opening value for 01.01 based on FY2024 closing
  if (fy2024Value !== undefined) {
    const bilanRef = db.doc(`clubs/${CLUB_ID}/fiscal_years/FY2025/data/bilan_values`);
    const bilanSnap = await bilanRef.get();
    if (bilanSnap.exists) {
      const values = bilanSnap.data().values || [];
      const idx = values.findIndex(v => v.bilanCodeId === '01.01');
      if (idx >= 0) {
        values[idx].openingValue = fy2024Value;
        await bilanRef.update({ values, updatedAt: new Date().toISOString() });
        console.log(`\n✅ Updated FY2025 bilan_values 01.01 opening = €${fy2024Value.toFixed(2)} (from FY2024 closing)`);
      }
    }
  }

  console.log('\n🎉 Done!');
  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
