'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  assertSafety,
  buildTimestampPlan,
  buildChangeManifest,
  classifyNestedPath,
  finalizeWriterContract,
  parseArgs,
  restoreFromManifest,
  serialize,
  skewBucket,
} = require('./backfill-unread-timestamps-v2.cjs');

class FakeTimestamp {
  constructor(msOrSeconds, nanoseconds) {
    if (Number.isInteger(nanoseconds)) {
      this.seconds = msOrSeconds;
      this.nanoseconds = nanoseconds;
    } else {
      this.seconds = Math.floor(msOrSeconds / 1000);
      this.nanoseconds = (msOrSeconds % 1000) * 1e6;
    }
  }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
  toDate() { return new Date(this.toMillis()); }
}

function snapshot(path, createdMs, data = {}) {
  const segments = path.split('/');
  const parentPath = segments.slice(0, -1).join('/');
  return {
    createTime: new FakeTimestamp(createdMs),
    data: () => data,
    ref: {
      path,
      parent: {
        path: parentPath,
        parent: { path: segments.slice(0, -2).join('/') },
      },
    },
  };
}

test('CLI defaults dry-run and production apply requires exact confirmation', () => {
  assert.equal(parseArgs(['--project', 'p']).mode, 'dry-run');
  assert.throws(
    () => assertSafety({ mode: 'apply', project: 'p' }, {}),
    /confirm-production/,
  );
  assert.doesNotThrow(() => assertSafety({
    mode: 'apply', project: 'p', confirmProduction: 'p',
  }, {}));
  assert.equal(
    parseArgs(['--restore', '/tmp/manifest.json', '--project', 'p'])
      .restoreManifest,
    '/tmp/manifest.json',
  );
  assert.throws(
    () => assertSafety({ mode: 'restore', project: 'p' }, {}),
    /confirm-production/,
  );
  assert.throws(
    () => assertSafety({
      mode: 'finalize', project: 'p', confirmProduction: 'p',
    }, {}),
    /confirm-writer-contract required/,
  );
  assert.doesNotThrow(() => assertSafety({
    mode: 'finalize',
    project: 'p',
    confirmProduction: 'p',
    confirmWriterContract: 'required',
  }, {}));
});

test('collection-group paths include orphan/default team messages exactly once', () => {
  assert.equal(
    classifyNestedPath('clubs/c/team_channels/general/messages/m1', 'c'),
    'team_messages',
  );
  assert.equal(
    classifyNestedPath('clubs/c/operations/o/messages/m2', 'c'),
    'event_messages',
  );
  assert.equal(
    classifyNestedPath('clubs/c/piscine_sessions/s/messages/m3', 'c'),
    'session_messages',
  );
  assert.equal(
    classifyNestedPath('clubs/c/announcements/a/replies/r1', 'c'),
    'announcement_replies',
  );
  assert.equal(
    classifyNestedPath('clubs/other/team_channels/general/messages/m1', 'c'),
    null,
  );
});

test('plan uses createTime, reports skew and rebuilds monotone announcement activity', () => {
  const rootPath = 'clubs/c/announcements/a';
  const root = snapshot(rootPath, 1_000, {
    created_at: new FakeTimestamp(99_000),
  });
  const replyOld = snapshot(`${rootPath}/replies/r1`, 2_000, {});
  const replyNew = snapshot(`${rootPath}/replies/r2`, 3_000, {
    created_at: new FakeTimestamp(500),
  });
  const event = snapshot(
    'clubs/c/operations/o/messages/m',
    4_000,
    { created_at: 'malformed' },
  );
  const plan = buildTimestampPlan({
    announcements: [root],
    announcement_replies: [replyOld, replyNew],
    event_messages: [event],
    team_messages: [],
    session_messages: [],
  });

  const rootChange = plan.changes.find(change => change.path === rootPath);
  assert.equal(rootChange.updates.unread_created_at.toMillis(), 1_000);
  assert.equal(rootChange.updates.created_at.toMillis(), 1_000);
  assert.equal(rootChange.updates.unread_activity_at.toMillis(), 3_000);
  assert.equal(rootChange.updates.unread_last_reply_at.toMillis(), 3_000);
  assert.equal(plan.skew.future_lte_1h, 1);
  assert.equal(plan.skew.missing_or_malformed, 2);
  assert.ok(plan.skewExamples.missing_or_malformed.includes(
    'clubs/c/operations/o/messages/m',
  ));
});

test('an already canonical plan is idempotent', () => {
  const at = new FakeTimestamp(5_000);
  const root = snapshot('clubs/c/announcements/a', 5_000, {
    created_at: at,
    unread_created_at: at,
    last_activity_at: at,
    unread_activity_at: at,
  });
  const plan = buildTimestampPlan({
    announcements: [root],
    announcement_replies: [],
    event_messages: [],
    team_messages: [],
    session_messages: [],
  });
  assert.equal(plan.changes.length, 0);
});

