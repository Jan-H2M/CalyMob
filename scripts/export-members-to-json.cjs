const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

/**
 * Export script: Excel → Clean JSON
 *
 * Fixes all issues from Excel parser:
 * - Email fallback: Email 2 → Email 1 → placeholder
 * - Encoding cleanup: Fix accents (é, è, à, etc.)
 * - Date conversion: Excel serial → ISO dates
 * - Phone number cleanup
 */

// Helper: Clean string and fix encoding issues
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
    .replace(/Â /g, ' ') // Non-breaking space
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
    .replace(/�e/g, 'ée')  // Alizée
    .replace(/�/g, 'é');   // Generic fallback

  return str || undefined;
}

// Helper: Convert Excel date serial number to ISO date
function excelDateToISO(serial) {
  if (!serial || serial === '-?-' || isNaN(serial)) return undefined;

  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);

  return date_info.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Helper: Find column index (case-insensitive, partial match)
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

async function exportToJson() {
  console.log('📊 Excel → JSON Export\n');

  const excelPath = '/Users/jan/Documents/CALYPSO/export.xls';
  const outputPath = path.join(__dirname, '../data/members-export.json');

  // Ensure data directory exists
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  console.log('📂 Reading Excel file:', excelPath);
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const headers = data[0];
  console.log('✅ Found', data.length - 1, 'rows\n');

  // Map column indexes
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
    telBureau: findColumn(headers, 'téléphone bureau', 'phone bureau'),
    gsm1: findColumn(headers, 'gsm 1'),
    gsm2: findColumn(headers, 'gsm 2'),
    certifDate: findColumn(headers, 'date du certificat'),
    certifValidite: findColumn(headers, 'validité du certificat'),
    ice: findColumn(headers, 'ice'),
    description: findColumn(headers, 'description'),
    pays: findColumn(headers, 'pays'),
    dateNaissance: findColumn(headers, 'date de naissance', 'naissance'),
    newsletter: findColumn(headers, 'newsletter'),
    niveauPlongeur: findColumn(headers, 'plongeur'),
    langue: findColumn(headers, 'langue'),
    nationalite: findColumn(headers, 'nationalité', 'nationalit')
  };

  console.log('📋 Column mapping:');
  Object.entries(col).forEach(([key, index]) => {
    if (index !== -1) {
      console.log(`  ${key}: column ${index} (${headers[index]})`);
    }
  });
  console.log();

  const members = [];
  const errors = [];
  let emailFallbackCount = 0;
  let email1Count = 0;
  let email2Count = 0;
  let placeholderCount = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    try {
      const lifrasId = cleanString(row[col.lifrasID]);

      if (!lifrasId) {
        errors.push(`Row ${i + 1}: Missing LifrasID`);
        continue;
      }

      const nom = cleanString(row[col.nom]);
      const prenom = cleanString(row[col.prenom]);

      if (!nom || !prenom) {
        errors.push(`Row ${i + 1}: Missing nom/prenom (LifrasID: ${lifrasId})`);
        continue;
      }

      // EMAIL FALLBACK LOGIC: Email 2 → Email 1 → placeholder
      let email = cleanString(row[col.email2]);
      let emailSource = 'email2';

      if (!email) {
        email = cleanString(row[col.email1]);
        emailSource = 'email1';
      }

      if (!email) {
        email = `${lifrasId}@no-email.local`;
        emailSource = 'placeholder';
        placeholderCount++;
      } else if (emailSource === 'email1') {
        email1Count++;
      } else {
        email2Count++;
      }

      // Build member object
      const member = {
        lifras_id: lifrasId,
        nr_febras: cleanString(row[col.nrFebras]),
        nom,
        prenom,
        email,
        email_source: emailSource, // For debugging
        adresse: cleanString(row[col.adresse]),
        code_postal: cleanString(row[col.codePostal]),
        localite: cleanString(row[col.localite]),
        telephone: cleanString(row[col.telPrive]),
        telephone_bureau: cleanString(row[col.telBureau]),
        gsm: cleanString(row[col.gsm1]),
        gsm2: cleanString(row[col.gsm2]),
        ice: cleanString(row[col.ice]),
        description: cleanString(row[col.description]),
        pays: cleanString(row[col.pays]),
        langue: cleanString(row[col.langue]),
        nationalite: cleanString(row[col.nationalite]),

        // Dates (convert Excel serial numbers)
        date_naissance: excelDateToISO(row[col.dateNaissance]),
        certificat_medical_date: excelDateToISO(row[col.certifDate]),
        certificat_medical_validite: cleanString(row[col.certifValidite]), // Already formatted

        // Boolean
        newsletter: cleanString(row[col.newsletter])?.toLowerCase() === 'true',

        // Diving level (use niveau_plongee as primary, keep niveau_plongeur for backward compatibility)
        niveau_plongee: cleanString(row[col.niveauPlongeur]),
        niveau_plongeur: cleanString(row[col.niveauPlongeur]) // DEPRECATED but keep for compatibility
      };

      members.push(member);

    } catch (error) {
      errors.push(`Row ${i + 1}: ${error.message}`);
    }
  }

  // Create output object
  const output = {
    exportDate: new Date().toISOString(),
    source: excelPath,
    memberCount: members.length,
    errorCount: errors.length,
    emailStats: {
      fromEmail2: email2Count,
      fromEmail1: email1Count,
      placeholder: placeholderCount
    },
    members,
    errors: errors.length > 0 ? errors : undefined
  };

  // Write to file
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log('✅ Export complete!\n');
  console.log('📊 Statistics:');
  console.log(`  Total members: ${members.length}`);
  console.log(`  Errors: ${errors.length}`);
  console.log(`  Emails from Email 2: ${email2Count}`);
  console.log(`  Emails from Email 1: ${email1Count}`);
  console.log(`  Placeholder emails: ${placeholderCount}`);
  console.log();
  console.log('📁 Output:', outputPath);

  // Show sample
  console.log('\n📋 Sample (LifrasID 56629 - Alizée PIGNON):');
  const sample = members.find(m => m.lifras_id === '56629');
  if (sample) {
    console.log(JSON.stringify(sample, null, 2));
  }
}

exportToJson()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
