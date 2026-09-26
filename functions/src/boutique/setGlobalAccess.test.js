const {
  BOUTIQUE_ACCESS_WORK_ITEM,
  BOUTIQUE_CONTROL_FIELDS,
  REQUIRED_BOUTIQUE_VERSION,
  buildBoutiqueAccessState,
  setBoutiqueGlobalAccessHandler,
} = require('./setGlobalAccess');

class MemoryDocumentReference {
  constructor(firestore, path) {
    this.firestore = firestore;
    this.path = path;
    this.id = path.split('/').at(-1);
  }

  collection(name) {
    return new MemoryCollectionReference(this.firestore, `${this.path}/${name}`);
  }
}

class MemoryCollectionReference {
  constructor(firestore, path) {
    this.firestore = firestore;
    this.path = path;
  }

  doc(id) {
    const documentId = id || `auto-${++this.firestore.autoId}`;
    return new MemoryDocumentReference(
      this.firestore,
      `${this.path}/${documentId}`,
    );
  }
}

class MemorySnapshot {
  constructor(value) {
    this.exists = value !== undefined;
    this.value = value;
  }

  data() {
    return clone(this.value);
  }
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value instanceof Date) return new Date(value.getTime());
  if (!value || typeof value !== 'object') return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, clone(item)]),
  );
}

class MemoryFirestore {
  constructor(seed = {}, options = {}) {
    this.docs = new Map(
      Object.entries(seed).map(([path, value]) => [path, clone(value)]),
    );
    this.options = options;
    this.autoId = 0;
    this.transactions = 0;
    this.commits = 0;
    this.reads = [];
  }

  collection(name) {
    return new MemoryCollectionReference(this, name);
  }

  async runTransaction(callback) {
    this.transactions += 1;
    if (this.options.beforeTransaction) this.options.beforeTransaction(this);
    const writes = [];
    const transaction = {
      get: async (reference) => {
        this.reads.push(reference.path);
        return new MemorySnapshot(this.docs.get(reference.path));
      },
      set: (reference, value, options) => {
        writes.push({
          type: 'set',
          path: reference.path,
          value: clone(value),
          options,
        });
      },
      create: (reference, value) => {
        writes.push({ type: 'create', path: reference.path, value: clone(value) });
      },
    };

    const result = await callback(transaction);
    if (this.options.failCommit) throw new Error('simulated-atomic-commit-failure');

    const next = new Map(
      [...this.docs].map(([path, value]) => [path, clone(value)]),
    );
    for (const write of writes) {
      if (write.type === 'create' && next.has(write.path)) {
        throw new Error(`already-exists:${write.path}`);
      }
      if (write.type === 'set' && write.options && write.options.mergeFields) {
        const current = clone(next.get(write.path) || {});
        for (const field of write.options.mergeFields) {
          current[field] = clone(write.value[field]);
        }
        next.set(write.path, current);
      } else {
        next.set(write.path, clone(write.value));
      }
    }
    this.docs = next;
    this.commits += 1;
    return result;
  }

  value(path) {
    return clone(this.docs.get(path));
  }

  matching(prefix) {
    return [...this.docs.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, value]) => ({ path, value: clone(value) }));
  }
}

const clubId = 'calypso';
const uid = 'admin-1';
const memberPath = `clubs/${clubId}/members/${uid}`;
const sessionPath = `clubs/${clubId}/sessions/${uid}`;
const flagsPath = `clubs/${clubId}/settings/feature_flags`;
const versionPath = 'settings/app_version';
const auditPrefix = `clubs/${clubId}/audit_logs/`;
const now = new Date('2026-09-26T12:00:00.000Z');
const serverTimestamp = Object.freeze({ serverTimestamp: true });

function timestamp(value) {
  return { toMillis: () => new Date(value).getTime() };
}

