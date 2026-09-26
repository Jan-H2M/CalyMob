#!/usr/bin/env node
'use strict';

// Backfills the server-derived piscine session chat ACL before assignment-
// scoped Firestore rules are deployed. Dry-run is the default. Production
// writes require an exact project confirmation and always emit a manifest.
const fs = require('fs');
const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');
const {
  sessionChatAcl,
  sameSessionChatAcl,
} = require('../functions/src/notifications/sessionChatAccess');

const SCHEMA_VERSION = 1;
const MAX_BATCH = 400;

function parseArgs(argv) {
  const options = {
    mode: 'dry-run',
    club: 'calypso',
    backupDir: 'tmp',
    batchSize: MAX_BATCH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (['--dry-run', '--apply', '--verify', '--restore'].includes(arg)) {
      options.mode = arg.slice(2);
    } else if (arg === '--project') options.project = argv[++index];
    else if (arg === '--club') options.club = argv[++index];
    else if (arg === '--backup-dir') options.backupDir = argv[++index];
    else if (arg === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (arg === '--resume-run-id') options.resumeRunId = argv[++index];
    else if (arg === '--manifest') options.manifest = argv[++index];
    else if (arg === '--confirm-production') {
      options.confirmProduction = argv[++index];
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!options.club) throw new Error('--club requires a value');
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1
    || options.batchSize > MAX_BATCH) {
    throw new Error(`--batch-size must be an integer from 1 to ${MAX_BATCH}`);
  }
  if (options.mode === 'restore' && !options.manifest) {
    throw new Error('--restore requires --manifest <path>');
  }
  return options;
}

function assertSafety(options, env = process.env) {
  if (env.FIRESTORE_EMULATOR_HOST) return;
  if (!options.project) {
    throw new Error('--project is required outside the Firestore emulator');
  }
  if (['apply', 'restore'].includes(options.mode)
    && options.confirmProduction !== options.project) {
    throw new Error(
      `--${options.mode} requires --confirm-production <same project id>`,
    );
  }
}

function planSessions(snapshots) {
  return snapshots.map(snapshot => {
    const data = snapshot.data() || {};
    const expected = sessionChatAcl(data);
    if (sameSessionChatAcl(data.chat_acl, expected)) return null;
    return {
      ref: snapshot.ref,
      path: snapshot.ref.path,
      before: Object.prototype.hasOwnProperty.call(data, 'chat_acl')
        ? { state: 'value', value: data.chat_acl }
        : { state: 'absent' },
      after: expected,
    };
  }).filter(Boolean);
}

function encodeManifestValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') {
    return { $firestoreTimestamp: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map(encodeManifestValue);
  return Object.fromEntries(Object.entries(value).map(
    ([key, nested]) => [key, encodeManifestValue(nested)],
  ));
}

function decodeManifestValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Object.keys(value).length === 1
    && typeof value.$firestoreTimestamp === 'string') {
    const parsed = new Date(value.$firestoreTimestamp);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Manifest contains an invalid Firestore timestamp');
    }
    return admin.firestore.Timestamp.fromDate(parsed);
  }
  if (Array.isArray(value)) return value.map(decodeManifestValue);
  return Object.fromEntries(Object.entries(value).map(
    ([key, nested]) => [key, decodeManifestValue(nested)],
  ));
}

function readManifest(filename, options) {
  const absolute = path.resolve(filename);
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (parsed.schemaVersion !== SCHEMA_VERSION
    || parsed.club !== options.club
    || (options.project && parsed.project && parsed.project !== options.project)
    || typeof parsed.runId !== 'string'
    || !Array.isArray(parsed.changes)) {
    throw new Error('Manifest does not match this session ACL migration');
  }
  return { absolute, parsed };
}

function deepEqual(left, right) {
  return JSON.stringify(encodeManifestValue(left))
    === JSON.stringify(encodeManifestValue(right));
}

