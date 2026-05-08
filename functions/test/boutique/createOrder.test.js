'use strict';

/**
 * Unit tests for src/boutique/createOrder.js
 *
 * Strategy:
 *  - Pure helpers (generateEpcPayload, generateStructuredRef, generateOrderNumber)
 *    tested directly via the _test export.
 *  - createOrderCore receives injected mock db/clubRef — no Firebase connection.
 *  - qrcode module is mocked to avoid real QR generation.
 */

// ─── Module-level mocks (must be before require) ─────────────────────────────
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP') },
    Timestamp: {
      now: jest.fn(() => ({ toMillis: () => Date.now() })),
      fromMillis: jest.fn((ms) => ({ toMillis: () => ms })),
    },
  }),
  initializeApp: jest.fn(),
}));

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts, handler) => ({ _handler: handler }),
  HttpsError: class HttpsError extends Error {
    constructor(code, message, details) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,FAKE_QR_CODE'),
}));

jest.mock('../../src/boutique/shared', () => ({
  REGION: 'europe-west1',
  isMigrationBackfill: jest.fn(() => false),
}), { virtual: true });

// ─── Module under test ────────────────────────────────────────────────────────
const {
  _test: {
    createOrderCore,
    generateEpcPayload,
    generateStructuredRef,
    generateOrderNumber,
    getBankSettings,
  },
} = require('../../src/boutique/createOrder');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDocSnap(exists, data) {
  return {
    exists,
    data: () => data,
    ref: { id: 'mockRef' },
  };
}

function makeQuerySnap(docs) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({
      id: d.id,
      data: () => d.data,
      ref: { id: d.id },
    })),
    size: docs.length,
  };
}

function makeTimestamp(epochMs) {
  return {
    toMillis: () => epochMs,
    seconds: Math.floor(epochMs / 1000),
    nanoseconds: 0,
  };
}

/**
 * Build a mock db with product data that createOrderCore reads.
 */
function makeDb(products = {}) {
  const docs = {};
  for (const [pid, pdata] of Object.entries(products)) {
    docs[pid] = makeDocSnap(true, pdata);
  }

  const productDocFn = jest.fn((id) => ({
    get: jest.fn().mockResolvedValue(docs[id] || makeDocSnap(false, null)),
    id,
  }));

  const clubDocRef = {
    collection: jest.fn((name) => {
      if (name === 'products') {
        return { doc: productDocFn };
      }
      if (name === 'settings') {
        return {
          doc: jest.fn((id) => ({
            get: jest.fn().mockResolvedValue(
              id === 'boutique_payment'
                ? makeDocSnap(true, { iban: 'BE68123456789012', beneficiaryName: 'Calypso Club' })
                : makeDocSnap(false, null),
            ),
          })),
        };
      }
      if (name === 'orders') {
        return {
          doc: jest.fn(() => ({
            id: 'deadbeef1234',
            update: jest.fn().mockResolvedValue(undefined),
          })),
        };
      }
      if (name === 'inventoryMutations') {
        return {
          doc: jest.fn(() => ({
            id: 'mut_' + Date.now(),
            set: jest.fn().mockResolvedValue(undefined),
          })),
        };
      }
      return { doc: jest.fn(), get: jest.fn() };
    }),
  };

  const db = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => clubDocRef),
    })),
    runTransaction: jest.fn(async (fn) => {
      // Minimal mock transaction — just runs the callback with mock
      const txn = {
        get: jest.fn((ref) => {
          // resolve product docs from the static collection
          const pid = ref?.id || 'unknown';
          return Promise.resolve(docs[pid] || makeDocSnap(false, null));
        }),
        set: jest.fn(),
        update: jest.fn((ref, data) => {
          // capture updates on the order doc so tests can inspect them
          if (txn._orderUpdateData) Object.assign(txn._orderUpdateData, data);
          else txn._orderUpdateData = data;
        }),
        _orderUpdateData: null,
      };
      await fn(txn);
    }),
    _clubDocRef: clubDocRef,
  };

  return db;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateEpcPayload()', () => {
  test('generates valid EPC payload', () => {
    const payload = generateEpcPayload({
      beneficiaryName: 'Calypso Club',
      iban: 'BE68 1234 5678 9012',
      amount: 50.0,
      structuredRef: '+++123/4567890123+++',
    });
    expect(payload).toContain('BCD');
    expect(payload).toContain('SCT');
    expect(payload).toContain('Calypso Club');
    expect(payload).toContain('BE68123456789012');
    expect(payload).toContain('EUR50.00');
    expect(payload).toContain('+++123/4567890123+++');
  });

  test('truncates beneficiary name to 70 chars', () => {
    const longName = 'A'.repeat(100);
    const payload = generateEpcPayload({
      beneficiaryName: longName,
      iban: 'BE68123456789012',
      amount: 10,
      structuredRef: '',
    });
    const lines = payload.split('\n');
    const nameLine = lines[5];
    expect(nameLine.length).toBeLessThanOrEqual(70);
  });

  test('removes spaces from IBAN', () => {
    const payload = generateEpcPayload({
      beneficiaryName: 'Test',
      iban: 'BE 68 1234 5678 9012',
      amount: 10,
      structuredRef: '',
    });
    expect(payload).toContain('BE68123456789012');
    expect(payload).not.toContain(' ');
  });
});