function seed(overrides = {}) {
  return {
    [memberPath]: {
      app_role: 'admin',
      email: 'server-member@example.test',
      prenom: 'Ada',
      nom: 'Admin',
    },
    [sessionPath]: {
      isActive: true,
      expiresAt: timestamp('2026-09-26T13:00:00.000Z'),
    },
    [versionPath]: { minSupportedVersion: REQUIRED_BOUTIQUE_VERSION },
    [flagsPath]: {
      boutiqueEnabled: false,
      boutiqueMobileEnabled: false,
      boutiqueAdminOnly: false,
      boutiqueAccess: 'masque',
      boutiqueSections: {
        produits: 'masque',
        panier: 'masque',
        commandes: 'masque',
        cotisation: 'masque',
        pretsMateriel: 'masque',
        obsolete: 'preserve-never',
      },
      carnetFormationEnabled: true,
    },
    ...overrides,
  };
}

function request(mode = 'tous', data = {}) {
  return {
    auth: { uid, token: { email: 'untrusted-token@example.test' } },
    data: { clubId, mode, ...data },
  };
}

function run(db, input = request()) {
  return setBoutiqueGlobalAccessHandler(input, {
    db,
    now,
    serverTimestamp: () => serverTimestamp,
  });
}

function expectNoWrites(db, original) {
  expect([...db.docs.entries()]).toEqual([...original.entries()]);
  expect(db.matching(auditPrefix)).toHaveLength(0);
  expect(db.commits).toBe(0);
}

