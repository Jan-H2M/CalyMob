#!/usr/bin/env node
'use strict';

// Emulator-only integration test for the Phase 5 migration.  It deliberately
// exercises the exported safety guard before any Firebase client is created.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const migration = require('./migrate-unread-read-state-v1.cjs');

const projectId = 'demo-calymob-migration';
const club = 'calypso';

function options(overrides = {}) {
  return {
    mode: 'dry-run',
    club,
    project: projectId,
    backupDir: fs.mkdtempSync(path.join(os.tmpdir(), 'calymob-read-state-migration-')),
    batchSize: 2,
    members: [],
    ...overrides,
  };
}

async function main() {
  assert.throws(
    () => migration.assertSafety({ mode: 'apply' }, {}),
    /--project is required outside the Firestore emulator/,
  );
  assert.throws(
    () => migration.assertSafety({ mode: 'apply', project: 'real-project' }, {}),
    /--confirm-production/,
  );

  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'this test must run under firebase emulators:exec');
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const members = db.collection('clubs').doc(club).collection('members');
  const announcements = db.collection('clubs').doc(club).collection('announcements');
  await Promise.all([
    members.doc('active-a').set({ member_status: 'active', unread_counts: { announcements: 12 } }),
    members.doc('active-b').set({ isActive: true, unread_counts: { team_messages: 4 } }),
    members.doc('inactive').set({ member_status: 'inactive', unread_counts: { announcements: 99 } }),
    members.doc('already').set({ member_status: 'active' }),
  ]);
  const oldTimestamp = admin.firestore.Timestamp.fromDate(new Date('2025-01-01T00:00:00.000Z'));
  await members.doc('already').collection('read_state').doc('announcements').set({
    schema_version: 1,
    last_seen_at: oldTimestamp,
    updated_at: oldTimestamp,
  });
  await announcements.doc('legacy').set({ created_at: oldTimestamp });
  await announcements.doc('deleted').set({ created_at: oldTimestamp, deleted_at: oldTimestamp });

  const dryRun = await migration.run(options({ mode: 'dry-run' }), { firestore: db });
  assert.equal(dryRun, 0);
  assert.equal((await members.doc('active-a').collection('read_state').doc('announcements').get()).exists, false);

  const applyOptions = options({ mode: 'apply' });
  let backupWasBeforeWrites = false;
  const applied = await migration.run(applyOptions, {
    firestore: db,
    onBackupWritten: async () => {
      backupWasBeforeWrites = !(await members.doc('active-a').collection('read_state').doc('events').get()).exists;
    },
  });
  assert.equal(applied, 0);
  assert.equal(backupWasBeforeWrites, true, 'backup hook runs before the first cursor write');
  const backupFiles = fs.readdirSync(applyOptions.backupDir).filter((file) => file.endsWith('.json'));
  assert.equal(backupFiles.length, 1, 'apply writes one pre-write backup');
  const backup = JSON.parse(fs.readFileSync(path.join(applyOptions.backupDir, backupFiles[0]), 'utf8'));
  assert.equal(backup.length, 11, 'three missing roots for already + four roots for each other active member');

  const roots = await Promise.all(['announcements', 'events', 'teams', 'sessions'].map((section) =>
    members.doc('active-a').collection('read_state').doc(section).get(),
  ));
  roots.forEach((snapshot) => assert.equal(snapshot.data().schema_version, 1));
  assert.ok(roots[0].data().last_seen_at.isEqual(roots[0].data().updated_at));
  roots.slice(1).forEach((snapshot) => {
    assert.ok(snapshot.data().global_last_seen_at.isEqual(snapshot.data().updated_at));
    assert.ok(snapshot.data().updated_at.isEqual(roots[0].data().updated_at), 'all roots share one migration timestamp');
  });
  assert.equal((await members.doc('inactive').collection('read_state').doc('events').get()).exists, false);
  assert.deepEqual((await members.doc('active-a').get()).data().unread_counts, { announcements: 12 });
  assert.ok((await members.doc('already').collection('read_state').doc('announcements').get()).data().last_seen_at.isEqual(oldTimestamp));

  assert.equal(await migration.run(options({ mode: 'verify' }), { firestore: db }), 0);
  await members.doc('active-b').collection('read_state').doc('teams').update({ unexpected: true });
  assert.equal(await migration.run(options({ mode: 'verify' }), { firestore: db }), 1, 'verify reports malformed schema-v1 roots');
  assert.equal(await migration.run(options({ mode: 'apply', force: true }), { firestore: db }), 0, '--force repairs schema-v1 roots');
  assert.equal(await migration.run(options({ mode: 'apply' }), { firestore: db }), 0, 'repeat apply is idempotent');
  assert.equal(await migration.run(options({ mode: 'apply', force: true }), { firestore: db }), 0, '--force can reset schema-v1 roots');
  assert.equal(await migration.run(options({ mode: 'dry-run', normalizeAnnouncements: true }), { firestore: db }), 0);
  assert.equal((await announcements.doc('legacy').get()).data().visibility, undefined, 'normalization dry-run writes nothing');
  assert.equal(await migration.run(options({ mode: 'apply', normalizeAnnouncements: true }), { firestore: db }), 0);
  assert.deepEqual((await announcements.doc('legacy').get()).data().visibility, 'published');
  assert.deepEqual((await announcements.doc('deleted').get()).data().visibility, 'deleted');
  assert.ok((await announcements.doc('legacy').get()).data().last_activity_at.isEqual(oldTimestamp));
  assert.equal(await migration.run(options({ mode: 'verify', normalizeAnnouncements: true }), { firestore: db }), 0);
  console.log('PASS unread read_state migration: guard, dry run, batching, backup, active-only, idempotency, verify, and force');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
