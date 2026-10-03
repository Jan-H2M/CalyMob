const {
  canonicalMemberName,
  operationOrganizerTriggerHandler,
  writeOperationHandler,
} = require('./operationOrganizer');

class Ref {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split('/').at(-1);
  }
  collection(name) { return new Collection(this.db, `${this.path}/${name}`); }
  async get() { return new Snapshot(this, this.db.docs.get(this.path)); }
  async set(value) { this.db.docs.set(this.path, { ...value }); }
  async update(value) {
    const next = { ...(this.db.docs.get(this.path) || {}) };
    for (const [key, item] of Object.entries(value)) {
      if (item === DELETE) delete next[key];
      else next[key] = item;
    }
    this.db.docs.set(this.path, next);
    this.db.updates.push({ path: this.path, value });
  }
}

class Collection {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id = `auto-${++this.db.autoId}`) { return new Ref(this.db, `${this.path}/${id}`); }
}

class Snapshot {
  constructor(ref, value) { this.ref = ref; this.value = value; this.exists = value !== undefined; }
  data() { return this.value; }
}

class MemoryDb {
  constructor(seed = {}) {
    this.docs = new Map(Object.entries(seed));
    this.autoId = 0;
    this.updates = [];
  }
  collection(name) { return new Collection(this, name); }
  async runTransaction(callback) {
    const writes = [];
    const transaction = {
      get: (ref) => ref.get(),
      create: (ref, value) => writes.push(() => ref.set(value)),
      update: (ref, value) => writes.push(() => ref.update(value)),
    };
    const result = await callback(transaction);
    for (const write of writes) await write();
    return result;
  }
}

const NOW = new Date('2026-10-03T14:00:00.000Z');
const SERVER_TIME = Object.freeze({ server: true });
const DELETE = Object.freeze({ delete: true });
const deps = (db) => ({
  db,
  now: NOW,
  Timestamp: { fromMillis: (millis) => ({ millis }) },
  serverTimestamp: () => SERVER_TIME,
  deleteField: () => DELETE,
});
const member = (role, first, last, extra = {}) => ({
  app_role: role,
  first_name: first,
  last_name: last,
  ...extra,
});
const baseFields = {
  type: 'evenement',
  titre: 'Barrages',
  statut: 'brouillon',
  date_debut: { __timestamp_ms: 1791072000000 },
};