function writeManifest(options, marker, changes, runId) {
  fs.mkdirSync(options.backupDir, { recursive: true });
  const destination = path.resolve(
    options.backupDir,
    `session-chat-acl-v1_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(destination, JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    club: options.club,
    project: options.project || null,
    runId,
    markerBefore: marker.exists
      ? { state: 'value', value: encodeManifestValue(marker.data()) }
      : { state: 'absent' },
    changes: changes.map(change => ({
      path: change.path,
      before: encodeManifestValue(change.before),
      after: encodeManifestValue(change.after),
    })),
  }, null, 2));
  return destination;
}

function writeRestoreBackup(options, marker, states, sourceManifest) {
  fs.mkdirSync(options.backupDir, { recursive: true });
  const destination = path.resolve(
    options.backupDir,
    `session-chat-acl-v1_restore_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(destination, JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    kind: 'pre-restore-backup',
    club: options.club,
    project: options.project || null,
    sourceManifest,
    marker: marker.exists
      ? { state: 'value', value: encodeManifestValue(marker.data()) }
      : { state: 'absent' },
    sessions: states.map(state => ({
      path: state.path,
      chatAcl: encodeManifestValue(state.current),
    })),
  }, null, 2));
  return destination;
}

async function collectSessions(db, clubId) {
  const snapshot = await db.collection('clubs').doc(clubId)
    .collection('piscine_sessions').get();
  return snapshot.docs;
}

async function applyChanges(db, changes, batchSize, afterBatch) {
  for (let offset = 0; offset < changes.length; offset += batchSize) {
    const batch = db.batch();
    changes.slice(offset, offset + batchSize).forEach(change => {
      batch.update(change.ref, { chat_acl: change.after });
    });
    await batch.commit();
    if (afterBatch) {
      await afterBatch({
        batchNumber: Math.floor(offset / batchSize) + 1,
        applied: Math.min(offset + batchSize, changes.length),
        total: changes.length,
      });
    }
  }
}

async function restoreFromManifest(db, markerRef, marker, options) {
  const { absolute, parsed } = readManifest(options.manifest, options);
  const markerData = marker.data() || {};
  const markerMatches = marker.exists
    && markerData.run_id === parsed.runId
    && ['running', 'complete'].includes(markerData.status);
  const changes = [];
  const states = [];
  for (const entry of parsed.changes) {
    const ref = db.doc(entry.path);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw new Error(`Restore target no longer exists: ${entry.path}`);
    }
    const data = snapshot.data() || {};
    const current = Object.prototype.hasOwnProperty.call(data, 'chat_acl')
      ? { state: 'value', value: data.chat_acl }
      : { state: 'absent' };
    const before = decodeManifestValue(entry.before);
    const after = decodeManifestValue(entry.after);
    states.push({ path: entry.path, current });
    if (deepEqual(current, before)) continue;
    if (!deepEqual(current, { state: 'value', value: after })) {
      throw new Error(
        `Restore refuses divergent chat_acl at ${entry.path}`,
      );
    }
    changes.push({ ref, path: entry.path, before });
  }
  if (!markerMatches) {
    const alreadyRestored = !marker.exists
      && parsed.markerBefore?.state === 'absent'
      && changes.length === 0;
    if (alreadyRestored) return 0;
    throw new Error('Restore marker does not own the manifest run');
  }

  const backup = writeRestoreBackup(options, marker, states, absolute);
  for (let offset = 0; offset < changes.length; offset += options.batchSize) {
    const batch = db.batch();
    changes.slice(offset, offset + options.batchSize).forEach(change => {
      batch.update(change.ref, change.before.state === 'absent'
        ? { chat_acl: admin.firestore.FieldValue.delete() }
        : { chat_acl: change.before.value });
    });
    await batch.commit();
  }
  if (parsed.markerBefore?.state === 'value') {
    await markerRef.set(decodeManifestValue(parsed.markerBefore.value));
  } else {
    await markerRef.delete();
  }

  for (const entry of parsed.changes) {
    const snapshot = await db.doc(entry.path).get();
    const data = snapshot.data() || {};
    const actual = Object.prototype.hasOwnProperty.call(data, 'chat_acl')
      ? { state: 'value', value: data.chat_acl }
      : { state: 'absent' };
    if (!deepEqual(actual, decodeManifestValue(entry.before))) {
      throw new Error(`Restore verification failed at ${entry.path}`);
    }
  }
  console.log(`RESTORE_BACKUP ${backup}`);
  return 0;
}

