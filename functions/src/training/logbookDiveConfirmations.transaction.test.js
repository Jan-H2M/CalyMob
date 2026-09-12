jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_options, handler) => handler,
  onDocumentWritten: (_options, handler) => handler,
}));
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_timestamp__' },
  Timestamp: { fromDate: (date) => date, now: () => new Date() },
}));
jest.mock('../utils/badge-helper', () => ({
  collectTokensAndMembers: jest.fn(),
  filterByPreference: jest.fn(),
  sendNotificationsWithBadge: jest.fn(),
}));

const admin = require('firebase-admin');
const {
  deterministicCopyEntryId,
  handleRespondToLogbookDiveConfirmation,
  respondToLogbookDiveConfirmation,
} = require('./logbookDiveConfirmations');

class FakeDocRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split('/').pop();
  }

  collection(name) {
    return new FakeCollection(this.db, `${this.path}/${name}`);
  }
}

class FakeCollection {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }

  doc(id) {
    return new FakeDocRef(this.db, `${this.path}/${id}`);
  }

  where(field, operator, value) {
    if (operator !== '==') throw new Error('unsupported query');
    return { db: this.db, path: this.path, field, value, isQuery: true };
  }
}

class FakeFirestore {
  constructor(seed) {
    this.docs = new Map(Object.entries(seed));
    this.queue = Promise.resolve();
    this.readPaths = [];
  }

  collection(name) {
    return new FakeCollection(this, name);
  }

  snapshot(ref) {
    const value = this.docs.get(ref.path);
    return {
      id: ref.id,
      ref,
      exists: value !== undefined,
      data: () => value,
    };
  }

  querySnapshot(query) {
    const prefix = `${query.path}/`;
    const docs = [...this.docs.entries()]
      .filter(([path, value]) => path.startsWith(prefix)
        && !path.slice(prefix.length).includes('/')
        && value[query.field] === query.value)
      .map(([path]) => this.snapshot(new FakeDocRef(this, path)));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }

