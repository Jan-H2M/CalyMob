/**
 * Unit tests for the WP-02 rejection chain Cloud Functions.
 *
 * We test the exported inner handlers (handleClaimRejected /
 * handleClaimResubmitted) against a tiny in-memory Firestore fake, so we don't
 * need the emulator. badge-helper (FCM) and onClaimSubmitted (assignee
 * resolution) are mocked to keep the tests deterministic and offline.
 */

// ---- Mocks -----------------------------------------------------------------

let mockDb;

jest.mock('firebase-admin', () => ({
  firestore: () => mockDb,
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__server_ts__' },
}));

jest.mock('../utils/badge-helper', () => ({
  collectTokensAndMembers: () => ({ memberTokenGroups: new Map() }),
  sendNotificationsWithBadge: jest.fn(async () => ({ successCount: 0, failureCount: 0 })),
}));

jest.mock('./onClaimSubmitted', () => ({
  resolveAssignee: jest.fn(async () => ({ id: 'monitor-1', type: 'monitor', source: 'test' })),
  composeTaskTitle: jest.fn(() => 'Valider exercice P2.DP (Alice)'),
}));

const { handleClaimRejected } = require('./onClaimRejected');
const { handleClaimResubmitted } = require('./onClaimResubmitted');

// ---- In-memory Firestore fake ---------------------------------------------

function getPath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}
function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
function clone(o) {
  return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
}
function matchFilter(data, f) {
  const v = getPath(data, f.field);
  if (f.op === '==') return v === f.val;
  if (f.op === 'in') return Array.isArray(f.val) && f.val.includes(v);
  return false;
}

class FakeFirestore {
  constructor() {
    this.store = new Map();
    this.auto = 0;
  }
  _map(path) {
    if (!this.store.has(path)) this.store.set(path, new Map());
    return this.store.get(path);
  }
  collection(path) {
    return new FakeCollection(this, path);
  }
}
class FakeCollection {
  constructor(fs, path) {
    this.fs = fs;
    this.path = path;
  }
  doc(id) {
    return new FakeDocRef(this.fs, this.path, id || `auto_${++this.fs.auto}`);
  }
  where(field, op, val) {
    return new FakeQuery(this.fs, this.path, [{ field, op, val }]);
  }
  get() {
    return new FakeQuery(this.fs, this.path, []).get();
  }
}
class FakeDocRef {
  constructor(fs, path, id) {
    this.fs = fs;
    this.path = path;
    this.id = id;
  }
  collection(sub) {
    return new FakeCollection(this.fs, `${this.path}/${this.id}/${sub}`);
  }
  async get() {
    const m = this.fs._map(this.path);
    const has = m.has(this.id);
    return {
      exists: has,
      id: this.id,
      data: () => (has ? clone(m.get(this.id)) : undefined),
      ref: this,
    };
  }
  async set(data) {
    this.fs._map(this.path).set(this.id, clone(data));
  }
  async update(data) {
    const m = this.fs._map(this.path);
    const cur = m.get(this.id) || {};
    for (const [k, v] of Object.entries(data)) {
      if (k.includes('.')) setPath(cur, k, v);
      else cur[k] = v;
    }
    m.set(this.id, cur);
  }
}
class FakeQuery {
  constructor(fs, path, filters) {
    this.fs = fs;
    this.path = path;
    this.filters = filters;
    this._limit = null;
  }
  where(field, op, val) {
    return new FakeQuery(this.fs, this.path, [...this.filters, { field, op, val }]);
  }
  limit(n) {
    this._limit = n;
    return this;
  }
  orderBy() {
    return this;
  }
  async get() {
    const m = this.fs._map(this.path);
    let docs = [...m.entries()].map(([id, data]) => ({ id, data }));
    docs = docs.filter((d) => this.filters.every((f) => matchFilter(d.data, f)));
    if (this._limit != null) docs = docs.slice(0, this._limit);
    const out = docs.map((d) => ({
      id: d.id,
      data: () => clone(d.data),
      ref: new FakeDocRef(this.fs, this.path, d.id),
    }));
    return { empty: out.length === 0, docs: out, size: out.length };
  }
}

// ---- Helpers ---------------------------------------------------------------

const CLUB = 'calypso';
const CLAIM_ID = 'claim-1';
const CLAIMS_PATH = `clubs/${CLUB}/exercise_claims`;
const TASKS_PATH = `clubs/${CLUB}/formation_tasks`;

function tasks() {
  return [...mockDb._map(TASKS_PATH).values()];
}
function tasksOfType(type) {
  return tasks().filter((t) => t.type === type);
}

async function seedClaim(data) {
  await new FakeDocRef(mockDb, CLAIMS_PATH, CLAIM_ID).set(data);
}
function claimNow() {
  return mockDb._map(CLAIMS_PATH).get(CLAIM_ID);
}
function eventFor(before, after) {
  const ref = new FakeDocRef(mockDb, CLAIMS_PATH, CLAIM_ID);
  return {
    params: { clubId: CLUB, claimId: CLAIM_ID },
    data: {
      before: { data: () => clone(before) },
      after: { data: () => clone(after), ref },
    },
  };
}

