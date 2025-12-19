const XLSX = require('xlsx');
const fs = require('fs');

async function debugParsing() {
  const filePath = '/Users/jan/Documents/CALYPSO/export.xls';

  console.log('📖 Reading file with File API simulation...\n');

  // Simulate browser File API
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  // Parse exactly like membreExcelParser.ts does
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const headers = data[0];

  // Helper: Trouver index d'une colonne (flexible pour gérer les headers corrompus)
  const findColumn = (exactName, fallbackPattern) => {
    // Essayer correspondance exacte d'abord
    let index = headers.indexOf(exactName);
    if (index !== -1) return index;

    // Sinon, chercher pattern dans les headers (pour gérer HTML corrompu)
    if (fallbackPattern) {
      index = headers.findIndex(h =>
        h && h.toLowerCase().includes(fallbackPattern.toLowerCase())
      );
    }

    return index;
  };

  const colIndexes = {
    lifrasID: findColumn('LifrasID', 'lifras'),
    nom: findColumn('Nom'),
    prenom: findColumn('Prenom'),
    // HTML corrompu: check "Email 2" first (where real data is)
    email: (() => {
      const email2Index = headers.indexOf('Email 2');
      if (email2Index !== -1) return email2Index;
      return findColumn('Email 1', 'email');
    })()
  };

  console.log('📊 Column indexes:', colIndexes);
  console.log('\n🔍 Testing email parsing for first 10 rows:\n');

  function cleanString(value) {
    if (!value) return undefined;
    const str = String(value).trim();
    return str.length > 0 ? str : undefined;
  }

  for (let i = 1; i <= 10; i++) {
    const row = data[i];
    const lifrasId = cleanString(row[colIndexes.lifrasID]);
    const nom = cleanString(row[colIndexes.nom]);
    const prenom = cleanString(row[colIndexes.prenom]);
    const rawEmail = row[colIndexes.email];
    const cleanedEmail = cleanString(rawEmail);
    const finalEmail = cleanedEmail || `${lifrasId}@no-email.local`;

    console.log(`Row ${i}:`);
    console.log(`  ${lifrasId} - ${prenom} ${nom}`);
    console.log(`  Raw: "${rawEmail}" (type: ${typeof rawEmail}, value: ${JSON.stringify(rawEmail)})`);
    console.log(`  Cleaned: ${cleanedEmail}`);
    console.log(`  Final: ${finalEmail}`);
    console.log();
  }
}

debugParsing().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
