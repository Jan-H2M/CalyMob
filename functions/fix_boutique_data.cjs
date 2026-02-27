// Fix Boutique data: replace test articles, create snapshots, update FY2024 bilan_values
// Run from: CalyMob/functions/  →  node fix_boutique_data.cjs
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', '..', 'CalyCompta', 'calycompta-firebase-adminsdk-fbsvc-8ac87e8247.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CLUB_ID = 'calypso';

// ============================================================
// STAP 1: Echte Boutique Club artikelen (31/12/2025 inventaris)
// Bron: official_reference.xlsx → "Boutk - fin 2025"
// ============================================================
const BOUTIQUE_CLUB_ARTICLES = [
  { nom: 'Carnet Plongée - Calypso', reference: 'CARN-001', quantite: 0, prix_achat: 5.00, prix_vente: 5.00 },
  { nom: 'Carnet Plongée - Lifras', reference: 'CARN-002', quantite: 41, prix_achat: 5.00, prix_vente: 5.00 },
  { nom: 'Carnet Apnée Lifras', reference: 'CARN-003', quantite: 1, prix_achat: 5.00, prix_vente: 5.00 },
  { nom: 'Feuille "Attestation médicale"', reference: 'FEUI-001', quantite: 72, prix_achat: 0.00 },
  { nom: 'Feuille "Inscriptions Club"', reference: 'FEUI-002', quantite: 4, prix_achat: 1.00, prix_vente: 1.00 },
  { nom: 'Triptype Premiers Secours', reference: 'TRIP-001', quantite: 3, prix_achat: 2.00, prix_vente: 2.00 },
  { nom: 'Plongée découverte', reference: 'PLON-001', quantite: 2, prix_achat: 0.00 },
  { nom: 'Livre "La vie en eau douce"', reference: 'LIVR-001', quantite: 5, prix_achat: 25.00, prix_vente: 25.00 },
  { nom: 'Fiche "Faune & Flore d\'eau douce"', reference: 'FICH-001', quantite: 2, prix_achat: 2.00, prix_vente: 2.00 },
  { nom: 'Spreadshop', reference: 'SPRE-001', quantite: 1, prix_achat: 208.41, prix_vente: 208.41 },
  { nom: 'Casquettes Calypso Diving Club', reference: 'CASQ-001', quantite: 18, prix_achat: 6.53, prix_vente: 10.00 },
  { nom: 'Casquettes Calypso', reference: 'CASQ-002', quantite: 29, prix_achat: 0.00 },
  { nom: 'Porte-clefs USB', reference: 'CLEF-001', quantite: 2, prix_achat: 5.00, prix_vente: 5.00 },
];

// ============================================================
// Waarden uit officieel Bilan
// ============================================================
const BILAN_VALUES = {
  // FY2024: closing waarden (worden FY2025 opening)
  FY2024: {
    '02.01.01': { closingValue: 467.00 },     // Boutique Club
    '02.01.02': { closingValue: 1958.80 },     // Boutique LIFRAS
  },
  // FY2025: closing waarden (huidige stock)
  FY2025: {
    '02.01.01': { closingValue: 685.01 },      // Boutique Club
    '02.01.02': { closingValue: 1716.00 },     // Boutique LIFRAS
  }
};