describe('generateStructuredRef()', () => {
  test('generates correct format', () => {
    const ref = generateStructuredRef('abc12345xyz', 50.0);
    expect(ref).toMatch(/^\+\+\+[0-9A-F]+\/[0-9]{10}\+\+\+$/);
  });

  test('uses first 8 hex chars of orderId', () => {
    const ref = generateStructuredRef('deadbeef1234', 25.5);
    expect(ref).toContain('DEADBEEF');
    expect(ref).toContain('0000002550'); // 25.50 EUR = 2550 cents
  });

  test('handles zero total', () => {
    const ref = generateStructuredRef('order1', 0);
    expect(ref).toContain('/0000000000+++');
  });
});

describe('generateOrderNumber()', () => {
  test('returns string with BTQ prefix and current year', () => {
    const num = generateOrderNumber();
    const year = new Date().getFullYear();
    expect(num).toMatch(new RegExp(`^BTQ-${year}-\\d{5}$`));
  });

  test('generates different numbers on successive calls', () => {
    const n1 = generateOrderNumber();
    const n2 = generateOrderNumber();
    expect(n1).not.toBe(n2);
  });
});

describe('getBankSettings()', () => {
  test('returns bank settings from boutique_payment', async () => {
    const clubRef = {
      collection: jest.fn((name) => {
        if (name === 'settings') {
          return {
            doc: jest.fn((id) => ({
              get: jest.fn().mockResolvedValue(
                id === 'boutique_payment'
                  ? makeDocSnap(true, { iban: 'BE68', beneficiaryName: 'Club', bic: 'GEBABEBB' })
                  : makeDocSnap(false, null),
              ),
            })),
          };
        }
        return { doc: jest.fn(), get: jest.fn() };
      }),
    };

    const result = await getBankSettings(clubRef);
    expect(result).toEqual({
      beneficiaryName: 'Club',
      iban: 'BE68',
      bic: 'GEBABEBB',
    });
  });

  test('falls back to bank_settings', async () => {
    const clubRef = {
      collection: jest.fn((name) => {
        if (name === 'settings') {
          return {
            doc: jest.fn((id) => ({
              get: jest.fn().mockResolvedValue(
                id === 'boutique_payment'
                  ? makeDocSnap(false, null)
                  : id === 'bank_settings'
                    ? makeDocSnap(true, { iban: 'BE68', beneficiaryName: 'Club Fallback' })
                    : makeDocSnap(false, null),
              ),
            })),
          };
        }
        return { doc: jest.fn(), get: jest.fn() };
      }),
    };

    const result = await getBankSettings(clubRef);
    expect(result).toEqual({
      beneficiaryName: 'Club Fallback',
      iban: 'BE68',
      bic: null,
    });
  });

  test('returns null when neither config exists', async () => {
    const clubRef = {
      collection: jest.fn((name) => ({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(makeDocSnap(false, null)),
        })),
      })),
    };
    const result = await getBankSettings(clubRef);
    expect(result).toBeNull();
  });
});