test('plan deletes stale reply timestamps when an announcement has no replies', () => {
  const root = snapshot('clubs/c/announcements/a', 5_000, {
    created_at: new FakeTimestamp(5_000),
    unread_created_at: new FakeTimestamp(5_000),
    last_activity_at: new FakeTimestamp(5_000),
    unread_activity_at: new FakeTimestamp(5_000),
    last_reply_at: new FakeTimestamp(4_000),
    unread_last_reply_at: null,
  });
  const plan = buildTimestampPlan({
    announcements: [root],
    announcement_replies: [],
    event_messages: [],
    team_messages: [],
    session_messages: [],
  });
  const change = plan.changes.find(item => item.path === root.ref.path);
  assert.deepEqual(
    [...change.deletes].sort(),
    ['last_reply_at', 'unread_last_reply_at'],
  );
});

test('manifest preserves nanoseconds and distinguishes absent from null', () => {
  const root = snapshot('clubs/c/announcements/a', 5_000, {
    created_at: new FakeTimestamp(5, 123_000_900),
    unread_last_reply_at: null,
  });
  const plan = buildTimestampPlan({
    announcements: [root],
    announcement_replies: [],
    event_messages: [],
    team_messages: [],
    session_messages: [],
  });
  const marker = {
    exists: false,
    data: () => undefined,
    ref: { path: 'clubs/c/settings/unread_timestamp_v2_migration' },
  };
  const manifest = buildChangeManifest(
    { club: 'c', project: 'p' },
    plan.changes,
    marker,
  );
  const change = manifest.changes[0];
  assert.deepEqual(change.before.created_at, {
    __type: 'firestore_timestamp', seconds: 5, nanoseconds: 123_000_900,
  });
  assert.equal(change.before.unread_last_reply_at, null);
  assert.deepEqual(change.before.unread_created_at, {
    __field_state: 'absent',
  });
  assert.deepEqual(serialize(new FakeTimestamp(8, 999_999_999)), {
    __type: 'firestore_timestamp', seconds: 8, nanoseconds: 999_999_999,
  });
});

test('skew buckets distinguish past, future and malformed legacy clocks', () => {
  const authoritative = new FakeTimestamp(100_000);
  assert.equal(skewBucket(null, authoritative), 'missing_or_malformed');
  assert.equal(skewBucket(new FakeTimestamp(100_000), authoritative), 'exact');
  assert.equal(skewBucket(new FakeTimestamp(101_000), authoritative), 'future_lte_1m');
  assert.equal(skewBucket(new FakeTimestamp(0), authoritative), 'past_lte_1h');
});

const DELETE = Symbol('delete');

class RestoreRef {
  constructor(db, documentPath) {
    this.db = db;
    this.path = documentPath;
  }
  async get() {
    const data = this.db.docs.get(this.path);
    return {
      exists: data !== undefined,
      data: () => data,
      ref: this,
    };
  }
  async set(data) { this.db.docs.set(this.path, data); }
  async delete() { this.db.docs.delete(this.path); }
  async update(updates) {
    const current = { ...(this.db.docs.get(this.path) || {}) };
    for (const [field, value] of Object.entries(updates)) {
      if (value === DELETE) delete current[field];
      else current[field] = value;
    }
    this.db.docs.set(this.path, current);
  }
}

class RestoreDb {
  constructor(documents) { this.docs = new Map(Object.entries(documents)); }
  doc(documentPath) { return new RestoreRef(this, documentPath); }
  batch() {
    const writes = [];
    return {
      update: (ref, data) => writes.push(() => ref.update(data)),
      commit: async () => Promise.all(writes.map(write => write())),
    };
  }
}

function restoreFixture() {
  const documentPath = 'clubs/c/announcements/a';
  const markerPath = 'clubs/c/settings/unread_timestamp_v2_migration';
  const canonical = new FakeTimestamp(10, 123_000_900);
  const db = new RestoreDb({
    [documentPath]: {
      created_at: canonical,
      unread_created_at: canonical,
    },
    [markerPath]: {
      schema_version: 2,
      status: 'complete',
      authority: 'document_create_time',
    },
  });
  const manifest = {
    schemaVersion: 2,
    authority: 'document_create_time',
    club: 'c',
    project: 'p',
    markerBefore: { path: markerPath, exists: false, data: null },
    changes: [{
      path: documentPath,
      before: {
        created_at: {
          __type: 'firestore_timestamp', seconds: 9, nanoseconds: 500,
        },
        unread_created_at: { __field_state: 'absent' },
      },
      after: {
        created_at: serialize(canonical),
        unread_created_at: serialize(canonical),
      },
    }],
  };
  return { db, documentPath, markerPath, manifest };
}

