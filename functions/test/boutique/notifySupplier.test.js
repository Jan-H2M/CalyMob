'use strict';

/**
 * Unit tests for src/boutique/notifySupplier.js
 *
 * Strategy:
 *  - Pure helpers (escapeHtml, formatMoney, formatDate, generateSupplierEmailHtml)
 *    are tested directly via the _test export.
 *  - Async helpers (getPendingOrdersForSupplier, buildSupplierNotificationPlan,
 *    sendSupplierNotificationEmail, loadEmailConfig) receive injected mock db
 *    objects — no Firebase connection needed.
 *  - fetch is mocked globally to avoid real HTTP calls.
 *
 * firebase-admin and firebase-functions v2 modules are mocked at the top so
 * the module can be required without a Firebase project.
 */

// ─── Module-level mocks (must be before require) ─────────────────────────────

jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP') },
    Timestamp: { now: jest.fn(() => ({ toMillis: () => Date.now() })) },
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

jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts, handler) => ({ _handler: handler }),
}));

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_opts, handler) => ({ _handler: handler }),
}));

jest.mock('../../src/boutique/shared', () => ({
  REGION: 'europe-west1',
}), { virtual: true });

// ─── Module under test ────────────────────────────────────────────────────────

const {
  _test: {
    escapeHtml,
    formatDate,
    formatMoney,
    generateSupplierEmailHtml,
    getPendingOrdersForSupplier,
    buildSupplierNotificationPlan,
    sendSupplierNotificationEmail,
    loadEmailConfig,
  },
} = require('../../src/boutique/notifySupplier');

// ─── Mock-builder helpers ─────────────────────────────────────────────────────

/** Returns a mock Firestore document snapshot */
function makeDocSnap(data) {
  return { exists: data !== null && data !== undefined, data: () => data };
}

/** Returns a mock Firestore query snapshot */
function makeQuerySnap(docs) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
  };
}

/**
 * Builds a lightweight mock `db` object.
 *
 * @param {object} opts
 * @param {object[]|null} opts.orders  - docs for the orders collection query
 * @param {object|null}   opts.emailConfig - data for settings/email_config
 * @param {object|null}   opts.general    - data for settings/general
 * @param {object}        opts.suppliers  - map supplierId → data
 * @param {jest.Mock}     opts.addSpy     - optional spy for email_history.add
 */
function makeDb({
  orders = [],
  emailConfig = null,
  general = null,
  suppliers = {},
  addSpy = jest.fn().mockResolvedValue({ id: 'email_history_id' }),
} = {}) {
  const settingsDocs = {
    email_config: makeDocSnap(emailConfig),
    general: makeDocSnap(general),
  };

  function makeDocRef(collPath, docId) {
    if (collPath === 'settings') {
      return {
        get: jest.fn().mockResolvedValue(settingsDocs[docId] || makeDocSnap(null)),
        collection: jest.fn(),
      };
    }
    if (collPath === 'fournisseurs') {
      const supplierData = suppliers[docId] || null;
      return {
        get: jest.fn().mockResolvedValue(makeDocSnap(supplierData)),
        collection: jest.fn(),
      };
    }
    return {
      get: jest.fn().mockResolvedValue(makeDocSnap(null)),
      collection: jest.fn(),
    };
  }

  const ordersCollection = {
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue(makeQuerySnap(orders)),
  };

  const emailHistoryCollection = {
    add: addSpy,
  };

  const clubDocRef = {
    collection: jest.fn((name) => {
      if (name === 'orders') return ordersCollection;
      if (name === 'email_history') return emailHistoryCollection;
      // settings / fournisseurs
      return {
        doc: jest.fn((id) => makeDocRef(name, id)),
        get: jest.fn().mockResolvedValue(makeQuerySnap([])),
      };
    }),
  };

  return {
    collection: jest.fn(() => ({
      doc: jest.fn(() => clubDocRef),
    })),
    _ordersCollection: ordersCollection,
    _emailHistoryAdd: addSpy,
  };
}

// ─── Pure helper tests ────────────────────────────────────────────────────────