  runTransaction(callback) {
    const run = async () => {
      const writes = [];
      const result = await callback({
        get: async (target) => {
          this.readPaths.push(target.path);
          return target.isQuery ? this.querySnapshot(target) : this.snapshot(target);
        },
        create: (ref, value) => writes.push(['create', ref, value]),
        set: (ref, value, options) => writes.push(['set', ref, value, options]),
        update: (ref, value) => writes.push(['update', ref, value]),
      });
      for (const [kind, ref, value, options] of writes) {
        const previous = this.docs.get(ref.path) || {};
        if (kind === 'create' && this.docs.has(ref.path)) {
          throw new Error(`already exists ${ref.path}`);
        }
        if (kind === 'update' && !this.docs.has(ref.path)) {
          throw new Error(`missing ${ref.path}`);
        }
        this.docs.set(
          ref.path,
          kind === 'set' && !options?.merge ? value : { ...previous, ...value }
        );
      }
      return result;
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

const club = 'calypso';
const member = 'member-1';
const confirmationPath = (id) =>
  `clubs/${club}/logbook_dive_confirmations/${id}`;
const entryPath = (id) => `clubs/${club}/student_logbook_entries/${id}`;
const memberPath = `clubs/${club}/members/${member}`;
const counterPath = `${memberPath}/settings/logbook_counter`;

const confirmation = () => ({
  target_member_id: member,
  target_member_name: 'Test Diver',
  source_member_id: 'source-member',
  source_member_name: 'Source Diver',
  source_entry_id: 'source-entry',
  status: 'pending',
  dive_snapshot: {
    date: new Date('2026-08-01T10:00:00Z'),
    location_name: 'Vodelée',
    depth_max_meters: 20,
    duration_minutes: 40,
  },
});

const request = (id, action) => ({
  auth: { uid: member },
  data: { clubId: club, confirmationId: id, action },
});

describe('COM-085 transactional confirmation decisions', () => {
  test.each([
    ['decline', 'declined'],
    ['confirm_no_import', 'confirmed_no_import'],
  ])('%s neither creates an entry nor consumes a number', async (action, status) => {
    const id = action.replaceAll('_', '-');
    const db = new FakeFirestore({
      [confirmationPath(id)]: confirmation(),
      [memberPath]: { first_name: 'Test', last_name: 'Diver' },
      [counterPath]: { next: 91 },
    });
    const notify = jest.fn();

    const result = await handleRespondToLogbookDiveConfirmation(
      request(id, action),
      { db, notify }
    );

    expect(result).toMatchObject({ status, diveNumber: null });
    expect(db.docs.get(counterPath).next).toBe(91);
    expect([...db.docs.keys()].filter((path) =>
      path.startsWith(`clubs/${club}/student_logbook_entries/`)
    )).toHaveLength(0);
    expect(db.readPaths).not.toContain(counterPath);
  });

  test('real callable copy allocates exactly one deterministic numbered entry', async () => {
    const id = 'copy-once';
    const copyId = deterministicCopyEntryId(id);
    const db = new FakeFirestore({
      [confirmationPath(id)]: confirmation(),
      [memberPath]: { first_name: 'Test', last_name: 'Diver' },
      [entryPath('old')]: {
        member_id: member,
        source: 'manual',
        dive_number: 40,
        date: new Date('2020-01-01T10:00:00Z'),
      },
      [counterPath]: { next: 41 },
    });
    admin.firestore.mockReturnValue(db);
    const notify = jest.fn();

    const first = await handleRespondToLogbookDiveConfirmation(
      request(id, 'confirm_copy'),
      { db, notify }
    );
    const retry = await respondToLogbookDiveConfirmation(request(id, 'confirm_copy'));

    expect(first).toEqual({
      status: 'confirmed_copied',
      copiedEntryId: copyId,
      matchedEntryId: null,
      diveNumber: 41,
    });
    expect(retry).toEqual(first);
    expect(db.docs.get(counterPath).next).toBe(42);
    expect(db.docs.get(entryPath(copyId))).toMatchObject({
      member_id: member,
      source: 'shared_logbook',
      logbook_confirmation_id: id,
      dive_number: 41,
      dive_number_source: 'respondToLogbookDiveConfirmation',
      dive_number_allocated_at: '__server_timestamp__',
    });
    expect(db.docs.get(confirmationPath(id))).toMatchObject({
      status: 'confirmed_copied',
      copied_entry_id: copyId,
      copied_dive_number: 41,
    });
    expect([...db.docs.keys()].filter((path) =>
      path.startsWith(`clubs/${club}/student_logbook_entries/`)
    )).toHaveLength(2);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test('parallel conflicting responses commit one decision and one number', async () => {
    const id = 'parallel';
    const db = new FakeFirestore({
      [confirmationPath(id)]: confirmation(),
      [memberPath]: { first_name: 'Test' },
      [counterPath]: { next: 12 },
    });
    const notify = jest.fn();

    const [copyResult, declineResult] = await Promise.all([
      handleRespondToLogbookDiveConfirmation(
        request(id, 'confirm_copy'),
        { db, notify }
      ),
      handleRespondToLogbookDiveConfirmation(
        request(id, 'decline'),
        { db, notify }
      ),
    ]);

    expect(copyResult.status).toBe('confirmed_copied');
    expect(declineResult).toEqual(copyResult);
    expect(db.docs.get(counterPath).next).toBe(13);
    expect(db.docs.get(entryPath(deterministicCopyEntryId(id))).dive_number)
      .toBe(12);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test('copy reuses a live matching entry without consuming a number', async () => {
    const id = 'already-there';
    const db = new FakeFirestore({
      [confirmationPath(id)]: confirmation(),
      [memberPath]: { first_name: 'Test' },
      [counterPath]: { next: 55 },
      [entryPath('matching')]: {
        member_id: member,
        source: 'manual',
        dive_number: 12,
        date: new Date('2026-08-01T10:00:00Z'),
        location_name: 'Vodelée',
        depth_max_meters: 20,
        duration_minutes: 40,
      },
    });

    const result = await handleRespondToLogbookDiveConfirmation(
      request(id, 'confirm_copy'),
      { db, notify: async () => {} }
    );

    expect(result).toMatchObject({
      status: 'confirmed_existing_identical',
      copiedEntryId: null,
      matchedEntryId: 'matching',
      diveNumber: null,
    });
    expect(db.docs.get(counterPath).next).toBe(55);
    expect(db.docs.has(entryPath(deterministicCopyEntryId(id)))).toBe(false);
  });

  test('copy ignores a persisted piscine exact match and creates one real dive', async () => {
    const id = 'pool-is-not-a-dive';
    const poolId = 'pool-exact';
    const copyId = deterministicCopyEntryId(id);
    const db = new FakeFirestore({
      [confirmationPath(id)]: {
        ...confirmation(),
        matched_entry_id: poolId,
        match_type: 'identical',
      },
      [memberPath]: { first_name: 'Test' },
      [counterPath]: { next: 56 },
      [entryPath(poolId)]: {
        member_id: member,
        source: 'piscine',
        dive_number: 999,
        date: new Date('2026-08-01T10:00:00Z'),
        location_name: 'Vodelée',
        depth_max_meters: 20,
        duration_minutes: 40,
      },
    });

    const result = await handleRespondToLogbookDiveConfirmation(
      request(id, 'confirm_copy'),
      { db, notify: async () => {} }
    );

    expect(result).toEqual({
      status: 'confirmed_copied',
      copiedEntryId: copyId,
      matchedEntryId: null,
      diveNumber: 56,
    });
    expect(db.docs.get(counterPath).next).toBe(57);
    expect(db.docs.get(entryPath(poolId))).toMatchObject({
      source: 'piscine',
      dive_number: 999,
    });
    expect(db.docs.get(entryPath(copyId))).toMatchObject({
      member_id: member,
      source: 'shared_logbook',
      dive_number: 56,
    });
    expect(db.docs.get(confirmationPath(id))).toMatchObject({
      copied_entry_id: copyId,
      matched_entry_id: null,
    });
  });

  test('copy retry metadata never retains a stale piscine match', async () => {
    const id = 'existing-copy-with-stale-pool';
    const copyId = deterministicCopyEntryId(id);
    const db = new FakeFirestore({
      [confirmationPath(id)]: {
        ...confirmation(),
        matched_entry_id: 'pool-exact',
      },
      [memberPath]: { first_name: 'Test' },
      [counterPath]: { next: 57 },
      [entryPath('pool-exact')]: {
        member_id: member,
        source: 'piscine',
        date: new Date('2026-08-01T10:00:00Z'),
      },
      [entryPath(copyId)]: {
        member_id: member,
        source: 'shared_logbook',
        logbook_confirmation_id: id,
        dive_number: 56,
      },
    });

    const result = await handleRespondToLogbookDiveConfirmation(
      request(id, 'confirm_copy'),
      { db, notify: async () => {} }
    );

    expect(result).toMatchObject({
      status: 'confirmed_copied',
      copiedEntryId: copyId,
      matchedEntryId: null,
      diveNumber: 56,
    });
    expect(db.docs.get(counterPath).next).toBe(57);
    expect(db.docs.get(confirmationPath(id))).toMatchObject({
      matched_entry_id: null,
    });
  });

  test.each([
    'confirm_existing_identical',
    'confirm_merge_notes',
    'confirm_keep_existing',
    'confirm_replace_existing',
  ])('%s rejects an explicit piscine artifact target', async (action) => {
    const id = `reject-pool-${action}`;
    const poolId = 'pool-target';
    const db = new FakeFirestore({
      [confirmationPath(id)]: {
        ...confirmation(),
        matched_entry_id: poolId,
      },
      [memberPath]: { first_name: 'Test' },
      [entryPath(poolId)]: {
        member_id: member,
        source: 'piscine',
        date: new Date('2026-08-01T10:00:00Z'),
        location_name: 'Vodelée',
        depth_max_meters: 20,
        duration_minutes: 40,
      },
    });

    await expect(handleRespondToLogbookDiveConfirmation(
      {
        ...request(id, action),
        data: {
          ...request(id, action).data,
          matchedEntryId: poolId,
        },
      },
      { db, notify: async () => {} }
    )).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(db.docs.get(confirmationPath(id)).status).toBe('pending');
    expect(db.docs.get(entryPath(poolId))).not.toHaveProperty(
      'logbook_confirmation_id'
    );
  });
});
