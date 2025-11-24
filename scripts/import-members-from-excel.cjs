const admin = require('firebase-admin');
const XLSX = require('xlsx');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

/**
 * Complete Excel → Firestore Import
 *
 * Flow:
 * 1. Read Excel file
 * 2. Parse & clean data (fix encoding, email fallback)
 * 3. Load existing members from Firestore
 * 4. Detect duplicates & merges
 * 5. Batch write to Firestore
 */

// ========== HELPERS ==========

function cleanString(val) {
  if (!val) return undefined;

  let str = String(val).trim();

  // Fix common encoding issues from iClubSport Excel
  str = str
    // ISO-8859-1 (Latin-1) encoded as UTF-8 mojibake
    .replace(/Ã©/g, 'é')
    .replace(/Ã¨/g, 'è')
    .replace(/Ã /g, 'à')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã´/g, 'ô')
    .replace(/Ã®/g, 'î')
    .replace(/Ã«/g, 'ë')
    .replace(/Ã¯/g, 'ï')
    .replace(/Ã»/g, 'û')
    .replace(/Ã¼/g, 'ü')
    .replace(/Ã�/g, 'É')
    .replace(/Ã€/g, 'À')
    .replace(/Â /g, ' ')
    // HTML entities
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&agrave;/g, 'à')
    .replace(/&ccedil;/g, 'ç')
    .replace(/&ocirc;/g, 'ô')
    .replace(/&icirc;/g, 'î')
    .replace(/&euml;/g, 'ë')
    .replace(/&iuml;/g, 'ï')
    .replace(/&ucirc;/g, 'û')
    .replace(/&uuml;/g, 'ü')
    // Windows-1252 replacement character (�)
    .replace(/�e/g, 'ée')
    .replace(/�/g, 'é');

  return str || undefined;
}

function excelDateToISO(serial) {
  if (!serial || serial === '-?-' || isNaN(serial)) return undefined;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().split('T')[0];
}

function findColumn(headers, ...names) {
  for (const name of names) {
    const normalized = name.toLowerCase();
    const index = headers.findIndex(h =>
      h && h.toLowerCase().includes(normalized)
    );
    if (index !== -1) return index;
  }
  return -1;
}

function generateId() {
  return 'mhm3y0ig' + Math.random().toString(36).substring(2, 15);
}

// ========== MAIN IMPORT FUNCTION ==========

