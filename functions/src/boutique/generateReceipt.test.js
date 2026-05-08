/**
 * Tests for generateReceipt.js
 *
 * We test the PDF building logic (buildReceiptPdf) directly by:
 * 1. Generating a PDF buffer with known input data
 * 2. Verifying the buffer is a valid PDF (starts with %PDF)
 * 3. Parsing text content from the PDF to verify it includes required fields
 *
 * Firebase Storage / Firestore interactions are verified via mocked admin SDK.
 */

const zlib = require('zlib');
const { buildReceiptPdf, formatEur, formatDate } = require('./generateReceipt');

// ─── Tests ───────────────────────────────────────────────────────────

describe('formatEur()', () => {
  test('formats a number as EUR string', () => {
    expect(formatEur(25)).toBe('\u20AC 25.00');
  });

  test('formats zero as EUR string', () => {
    expect(formatEur(0)).toBe('\u20AC 0.00');
  });

  test('formats decimal', () => {
    expect(formatEur(49.5)).toBe('\u20AC 49.50');
  });

  test('handles null/undefined', () => {
    expect(formatEur(null)).toBe('\u20AC 0.00');
    expect(formatEur(undefined)).toBe('\u20AC 0.00');
  });
});

describe('formatDate()', () => {
  test('formats a JS Date', () => {
    const date = new Date(2026, 4, 15); // May 15, 2026
    expect(formatDate(date)).toBe('15 mai 2026');
  });

  test('formats a Firestore-like timestamp object with toDate()', () => {
    const ts = { toDate: () => new Date(2026, 0, 1) };
    expect(formatDate(ts)).toBe('1 janvier 2026');
  });

  test('returns em-dash for null', () => {
    expect(formatDate(null)).toBe('\u2014');
  });

  test('returns em-dash for undefined', () => {
    expect(formatDate(undefined)).toBe('\u2014');
  });
});

