/**
 * Unit tests for onBuddyConfirmationTask (WP-05 complément) against an in-memory
 * Firestore fake. firebase-admin is mocked to return the fake db.
 */

let mockDb;

jest.mock('firebase-admin', () => ({ firestore: () => mockDb }));
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_ts__' },
}));

const { handleBuddyConfirmationTask } = require('./onBuddyConfirmationTask');

// ---- In-memory Firestore fake (subset) ------------------------------------
function getPath(o, p) {
  return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
}
function setPath(o, p, v) {
  const parts = p.split('.');
  let c = o;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof c[parts[i]] !== 'object' || c[parts[i]] == null) c[parts[i]] = {};
    c = c[parts[i]];
  }
  c[parts[parts.length - 1]] = v;
}
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
function match(data, f) {
  const v = getPath(data, f.field);
  return f.op === '==' ? v === f.val : false;
}

class FS {
  constructor() { this.store = new Map(); this.auto = 0; }
  _m(p) { if (!this.store.has(p)) this.store.set(p, new Map()); return this.store.get(p); }
  collection(p) { return new Coll(this, p); }
}
class Coll {
  constructor(fs, p) { this.fs = fs; this.p = p; }
  doc(id) { return new Ref(this.fs, this.p, id || `auto_${++this.fs.auto}`); }
  where(field, op, val) { return new Q(this.fs, this.p, [{ field, op, val }]); }
  get() { return new Q(this.fs, this.p, []).get(); }
}
class Ref {
  constructor(fs, p, id) { this.fs = fs; this.p = p; this.id = id; }
  collection(sub) { return new Coll(this.fs, `${this.p}/${this.id}/${sub}`); }
  async get() {
    const m = this.fs._m(this.p); const has = m.has(this.id);
    return { exists: has, id: this.id, data: () => (has ? clone(m.get(this.id)) : undefined), ref: this };
  }
  async set(d) { this.fs._m(this.p).set(this.id, clone(d)); }
  async update(d) {
    const m = this.fs._m(this.p); const cur = m.get(this.id) || {};
    for (const [k, v] of Object.entries(d)) { if (k.includes('.')) setPath(cur, k, v); else cur[k] = v; }
    m.set(this.id, cur);
  }
}
class Q {
  constructor(fs, p, f) { this.fs = fs; this.p = p; this.f = f; }
  where(field, op, val) { return new Q(this.fs, this.p, [...this.f, { field, op, val }]); }
  async get() {
    const m = this.fs._m(this.p);
    const docs = [...m.entries()]
      .filter(([, data]) => this.f.every((f) => match(data, f)))
      .map(([id, data]) => ({ id, data: () => clone(data), ref: new Ref(this.fs, this.p, id) }));
    return { empty: docs.length === 0, docs, size: docs.length };
  }
}

const CLUB = 'calypso';
const MEMBER = 'alice';
const CONF = `clubs/${CLUB}/logbook_dive_confirmations`;
const TASKS = `clubs/${CLUB}/formation_tasks`;

const tasks = () => [...mockDb._m(TASKS).values()];
const buddyTasks = () => tasks().filter((t) => t.type === 'buddy_confirmation');

async function seedConf(id, status) {
  await new Ref(mockDb, CONF, id).set({
    target_member_id: MEMBER,
    target_member_name: 'Alice',
    status,
  });
}
function event(afterStatus) {
  return {
    params: { clubId: CLUB },
    data: {
      after: { exists: true, data: () => ({ target_member_id: MEMBER, target_member_name: 'Alice', status: afterStatus }) },
      before: { exists: false },
    },
  };
}

beforeEach(() => { mockDb = new FS(); });

describe('handleBuddyConfirmationTask', () => {
  it('creates one aggregated task when confirmations are pending', async () => {
    await seedConf('c1', 'pending');
    await seedConf('c2', 'pending');
    await handleBuddyConfirmationTask(event('pending'));
    expect(buddyTasks()).toHaveLength(1);
    expect(buddyTasks()[0].title).toMatch(/2 plongées/);
    expect(buddyTasks()[0].current_assignee_id).toBe(MEMBER);
    expect(buddyTasks()[0].context.pending_count).toBe(2);
  });

  it('does not create a second task if one is already open (updates count)', async () => {
    await seedConf('c1', 'pending');
    await new Ref(mockDb, TASKS, 't1').set({
      type: 'buddy_confirmation', status: 'open',
      current_assignee_id: MEMBER, context: { pending_count: 5 },
    });
    await handleBuddyConfirmationTask(event('pending'));
    const open = buddyTasks().filter((t) => t.status === 'open');
    expect(open).toHaveLength(1);
    expect(open[0].context.pending_count).toBe(1);
  });

  it('resolves the open task when no confirmations remain pending', async () => {
    // no pending confirmations seeded
    await new Ref(mockDb, TASKS, 't1').set({
      type: 'buddy_confirmation', status: 'open',
      current_assignee_id: MEMBER, context: { pending_count: 1 },
    });
    await handleBuddyConfirmationTask(event('confirmed_copied'));
    expect(buddyTasks()[0].status).toBe('done');
  });
});
