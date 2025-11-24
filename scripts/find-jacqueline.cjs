const XLSX = require('xlsx');

const workbook = XLSX.readFile('/Users/jan/Documents/CALYPSO/export.xls');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const headers = data[0];
const email2Index = headers.indexOf('Email 2');
const lifrasIndex = headers.indexOf('LifrasID');
const nomIndex = headers.indexOf('Nom');
const prenomIndex = headers.indexOf('Prenom');

console.log('Zoeken naar members zonder LifrasID match in Excel...\n');

const targets = [
  'jacqueline.damoiseau@skynet.be',
  'juan.antonio.marquez.sc@gmail.com',
  'james.hughes@skynet.be',
  'truong.julie54@gmail.com'
];

for (let i = 1; i < data.length; i++) {
  const row = data[i];
  const email = row[email2Index];
  const lifrasId = row[lifrasIndex];
  const nom = row[nomIndex];
  const prenom = row[prenomIndex];

  if (email && targets.some(t => email.toLowerCase().includes(t.toLowerCase()))) {
    console.log(`Row ${i + 1}:`);
    console.log(`  Nom: ${nom}`);
    console.log(`  Prenom: ${prenom}`);
    console.log(`  Email: ${email}`);
    console.log(`  LifrasID: ${lifrasId}`);
    console.log();
  }
}
