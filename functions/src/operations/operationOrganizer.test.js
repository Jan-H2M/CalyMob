const {
  canonicalMemberName,
  memberOrganizerNameTriggerHandler,
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
  where(field, operator, value) { return new Query(this.db, this.path, field, operator, value); }
}

class Query {
  constructor(db, path, field, operator, value) {
    this.db = db;
    this.path = path;
    this.field = field;
    this.operator = operator;
    this.value = value;
  }
  async get() {
    if (this.operator !== '==') throw new Error(`Unsupported operator ${this.operator}`);
    const prefix = `${this.path}/`;
    const docs = [...this.db.docs.entries()]
      .filter(([path, value]) => path.startsWith(prefix)
        && !path.slice(prefix.length).includes('/')
        && value[this.field] === this.value)
      .map(([path, value]) => new Snapshot(new Ref(this.db, path), value));
    return { docs, size: docs.length };
  }
}

class Snapshot {
  constructor(ref, value) { this.ref = ref; this.value = value; this.exists = value !== undefined; }
  get id() { return this.ref.id; }
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
      data: {
        action: 'create',
        clubId: 'calypso',
        organizerId: 'target',
        fields: baseFields,
        // Matches the web serializer for unset optional wizard fields.
        deleteFields: ['date_fin', 'capacite_max'],
      },
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

  test('validators cannot create in a closed fiscal year while admins can', async () => {
    const seed = {
      'clubs/calypso/members/validator': member('validateur', 'Val', 'Idator'),
      'clubs/calypso/members/admin': member('admin', 'Ada', 'Admin'),
      'clubs/calypso/members/target': member('membre', 'Target', 'Member'),
      'clubs/calypso/fiscal_years/fy-closed': { status: 'closed' },
    };
    await expect(writeOperationHandler({
      auth: { uid: 'validator' },
      data: {
        action: 'create',
        clubId: 'calypso',
        organizerId: 'target',
        fields: { ...baseFields, fiscal_year_id: 'fy-closed' },
      },
    }, deps(new MemoryDb(seed)))).rejects.toMatchObject({ code: 'permission-denied' });

    await expect(writeOperationHandler({
      auth: { uid: 'admin' },
      data: {
        action: 'create',
        clubId: 'calypso',
        organizerId: 'target',
        fields: { ...baseFields, fiscal_year_id: 'fy-closed' },
      },
    }, deps(new MemoryDb(seed)))).resolves.toMatchObject({ success: true });
  });

