const PDFDocument = require('pdfkit');
const zlib = require('zlib');
const path = require('path');

async function buildReceiptPdf(order, orderId) {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });
    doc.on('data', (chunk) => chunks.push(chunk));
    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(20).font('Helvetica-Bold').text('Hello World Test', { align: 'center' });
      doc.end();
    });
    return pdfBuffer;
}

async function main() {
  const buf = await buildReceiptPdf({}, 'test123');
  console.log('Length:', buf.length);
  
  // Try: pdfkit stores text in the Title metadata as well
  const str = buf.toString('binary');
  
  // Find all parenthesized strings
  const parenMatches = str.match(/\([^)]*\)/g);
  if (parenMatches) {
    console.log('Parenthesized strings found:', parenMatches.length);
    parenMatches.forEach((m, i) => console.log(`  [${i}]: ${m}`));
  }
  
  // Print what's between stream and endstream
  const streamMatch = str.match(/stream(.+?)endstream/gs);
  if (streamMatch) {
    console.log('\nStream content (first 200 chars):');
    streamMatch.forEach((s, i) => {
      console.log(`Stream ${i}:`);
      // Extract just the data
      const dataStart = s.indexOf('\n') + 1;
      const dataEnd = s.lastIndexOf('\n');
      const data = s.slice(dataStart, dataEnd);
      console.log(`  raw preview:`, data.slice(0, 100));
      
      // Try raw bytes
      const matchIdx = str.indexOf(s);
      const globalDataStart = matchIdx + dataStart;
      const rawBytes = buf.slice(globalDataStart, globalDataStart + data.length);
      console.log(`  binary preview:`, rawBytes.slice(0, 20));
      
      try {
        const decomp = zlib.inflateSync(rawBytes);
        console.log('  DECOMPRESSED:', decomp.toString('utf8').slice(0, 300));
      } catch(e) {
        console.log('  Not deflate:', e.message.slice(0, 80));
      }
    });
  }
}

main().catch(console.error);
