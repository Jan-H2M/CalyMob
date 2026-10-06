const {
  buildBoutiqueOrderTemplateData,
  createBoutiqueOrderHandler,
} = require('./createOrder');

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== 'object') return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
}

function field(value, path) {
  return path.split('.').reduce((current, key) => current && current[key], value);
}

class Snapshot {
  constructor(reference, value) {
    this.ref = reference;
    this.id = reference.id;
    this.exists = value !== undefined;
    this.value = value;
  }

  data() { return clone(this.value); }
  get(path) { return field(this.value, path); }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
  }
}

class DocumentReference {
  constructor(store, path) {
    this.firestore = store;
    this.store = store;
    this.path = path;
    this.id = path.split('/').at(-1);
  }

  collection(name) { return new CollectionReference(this.store, `${this.path}/${name}`); }
  async get() { return new Snapshot(this, this.store.docs.get(this.path)); }
  async update(value) { this.store.applyUpdate(this.path, value); }
}

class CollectionReference {
  constructor(store, path, filters = [], limitValue = null) {
    this.firestore = store;
    this.store = store;
    this.path = path;
    this.filters = filters;
    this.limitValue = limitValue;
  }

  doc(id) {
    const documentId = id || `auto-${++this.store.autoId}`;
    return new DocumentReference(this.store, `${this.path}/${documentId}`);
  }

  where(path, operator, value) {
    return new CollectionReference(this.store, this.path, [...this.filters, { path, operator, value }], this.limitValue);
  }

  limit(value) { return new CollectionReference(this.store, this.path, this.filters, value); }
}

class MemoryFirestore {
  constructor(seed) {
    this.docs = new Map(Object.entries(seed).map(([path, value]) => [path, clone(value)]));
    this.autoId = 0;
  }

  collection(name) { return new CollectionReference(this, name); }

  querySnapshot(query) {
    const prefix = `${query.path}/`;
    let docs = [...this.docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, value]) => new Snapshot(new DocumentReference(this, path), value));
    for (const filter of query.filters) {
      docs = docs.filter((doc) => {
        const actual = doc.get(filter.path);
        if (filter.operator === '==') return actual === filter.value;
        if (filter.operator === '>=') return actual >= filter.value;
        if (filter.operator === '<=') return actual <= filter.value;
        throw new Error(`unsupported operator ${filter.operator}`);
      });
    }
    if (query.limitValue !== null) docs = docs.slice(0, query.limitValue);
    return new QuerySnapshot(docs);
  }

  applyUpdate(path, patch) {
    const current = clone(this.docs.get(path) || {});
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.');
      let target = current;
      while (parts.length > 1) {
        const part = parts.shift();
        target[part] = target[part] || {};
        target = target[part];
      }
      target[parts[0]] = clone(value);
    }
    this.docs.set(path, current);
  }

  async runTransaction(callback) {
    const writes = [];
    const transaction = {
      get: async (reference) => reference instanceof CollectionReference
        ? this.querySnapshot(reference)
        : new Snapshot(reference, this.docs.get(reference.path)),
      set: (reference, value, options) => writes.push({ type: 'set', reference, value, options }),
      update: (reference, value) => writes.push({ type: 'update', reference, value }),
    };
    const result = await callback(transaction);
    for (const write of writes) {
      if (write.type === 'update') {
        this.applyUpdate(write.reference.path, write.value);
      } else if (write.options?.merge) {
        this.docs.set(write.reference.path, { ...clone(this.docs.get(write.reference.path) || {}), ...clone(write.value) });
      } else {
        this.docs.set(write.reference.path, clone(write.value));
      }
    }
    return result;
  }
}

const clubId = 'calypso';
const uid = 'member-1';
const productPath = `clubs/${clubId}/products/product-1`;
const memberPath = `clubs/${clubId}/members/${uid}`;
const flagsPath = `clubs/${clubId}/settings/feature_flags`;
const now = { toMillis: () => Date.parse('2026-10-04T12:00:00.000Z'), toDate: () => new Date('2026-10-04T12:00:00.000Z') };

function product(visibility = 'published') {
  return {
    visibility,
    name: 'Polo',
    category: 'textile',
    inventoryMode: 'tracked',
    supplierId: 'supplier-1',
    deliveryModes: ['pool_pickup'],
    pricing: { salePrice: 25 },
    variants: [{
      id: 'size-m',
      label: 'M',
      attributes: { color: 'Bleu marine', gender: 'Femme' },
      stockCount: 5,
    }],
  };
}