  test('updates cannot move an operation to another fiscal year', async () => {
    const db = new MemoryDb({
      'clubs/calypso/members/admin': member('admin', 'Ada', 'Admin'),
      'clubs/calypso/fiscal_years/fy-open': { status: 'open' },
      'clubs/calypso/operations/event-locked': {
        ...baseFields,
        fiscal_year_id: 'fy-open',
        organisateur_id: 'admin',
        organisateur_nom: 'Ada Admin',
        creator_user_id: 'admin',
      },
    });
    await expect(writeOperationHandler({
      auth: { uid: 'admin' },
      data: {
        action: 'update',
        clubId: 'calypso',
        operationId: 'event-locked',
        organizerId: 'admin',
        fields: { titre: 'Changed', fiscal_year_id: 'another-year' },
      },
    }, deps(db))).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  test('only a superadmin can mark an operation removed and metadata is server-owned', async () => {
    const operation = {
      ...baseFields,
      organisateur_id: 'admin',
      organisateur_nom: 'Ada Admin',
      creator_user_id: 'admin',
    };
    const seed = {
      'clubs/calypso/members/admin': member('admin', 'Ada', 'Admin'),
      'clubs/calypso/members/super': member('superadmin', 'Sue', 'Super'),
      'clubs/calypso/operations/event-remove': operation,
    };
    await expect(writeOperationHandler({
      auth: { uid: 'admin' },
      data: {
        action: 'update', clubId: 'calypso', operationId: 'event-remove',
        organizerId: 'admin', fields: { statut: 'supprime' },
      },
    }, deps(new MemoryDb(seed)))).rejects.toMatchObject({ code: 'permission-denied' });

    const db = new MemoryDb(seed);
    await writeOperationHandler({
      auth: { uid: 'super' },
      data: {
        action: 'update', clubId: 'calypso', operationId: 'event-remove',
        organizerId: 'admin', fields: { statut: 'supprime' },
        source: 'calycompta_web', clientVersion: 'test',
      },
    }, deps(db));
    expect(db.docs.get('clubs/calypso/operations/event-remove')).toMatchObject({
      statut: 'supprime',
      canceled_by: 'super',
      canceled_by_name: 'Sue Super',
      canceled_by_role: 'superadmin',
      canceled_source: 'calycompta_web',
      canceled_app_version: 'test',
      canceled_reason: 'explicit_event_removal',
    });
  });

  test('non-superadmins cannot restore or edit an already removed operation', async () => {
    const seed = {
      'clubs/calypso/members/owner': member('user', 'Current', 'Owner'),
      'clubs/calypso/operations/event-removed': {
        ...baseFields,
        statut: 'supprime',
        organisateur_id: 'owner',
        organisateur_nom: 'Current Owner',
        creator_user_id: 'owner',
      },
    };
    for (const fields of [{ statut: 'ouvert' }, { titre: 'Edited after removal' }]) {
      await expect(writeOperationHandler({
        auth: { uid: 'owner' },
        data: {
          action: 'update', clubId: 'calypso', operationId: 'event-removed',
          organizerId: 'owner', fields,
        },
      }, deps(new MemoryDb(seed)))).rejects.toMatchObject({ code: 'permission-denied' });
    }
  });

  test('cancellation metadata is derived by the server', async () => {
    const db = new MemoryDb({
      'clubs/calypso/members/owner': member('user', 'Current', 'Owner'),
      'clubs/calypso/operations/event-cancel': {
        ...baseFields,
        organisateur_id: 'owner',
        organisateur_nom: 'Current Owner',
        creator_user_id: 'owner',
      },
    });
    await writeOperationHandler({
      auth: { uid: 'owner' },
      data: {
        action: 'update', clubId: 'calypso', operationId: 'event-cancel',
        organizerId: 'owner', fields: { statut: 'annule' },
        source: 'calycompta_settings', cancellationReason: 'bulk_operation_cancellation',
      },
    }, deps(db));
    expect(db.docs.get('clubs/calypso/operations/event-cancel')).toMatchObject({
      statut: 'annule',
      canceled_by: 'owner',
      canceled_by_name: 'Current Owner',
      canceled_source: 'calycompta_settings',
      canceled_reason: 'bulk_operation_cancellation',
    });
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

  test('malformed ids are alerted before member dereference', async () => {
    const operation = { ...baseFields, organisateur_id: 'bad/id', organisateur_nom: 'Stored' };
    const db = new MemoryDb({ 'clubs/calypso/operations/event-3': operation });
    const ref = new Ref(db, 'clubs/calypso/operations/event-3');
    await operationOrganizerTriggerHandler({
      id: 'event-malformed',
      time: '2026-10-03T14:00:00.000Z',
      params: { clubId: 'calypso', operationId: 'event-3' },
      data: { before: new Snapshot(ref, operation), after: new Snapshot(ref, operation) },
    }, { db });
    expect(db.docs.get('clubs/calypso/audit_logs/organizer-integrity-event-malformed')).toMatchObject({
      severity: 'critical',
      details: { reason: 'invalid_organizer_id' },
    });
  });
});

describe('member organizer integrity trigger', () => {
  test('deleting a referenced member creates an orphan alert per operation', async () => {
    const memberRef = new Ref(new MemoryDb(), 'clubs/calypso/members/target');
    const db = memberRef.db;
    db.docs.set('clubs/calypso/operations/event-4', {
      ...baseFields,
      organisateur_id: 'target',
      organisateur_nom: 'Former Member',
    });
    await memberOrganizerNameTriggerHandler({
      id: 'member-delete',
      time: '2026-10-03T14:00:00.000Z',
      params: { clubId: 'calypso', memberId: 'target' },
      data: {
        before: new Snapshot(memberRef, member('membre', 'Former', 'Member')),
        after: new Snapshot(memberRef, undefined),
      },
    }, { db });
    expect(db.docs.get(
      'clubs/calypso/audit_logs/organizer-integrity-member-delete-event-4',
    )).toMatchObject({
      targetId: 'event-4',
      severity: 'critical',
      details: { reason: 'organizer_member_deleted', organisateur_id: 'target' },
    });
  });
});

test('canonical member name never falls back to email', () => {
  expect(canonicalMemberName({ email: 'private@example.test' })).toBeNull();
});

test('canonical member name prefers first and last over a stale display label', () => {
  expect(canonicalMemberName({
    first_name: 'Juan Antonio',
    last_name: 'MARQUEZ SEQUEIRA',
    display_name: 'Legacy label',
  })).toBe('Juan Antonio MARQUEZ SEQUEIRA');
});