async function run(options, {
  firestore,
  environment = process.env,
  afterBatch,
} = {}) {
  assertSafety(options, environment);
  if (!firestore && !admin.apps.length) {
    admin.initializeApp(options.project ? { projectId: options.project } : undefined);
  }
  const db = firestore || admin.firestore();
  const markerRef = db.doc(
    `clubs/${options.club}/settings/session_chat_acl_v1_migration`,
  );
  const [marker, sessions] = await Promise.all([
    markerRef.get(),
    collectSessions(db, options.club),
  ]);
  if (options.mode === 'restore') {
    return restoreFromManifest(db, markerRef, marker, options);
  }
  const changes = planSessions(sessions);
  console.log(JSON.stringify({
    mode: options.mode,
    club: options.club,
    sessions: sessions.length,
    writesRequired: changes.length,
    paths: changes.slice(0, 100).map(change => change.path),
    marker: marker.exists ? marker.data() : null,
  }, null, 2));
  if (options.mode === 'verify') {
    const markerData = marker.data() || {};
    return changes.length === 0
      && marker.exists
      && markerData.schema_version === SCHEMA_VERSION
      && markerData.status === 'complete'
      ? 0
      : 2;
  }
  if (options.mode !== 'apply') return changes.length ? 2 : 0;

  const markerData = marker.data() || {};
  if (marker.exists && markerData.schema_version !== SCHEMA_VERSION) {
    throw new Error('Refusing incompatible session ACL migration marker');
  }
  if (marker.exists && markerData.status === 'complete') {
    if (changes.length) {
      throw new Error(
        'Completed marker has ACL drift; refusing apply until trigger health is investigated',
      );
    }
    return 0;
  }
  let runId;
  let manifest;
  let resumed = false;
  if (marker.exists) {
    if (markerData.status !== 'running'
      || !options.resumeRunId
      || options.resumeRunId !== markerData.run_id
      || typeof markerData.manifest !== 'string') {
      throw new Error(
        'Incomplete migration requires --apply --resume-run-id <exact run id>',
      );
    }
    const loaded = readManifest(markerData.manifest, options);
    if (loaded.parsed.runId !== markerData.run_id) {
      throw new Error('Running marker and manifest run ids do not match');
    }
    runId = markerData.run_id;
    manifest = loaded.absolute;
    resumed = true;
  } else {
    if (options.resumeRunId) {
      throw new Error('Cannot resume: the running marker is absent');
    }
    runId = `${Date.now()}-${process.pid}`;
    manifest = writeManifest(options, marker, changes, runId);
    await markerRef.set({
      schema_version: SCHEMA_VERSION,
      status: 'running',
      run_id: runId,
      started_at: admin.firestore.FieldValue.serverTimestamp(),
      manifest,
    });
  }
  await applyChanges(db, changes, options.batchSize, afterBatch);
  const remaining = planSessions(await collectSessions(db, options.club));
  if (remaining.length) {
    throw new Error(
      `Verification failed: ${remaining.length} sessions still need ACL repair`,
    );
  }
  const currentMarker = await markerRef.get();
  if (currentMarker.data()?.run_id !== runId
    || currentMarker.data()?.status !== 'running') {
    throw new Error('ACL migration marker ownership changed during apply');
  }
  await markerRef.set({
    schema_version: SCHEMA_VERSION,
    status: 'complete',
    run_id: runId,
    verified_sessions: sessions.length,
    completed_at: admin.firestore.FieldValue.serverTimestamp(),
    manifest,
    resumed,
  });
  console.log(`MANIFEST ${manifest}`);
  return 0;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2)))
    .then(code => { process.exitCode = code; })
    .catch(error => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  SCHEMA_VERSION,
  parseArgs,
  assertSafety,
  planSessions,
  encodeManifestValue,
  decodeManifestValue,
  readManifest,
  restoreFromManifest,
  run,
};
