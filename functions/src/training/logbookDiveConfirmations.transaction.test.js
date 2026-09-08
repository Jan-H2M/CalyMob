jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_options, handler) => handler,
}));
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options, handler) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  },
}));
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_timestamp__' },
  Timestamp: { fromDate: (date) => date, now: () => new Date() },
}));
jest.mock('../utils/badge-helper', () => ({
  collectTokensAndMembers: jest.fn(), filterByPreference: jest.fn(), sendNotificationsWithBadge: jest.fn(),
}));

const {
  deterministicCopyEntryId,
  handleRespondToLogbookDiveConfirmation,
} = require('./logbookDiveConfirmations');

class FakeDocRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').pop(); }
  collection(name) { return new FakeCollection(this.db, `${this.path}/${name}`); }
}
class FakeCollection {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return new FakeDocRef(this.db, `${this.path}/${id}`); }
  where(field, operator, value) {
    if (operator !== '==') throw new Error('unsupported query');
    return { db: this.db, path: this.path, field, value, isQuery: true };
  }
}
class FakeFirestore {
  constructor(seed) { this.docs = new Map(Object.entries(seed)); this.queue = Promise.resolve(); }
  collection(name) { return new FakeCollection(this, name); }
  snapshot(ref) {
    const value = this.docs.get(ref.path);
    return { id: ref.id, ref, exists: value !== undefined, data: () => value };
  }
  querySnapshot(query) {
    const prefix = `${query.path}/`;
    return {
      docs: [...this.docs.entries()]
        .filter(([path, value]) => path.startsWith(prefix)
          && !path.slice(prefix.length).includes('/')
          && value[query.field] === query.value)
        .map(([path]) => this.snapshot(new FakeDocRef(this, path))),
    };
  }
  runTransaction(callback) {
    const run = async () => callback({
      get: async (target) => target.isQuery ? this.querySnapshot(target) : this.snapshot(target),
      create: (ref, value) => {
        if (this.docs.has(ref.path)) throw new Error(`already exists ${ref.path}`);
        this.docs.set(ref.path, value);
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

const club = 'calypso';
const member = 'member-1';
const confirmationPath = (id) => `clubs/${club}/logbook_dive_confirmations/${id}`;
const entryPath = (id) => `clubs/${club}/student_logbook_entries/${id}`;
const memberPath = `clubs/${club}/members/${member}`;
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
  test('parallel conflicting responses commit exactly one terminal decision and copy', async () => {
    const db = new FakeFirestore({ [confirmationPath('parallel')]: confirmation(), [memberPath]: { first_name: 'Test', last_name: 'Diver' } });
    const notify = jest.fn();

    const [copyResult, declineResult] = await Promise.all([
      handleRespondToLogbookDiveConfirmation(request('parallel', 'confirm_copy'), { db, notify }),
      handleRespondToLogbookDiveConfirmation(request('parallel', 'decline'), { db, notify }),
    ]);

    expect(copyResult.status).toBe('confirmed_copied');
    expect(declineResult).toEqual(copyResult);
    expect(db.docs.get(confirmationPath('parallel')).status).toBe('confirmed_copied');
    expect(db.docs.has(entryPath(deterministicCopyEntryId('parallel')))).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test('redelivery of confirm_copy creates one deterministic entry and no second notification', async () => {
    const db = new FakeFirestore({ [confirmationPath('retry')]: confirmation(), [memberPath]: { first_name: 'Test' } });
    const notify = jest.fn();
    const first = await handleRespondToLogbookDiveConfirmation(request('retry', 'confirm_copy'), { db, notify });
    const retry = await handleRespondToLogbookDiveConfirmation(request('retry', 'confirm_copy'), { db, notify });

    expect(retry).toEqual(first);
    expect([...db.docs.keys()].filter((path) => path.includes('confirmation-retry'))).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['confirm_copy', 'confirmed_copied', 1],
    ['confirm_no_import', 'confirmed_no_import', 0],
    ['decline', 'declined', 0],
  ])('%s follows its one terminal path', async (action, expectedStatus, expectedEntries) => {
    const id = action.replaceAll('_', '-');
    const db = new FakeFirestore({ [confirmationPath(id)]: confirmation(), [memberPath]: { first_name: 'Test' } });
    const result = await handleRespondToLogbookDiveConfirmation(request(id, action), { db, notify: async () => {} });

    expect(result.status).toBe(expectedStatus);
    expect(db.docs.get(confirmationPath(id)).status).toBe(expectedStatus);
    expect([...db.docs.keys()].filter((path) => path.startsWith(`clubs/${club}/student_logbook_entries/`))).toHaveLength(expectedEntries);
  });
});