async function importMembers() {
  console.log('🚀 Complete Excel → Firestore Import\n');

  const excelPath = '/Users/jan/Documents/CALYPSO/export.xls';
  const clubId = 'calypso';

  // STEP 1: Read Excel
  console.log('📂 Step 1: Reading Excel file...');
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const headers = data[0];
  console.log(`✅ Found ${data.length - 1} rows\n`);

  // Map columns
  const col = {
    lifrasID: findColumn(headers, 'lifrasid'),
    nrFebras: findColumn(headers, 'febras'),
    nom: findColumn(headers, 'nom'),
    prenom: findColumn(headers, 'prenom'),
    adresse: findColumn(headers, 'adresse'),
    codePostal: findColumn(headers, 'code postal', 'postal'),
    localite: findColumn(headers, 'localité', 'localit'),
    email1: findColumn(headers, 'email 1'),
    email2: findColumn(headers, 'email 2'),
    telPrive: findColumn(headers, 'téléphone priv', 'phone priv'),
    gsm1: findColumn(headers, 'gsm 1'),
    certifDate: findColumn(headers, 'date du certificat'),
    certifValidite: findColumn(headers, 'validité du certificat'),
    ice: findColumn(headers, 'ice'),
    pays: findColumn(headers, 'pays'),
    dateNaissance: findColumn(headers, 'date de naissance', 'naissance'),
    newsletter: findColumn(headers, 'newsletter'),
    niveauPlongeur: findColumn(headers, 'plongeur'),
    langue: findColumn(headers, 'langue'),
    nationalite: findColumn(headers, 'nationalité', 'nationalit')
  };

  // STEP 2: Parse Excel → JSON
  console.log('📊 Step 2: Parsing Excel data...');
  const parsedMembers = [];
  const parseErrors = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    try {
      const lifrasId = cleanString(row[col.lifrasID]);
      if (!lifrasId) continue;

      const nom = cleanString(row[col.nom]);
      const prenom = cleanString(row[col.prenom]);
      if (!nom || !prenom) continue;

      // EMAIL FALLBACK: Email 2 → Email 1 → placeholder
      let email = cleanString(row[col.email2]);
      if (!email) email = cleanString(row[col.email1]);
      if (!email) email = `${lifrasId}@no-email.local`;

      const member = {
        lifras_id: lifrasId,
        nr_febras: cleanString(row[col.nrFebras]),
        nom,
        prenom,
        email,
        displayName: `${prenom} ${nom}`,
        adresse: cleanString(row[col.adresse]),
        code_postal: cleanString(row[col.codePostal]),
        localite: cleanString(row[col.localite]),
        telephone: cleanString(row[col.gsm1]),
        gsm: cleanString(row[col.gsm1]),
        ice: cleanString(row[col.ice]),
        pays: cleanString(row[col.pays]),
        langue: cleanString(row[col.langue]),
        nationalite: cleanString(row[col.nationalite]),
        date_naissance: excelDateToISO(row[col.dateNaissance]),
        certificat_medical_date: excelDateToISO(row[col.certifDate]),
        certificat_medical_validite: cleanString(row[col.certifValidite]),
        newsletter: cleanString(row[col.newsletter])?.toLowerCase() === 'true',
        niveau_plongee: cleanString(row[col.niveauPlongeur]),
        niveau_plongeur: cleanString(row[col.niveauPlongeur]),

        // Member metadata
        app_role: 'membre',
        member_status: 'inactive',
        has_app_access: false,
        is_diver: !!cleanString(row[col.niveauPlongeur]),
        has_lifras: true,
        isCA: false,
        clubId: clubId
      };

      parsedMembers.push(member);

    } catch (error) {
      parseErrors.push(`Row ${i + 1}: ${error.message}`);
    }
  }

  console.log(`✅ Parsed ${parsedMembers.length} members`);
  if (parseErrors.length > 0) {
    console.log(`⚠️  ${parseErrors.length} errors during parsing`);
  }
  console.log();

  // STEP 3: Load existing members
  console.log('🔍 Step 3: Loading existing members from Firestore...');
  const membersRef = db.collection('clubs').doc(clubId).collection('members');
  const snapshot = await membersRef.get();

  const existingByLifrasId = new Map();
  const existingByEmail = new Map();
  const existingByNameKey = new Map();

  snapshot.forEach(doc => {
    const data = doc.data();
    const member = { id: doc.id, ...data };

    if (data.lifras_id) {
      existingByLifrasId.set(data.lifras_id, member);
    }
    if (data.email && !data.email.includes('@no-email.local')) {
      existingByEmail.set(data.email.toLowerCase().trim(), member);
    }
    if (data.nom && data.prenom) {
      const key = `${data.nom.toLowerCase().trim()}_${data.prenom.toLowerCase().trim()}`;
      existingByNameKey.set(key, member);
    }
  });

  console.log(`✅ Found ${snapshot.size} existing members\n`);

  // STEP 4: Classify operations
  console.log('🔀 Step 4: Detecting duplicates & merges...');
  const toAdd = [];
  const toUpdate = [];
  const toMerge = [];
  const skipped = [];

  for (const member of parsedMembers) {
    const lifrasId = member.lifras_id;
    const emailKey = member.email.toLowerCase().trim();
    const nameKey = `${member.nom.toLowerCase().trim()}_${member.prenom.toLowerCase().trim()}`;

    // Priority 1: Match by LifrasID
    let existing = existingByLifrasId.get(lifrasId);
    let matchReason = existing ? 'lifras_id' : null;

    // Priority 2: Match by email
    if (!existing && !emailKey.includes('@no-email.local')) {
      existing = existingByEmail.get(emailKey);
      matchReason = existing ? 'email' : null;
    }

    // Priority 3: Match by name
    if (!existing) {
      existing = existingByNameKey.get(nameKey);
      matchReason = existing ? 'name' : null;
    }

    if (existing) {
      // PROTECTED: Don't touch members with app access
      if (existing.has_app_access === true) {
        skipped.push({ ...member, reason: 'has_app_access' });
        continue;
      }

      // MERGE: Add LifrasID if missing or different
      if (matchReason !== 'lifras_id' && existing.lifras_id !== lifrasId) {
        toMerge.push({
          id: existing.id,
          oldLifrasId: existing.lifras_id,
          newLifrasId: lifrasId,
          member,
          matchReason
        });
      } else {
        // UPDATE: Refresh data
        toUpdate.push({
          id: existing.id,
          member
        });
      }
    } else {
      // NEW: Add member
      toAdd.push(member);
    }
  }

  console.log(`✅ Classification complete:`);
  console.log(`   📝 New members: ${toAdd.length}`);
  console.log(`   🔄 Updates: ${toUpdate.length}`);
  console.log(`   🔀 Merges (add LifrasID): ${toMerge.length}`);
  console.log(`   🔒 Skipped (protected): ${skipped.length}\n`);

  // STEP 5: Confirm
  console.log('⚠️  Ready to import. Press Ctrl+C to cancel, or wait 5 seconds...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // STEP 6: Execute batch writes
  console.log('\n💾 Step 5: Writing to Firestore...');

  let batch = db.batch();
  let batchCount = 0;
  let totalOps = 0;

  // ADD new members
  for (const member of toAdd) {
    const id = generateId();
    const ref = membersRef.doc(id);

    // Filter undefined values
    const cleanData = Object.fromEntries(
      Object.entries(member).filter(([_, v]) => v !== undefined)
    );

    cleanData.createdAt = new Date();
    cleanData.updatedAt = new Date();

    batch.set(ref, cleanData);
    batchCount++;
    totalOps++;

    if (batchCount >= 500) {
      await batch.commit();
      console.log(`   ✓ Committed batch (${totalOps} ops)`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  // UPDATE existing
  for (const { id, member } of toUpdate) {
    const ref = membersRef.doc(id);

    const cleanData = Object.fromEntries(
      Object.entries(member).filter(([_, v]) => v !== undefined)
    );
    cleanData.updatedAt = new Date();
    delete cleanData.createdAt; // Don't overwrite

    batch.update(ref, cleanData);
    batchCount++;
    totalOps++;

    if (batchCount >= 500) {
      await batch.commit();
      console.log(`   ✓ Committed batch (${totalOps} ops)`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  // MERGE (add LifrasID)
  for (const { id, member, oldLifrasId, newLifrasId } of toMerge) {
    const ref = membersRef.doc(id);

    const cleanData = Object.fromEntries(
      Object.entries(member).filter(([_, v]) => v !== undefined)
    );
    cleanData.updatedAt = new Date();
    cleanData.lifras_id = newLifrasId;
    cleanData.has_lifras = true;
    delete cleanData.createdAt;

    batch.update(ref, cleanData);
    batchCount++;
    totalOps++;

    console.log(`   🔀 MERGE: ${member.prenom} ${member.nom} - LifrasID ${oldLifrasId || 'none'} → ${newLifrasId}`);

    if (batchCount >= 500) {
      await batch.commit();
      console.log(`   ✓ Committed batch (${totalOps} ops)`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  // Commit final batch
  if (batchCount > 0) {
    await batch.commit();
    console.log(`   ✓ Committed final batch (${totalOps} ops)`);
  }

  console.log('\n✅ Import complete!\n');
  console.log('📊 Final statistics:');
  console.log(`   ✅ Added: ${toAdd.length} new members`);
  console.log(`   🔄 Updated: ${toUpdate.length} members`);
  console.log(`   🔀 Merged: ${toMerge.length} members (LifrasID added)`);
  console.log(`   🔒 Protected: ${skipped.length} members (skipped)`);
}

importMembers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
