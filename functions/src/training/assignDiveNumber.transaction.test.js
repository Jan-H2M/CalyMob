jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_options, handler) => handler,
}));
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class HttpsError extends Error {},
}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_timestamp__' },
}));

const {
  allocateCreatedEntry,
  backfillMemberDiveNumbers,
} = require('./assignDiveNumber');

class FakeDocRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').pop(); }
  collection(name) { return new FakeCollection(this.db, `${this.path}/${name}`); }
}

class FakeCollection {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return new FakeDocRef(this.db, `${this.path}/${id}`); }
  collection() { throw new Error('unsupported'); }
  where(field, operator, value) {
    if (operator !== '==') throw new Error('unsupported query');
    return { db: this.db, path: this.path, field, value, isQuery: true };
  }
}

class FakeFirestore {
  constructor(seed) {
    this.docs = new Map(Object.entries(seed));
    this.queue = Promise.resolve();
  }
  collection(name) { return new FakeCollection(this, name); }
  snapshot(ref) {
    const value = this.docs.get(ref.path);
    return { id: ref.id, ref, exists: value !== undefined, data: () => value };
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
    const run = async () => callback({
      get: async (target) => target.isQuery
        ? this.querySnapshot(target)
        : this.snapshot(target),
      set: (ref, patch, options) => {
        const previous = this.docs.get(ref.path) || {};
        this.docs.set(ref.path, options?.merge ? { ...previous, ...patch } : patch);
      },
      update: (ref, patch) => {
        if (!this.docs.has(ref.path)) throw new Error(`missing ${ref.path}`);
        this.docs.set(ref.path, { ...this.docs.get(ref.path), ...patch });
      },
    });
    const result = this.queue.then(run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

const entryPath = (id) => `clubs/calypso/student_logbook_entries/${id}`;
const counterPath = 'clubs/calypso/members/member-1/settings/logbook_counter';

describe('COM-085 transactional allocator', () => {
  test('redelivery rereads the entry and does not consume another number', async () => {
    const db = new FakeFirestore({
      [entryPath('created')]: { member_id: 'member-1', source: 'manual' },
      [entryPath('old')]: { member_id: 'member-1', source: 'manual', dive_number: 41 },
      [counterPath]: { next: 42 },
    });
    const entryRef = db.collection('clubs').doc('calypso')
      .collection('student_logbook_entries').doc('created');

    const first = await allocateCreatedEntry({ db, clubId: 'calypso', entryId: 'created', entryRef });
    const retry = await allocateCreatedEntry({ db, clubId: 'calypso', entryId: 'created', entryRef });

    expect(first).toMatchObject({ outcome: 'assigned', assigned: 42, next: 43 });
    expect(retry).toMatchObject({ outcome: 'already_numbered', assigned: 42 });
    expect(db.docs.get(counterPath).next).toBe(43);
  });

  test('backfill and create share one counter lock and keep unique numbers', async () => {
    const db = new FakeFirestore({
      [entryPath('legacy')]: { member_id: 'member-1', source: 'manual', date: new Date('2025-01-01') },
      [entryPath('created')]: { member_id: 'member-1', source: 'manual', date: new Date('2026-01-01') },
      [entryPath('old')]: { member_id: 'member-1', source: 'manual', dive_number: 12 },
      [counterPath]: { next: 80 },
    });
    const entryRef = db.collection('clubs').doc('calypso')
      .collection('student_logbook_entries').doc('created');

    await Promise.all([
      backfillMemberDiveNumbers({ db, clubId: 'calypso', memberId: 'member-1' }),
      allocateCreatedEntry({ db, clubId: 'calypso', entryId: 'created', entryRef }),
    ]);

    const assigned = [
      db.docs.get(entryPath('legacy')).dive_number,
      db.docs.get(entryPath('created')).dive_number,
    ];
    expect(new Set(assigned).size).toBe(2);
    expect(assigned.every((value) => Number.isSafeInteger(value) && value > 0)).toBe(true);
    expect(db.docs.get(counterPath).next).toBeGreaterThan(Math.max(...assigned));
    expect(db.docs.get(counterPath).next).toBeGreaterThanOrEqual(80);
  });
});
