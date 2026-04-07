#!/usr/bin/env node
/**
 * Fix session theme categories: convert labels to lowercase values
 * and map to correct ThemeCategory enum values.
 *
 * Run from: CalyMob/scripts/  →  node fix_theme_categories.cjs
 */
const path = require('path');

const functionsPath = path.join(__dirname, '../functions');
const admin = require(path.join(functionsPath, 'node_modules/firebase-admin'));

const possibleServiceAccountPaths = [
  '/Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-fbsvc-7981ec9e47.json',
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  path.join(__dirname, '../functions/service-account-key.json')
].filter(Boolean);

let initialized = false;
for (const saPath of possibleServiceAccountPaths) {
  try {
    const serviceAccount = require(saPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    initialized = true;
    console.log(`✅ Firebase initialized with: ${path.basename(saPath)}`);
    break;
  } catch (e) { /* try next */ }
}
if (!initialized) {
  try {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    initialized = true;
  } catch (e) {
    console.error('❌ Could not initialize Firebase.');
    process.exit(1);
  }
}

const db = admin.firestore();
const CLUB_ID = 'calypso';
const COLLECTION = `clubs/${CLUB_ID}/session_themes`;

// Mapping from incorrect labels to correct ThemeCategory values
const CATEGORY_FIX_MAP = {
  'Sauvetage': 'sauvetage',
  'Technique': 'technique',
  'Encadrement': 'encadrement',
  'Communication': 'communication',
  'Orientation': 'orientation',
  'Apnée': 'apnee',
  'Gestion du stress': 'gestion_stress',
  'Ludique': 'jeux',
  'Flottabilité': 'flottabilite',
  'Préparation examen': 'examen_prep',
};

async function fixCategories() {
  console.log('\n🔧 Fixing theme categories...\n');

  const snapshot = await db.collection(COLLECTION).get();
  const batch = db.batch();
  let fixed = 0;
  let alreadyOk = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const currentCat = data.category;
    const newCat = CATEGORY_FIX_MAP[currentCat];

    if (newCat) {
      batch.update(doc.ref, { category: newCat });
      console.log(`  🔄 "${data.title}" : "${currentCat}" → "${newCat}"`);
      fixed++;
    } else {
      alreadyOk++;
    }
  }

  if (fixed > 0) {
    await batch.commit();
    console.log(`\n✅ Fixed ${fixed} themes, ${alreadyOk} already correct.`);
  } else {
    console.log('\n✅ All categories are already correct.');
  }

  process.exit(0);
}

fixCategories().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