async function main() {
  console.log('=== Fix Boutique Data ===\n');

  // ──────────────────────────────────────────
  // STAP 1: Verwijder test Boutique Club items
  // ──────────────────────────────────────────
  console.log('STAP 1: Verwijder test Boutique Club artikelen...');
  const stockRef = db.collection(`clubs/${CLUB_ID}/boutique_stock`);
  const testItems = await stockRef.where('type', '==', 'boutique').get();

  if (testItems.empty) {
    console.log('  Geen Boutique Club items gevonden.');
  } else {
    const batch1 = db.batch();
    testItems.forEach(doc => {
      console.log(`  Verwijder: ${doc.data().nom} (${doc.id})`);
      batch1.delete(doc.ref);
    });
    await batch1.commit();
    console.log(`  ✓ ${testItems.size} test items verwijderd.\n`);
  }

  // ──────────────────────────────────────────
  // STAP 2: Voeg echte Boutique Club items toe
  // ──────────────────────────────────────────
  console.log('STAP 2: Voeg echte Boutique Club artikelen toe...');
  const batch2 = db.batch();
  const now = admin.firestore.Timestamp.now();

  for (const article of BOUTIQUE_CLUB_ARTICLES) {
    const docRef = stockRef.doc();
    const data = {
      type: 'boutique',
      nom: article.nom,
      description: null,
      quantite: article.quantite,
      prix_achat: article.prix_achat,
      prix_vente: article.prix_vente || null,
      date_achat: admin.firestore.Timestamp.fromDate(new Date('2024-01-01')),
      fournisseur: null,
      reference: article.reference,
      photo_url: null,
      actif: article.quantite > 0,
      createdAt: now,
      updatedAt: now,
      createdBy: 'fix_boutique_data_script'
    };
    batch2.set(docRef, data);
    const val = article.quantite * article.prix_achat;
    console.log(`  + ${article.nom}: ${article.quantite} × €${article.prix_achat} = €${val.toFixed(2)}`);
  }
  await batch2.commit();

  const totalValue = BOUTIQUE_CLUB_ARTICLES.reduce((sum, a) => sum + (a.quantite * a.prix_achat), 0);
  console.log(`  ✓ ${BOUTIQUE_CLUB_ARTICLES.length} artikelen toegevoegd. Totaal: €${totalValue.toFixed(2)}\n`);

  // ──────────────────────────────────────────
  // STAP 3: Update FY2024 bilan_values
  // ──────────────────────────────────────────
  console.log('STAP 3: Update FY2024 bilan_values...');
  const fy2024Ref = db.doc(`clubs/${CLUB_ID}/fiscal_years/FY2024/data/bilan_values`);
  const fy2024Snap = await fy2024Ref.get();

  if (!fy2024Snap.exists) {
    console.log('  ERROR: FY2024 bilan_values niet gevonden!');
  } else {
    const values = fy2024Snap.data().values || [];

    for (const [codeId, target] of Object.entries(BILAN_VALUES.FY2024)) {
      const idx = values.findIndex(v => v.bilanCodeId === codeId);
      if (idx >= 0) {
        console.log(`  ${codeId}: was closing=${values[idx].closingValue} → wordt ${target.closingValue}`);
        values[idx].closingValue = target.closingValue;
        values[idx].isManualClosing = true;
      } else {
        console.log(`  ${codeId}: nieuw entry met closing=${target.closingValue}`);
        values.push({
          bilanCodeId: codeId,
          openingValue: 0,
          closingValue: target.closingValue,
          isManualOpening: true,
          isManualClosing: true,
          calculatedMovements: 0
        });
      }
    }

    // Update ook 02.01 (Stock CDC = som van 02.01.01 + 02.01.02)
    const stock0201 = values.findIndex(v => v.bilanCodeId === '02.01');
    const closingStockCDC = 467.00 + 1958.80; // = 2425.80
    if (stock0201 >= 0) {
      console.log(`  02.01: was closing=${values[stock0201].closingValue} → wordt ${closingStockCDC}`);
      values[stock0201].closingValue = closingStockCDC;
    }

    await fy2024Ref.update({ values });
    console.log('  ✓ FY2024 bilan_values bijgewerkt.\n');
  }

  // ──────────────────────────────────────────
  // STAP 4: Maak FY2024 boutique snapshots aan
  // ──────────────────────────────────────────
  console.log('STAP 4: Maak FY2024 boutique snapshots aan...');
  const snapshotsRef = db.collection(`clubs/${CLUB_ID}/boutique_snapshots`);

  // Check of er al FY2024 snapshots bestaan
  const existing2024 = await snapshotsRef.where('year', '==', 2024).get();
  if (!existing2024.empty) {
    console.log(`  ⚠️ Er bestaan al ${existing2024.size} FY2024 snapshots:`);
    existing2024.forEach(d => console.log(`    - ${d.data().nom}: €${d.data().total_value}`));
  }

  // FY2024 Boutique Club snapshot
  const snap2024Club = {
    year: 2024,
    type: 'boutique',
    nom: 'Boutique Club 2024',
    snapshot_date: admin.firestore.Timestamp.fromDate(new Date('2025-01-08')),
    total_items: 13,
    total_quantite: 0, // We kennen de FY2024 hoeveelheden niet exact
    total_value: 467.00,
    statut: 'verrouille',
    date_verrouillage: admin.firestore.Timestamp.fromDate(new Date('2025-01-15')),
    createdAt: now,
    updatedAt: now,
    createdBy: 'fix_boutique_data_script'
  };
  await snapshotsRef.add(snap2024Club);
  console.log(`  ✓ Boutique Club 2024: €${snap2024Club.total_value} (verrouillé)`);

  // FY2024 Boutique LIFRAS snapshot
  const snap2024Lifras = {
    year: 2024,
    type: 'boutique_lifras',
    nom: 'Boutique LIFRAS 2024',
    snapshot_date: admin.firestore.Timestamp.fromDate(new Date('2025-01-08')),
    total_items: 6,
    total_quantite: 0,
    total_value: 1958.80,
    statut: 'verrouille',
    date_verrouillage: admin.firestore.Timestamp.fromDate(new Date('2025-01-15')),
    createdAt: now,
    updatedAt: now,
    createdBy: 'fix_boutique_data_script'
  };
  await snapshotsRef.add(snap2024Lifras);
  console.log(`  ✓ Boutique LIFRAS 2024: €${snap2024Lifras.total_value} (verrouillé)\n`);

  // ──────────────────────────────────────────
  // STAP 5: Maak/update FY2025 Boutique Club snapshot
  // ──────────────────────────────────────────
  console.log('STAP 5: Maak FY2025 Boutique Club snapshot aan...');
  const existing2025Club = await snapshotsRef
    .where('year', '==', 2025)
    .where('type', '==', 'boutique')
    .get();

  if (!existing2025Club.empty) {
    // Update bestaande
    const docId = existing2025Club.docs[0].id;
    await snapshotsRef.doc(docId).update({
      total_value: 685.01,
      total_items: 13,
      total_quantite: BOUTIQUE_CLUB_ARTICLES.reduce((sum, a) => sum + a.quantite, 0),
      updatedAt: now
    });
    console.log(`  ✓ Bestaande snapshot bijgewerkt: €685.01`);
  } else {
    const snap2025Club = {
      year: 2025,
      type: 'boutique',
      nom: 'Boutique Club 2025',
      snapshot_date: admin.firestore.Timestamp.fromDate(new Date('2026-01-08')),
      total_items: 13,
      total_quantite: BOUTIQUE_CLUB_ARTICLES.reduce((sum, a) => sum + a.quantite, 0),
      total_value: 685.01,
      statut: 'en_cours',
      createdAt: now,
      updatedAt: now,
      createdBy: 'fix_boutique_data_script'
    };
    await snapshotsRef.add(snap2025Club);
    console.log(`  ✓ Nieuwe snapshot: €685.01 (en cours)`);
  }

  // ──────────────────────────────────────────
  // STAP 6: Verifieer FY2025 LIFRAS snapshot
  // ──────────────────────────────────────────
  console.log('\nSTAP 6: Verifieer FY2025 LIFRAS snapshot...');
  const existing2025Lifras = await snapshotsRef
    .where('year', '==', 2025)
    .where('type', '==', 'boutique_lifras')
    .get();

  if (existing2025Lifras.empty) {
    console.log('  ⚠️ Geen FY2025 LIFRAS snapshot gevonden!');
  } else {
    const data = existing2025Lifras.docs[0].data();
    console.log(`  ✓ ${data.nom}: €${data.total_value} (${data.statut})`);
  }

  // ──────────────────────────────────────────
  // SAMENVATTING
  // ──────────────────────────────────────────
  console.log('\n=== SAMENVATTING ===');
  console.log('FY2024 closing → FY2025 opening:');
  console.log(`  02.01.01 Boutique:       €467.00`);
  console.log(`  02.01.02 Boutique LIFRAS: €1958.80`);
  console.log(`  02.01   Stock CDC:       €2425.80`);
  console.log('\nFY2025 closing (huidig):');
  console.log(`  02.01.01 Boutique:       €685.01`);
  console.log(`  02.01.02 Boutique LIFRAS: €1716.00`);
  console.log(`  02.01   Stock CDC:       €2401.01`);
  console.log('\n✅ Script voltooid!');
}

main().catch(err => {
  console.error('FOUT:', err);
  process.exit(1);
}).then(() => process.exit(0));