describe('writeOperation server authority', () => {
  test('creates with canonical member identity and immutable authenticated creator', async () => {
    const db = new MemoryDb({
      'clubs/calypso/members/admin': member('admin', 'Ada', 'Admin'),
      'clubs/calypso/members/target': member('membre', 'Philippe', 'CANO'),
    });
    const result = await writeOperationHandler({
      auth: { uid: 'admin' },
      data: { action: 'create', clubId: 'calypso', organizerId: 'target', fields: baseFields },
    }, deps(db));
    const stored = db.docs.get(`clubs/calypso/operations/${result.operationId}`);
    expect(stored).toMatchObject({
      organisateur_id: 'target',
      organisateur_nom: 'Philippe CANO',
      creator_user_id: 'admin',
      date_debut: { millis: 1791072000000 },
    });
  });

  test('ordinary members cannot create for another member', async () => {
    const db = new MemoryDb({
      'clubs/calypso/members/ordinary': member('user', 'Ordinary', 'Member'),
      'clubs/calypso/members/target': member('membre', 'Target', 'Member'),
    });
    await expect(writeOperationHandler({
      auth: { uid: 'ordinary' },
      data: { action: 'create', clubId: 'calypso', organizerId: 'target', fields: baseFields },
    }, deps(db))).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('handover is narrow, canonical and keeps creator unchanged', async () => {
    const db = new MemoryDb({
      'clubs/calypso/members/current': member('user', 'Current', 'Owner'),
      'clubs/calypso/members/target': member('membre', 'New', 'Owner'),
      'clubs/calypso/operations/event-1': {
        ...baseFields,
        organisateur_id: 'current',
        organisateur_nom: 'Current Owner',
        creator_user_id: 'creator',
      },
    });
    await writeOperationHandler({
      auth: { uid: 'current' },
      data: {
        action: 'handover',
        clubId: 'calypso',
        operationId: 'event-1',
        organizerId: 'target',
        source: 'calycompta_web',
      },
    }, deps(db));
    expect(db.docs.get('clubs/calypso/operations/event-1')).toMatchObject({
      organisateur_id: 'target',
      organisateur_nom: 'New Owner',
      creator_user_id: 'creator',
      organizer_last_action_by: 'current',
    });
  });

  test('non-elevated actors cannot hand over non-event operations', async () => {
    const db = new MemoryDb({
      'clubs/calypso/members/current': member('user', 'Current', 'Owner'),
      'clubs/calypso/members/target': member('membre', 'New', 'Owner'),
      'clubs/calypso/operations/caution-1': {
        ...baseFields,
        type: 'caution',
        organisateur_id: 'current',
        organisateur_nom: 'Current Owner',
        creator_user_id: 'current',
      },
    });
    await expect(writeOperationHandler({
      auth: { uid: 'current' },
      data: {
        action: 'handover',
        clubId: 'calypso',
        operationId: 'caution-1',
        organizerId: 'target',
      },
    }, deps(db))).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('organizer integrity trigger', () => {
  test('repairs a stale name once and records an attributed handover', async () => {
    const before = {
      ...baseFields,
      organisateur_id: 'old',
      organisateur_nom: 'Old Owner',
      creator_user_id: 'creator',
    };
    const after = {
      ...before,
      organisateur_id: 'target',
      organisateur_nom: 'Wrong Label',
      organizer_last_action_by: 'creator',
      organizer_last_action_at: { toMillis: () => 2 },
      organizer_last_action_source: 'calycompta_web',
    };
    const db = new MemoryDb({
      'clubs/calypso/members/target': member('membre', 'Canonical', 'Name'),
      'clubs/calypso/operations/event-1': after,
    });
    const ref = new Ref(db, 'clubs/calypso/operations/event-1');
    await operationOrganizerTriggerHandler({
      id: 'event-abc',
      time: '2026-10-03T14:00:00.000Z',
      params: { clubId: 'calypso', operationId: 'event-1' },
      data: { before: new Snapshot(ref, before), after: new Snapshot(ref, after) },
    }, { db });
    expect(db.docs.get('clubs/calypso/operations/event-1').organisateur_nom).toBe('Canonical Name');
    expect(db.docs.get('clubs/calypso/operations/event-1/organizer_audit/event-abc')).toMatchObject({
      actor_uid: 'creator',
      old_organizer_id: 'old',
      new_organizer_id: 'target',
    });
  });

  test('unknown ids are alerted and never guessed or repaired', async () => {
    const operation = { ...baseFields, organisateur_id: 'missing', organisateur_nom: 'Stored' };
    const db = new MemoryDb({ 'clubs/calypso/operations/event-2': operation });
    const ref = new Ref(db, 'clubs/calypso/operations/event-2');
    await operationOrganizerTriggerHandler({
      id: 'event-orphan',
      time: '2026-10-03T14:00:00.000Z',
      params: { clubId: 'calypso', operationId: 'event-2' },
      data: { before: new Snapshot(ref, operation), after: new Snapshot(ref, operation) },
    }, { db });
    expect(db.docs.get('clubs/calypso/operations/event-2')).toEqual(operation);
    expect(db.docs.get('clubs/calypso/audit_logs/organizer-integrity-event-orphan')).toMatchObject({
      severity: 'critical',
      details: { reason: 'unknown_organizer_id', organisateur_id: 'missing' },
    });
  });
});

test('canonical member name never falls back to email', () => {
  expect(canonicalMemberName({ email: 'private@example.test' })).toBeNull();
});
