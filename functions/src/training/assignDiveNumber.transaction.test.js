jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_options, handler) => handler,
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
}));

const admin = require('firebase-admin');
const {
  assignDiveNumber,
  backfillMyDiveNumbers,
  backfillMemberDiveNumbers,
} = require('./assignDiveNumber');

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
          this.readPaths.push(target.path || `${target.path}:${target.field}`);
          return target.isQuery ? this.querySnapshot(target) : this.snapshot(target);
        },
        set: (ref, patch, options) => writes.push(['set', ref, patch, options]),
        update: (ref, patch) => writes.push(['update', ref, patch]),
      });
      for (const [kind, ref, patch, options] of writes) {
        const previous = this.docs.get(ref.path) || {};
        if (kind === 'update' && !this.docs.has(ref.path)) {
          throw new Error(`missing ${ref.path}`);
        }
        this.docs.set(
          ref.path,
          kind === 'set' && !options?.merge ? patch : { ...previous, ...patch }
        );
      }
      return result;
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

const entryPath = (id) => `clubs/calypso/student_logbook_entries/${id}`;
const counterPath = 'clubs/calypso/members/member-1/settings/logbook_counter';
const entryRef = (db, id) => db.collection('clubs').doc('calypso')
  .collection('student_logbook_entries').doc(id);

describe('COM-085 transactional allocator wiring', () => {
  test('real create trigger redelivery allocates once with metadata', async () => {
    const db = new FakeFirestore({
      [entryPath('created')]: { member_id: 'member-1', source: 'manual' },
      [entryPath('old')]: { member_id: 'member-1', source: 'manual', dive_number: 41 },
      [counterPath]: { next: 42 },
    });
    admin.firestore.mockReturnValue(db);
    const event = {
      params: { clubId: 'calypso', entryId: 'created' },
      data: { ref: entryRef(db, 'created') },
    };

    const first = await assignDiveNumber(event);
    const retry = await assignDiveNumber(event);

    expect(first).toMatchObject({ outcome: 'assigned', assigned: 42, next: 43 });
    expect(retry).toMatchObject({ outcome: 'already_numbered', assigned: 42 });
    expect(db.docs.get(counterPath).next).toBe(43);
    expect(db.docs.get(entryPath('created'))).toMatchObject({
      dive_number: 42,
      dive_number_source: 'assignDiveNumber',
      dive_number_allocated_at: '__server_timestamp__',
    });
  });

  test('real create trigger leaves piscine entry and counter untouched', async () => {
    const db = new FakeFirestore({
      [entryPath('pool')]: { member_id: 'member-1', source: 'piscine' },
      [counterPath]: { next: 9 },
    });
    admin.firestore.mockReturnValue(db);

    const result = await assignDiveNumber({
      params: { clubId: 'calypso', entryId: 'pool' },
      data: { ref: entryRef(db, 'pool') },
    });

    expect(result).toMatchObject({ outcome: 'skipped', assigned: null });
    expect(db.docs.get(entryPath('pool')).dive_number).toBeUndefined();
    expect(db.docs.get(counterPath).next).toBe(9);
  });

  test('backfill and create share one counter lock and keep unique numbers', async () => {
    const db = new FakeFirestore({
      [entryPath('legacy')]: {
        member_id: 'member-1', source: 'manual', date: new Date('2025-01-01'),
      },
      [entryPath('created')]: {
        member_id: 'member-1', source: 'manual', date: new Date('2026-01-01'),
      },
      [entryPath('pool')]: {
        member_id: 'member-1', source: 'piscine', date: new Date('2024-01-01'),
      },
      [entryPath('old')]: { member_id: 'member-1', source: 'manual', dive_number: 12 },
      [counterPath]: { next: 80 },
    });
    admin.firestore.mockReturnValue(db);

    await Promise.all([
      backfillMemberDiveNumbers({ db, clubId: 'calypso', memberId: 'member-1' }),
      assignDiveNumber({
        params: { clubId: 'calypso', entryId: 'created' },
        data: { ref: entryRef(db, 'created') },
      }),
    ]);

    const assigned = [
      db.docs.get(entryPath('legacy')).dive_number,
      db.docs.get(entryPath('created')).dive_number,
    ];
    expect(new Set(assigned).size).toBe(2);
    expect(assigned.every((value) => Number.isSafeInteger(value) && value > 0)).toBe(true);
    expect(db.docs.get(entryPath('pool')).dive_number).toBeUndefined();
    expect(db.docs.get(counterPath).next).toBeGreaterThan(Math.max(...assigned));
    expect(db.docs.get(counterPath).next).toBeGreaterThanOrEqual(80);
  });

  test('real callable backfills in stable date/id order with metadata', async () => {
    const db = new FakeFirestore({
      [entryPath('b')]: {
        member_id: 'member-1', source: 'manual', date: new Date('2020-01-01'),
      },
      [entryPath('a')]: {
        member_id: 'member-1', source: 'manual', date: new Date('2020-01-01'),
      },
      [entryPath('old')]: { member_id: 'member-1', source: 'manual', dive_number: 7 },
      [counterPath]: { next: 8 },
    });
    admin.firestore.mockReturnValue(db);

    const result = await backfillMyDiveNumbers({
      auth: { uid: 'member-1' },
      data: { clubId: 'calypso' },
    });

    expect(result).toEqual({ backfilled: 2, total: 3, highest: 9 });
    expect(db.docs.get(entryPath('a'))).toMatchObject({
      dive_number: 8,
      dive_number_source: 'backfillMyDiveNumbers',
      dive_number_allocated_at: '__server_timestamp__',
    });
    expect(db.docs.get(entryPath('b')).dive_number).toBe(9);
    expect(db.docs.get(counterPath).next).toBe(10);
  });
});
