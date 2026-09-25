#!/usr/bin/env node
'use strict';

// Intentionally lives with CalyMob, not CalyCompta: it migrates CalyMob's
// cursor schema. It never loads a service account; an operator supplies ADC.
const fs = require('fs');
const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');
const { isActiveMember } = require('../functions/src/utils/memberStatus');

function parseArgs(argv) {
  const options = { mode: 'dry-run', club: 'calypso', backupDir: 'tmp', batchSize: 450, members: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (['--dry-run', '--apply', '--verify'].includes(value)) options.mode = value.slice(2);
    else if (value === '--club') options.club = argv[++i];
    else if (value === '--project') options.project = argv[++i];
    else if (value === '--confirm-production') options.confirmProduction = argv[++i];
    else if (value === '--backup-dir') options.backupDir = argv[++i];
    else if (value === '--limit') options.limit = Number(argv[++i]);
    else if (value === '--batch-size') options.batchSize = Number(argv[++i]);
    else if (value === '--member') options.members.push(argv[++i]);
    else if (value === '--force') options.force = true;
    else throw new Error(`Unknown option: ${value}`);
  }
  if (!options.club) throw new Error('--club requires a value');
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 500) {
    throw new Error('--batch-size must be an integer from 1 to 500');
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 0)) {
    throw new Error('--limit must be a non-negative integer');
  }
  return options;
}

function assertSafety(options, env = process.env) {
  if (env.FIRESTORE_EMULATOR_HOST) return;
  if (!options.project) throw new Error('--project is required outside the Firestore emulator');
  if (options.mode === 'apply' && options.confirmProduction !== options.project) {
    throw new Error('--apply outside emulator requires --confirm-production <same project id>');
  }
}

function cursorPayload(section, timestamp) {
  const base = { schema_version: 1, updated_at: timestamp };
  return section === 'announcements'
    ? { ...base, last_seen_at: timestamp }
    : { ...base, global_last_seen_at: timestamp };
}

function isTimestamp(value) {
  return value && typeof value.toDate === 'function';
}

function isValidRoot(section, data) {
  if (!data || data.schema_version !== 1 || !isTimestamp(data.updated_at)) return false;
  if (section === 'announcements') {
    return isTimestamp(data.last_seen_at)
      && Object.keys(data).every((key) => ['schema_version', 'last_seen_at', 'updated_at'].includes(key));
  }
  return isTimestamp(data.global_last_seen_at)
    && Object.keys(data).every((key) => ['schema_version', 'global_last_seen_at', 'updated_at'].includes(key));
}

function serialise(value) {
  if (value == null) return value;
  if (typeof value.toDate === 'function') return { __timestamp: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(serialise);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialise(item)]));
  return value;
}

async function buildPlan(db, options, timestamp) {
  const club = db.collection('clubs').doc(options.club);
  const members = await club.collection('members').get();
  const selected = members.docs.filter((doc) => isActiveMember(doc.data()))
    .filter((doc) => !options.members.length || options.members.includes(doc.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const limited = Number.isFinite(options.limit) ? selected.slice(0, options.limit) : selected;
  const changes = [];
  for (const member of limited) {
    for (const section of ['announcements', 'events', 'teams', 'sessions']) {
      const ref = member.ref.collection('read_state').doc(section);
      const before = await ref.get();
      if (before.data()?.schema_version === 1 && !options.force) continue;
      changes.push({ ref, path: ref.path, before: before.exists ? before.data() : null, after: cursorPayload(section, timestamp) });
    }
  }
  return { members: limited.map((doc) => doc.id), changes };
}

function writeBackup(options, changes) {
  fs.mkdirSync(options.backupDir, { recursive: true });
  const file = path.resolve(options.backupDir, `unread-read-state-v1-backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(changes.map((change) => ({ path: change.path, data: serialise(change.before) })), null, 2));
  return file;
}

async function applyPlan(db, changes, batchSize) {
  for (let offset = 0; offset < changes.length; offset += batchSize) {
    const batch = db.batch();
    changes.slice(offset, offset + batchSize).forEach((change) => batch.set(change.ref, change.after));
    await batch.commit();
  }
}

async function verify(db, options) {
  const club = db.collection('clubs').doc(options.club);
  const members = (await club.collection('members').get()).docs
    .filter((doc) => isActiveMember(doc.data()))
    .filter((doc) => !options.members.length || options.members.includes(doc.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const limited = Number.isFinite(options.limit) ? members.slice(0, options.limit) : members;
  const missingOrInvalidRoots = [];
  for (const member of limited) {
    for (const section of ['announcements', 'events', 'teams', 'sessions']) {
      const snapshot = await member.ref.collection('read_state').doc(section).get();
      if (!isValidRoot(section, snapshot.data())) missingOrInvalidRoots.push(snapshot.ref.path);
    }
  }
  console.log(JSON.stringify({ mode: 'verify', activeMembers: limited.length, missingOrInvalidRoots }, null, 2));
  return missingOrInvalidRoots.length ? 1 : 0;
}

async function run(options, { firestore, onBackupWritten } = {}) {
  assertSafety(options);
  if (!admin.apps.length) admin.initializeApp(options.project ? { projectId: options.project } : undefined);
  const db = firestore || admin.firestore();
  if (options.mode === 'verify') return verify(db, options);
  const timestamp = admin.firestore.Timestamp.now(); // one consistent migration baseline
  const { members, changes } = await buildPlan(db, options, timestamp);
  changes.forEach((change) => console.log(`${options.mode.toUpperCase()} ${change.path} ${JSON.stringify(serialise(change.before))} -> ${JSON.stringify(serialise(change.after))}`));
  console.log(JSON.stringify({ mode: options.mode, activeMembers: members.length, writes: changes.length }, null, 2));
  if (options.mode !== 'apply') return 0;
  const backup = writeBackup(options, changes); // must succeed before a batch commit
  if (onBackupWritten) await onBackupWritten({ backup, changes, db });
  await applyPlan(db, changes, options.batchSize);
  console.log(`BACKUP ${backup}`);
  return 0;
}

if (require.main === module) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    assertSafety(options);
  } catch (error) {
    console.error(`Safety refusal: ${error.message}`);
    process.exitCode = 2;
    options = null;
  }
  if (options) {
    run(options).then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
  }
}

module.exports = { parseArgs, assertSafety, cursorPayload, isValidRoot, buildPlan, run, serialise };