function seed(visibility = 'published') {
  return {
    [productPath]: product(visibility),
    [memberPath]: {
      member_status: 'active',
      email: 'canonical@example.test',
      prenom: 'Ada',
      nom: 'Member',
      phoneNumber: '+32470000000',
    },
    [flagsPath]: {
      boutiqueEnabled: true,
      boutiqueMobileEnabled: true,
      boutiqueAccess: 'tous',
    },
  };
}

function request(overrides = {}) {
  return {
    auth: { uid },
    data: {
      clubId,
      buyer: {
        email: 'attacker@example.test',
        displayName: 'Attacker',
        memberId: 'someone-else',
      },
      deferPaymentEmail: true,
      idempotencyKey: 'checkout-1234567890',
      items: [{ productId: 'product-1', variantId: 'size-m', qty: 2 }],
      ...overrides,
    },
  };
}

function run(db, input = request(), overrides = {}) {
  return createBoutiqueOrderHandler(input, {
    db,
    timestampNow: () => now,
    timestampFromMillis: (value) => ({ toMillis: () => value, toDate: () => new Date(value) }),
    serverTimestamp: () => ({ serverTimestamp: true }),
    randomUUID: () => 'line-uuid',
    qrToDataURL: async () => 'data:image/png;base64,qr',
    resolveClubBankSettings: async () => ({ iban: 'BE68539007547034', beneficiary: 'Calypso' }),
    assertBoutiqueAccess: async () => ({
      memberId: uid,
      member: {
        email: 'canonical@example.test',
        prenom: 'Ada',
        nom: 'Member',
        phoneNumber: '+32470000000',
      },
    }),
    ...overrides,
  });
}