beforeEach(() => {
  mockDb = new FakeFirestore();
});

// ---- onClaimRejected -------------------------------------------------------

describe('handleClaimRejected', () => {
  const base = {
    member_id: 'alice',
    member_name: 'Alice',
    exercise_code: 'P2.DP',
    exercise_label: 'Direction de palanquée',
    validation_mode: 'calypso_monitor',
  };

  it('creates a claim_rejected task once, closes the parent, marks feedback_task_id', async () => {
    // Seed an open parent monitor_validation task for the claim.
    await new FakeDocRef(mockDb, TASKS_PATH, 'mv-1').set({
      type: 'monitor_validation',
      status: 'open',
      context: { exercise_claim_id: CLAIM_ID },
    });
    const before = { ...base, status: 'submitted' };
    const after = {
      ...base,
      status: 'rejected',
      decision: { rejected_reason: 'Technique à retravailler', rejected_by: 'monitor-1' },
    };
    await seedClaim(after);

    await handleClaimRejected(eventFor(before, after));

    expect(tasksOfType('claim_rejected')).toHaveLength(1);
    const rej = tasksOfType('claim_rejected')[0];
    expect(rej.member_id).toBe('alice');
    expect(rej.current_assignee_id).toBe('alice');
    expect(rej.context.rejected_reason).toBe('Technique à retravailler');
    expect(rej.available_actions.map((a) => a.key)).toEqual(['retry', 'abandon']);
    // parent closed
    expect(mockDb._map(TASKS_PATH).get('mv-1').status).toBe('done');
    // feedback marker written on the claim
    expect(claimNow().decision.feedback_task_id).toBeTruthy();
  });

  it('is idempotent on a duplicate event delivery (only one task)', async () => {
    const before = { ...base, status: 'submitted' };
    const after = { ...base, status: 'rejected', decision: { rejected_reason: 'Exercice incomplet' } };
    await seedClaim(after);

    // Same event delivered twice (identical snapshot, no feedback_task_id yet).
    await handleClaimRejected(eventFor(before, after));
    await handleClaimRejected(eventFor(before, after));

    expect(tasksOfType('claim_rejected')).toHaveLength(1);
  });

  it('does nothing when status did not transition to rejected', async () => {
    const before = { ...base, status: 'rejected' };
    const after = { ...base, status: 'rejected' };
    await seedClaim(after);
    await handleClaimRejected(eventFor(before, after));
    expect(tasksOfType('claim_rejected')).toHaveLength(0);
  });
});

// ---- onClaimResubmitted ----------------------------------------------------

describe('handleClaimResubmitted', () => {
  const base = {
    member_id: 'alice',
    member_name: 'Alice',
    exercise_code: 'P2.DP',
    validation_mode: 'calypso_monitor',
  };

  it('creates a new monitor_validation task and closes the open claim_rejected', async () => {
    await new FakeDocRef(mockDb, TASKS_PATH, 'rej-1').set({
      type: 'claim_rejected',
      status: 'open',
      context: { exercise_claim_id: CLAIM_ID },
    });
    const before = { ...base, status: 'rejected', retry_count: 0 };
    const after = { ...base, status: 'submitted', retry_count: 1 };
    await seedClaim(after);

    await handleClaimResubmitted(eventFor(before, after));

    const mv = tasksOfType('monitor_validation');
    expect(mv).toHaveLength(1);
    expect(mv[0].status).toBe('open');
    expect(mv[0].current_assignee_id).toBe('monitor-1');
    expect(mv[0].context.resubmission).toBe(true);
    // the old claim_rejected task is closed
    expect(mockDb._map(TASKS_PATH).get('rej-1').status).toBe('done');
  });

  it('does not create a second validation task if one is already open (idempotent)', async () => {
    await new FakeDocRef(mockDb, TASKS_PATH, 'mv-open').set({
      type: 'monitor_validation',
      status: 'open',
      context: { exercise_claim_id: CLAIM_ID },
    });
    const before = { ...base, status: 'rejected' };
    const after = { ...base, status: 'submitted', retry_count: 1 };
    await seedClaim(after);

    await handleClaimResubmitted(eventFor(before, after));

    expect(tasksOfType('monitor_validation')).toHaveLength(1);
  });

  it('assigns an external reviewer on the claim for Storage access', async () => {
    const external = { ...base, validation_mode: 'external_monitor' };
    const before = { ...external, status: 'rejected', retry_count: 0 };
    const after = { ...external, status: 'submitted', retry_count: 1 };
    await seedClaim(after);

    await handleClaimResubmitted(eventFor(before, after));

    expect(tasksOfType('external_proof_review')).toHaveLength(1);
    expect(claimNow().external_reviewer_id).toBe('monitor-1');
    expect(claimNow().review_task_id).toBeTruthy();
  });

  it('does nothing on abandon (rejected → abandoned): no new task', async () => {
    const before = { ...base, status: 'rejected' };
    const after = { ...base, status: 'abandoned' };
    await seedClaim(after);

    await handleClaimResubmitted(eventFor(before, after));

    expect(tasksOfType('monitor_validation')).toHaveLength(0);
  });
});
