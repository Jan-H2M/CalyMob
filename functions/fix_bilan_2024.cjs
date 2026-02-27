// Fix 2024 bilan values: inject correct 04.01 Résultat reporté
// Values from "250112 Compta Calypso 2024 (PA).xlsx" BS 24 sheet
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const docRef = db.doc('clubs/calypso/fiscal_years/FY2024/data/bilan_values');
  const snap = await docRef.get();

  if (!snap.exists) {
    console.log('ERROR: No FY2024 bilan_values document');
    process.exit(1);
  }

  const values = snap.data().values || [];
  console.log('Current FY2024 entries:');
  values.forEach(v => console.log('  ' + v.bilanCodeId + ': O=' + v.openingValue + ' C=' + v.closingValue));

  // Fix 04.01 Résultat reporté (from BS 24 Excel)
  const idx0401 = values.findIndex(v => v.bilanCodeId === '04.01');
  const entry0401 = {
    bilanCodeId: '04.01',
    openingValue: 47802.28,
    closingValue: 43422.59,
    isManualOpening: true,
    isManualClosing: true,
    calculatedMovements: 0
  };

  if (idx0401 >= 0) {
    console.log('\nUpdating 04.01: was O=' + values[idx0401].openingValue + ' C=' + values[idx0401].closingValue);
    values[idx0401] = entry0401;
  } else {
    console.log('\nAdding new 04.01 entry');
    values.push(entry0401);
  }

  await docRef.set({ values, updatedAt: new Date().toISOString() });
  console.log('\n✓ FY2024 04.01 fixed: O=47802.28 C=43422.59');

  // Show FY2025 state
  const snap25 = await db.doc('clubs/calypso/fiscal_years/FY2025/data/bilan_values').get();
  if (snap25.exists) {
    const v = (snap25.data().values || []).find(x => x.bilanCodeId === '04.01');
    console.log('\nFY2025 04.01 current: O=' + (v ? v.openingValue : 'n/a') + ' C=' + (v ? v.closingValue : 'n/a'));
    console.log('→ Na Recalculer in de app wordt dit: O=43422.59 C=43422.59+04.03_2024');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