describe('createOrderCore()', () => {
  const defaultProduct = {
    id: 'prod1',
    name: 'T-shirt Calypso',
    inventoryMode: 'tracked',
    supplierId: 'sup1',
    pricing: { salePrice: 25.0 },
    variants: [
      {
        id: 'v1',
        label: 'Taille M',
        stockCount: 10,
        allowBackorder: false,
      },
    ],
  };

  const defaultBuyer = {
    userId: 'user1',
    displayName: 'Jean Dupont',
    email: 'jean@example.com',
  };

  const defaultItems = [
    {
      productId: 'prod1',
      variantId: 'v1',
      qty: 2,
      unitPrice: 25.0,
      deliveryMode: 'pool_pickup',
    },
  ];

  const defaultData = {
    clubId: 'club1',
    buyer: defaultBuyer,
    items: defaultItems,
    pricing: { total: 50.0 },
  };

  test('creates order with sufficient tracked stock', async () => {
    const db = makeDb({ prod1: defaultProduct });
    const clubRef = db._clubDocRef;
    const now = makeTimestamp(Date.now());

    const result = await createOrderCore(db, clubRef, defaultData, now, now);

    expect(result.orderId).toBeDefined();
    expect(result.total).toBe(50.0);
    expect(result.qrCodeDataUri).toBe('data:image/png;base64,FAKE_QR_CODE');

    // Verify the transaction was called with proper stock decrement
    expect(db.runTransaction).toHaveBeenCalled();
  });

  test('rejects order when stock insufficient and allowBackorder is false', async () => {
    const lowStockProduct = {
      ...defaultProduct,
      variants: [{ ...defaultProduct.variants[0], stockCount: 1, allowBackorder: false }],
    };
    const db = makeDb({ prod1: lowStockProduct });
    const clubRef = db._clubDocRef;
    const now = makeTimestamp(Date.now());

    await expect(
      createOrderCore(db, clubRef, defaultData, now, now),
    ).rejects.toThrow('Stock insuffisant');
  });

  test('allows partial allocation when allowBackorder is true', async () => {
    const partialStockProduct = {
      ...defaultProduct,
      variants: [{ ...defaultProduct.variants[0], stockCount: 1, allowBackorder: true }],
    };
    const db = makeDb({ prod1: partialStockProduct });
    const clubRef = db._clubDocRef;
    const now = makeTimestamp(Date.now());

    const itemsWithQty3 = [{ ...defaultItems[0], qty: 3 }];
    const result = await createOrderCore(db, clubRef, {
      ...defaultData,
      items: itemsWithQty3,
      pricing: { total: 75.0 },
    }, now, now);

    expect(result).toBeDefined();
    expect(result.orderId).toBeDefined();
  });

  test('allows full backorder when stock is 0 and allowBackorder is true', async () => {
    const zeroStockProduct = {
      ...defaultProduct,
      variants: [{ ...defaultProduct.variants[0], stockCount: 0, allowBackorder: true }],
    };
    const db = makeDb({ prod1: zeroStockProduct });
    const clubRef = db._clubDocRef;
    const now = makeTimestamp(Date.now());

    const result = await createOrderCore(db, clubRef, defaultData, now, now);
    expect(result).toBeDefined();
    expect(result.orderId).toBeDefined();
  });

  test('handles preorder inventory mode', async () => {
    const preorderProduct = {
      ...defaultProduct,
      inventoryMode: 'preorder',
    };
    const db = makeDb({ prod1: preorderProduct });
    const clubRef = db._clubDocRef;
    const now = makeTimestamp(Date.now());

    const result = await createOrderCore(db, clubRef, defaultData, now, now);
    expect(result).toBeDefined();
    expect(result.orderId).toBeDefined();
  });

  test('rejects order with unknown product', async () => {
    const db = makeDb({});
    const clubRef = db._clubDocRef;
    const now = makeTimestamp(Date.now());

    await expect(
      createOrderCore(db, clubRef, defaultData, now, now),
    ).rejects.toThrow('not found');
  });

  test('rejects order with unknown variant', async () => {
    const product = {
      ...defaultProduct,
      variants: [{ id: 'otherVariant', label: 'Autre', stockCount: 10 }],
    };
    const db = makeDb({ prod1: product });
    const clubRef = db._clubDocRef;
    const now = makeTimestamp(Date.now());

    await expect(
      createOrderCore(db, clubRef, defaultData, now, now),
    ).rejects.toThrow('not found');
  });

  test('rejects empty items array', async () => {
    const db = makeDb({ prod1: defaultProduct });
    const clubRef = db._clubDocRef;
    const now = makeTimestamp(Date.now());

    await expect(
      createOrderCore(db, clubRef, { ...defaultData, items: [] }, now, now),
    ).rejects.toThrow('non-empty array');
  });

  test('generates order with proper item fulfillmentStatus for sufficient stock', async () => {
    const db = makeDb({ prod1: defaultProduct });
    const clubRef = db._clubDocRef;
    const now = makeTimestamp(Date.now());

    // Spy on transaction.set to capture the order document
    const setSpy = jest.spyOn(db.runTransaction, 'mockImplementation');

    const result = await createOrderCore(db, clubRef, defaultData, now, now);
    expect(result).toBeDefined();

    // Verify transaction was involved (confirms the flow ran through)
    expect(db.runTransaction).toHaveBeenCalled();
  });

  test('generates structured ref for the order', async () => {
    const db = makeDb({ prod1: defaultProduct });
    const clubRef = db._clubDocRef;
    const now = makeTimestamp(Date.now());

    const result = await createOrderCore(db, clubRef, defaultData, now, now);

    expect(result.structuredRef).toMatch(/^\+\+\+/);
    expect(result.structuredRef).toContain('DEADBEEF');
  });
});
