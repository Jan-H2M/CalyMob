'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { MemoryFirestore } = require('../functions/test-utils/memoryFirestore');
const {
  parseArgs,
  assertSafety,
  rootSeedMillis,
  analyzeStrictCohort,
  run,
} = require('./record-unread-cursor-v1-migration-baseline.cjs');

const baselineIso = '2026-09-25T08:26:55.038Z';
const baselineMs = Date.parse(baselineIso);
const ts = value => ({
  toMillis: () => value,
  toDate: () => new Date(value),
});

function root(section, value = baselineMs) {
  return section === 'announcements'
    ? { schema_version: 1, last_seen_at: ts(value), updated_at: ts(value) }
    : { schema_version: 1, global_last_seen_at: ts(value), updated_at: ts(value) };
}

function database() {
  const documents = {
    'clubs/calypso/settings/feature_flags': {
      unreadCursorV1Enabled: true,
      unreadCursorV1Mode: 'shadow',
      unreadCursorV1PilotMemberIds: ['pilot'],
    },
    'clubs/calypso/members/active-a': { member_status: 'active' },
    'clubs/calypso/members/active-b': { member_status: 'active' },
    'clubs/calypso/members/pilot': { member_status: 'active' },
  };
  for (const member of ['active-a', 'active-b']) {
    for (const section of ['announcements', 'events', 'teams', 'sessions']) {
      documents[`clubs/calypso/members/${member}/read_state/${section}`] = root(section);
    }
  }
  return new MemoryFirestore(documents);
}

function applyOptions(backupDir) {
  return {
    mode: 'apply',
    club: 'calypso',
    project: 'demo-marker-repair',
    confirmProduction: 'demo-marker-repair',
    expectedBaseline: baselineIso,
    backupDir,
  };
}

test('recognizes only untouched root seed shapes', () => {
  assert.equal(rootSeedMillis('announcements', {
    schema_version: 1,
    last_seen_at: ts(10),
    updated_at: ts(10),
  }), 10);
  assert.equal(rootSeedMillis('events', {
    schema_version: 1,
    global_last_seen_at: ts(10),
    updated_at: ts(11),
  }), null);
});

test('accepts only one exact four-root cohort', () => {
  const valid = analyzeStrictCohort([
    { id: 'a', roots: [1, 2, 3, 4].map(() => ({ seedMs: 10 })) },
    { id: 'b', roots: [1, 2, 3, 4].map(() => ({ seedMs: 10 })) },
  ]);
  assert.equal(valid.baselineMs, 10);
  assert.deepEqual(valid.invalidMembers, []);

  const divergent = analyzeStrictCohort([
    { id: 'a', roots: [10, 10, 10, 11].map(seedMs => ({ seedMs })) },
  ]);
  assert.equal(divergent.baselineMs, null);
  assert.deepEqual(divergent.invalidMembers, ['a']);
});

test('production apply requires exact expected baseline and confirmation', () => {
  const base = parseArgs(['--apply', '--project', 'calycompta']);
  assert.throws(() => assertSafety(base, {}), /--expected-baseline/);
  const withBaseline = parseArgs([
    '--apply',
    '--project', 'calycompta',
    '--expected-baseline', baselineIso,
  ]);
  assert.throws(() => assertSafety(withBaseline, {}), /--confirm-production/);
  assert.doesNotThrow(() => assertSafety({
    ...withBaseline,
    confirmProduction: 'calycompta',
  }, {}));
});

test('apply backs up, creates exactly one marker, and is idempotent', async () => {
  const db = database();
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-marker-'));
  let backupObservedBeforeWrite = false;
  assert.equal(await run(applyOptions(backupDir), {
    firestore: db,
    onBackupWritten: async ({ backup }) => {
      assert.equal(fs.existsSync(backup), true);
      const contents = JSON.parse(fs.readFileSync(backup, 'utf8'));
      assert.equal(contents.exists, false);
      backupObservedBeforeWrite = !db.docs.has(
        'clubs/calypso/settings/unread_cursor_v1_migration',
      );
    },
  }), 0);
  assert.equal(backupObservedBeforeWrite, true);
  const markerPath = 'clubs/calypso/settings/unread_cursor_v1_migration';
  const first = db.docs.get(markerPath);
  assert.equal(first.schema_version, 1);
  assert.equal(first.status, 'roots-seeded');
  assert.equal(first.verified_members, 2);
  assert.equal(first.verified_roots, 8);
  assert.deepEqual(first.excluded_pilot_ids, ['pilot']);
  assert.equal(first.baseline_at.toMillis(), baselineMs);

  assert.equal(await run(applyOptions(backupDir), { firestore: db }), 0);
  assert.equal(db.docs.get(markerPath).baseline_at.toMillis(), baselineMs);
  assert.equal(
    fs.readdirSync(backupDir).filter(name => name.endsWith('.json')).length,
    2,
  );
});

test('apply refuses one divergent non-pilot root before backup/write', async () => {
  const db = database();
  db.docs.set(
    'clubs/calypso/members/active-b/read_state/teams',
    root('teams', baselineMs + 1000),
  );
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-marker-'));
  await assert.rejects(
    () => run(applyOptions(backupDir), { firestore: db }),
    /do not prove the exact expected baseline/,
  );
  assert.equal(
    db.docs.has('clubs/calypso/settings/unread_cursor_v1_migration'),
    false,
  );
  assert.deepEqual(fs.readdirSync(backupDir), []);
});