describe('createBoutiqueOrder callable transaction', () => {
  test('uses the immutable product snapshot name in payment emails', () => {
    const templateData = buildBoutiqueOrderTemplateData({
      orderNumber: 'BTQ-2026-0039',
      buyer: { displayName: 'Jan ANDRIESSENS', email: 'canonical@example.test' },
      payment: { amount: 20, communication: '+++BTQ-2026-0039+++' },
      items: [{
        productId: 'Vb3iVyPXR8IA8JTVNS9Q',
        qty: 1,
        deliveryMode: 'pool_pickup',
        productSnapshot: {
          name: 'Softshell Calypso',
          variantLabel: 'M',
          variantAttributes: { color: 'Bleu marine', gender: 'Femme' },
          customizations: {
            technique: 'embroidery',
            clubLogo: { enabled: true, zone: 'coeur' },
            name: { text: 'Jan', zone: 'manche droite' },
            certification: { value: 'P3', zone: 'manche gauche' },
          },
        },
      }],
    }, { clubName: 'Calypso Diving Club', logoUrl: '' });

    expect(templateData.items).toEqual([
      {
        name: 'Softshell Calypso · M · Bleu marine · Femme · Broderie: logo club (coeur), nom « Jan » (manche droite), brevet P3 (manche gauche) · Retrait piscine',
        quantity: 1,
      },
    ]);
    expect(templateData.qrCodeImage).toBe('cid:qrcode');
    expect(JSON.stringify(templateData)).not.toContain('Vb3iVyPXR8IA8JTVNS9Q');
  });

  test('does not duplicate attributes already present in a composite variant label', () => {
    const templateData = buildBoutiqueOrderTemplateData({
      orderNumber: 'BTQ-2026-0041',
      buyer: { displayName: 'Jan ANDRIESSENS' },
      payment: { amount: 67 },
      items: [{
        qty: 1,
        productSnapshot: {
          name: 'Softshell Calypso',
          variantLabel: 'M · Bleu marine · Femme',
          variantAttributes: { color: 'Bleu marine', gender: 'Femme' },
        },
      }],
    }, { clubName: 'Calypso Diving Club', logoUrl: '' });

    expect(templateData.items[0].name).toBe('Softshell Calypso · M · Bleu marine · Femme');
  });

  test('keeps short attributes that merely occur inside another word', () => {
    const templateData = buildBoutiqueOrderTemplateData({
      orderNumber: 'BTQ-2026-0042',
      buyer: { displayName: 'Jan ANDRIESSENS' },
      payment: { amount: 67 },
      items: [{
        qty: 1,
        productSnapshot: {
          name: 'Softshell Calypso',
          variantLabel: 'Bleu marine',
          variantAttributes: { size: 'M', gender: 'Femme' },
        },
      }],
    }, { clubName: 'Calypso Diving Club', logoUrl: '' });

    expect(templateData.items[0].name).toBe('Softshell Calypso · Bleu marine · M · Femme');
  });

  test.each(['draft', 'archived', null])('rejects visibility %p without writes', async (visibility) => {
    const db = new MemoryFirestore(seed(visibility));
    const before = clone([...db.docs]);
    await expect(run(db)).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { code: 'PRODUCT_NOT_PUBLISHED' },
    });
    expect(clone([...db.docs])).toEqual(before);
  });

  test('snapshots variant attributes for complete immutable order details', async () => {
    const db = new MemoryFirestore(seed());
    await run(db);
    const order = [...db.docs.entries()].find(([path]) => /\/orders\//.test(path))[1];

    expect(order.items[0].productSnapshot).toMatchObject({
      variantLabel: 'M',
      variantAttributes: { color: 'Bleu marine', gender: 'Femme' },
    });
  });

  test('commits canonical buyer identity, inventory reservation and payment snapshot atomically', async () => {
    const db = new MemoryFirestore(seed());
    const result = await run(db);
    expect(result).toMatchObject({ success: true, total: 50 });
    expect(result).not.toHaveProperty('duplicate');

    const orders = [...db.docs.entries()].filter(([path]) => /\/orders\//.test(path));
    expect(orders).toHaveLength(1);
    expect(orders[0][1]).toMatchObject({
      buyer: {
        userId: uid,
        memberId: uid,
        displayName: 'Ada Member',
        email: 'canonical@example.test',
        phone: '+32470000000',
      },
      pricing: { total: 50 },
      status: 'awaiting_payment',
      idempotencyKey: 'checkout-1234567890',
    });
    expect(db.docs.get(productPath).variants[0].stockCount).toBe(3);
    expect([...db.docs.keys()].filter((path) => /\/inventoryMutations\//.test(path))).toHaveLength(1);
  });

  test('replays the same buyer idempotency key without a second order or stock reservation', async () => {
    const db = new MemoryFirestore(seed());
    const first = await run(db);
    const second = await run(db);
    expect(second).toMatchObject({ success: true, duplicate: true, orderId: first.orderId });
    expect([...db.docs.keys()].filter((path) => /\/orders\//.test(path))).toHaveLength(1);
    expect([...db.docs.keys()].filter((path) => /\/inventoryMutations\//.test(path))).toHaveLength(1);
    expect(db.docs.get(productPath).variants[0].stockCount).toBe(3);
  });

  test('denies a replay when transactional membership is no longer authorized', async () => {
    const db = new MemoryFirestore(seed());
    await run(db);
    db.docs.set(memberPath, { ...db.docs.get(memberPath), member_status: 'inactive' });

    await expect(run(db)).rejects.toMatchObject({ code: 'permission-denied' });
    expect([...db.docs.keys()].filter((path) => /\/orders\//.test(path))).toHaveLength(1);
    expect(db.docs.get(productPath).variants[0].stockCount).toBe(3);
  });

  test('revalidates tester responsibility and feature flags inside the transaction', async () => {
    const scenarios = [
      {
        member: { ...seed()[memberPath], clubStatuten: [] },
        flags: { boutiqueEnabled: true, boutiqueAccess: 'testeurs' },
      },
      {
        member: { ...seed()[memberPath], clubStatuten: ['Responsable boutique'] },
        flags: { boutiqueEnabled: false, boutiqueMobileEnabled: false, boutiqueAccess: 'testeurs' },
      },
    ];

    for (const scenario of scenarios) {
      const data = seed();
      data[memberPath] = scenario.member;
      data[flagsPath] = scenario.flags;
      const db = new MemoryFirestore(data);
      const before = clone([...db.docs]);
      await expect(run(db)).rejects.toMatchObject({ code: 'permission-denied' });
      expect(clone([...db.docs])).toEqual(before);
    }
  });

  test('rolls back every write when stock is insufficient', async () => {
    const data = seed();
    data[productPath].variants[0].stockCount = 1;
    const db = new MemoryFirestore(data);
    const before = clone([...db.docs]);
    await expect(run(db)).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { code: 'OUT_OF_STOCK', available: 1, requested: 2 },
    });
    expect(clone([...db.docs])).toEqual(before);
  });

  test('sends the payment email only after the order transaction commits', async () => {
    const db = new MemoryFirestore(seed());
    const sentAt = { toDate: () => new Date('2026-10-04T12:00:01.000Z') };
    const sendBoutiqueOrderEmail = jest.fn(async ({ orderRef, order }) => {
      expect(db.docs.has(orderRef.path)).toBe(true);
      expect(order).toMatchObject({ buyer: { email: 'canonical@example.test' } });
      return sentAt;
    });

    const result = await run(db, request({ deferPaymentEmail: false }), { sendBoutiqueOrderEmail });

    expect(sendBoutiqueOrderEmail).toHaveBeenCalledTimes(1);
    expect(result.payment).toMatchObject({
      emailStatus: 'sent',
      emailSentAt: '2026-10-04T12:00:01.000Z',
    });
  });
});
