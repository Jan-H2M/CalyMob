const XLSX = require('xlsx');
const fs = require('fs');

const buffer = fs.readFileSync('/Users/jan/Documents/CALYPSO/export.xls');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log('=== Headers ===');
console.log('[6]:', data[0][6]);
console.log('[7]:', data[0][7]);
console.log('[8]:', data[0][8]);

console.log('\n=== Testing columns 6, 7, 8 for first 5 rows ===\n');
for (let i = 1; i <= 5; i++) {
  const row = data[i];
  console.log(`Row ${i}:`);
  console.log(`  [6]: "${row[6]}"`);
  console.log(`  [7]: "${row[7]}"`);
  console.log(`  [8]: "${row[8]}"`);
  console.log();
}
