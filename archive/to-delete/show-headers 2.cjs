const XLSX = require('xlsx');
const fs = require('fs');

const buffer = fs.readFileSync('/Users/jan/Documents/CALYPSO/export.xls');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log('=== Headers as parsed by XLSX in browser mode ===\n');
data[0].forEach((header, index) => {
  console.log(`[${index}] "${header}"`);
  // Show hex codes for first few chars
  if (header) {
    const chars = header.substring(0, 10).split('').map(c => c.charCodeAt(0).toString(16)).join(' ');
    console.log(`    Hex: ${chars}`);
  }
});

console.log('\n=== Searching for Email columns ===');
console.log('indexOf("Email 1"):', data[0].indexOf('Email 1'));
console.log('indexOf("Email"):', data[0].indexOf('Email'));

const emailCols = data[0].filter((h, i) => h && h.toLowerCase().includes('email'));
console.log('\nColumns containing "email":', emailCols);