test('restore validates after-state, restores exact values and removes marker', async t => {
  const fixture = restoreFixture();
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unread-v2-restore-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  await restoreFromManifest({
    db: fixture.db,
    markerRef: fixture.db.doc(fixture.markerPath),
    manifest: fixture.manifest,
    options: { club: 'c', project: 'p', backupDir, batchSize: 10 },
    deleteField: () => DELETE,
    timestampFactory: (seconds, nanoseconds) =>
      new FakeTimestamp(seconds, nanoseconds),
  });
  const restored = fixture.db.docs.get(fixture.documentPath);
  assert.equal(restored.created_at.seconds, 9);
  assert.equal(restored.created_at.nanoseconds, 500);
  assert.equal('unread_created_at' in restored, false);
  assert.equal(fixture.db.docs.has(fixture.markerPath), false);
  assert.equal(fs.readdirSync(backupDir).length, 1);
});

test('restore refuses a one-nanosecond drift before writing anything', async t => {
  const fixture = restoreFixture();
  fixture.db.docs.get(fixture.documentPath).unread_created_at =
    new FakeTimestamp(10, 123_000_901);
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unread-v2-refuse-'));
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
  await assert.rejects(
    restoreFromManifest({
      db: fixture.db,
      markerRef: fixture.db.doc(fixture.markerPath),
      manifest: fixture.manifest,
      options: { club: 'c', project: 'p', backupDir, batchSize: 10 },
      deleteField: () => DELETE,
      timestampFactory: (seconds, nanoseconds) =>
        new FakeTimestamp(seconds, nanoseconds),
    }),
    /changed after backfill/,
  );
  assert.equal(fixture.db.docs.has(fixture.markerPath), true);
  assert.equal(fs.readdirSync(backupDir).length, 0);
});

function emptyFamilies() {
  return {
    announcements: [],
    announcement_replies: [],
    event_messages: [],
    team_messages: [],
    session_messages: [],
  };
}

test('finalize enforces writers before its final scan and then completes', async () => {
  const markerPath = 'clubs/c/settings/unread_timestamp_v2_migration';
  const db = new RestoreDb({
    [markerPath]: {
      schema_version: 2,
      status: 'backfilled',
      missing_count: 0,
      authority: 'document_create_time',
      writer_contract: 'optional_legacy',
    },
  });
  let scannedWhileEnforcing = false;
  const result = await finalizeWriterContract({
    markerRef: db.doc(markerPath),
    options: { club: 'c' },
    collectFamiliesFn: async () => {
      const marker = db.docs.get(markerPath);
      scannedWhileEnforcing = marker.status === 'enforcing'
        && marker.writer_contract === 'required';
      return emptyFamilies();
    },
    serverTimestamp: () => 'server-time',
    backupMarkerFn: () => '/backup/marker.json',
  });
  assert.equal(scannedWhileEnforcing, true);
  assert.equal(db.docs.get(markerPath).status, 'complete');
  assert.equal(db.docs.get(markerPath).writer_contract, 'required');
  assert.equal(result.backup, '/backup/marker.json');
});

test('post-enforcement legacy race is refused and a clean retry converges', async () => {
  const markerPath = 'clubs/c/settings/unread_timestamp_v2_migration';
  const db = new RestoreDb({
    [markerPath]: {
      schema_version: 2,
      status: 'backfilled',
      missing_count: 0,
      authority: 'document_create_time',
      writer_contract: 'optional_legacy',
    },
  });
  const created = new FakeTimestamp(12_000);
  let families = {
    ...emptyFamilies(),
    event_messages: [snapshot(
      'clubs/c/operations/o/messages/racing-legacy-writer',
      12_000,
      { created_at: created },
    )],
  };
  const input = {
    markerRef: db.doc(markerPath),
    options: { club: 'c' },
    collectFamiliesFn: async () => families,
    serverTimestamp: () => 'server-time',
    backupMarkerFn: () => '/backup/marker.json',
  };
  await assert.rejects(
    finalizeWriterContract(input),
    /after enforcement: 1 documents still need repair/,
  );
  assert.equal(db.docs.get(markerPath).status, 'enforcing');
  assert.equal(db.docs.get(markerPath).writer_contract, 'required');

  families = {
    ...emptyFamilies(),
    event_messages: [snapshot(
      'clubs/c/operations/o/messages/racing-legacy-writer',
      12_000,
      { created_at: created, unread_created_at: created },
    )],
  };
  await finalizeWriterContract(input);
  assert.equal(db.docs.get(markerPath).status, 'complete');
});
