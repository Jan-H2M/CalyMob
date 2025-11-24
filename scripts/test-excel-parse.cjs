const XLSX = require('xlsx');

const workbook = XLSX.readFile('/Users/jan/Documents/CALYPSO/export.xls');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const headers = data[0];
const colIndexes = {
  lifrasID: headers.indexOf('LifrasID'),
  nom: headers.indexOf('Nom'),
  prenom: headers.indexOf('Prenom'),
  email: headers.indexOf('Email 1')
};

console.log('Column indexes:', colIndexes);
console.log('\n=== Testing cleanString function ===');

function cleanString(value) {
  if (!value) return undefined;
  const str = String(value).trim();
  return str.length > 0 ? str : undefined;
}

console.log('\n=== First 10 rows with email processing ===');
for (let i = 1; i <= 10; i++) {
  const row = data[i];
  const lifrasId = cleanString(row[colIndexes.lifrasID]);
  const nom = cleanString(row[colIndexes.nom]);
  const prenom = cleanString(row[colIndexes.prenom]);
  const rawEmail = row[colIndexes.email];
  const cleanedEmail = cleanString(rawEmail);
  const finalEmail = cleanedEmail || `${lifrasId}@no-email.local`;

  console.log(`\nRow ${i}:`);
  console.log(`  LifrasID: ${lifrasId}`);
  console.log(`  Nom: ${nom}`);
  console.log(`  Prenom: ${prenom}`);
  console.log(`  Raw Email: "${rawEmail}" (type: ${typeof rawEmail})`);
  console.log(`  Cleaned Email: ${cleanedEmail}`);
  console.log(`  Final Email: ${finalEmail}`);
}