describe('setBoutiqueGlobalAccess callable contract', () => {
  test('rejects unauthenticated and non-admin actors without writes', async () => {
    const unauthenticated = new MemoryFirestore(seed());
    const unauthenticatedOriginal = new Map(unauthenticated.docs);
    await expect(run(unauthenticated, { data: { clubId, mode: 'tous' } }))
      .rejects.toMatchObject({ code: 'unauthenticated' });
    expectNoWrites(unauthenticated, unauthenticatedOriginal);

    const nonAdmin = new MemoryFirestore(
      seed({
        [memberPath]: { app_role: 'user', email: 'ordinary@example.test' },
      }),
    );
    const nonAdminOriginal = new Map(nonAdmin.docs);
    await expect(run(nonAdmin)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expectNoWrites(nonAdmin, nonAdminOriginal);
  });

  test('rejects inactive or expired sessions without writes', async () => {
    for (const session of [
      { isActive: false, expiresAt: timestamp('2026-09-26T13:00:00.000Z') },
      { isActive: true, expiresAt: timestamp('2026-09-26T12:00:00.000Z') },
      { isActive: true },
    ]) {
      const db = new MemoryFirestore(seed({ [sessionPath]: session }));
      const original = new Map(db.docs);
      await expect(run(db)).rejects.toMatchObject({ code: 'permission-denied' });
      expectNoWrites(db, original);
    }
  });

  test('allows the existing missing-session semantics', async () => {
    const data = seed();
    delete data[sessionPath];
    data[memberPath].app_role = 'superadmin';
    const db = new MemoryFirestore(data);
    await expect(run(db, request('testeurs'))).resolves.toMatchObject({
      success: true,
      changed: true,
    });
  });

  test('strictly rejects extra, missing, invalid and actor-smuggling payload fields', async () => {
    const invalidPayloads = [
      { clubId, mode: 'tous', actor: { uid: 'someone-else' } },
      { clubId, mode: 'tous', audit: {} },
      { clubId, mode: 'tous', boutiqueSections: {} },
      { clubId, mode: 'masque' },
      { clubId: 'bad/club', mode: 'tous' },
      { clubId: ' calypso', mode: 'tous' },
      { clubId },
      null,
    ];
    for (const data of invalidPayloads) {
      const db = new MemoryFirestore(seed());
      const original = new Map(db.docs);
      await expect(run(db, { auth: { uid }, data }))
        .rejects.toMatchObject({ code: 'invalid-argument' });
      expectNoWrites(db, original);
    }
  });

  test.each([
    null,
    'not-semver',
    '1.22.9',
    '01.23.0',
    '1.23',
    '1.23.0-beta',
  ])(
    'blocks online atomically for minimum version %p',
    async (minimum) => {
      const db = new MemoryFirestore(seed({
        [versionPath]: { minSupportedVersion: minimum },
      }));
      const original = new Map(db.docs);
      await expect(run(db)).rejects.toMatchObject({
        code: 'failed-precondition',
        details: {
          reason: 'boutique-min-version',
          minSupportedVersion: minimum,
          requiredVersion: '1.23.0',
        },
      });
      expectNoWrites(db, original);
    },
  );

  test('rereads and blocks a version lowered after UI preflight', async () => {
    const db = new MemoryFirestore(
      seed({
        [versionPath]: { minSupportedVersion: '9.0.0' },
      }),
      {
        beforeTransaction: (store) => {
          store.docs.set(versionPath, { minSupportedVersion: '1.22.9' });
        },
      },
    );
    await expect(run(db)).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'boutique-min-version' },
    });
    expect(db.value(flagsPath).boutiqueAccess).toBe('masque');
    expect(db.matching(auditPrefix)).toHaveLength(0);
  });

  test.each(['1.23.0', '1.23.1', '1.24.0', '2.0.0'])(
    'allows online when minimum version is %s',
    async (minimum) => {
      const db = new MemoryFirestore(seed({
        [versionPath]: { minSupportedVersion: minimum },
      }));
      await expect(run(db)).resolves.toMatchObject({
        success: true,
        changed: true,
        state: buildBoutiqueAccessState('tous'),
      });
    },
  );

  test('preparation works on an old version and commits exact state plus bound audit', async () => {
    const db = new MemoryFirestore(seed({
      [versionPath]: { minSupportedVersion: '1.0.0' },
    }));

    const result = await run(db, request('testeurs'));
    const target = buildBoutiqueAccessState('testeurs');
    expect(db.reads).toEqual([
      memberPath,
      sessionPath,
      versionPath,
      flagsPath,
    ]);
    expect(result).toEqual({ success: true, changed: true, state: target });
    expect(db.value(flagsPath)).toEqual({
      ...target,
      carnetFormationEnabled: true,
    });
    expect(Object.keys(db.value(flagsPath).boutiqueSections).sort())
      .toEqual(['commandes', 'cotisation', 'panier', 'pretsMateriel', 'produits']);

    const audits = db.matching(auditPrefix);
    expect(audits).toHaveLength(1);
    expect(audits[0].value).toEqual({
      action: 'boutique.access.preparation_enabled',
      userId: uid,
      userEmail: 'server-member@example.test',
      userName: 'Ada Admin',
      targetId: 'feature_flags',
      targetType: 'boutique_settings',
      targetName: 'Boutique',
      previousValue: {
        boutiqueEnabled: false,
        boutiqueMobileEnabled: false,
        boutiqueAdminOnly: false,
        boutiqueAccess: 'masque',
        boutiqueSections: {
          produits: 'masque',
          panier: 'masque',
          commandes: 'masque',
          cotisation: 'masque',
          pretsMateriel: 'masque',
        },
      },
      newValue: target,
      clubId,
      timestamp: serverTimestamp,
      mode: 'testeurs',
      requiredVersion: REQUIRED_BOUTIQUE_VERSION,
      workItemId: BOUTIQUE_ACCESS_WORK_ITEM,
    });
    expect(Object.keys(result.state)).toEqual(BOUTIQUE_CONTROL_FIELDS);
  });

  test('exact replay is idempotent and creates no duplicate audit', async () => {
    const db = new MemoryFirestore(seed());
    await expect(run(db)).resolves.toMatchObject({ changed: true });
    await expect(run(db)).resolves.toEqual({
      success: true,
      changed: false,
      state: buildBoutiqueAccessState('tous'),
    });
    expect(db.matching(auditPrefix)).toHaveLength(1);
  });

  test('settings and audit are committed together or not at all', async () => {
    const db = new MemoryFirestore(seed(), { failCommit: true });
    const original = new Map(db.docs);
    await expect(run(db)).rejects.toThrow('simulated-atomic-commit-failure');
    expectNoWrites(db, original);
  });
});