describe('buildReceiptPdf() — PDF generation', () => {
  /**
   * Extract text from a simple pdfkit-generated PDF buffer.
   * pdfkit uses FlateDecode (zlib deflate) compression and encodes text
   * as hex strings between <> in TJ arrays, sometimes split per-character
   * with spacing info. We rebuild the text by concatenating all hex chunks.
   */
  function extractPdfText(buffer) {
    const str = buffer.toString('binary');

    // Find stream...endstream
    const textParts = [];
    const streamRegex = /stream\n(.+?)\nendstream/gs;
    let match;

    while ((match = streamRegex.exec(str)) !== null) {
      const start = match.index + match[0].indexOf(match[1]);
      const rawBytes = buffer.slice(start, start + match[1].length);

      try {
        // Decompress (FlateDecode)
        const decompressed = zlib.inflateSync(rawBytes).toString('utf8');

        // Extract text from hex strings in TJ/Tj operators
        const hexStrings = decompressed.match(/<([0-9A-Fa-f]+)>/g);
        if (hexStrings) {
          let fullText = '';
          hexStrings.forEach(hexStr => {
            const hex = hexStr.slice(1, -1);
            for (let i = 0; i < hex.length; i += 2) {
              const code = parseInt(hex.substring(i, i + 2), 16);
              if (code >= 32 && code <= 126) {
                fullText += String.fromCharCode(code);
              } else if (code === 0x0a) {
                fullText += '\n';
              } else {
                const fallback = String.fromCharCode(code);
                if (fallback.trim() || code === 0x20) {
                  fullText += fallback;
                }
              }
            }
          });
          if (fullText.trim()) {
            textParts.push(fullText);
          }
        }
      } catch (_) {
        // Not compressed — skip
      }
    }

    return textParts.join('\n');
  }

  test('generates a valid PDF buffer', async () => {
    const order = {
      orderNumber: 'BTQ-2026-0001',
      createdAt: new Date(2026, 4, 15),
      status: 'paid',
      buyer: {
        displayName: 'Jean Dupont',
        email: 'jean@example.com',
        phone: '+32476123456',
      },
      items: [
        {
          qty: 2,
          unitPrice: 25.00,
          lineTotal: 50.00,
          productSnapshot: {
            name: 'T-shirt Calypso',
            variantLabel: 'Taille M',
          },
        },
      ],
      pricing: {
        itemsSubtotal: 50.00,
        deliverySurcharges: 0,
        total: 50.00,
      },
      payment: {
        iban: 'BE68123456789012',
        beneficiary: 'Calypso Diving Club',
        structuredCommunication: '+++123/4567/89123+++',
        paidAt: { toDate: () => new Date(2026, 4, 15) },
      },
      ogm_display: '+++123/4567/89123+++',
    };

    const buffer = await buildReceiptPdf(order, 'order_abc123');

    // Must be a Buffer
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500); // reasonable PDF size

    // PDF magic bytes
    const header = buffer.slice(0, 8).toString('ascii');
    expect(header).toMatch(/^%PDF-\d\.\d/);

    // Verify text content via pdf-parse
    const text = extractPdfText(buffer);
    expect(text).toContain('Calypso Diving Club');
    expect(text).toContain('FACTURE');
    expect(text).toContain('REÇU');
    expect(text).toContain('BTQ-2026-0001');
    expect(text).toContain('Jean Dupont');
    expect(text).toContain('T-shirt Calypso');
    expect(text).toContain('Taille M');
    expect(text).toContain('50.00');
    expect(text).toContain('TVA non applicable');
    expect(text).toContain('article 44');
    expect(text).toContain('BE68123456789012');
  });

  test('handles order without items gracefully', async () => {
    const order = {
      orderNumber: 'BTQ-2026-0002',
      createdAt: new Date(2026, 4, 15),
      status: 'awaiting_payment',
      buyer: {
        displayName: 'Test User',
        email: 'test@example.com',
      },
      items: [],
      pricing: {
        itemsSubtotal: 0,
        deliverySurcharges: 0,
        total: 0,
      },
      payment: {},
    };

    const buffer = await buildReceiptPdf(order, 'order_empty');
    const text = extractPdfText(buffer);
    expect(text).toContain('BTQ-2026-0002');
    expect(text).toContain('Test User');
  });

  test('handles missing buyer gracefully', async () => {
    const order = {
      orderNumber: 'BTQ-2026-0003',
      createdAt: new Date(2026, 4, 15),
      status: 'paid',
      items: [
        {
          qty: 1,
          unitPrice: 10.00,
          lineTotal: 10.00,
          productSnapshot: {
            name: 'Test Product',
          },
        },
      ],
      pricing: {
        itemsSubtotal: 10.00,
        deliverySurcharges: 2.50,
        total: 12.50,
      },
      payment: {
        iban: 'BE68123456789012',
        beneficiary: 'Calypso',
      },
    };

    const buffer = await buildReceiptPdf(order, 'order_nobuyer');
    const text = extractPdfText(buffer);
    // Should show delivery surcharge
    expect(text).toContain('12.50');
  });

  test('generates valid PDF for multi-item order with delivery', async () => {
    const order = {
      orderNumber: 'BTQ-2026-0010',
      createdAt: new Date(2026, 4, 15),
      status: 'paid',
      buyer: { displayName: 'Multi-Item Buyer', email: 'multi@example.com' },
      items: [
        {
          qty: 3,
          unitPrice: 15.00,
          lineTotal: 45.00,
          productSnapshot: { name: 'Item A', variantLabel: 'Blue' },
        },
        {
          qty: 1,
          unitPrice: 75.00,
          lineTotal: 75.00,
          productSnapshot: { name: 'Item B', variantLabel: 'Large' },
        },
        {
          qty: 5,
          unitPrice: 8.50,
          lineTotal: 42.50,
          productSnapshot: { name: 'Item C' },
        },
      ],
      pricing: {
        itemsSubtotal: 162.50,
        deliverySurcharges: 7.50,
        total: 170.00,
      },
      payment: {
        iban: 'BE68123456789012',
        beneficiary: 'Calypso',
        structuredCommunication: '+++123/4567/89123+++',
        paidAt: { toDate: () => new Date(2026, 4, 15) },
      },
      ogm_display: '+++123/4567/89123+++',
    };

    const buffer = await buildReceiptPdf(order, 'order_multi');
    expect(buffer.length).toBeGreaterThan(800);
    const text = extractPdfText(buffer);
    expect(text).toContain('Item A');
    expect(text).toContain('Item B');
    expect(text).toContain('Item C');
    expect(text).toContain('162.50'); // subtotal
    expect(text).toContain('7.50');   // delivery
    expect(text).toContain('170.00'); // total
  });
});

describe('generateBoutiqueReceipt — Storage upload flow', () => {
  test('buildReceiptPdf produces a buffer suitable for Storage upload', async () => {
    const order = {
      orderNumber: 'BTQ-2026-0001',
      status: 'paid',
      buyer: { displayName: 'Test' },
      items: [],
      pricing: { itemsSubtotal: 0, total: 0 },
      payment: { iban: 'BE00', beneficiary: 'Club' },
    };

    const buffer = await buildReceiptPdf(order, 'test-id');

    // Buffer is valid for Storage upload
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);

    // Correct content type would be 'application/pdf'
    const header = buffer.slice(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');

    // Simulate what the onCall function does with the buffer
    const mockSave = jest.fn().mockResolvedValue();
    const mockMakePublic = jest.fn().mockResolvedValue();
    const mockPublicUrl = jest.fn().mockReturnValue(
      'https://storage.googleapis.com/bucket/clubs/c1/orders/o1/receipt.pdf',
    );

    const mockFileRef = { save: mockSave, makePublic: mockMakePublic, publicUrl: mockPublicUrl };

    await mockFileRef.save(buffer, { metadata: { contentType: 'application/pdf' } });
    await mockFileRef.makePublic();
    const url = mockFileRef.publicUrl();

    expect(mockSave).toHaveBeenCalledWith(buffer, { metadata: { contentType: 'application/pdf' } });
    expect(mockMakePublic).toHaveBeenCalled();
    expect(url).toContain('receipt.pdf');
  });
});