describe('escapeHtml()', () => {
  test('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes ampersand', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  test('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  test('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  test('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  test('does not double-escape already-safe strings', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  test('handles XSS payload', () => {
    const html = escapeHtml('<img src=x onerror="alert(1)">');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('formatMoney()', () => {
  test('formats integer', () => expect(formatMoney(25)).toBe('25.00'));
  test('formats decimal', () => expect(formatMoney(12.5)).toBe('12.50'));
  test('formats zero', () => expect(formatMoney(0)).toBe('0.00'));
  test('returns 0.00 for NaN', () => expect(formatMoney(NaN)).toBe('0.00'));
  test('returns 0.00 for Infinity', () => expect(formatMoney(Infinity)).toBe('0.00'));
  test('returns 0.00 for string', () => expect(formatMoney('abc')).toBe('0.00'));
  test('formats negative', () => expect(formatMoney(-5)).toBe('-5.00'));
});

describe('formatDate()', () => {
  test('formats a JS Date in fr-BE locale', () => {
    const result = formatDate(new Date(2026, 4, 15)); // May 15
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
  });

  test('formats a Firestore-like timestamp with toDate()', () => {
    const ts = { toDate: () => new Date(2026, 0, 1) };
    const result = formatDate(ts);
    expect(result).toMatch(/1/);
    expect(result).toMatch(/2026/);
  });

  test('returns "-" for null', () => {
    expect(formatDate(null)).toBe('-');
  });

  test('returns "-" for undefined', () => {
    expect(formatDate(undefined)).toBe('-');
  });
});

describe('generateSupplierEmailHtml()', () => {
  const baseInput = {
    supplierName: 'Supplier <Test>',
    orders: [
      {
        id: 'order1',
        orderNumber: 'BTQ-2026-0001',
        buyer: { displayName: 'Jean Dupont' },
        createdAt: new Date(2026, 4, 15),
        supplierItems: [
          {
            productId: 'p1',
            variantId: 'v1',
            qty: 2,
            unitPrice: 25.0,
            lineTotal: 50.0,
            productSnapshot: { name: 'T-shirt Calypso', variantLabel: 'Taille M' },
            supplierId: 'sup1',
          },
        ],
      },
    ],
    clubName: 'Calypso <Club>',
    logoUrl: '',
    orderCount: 1,
    itemCount: 1,
  };

  test('generates valid HTML string', () => {
    const html = generateSupplierEmailHtml(baseInput);
    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  test('escapes supplier name to prevent XSS', () => {
    const html = generateSupplierEmailHtml(baseInput);
    expect(html).not.toContain('<Test>');
    expect(html).toContain('Supplier &lt;Test&gt;');
  });

  test('escapes club name', () => {
    const html = generateSupplierEmailHtml(baseInput);
    expect(html).toContain('Calypso &lt;Club&gt;');
  });

  test('includes order number', () => {
    const html = generateSupplierEmailHtml(baseInput);
    expect(html).toContain('BTQ-2026-0001');
  });

  test('includes buyer display name (escaped)', () => {
    const html = generateSupplierEmailHtml(baseInput);
    expect(html).toContain('Jean Dupont');
  });

  test('includes product name', () => {
    const html = generateSupplierEmailHtml(baseInput);
    expect(html).toContain('T-shirt Calypso');
  });

  test('includes variant label', () => {
    const html = generateSupplierEmailHtml(baseInput);
    expect(html).toContain('Taille M');
  });

  test('includes formatted unit price', () => {
    const html = generateSupplierEmailHtml(baseInput);
    expect(html).toContain('25.00 EUR');
  });

  test('includes formatted line total', () => {
    const html = generateSupplierEmailHtml(baseInput);
    expect(html).toContain('50.00 EUR');
  });

  test('includes order + item count summary', () => {
    const html = generateSupplierEmailHtml(baseInput);
    expect(html).toContain('<strong>1</strong> commande');
    expect(html).toContain('<strong>1</strong> article');
  });

  test('uses img tag when logoUrl is provided', () => {
    const html = generateSupplierEmailHtml({ ...baseInput, logoUrl: 'https://example.com/logo.png' });
    expect(html).toContain('<img src="https://example.com/logo.png"');
  });

  test('uses h2 fallback when no logoUrl', () => {
    const html = generateSupplierEmailHtml({ ...baseInput, logoUrl: '' });
    expect(html).not.toContain('<img');
    expect(html).toContain('<h2');
  });

  test('pluralises "commandes" for multiple orders', () => {
    const input = { ...baseInput, orderCount: 3, itemCount: 5 };
    const html = generateSupplierEmailHtml(input);
    expect(html).toContain('3</strong> commandes');
    expect(html).toContain('5</strong> articles');
  });

  test('escapes XSS in product name', () => {
    const malicious = {
      ...baseInput,
      orders: [
        {
          ...baseInput.orders[0],
          supplierItems: [
            {
              ...baseInput.orders[0].supplierItems[0],
              productSnapshot: { name: '<script>alert(1)</script>', variantLabel: '' },
            },
          ],
        },
      ],
    };
    const html = generateSupplierEmailHtml(malicious);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ─── Async helper tests ───────────────────────────────────────────────────────

describe('loadEmailConfig()', () => {
  test('returns null when email_config document does not exist', async () => {
    const db = makeDb({ emailConfig: null });
    const result = await loadEmailConfig(db, 'club1');
    expect(result).toBeNull();
  });

  test('returns null when provider is not resend', async () => {
    const db = makeDb({
      emailConfig: { provider: 'sendgrid', sendgrid: { apiKey: 'key' } },
    });
    const result = await loadEmailConfig(db, 'club1');
    expect(result).toBeNull();
  });

  test('returns null when resend apiKey is missing', async () => {
    const db = makeDb({
      emailConfig: { provider: 'resend', resend: {} },
    });
    const result = await loadEmailConfig(db, 'club1');
    expect(result).toBeNull();
  });

  test('returns config object for valid resend config', async () => {
    const db = makeDb({
      emailConfig: {
        provider: 'resend',
        resend: {
          apiKey: 'test_key_123',
          fromEmail: 'noreply@calypso.be',
          fromName: 'Calypso',
        },
      },
      general: { clubName: 'Calypso Diving Club', logoUrl: 'https://logo.png' },
    });
    const result = await loadEmailConfig(db, 'club1');
    expect(result).toEqual({
      apiKey: 'test_key_123',
      fromEmail: 'noreply@calypso.be',
      fromName: 'Calypso',
      clubName: 'Calypso Diving Club',
      logoUrl: 'https://logo.png',
    });
  });

  test('uses fallback fromEmail when not set', async () => {
    const db = makeDb({
      emailConfig: {
        provider: 'resend',
        resend: { apiKey: 'key' },
      },
    });
    const result = await loadEmailConfig(db, 'club1');
    expect(result.fromEmail).toBe('onboarding@resend.dev');
  });

  test('uses clubName as fromName fallback', async () => {
    const db = makeDb({
      emailConfig: { provider: 'resend', resend: { apiKey: 'key' } },
      general: { clubName: 'Calypso Club' },
    });
    const result = await loadEmailConfig(db, 'club1');
    expect(result.fromName).toBe('Calypso Club');
    expect(result.clubName).toBe('Calypso Club');
  });
});

describe('getPendingOrdersForSupplier()', () => {
  const sup1Items = [
    { supplierId: 'sup1', productId: 'p1', variantId: 'v1', qty: 2, unitPrice: 10, lineTotal: 20 },
  ];
  const sup2Items = [
    { supplierId: 'sup2', productId: 'p2', variantId: 'v2', qty: 1, unitPrice: 5, lineTotal: 5 },
  ];

  test('returns only orders with matching supplierId items', async () => {
    const db = makeDb({
      orders: [
        { id: 'o1', data: { status: 'awaiting_payment', items: [...sup1Items, ...sup2Items] } },
        { id: 'o2', data: { status: 'awaiting_payment', items: sup2Items } },
      ],
    });
    const result = await getPendingOrdersForSupplier(db, 'club1', 'sup1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('o1');
  });

  test('supplierItems contains only items for the requested supplier', async () => {
    const db = makeDb({
      orders: [
        { id: 'o1', data: { status: 'awaiting_payment', items: [...sup1Items, ...sup2Items] } },
      ],
    });
    const result = await getPendingOrdersForSupplier(db, 'club1', 'sup1');
    expect(result[0].supplierItems).toHaveLength(1);
    expect(result[0].supplierItems[0].supplierId).toBe('sup1');
  });

  test('returns empty array when no orders match', async () => {
    const db = makeDb({
      orders: [
        { id: 'o1', data: { status: 'awaiting_payment', items: sup2Items } },
      ],
    });
    const result = await getPendingOrdersForSupplier(db, 'club1', 'sup1');
    expect(result).toHaveLength(0);
  });

  test('returns empty array when no orders exist', async () => {
    const db = makeDb({ orders: [] });
    const result = await getPendingOrdersForSupplier(db, 'club1', 'sup1');
    expect(result).toHaveLength(0);
  });

  test('handles order with no items array gracefully', async () => {
    const db = makeDb({
      orders: [
        { id: 'o1', data: { status: 'awaiting_payment' /* no items */ } },
      ],
    });
    const result = await getPendingOrdersForSupplier(db, 'club1', 'sup1');
    expect(result).toHaveLength(0);
  });

  test('queries correct statuses via where()', async () => {
    const db = makeDb({ orders: [] });
    await getPendingOrdersForSupplier(db, 'club1', 'sup1');
    const whereMock = db._ordersCollection.where;
    expect(whereMock).toHaveBeenCalledWith('status', 'in', ['awaiting_payment', 'pending']);
  });

  test('spreads order data including id and supplierItems', async () => {
    const db = makeDb({
      orders: [
        {
          id: 'o1',
          data: {
            status: 'awaiting_payment',
            orderNumber: 'BTQ-2026-0001',
            items: sup1Items,
          },
        },
      ],
    });
    const result = await getPendingOrdersForSupplier(db, 'club1', 'sup1');
    expect(result[0].id).toBe('o1');
    expect(result[0].orderNumber).toBe('BTQ-2026-0001');
    expect(result[0].supplierItems).toBeDefined();
  });
});

describe('buildSupplierNotificationPlan()', () => {
  const makeSupplier = (mode, minItems = 0) => ({
    name: 'Test Supplier',
    email: 'supplier@test.com',
    boutique_config: {
      notification_strategy: {
        mode,
        threshold: { min_items: minItems },
      },
    },
  });

  test('returns correct plan shape', async () => {
    const db = makeDb({ orders: [] });
    const plan = await buildSupplierNotificationPlan(db, 'club1', 'sup1', makeSupplier('manual'));
    expect(plan).toMatchObject({
      supplierId: 'sup1',
      clubId: 'club1',
      mode: 'manual',
      pendingItemsCount: expect.any(Number),
      pendingOrdersCount: expect.any(Number),
      thresholdReached: expect.any(Boolean),
      readyToSend: expect.any(Boolean),
    });
  });

  test('pendingItemsCount reflects actual item count', async () => {
    const db = makeDb({
      orders: [
        {
          id: 'o1',
          data: {
            status: 'awaiting_payment',
            items: [
              { supplierId: 'sup1', qty: 1, unitPrice: 10, lineTotal: 10 },
              { supplierId: 'sup1', qty: 2, unitPrice: 5, lineTotal: 10 },
            ],
          },
        },
      ],
    });
    const plan = await buildSupplierNotificationPlan(db, 'club1', 'sup1', makeSupplier('threshold', 2));
    expect(plan.pendingItemsCount).toBe(2); // 2 line items for sup1
    expect(plan.pendingOrdersCount).toBe(1);
  });

  test('thresholdReached is true when items >= min_items', async () => {
    const db = makeDb({
      orders: [
        {
          id: 'o1',
          data: {
            status: 'awaiting_payment',
            items: [
              { supplierId: 'sup1', qty: 1, unitPrice: 10, lineTotal: 10 },
              { supplierId: 'sup1', qty: 1, unitPrice: 10, lineTotal: 10 },
              { supplierId: 'sup1', qty: 1, unitPrice: 10, lineTotal: 10 },
            ],
          },
        },
      ],
    });
    const plan = await buildSupplierNotificationPlan(db, 'club1', 'sup1', makeSupplier('threshold', 3));
    expect(plan.thresholdReached).toBe(true);
  });

  test('thresholdReached is false when items < min_items', async () => {
    const db = makeDb({
      orders: [
        {
          id: 'o1',
          data: {
            status: 'awaiting_payment',
            items: [{ supplierId: 'sup1', qty: 1, unitPrice: 10, lineTotal: 10 }],
          },
        },
      ],
    });
    const plan = await buildSupplierNotificationPlan(db, 'club1', 'sup1', makeSupplier('threshold', 5));
    expect(plan.thresholdReached).toBe(false);
  });

  test('thresholdReached is true when threshold is 0 (no threshold configured)', async () => {
    const db = makeDb({ orders: [] });
    const plan = await buildSupplierNotificationPlan(db, 'club1', 'sup1', makeSupplier('manual', 0));
    expect(plan.thresholdReached).toBe(true);
  });

  test('defaults mode to "manual" when boutique_config is missing', async () => {
    const db = makeDb({ orders: [] });
    const plan = await buildSupplierNotificationPlan(db, 'club1', 'sup1', {});
    expect(plan.mode).toBe('manual');
  });
});

describe('sendSupplierNotificationEmail()', () => {
  const emailConfig = {
    apiKey: 'resend_key',
    fromEmail: 'noreply@calypso.be',
    fromName: 'Calypso',
    clubName: 'Calypso Diving Club',
    logoUrl: '',
  };

  const supplierWithEmail = {
    name: 'Acme Supplies',
    email: 'acme@example.com',
  };

  const supplierNoEmail = {
    name: 'No Contact',
    // no email field
  };

  const orderWithItems = {
    id: 'o1',
    data: {
      status: 'awaiting_payment',
      orderNumber: 'BTQ-2026-0001',
      buyer: { displayName: 'Jean Dupont' },
      createdAt: new Date(2026, 4, 15),
      items: [
        {
          supplierId: 'sup1',
          productId: 'p1',
          variantId: 'v1',
          qty: 1,
          unitPrice: 20,
          lineTotal: 20,
          productSnapshot: { name: 'T-shirt', variantLabel: 'S' },
        },
      ],
    },
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: 'resend_msg_id' }),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('returns NO_SUPPLIER_EMAIL when supplier has no email', async () => {
    const db = makeDb({ orders: [orderWithItems] });
    const result = await sendSupplierNotificationEmail(db, 'club1', 'sup1', supplierNoEmail, emailConfig);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('NO_SUPPLIER_EMAIL');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns NO_PENDING_ORDERS when no orders exist', async () => {
    const db = makeDb({ orders: [] });
    const result = await sendSupplierNotificationEmail(db, 'club1', 'sup1', supplierWithEmail, emailConfig);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('NO_PENDING_ORDERS');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('calls Resend API with correct params when orders exist', async () => {
    const db = makeDb({ orders: [orderWithItems] });
    await sendSupplierNotificationEmail(db, 'club1', 'sup1', supplierWithEmail, emailConfig);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer resend_key',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.to).toBe('acme@example.com');
    expect(body.from).toBe('Calypso <noreply@calypso.be>');
    expect(body.subject).toContain('Récapitulatif');
    expect(body.html).toContain('<!DOCTYPE html>');
  });

  test('returns sent=true with messageId on success', async () => {
    const db = makeDb({ orders: [orderWithItems] });
    const result = await sendSupplierNotificationEmail(db, 'club1', 'sup1', supplierWithEmail, emailConfig);
    expect(result.sent).toBe(true);
    expect(result.messageId).toBe('resend_msg_id');
    expect(result.orderCount).toBe(1);
    expect(result.itemCount).toBe(1);
  });

  test('logs email to email_history collection', async () => {
    const addSpy = jest.fn().mockResolvedValue({ id: 'history_id' });
    const db = makeDb({ orders: [orderWithItems], addSpy });
    await sendSupplierNotificationEmail(db, 'club1', 'sup1', supplierWithEmail, emailConfig);

    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'acme@example.com',
        supplierId: 'sup1',
        emailType: 'supplier_order_digest',
        status: 'sent',
        messageId: 'resend_msg_id',
        orderCount: 1,
        itemCount: 1,
        clubId: 'club1',
      }),
    );
  });

  test('throws when Resend API returns non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ message: 'Invalid API key' }),
    });

    const db = makeDb({ orders: [orderWithItems] });
    await expect(
      sendSupplierNotificationEmail(db, 'club1', 'sup1', supplierWithEmail, emailConfig),
    ).rejects.toThrow('Invalid API key');
  });

  test('email subject contains singular "commande" for 1 order', async () => {
    const db = makeDb({ orders: [orderWithItems] });
    await sendSupplierNotificationEmail(db, 'club1', 'sup1', supplierWithEmail, emailConfig);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.subject).toContain('1 commande en attente');
    expect(body.subject).not.toContain('commandes');
  });

  test('email subject uses plural "commandes" for multiple orders', async () => {
    const order2 = {
      id: 'o2',
      data: {
        status: 'awaiting_payment',
        items: [{ supplierId: 'sup1', qty: 1, unitPrice: 5, lineTotal: 5 }],
      },
    };
    const db = makeDb({ orders: [orderWithItems, order2] });
    await sendSupplierNotificationEmail(db, 'club1', 'sup1', supplierWithEmail, emailConfig);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.subject).toContain('2 commandes en attente');
  });
});
