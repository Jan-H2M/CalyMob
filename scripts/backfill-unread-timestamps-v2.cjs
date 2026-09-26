#!/usr/bin/env node
'use strict';

// Canonical unread timestamp backfill. Firestore DocumentSnapshot.createTime
// is the sole authority; legacy device timestamps are reported for skew only.
// Dry-run is the default. The completeness marker is written only after a
// second scan proves that no document still needs repair.
const fs = require('fs');
const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');

const SCHEMA_VERSION = 2;
const MAX_BATCH = 400;
const FIELD_ABSENT = Object.freeze({ __field_state: 'absent' });
const TIMESTAMP_TYPE = 'firestore_timestamp';
const TIMESTAMP_FIELDS = [
  'created_at',
  'unread_created_at',
  'last_activity_at',
  'unread_activity_at',
  'last_reply_at',
  'unread_last_reply_at',
];

function parseArgs(argv) {
  const options = {
    mode: 'dry-run',
    club: 'calypso',
    backupDir: 'tmp',
    batchSize: MAX_BATCH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (['--dry-run', '--apply', '--verify', '--finalize'].includes(arg)) {
      options.mode = arg.slice(2);
    } else if (arg === '--restore') {
      options.mode = 'restore';
      options.restoreManifest = argv[++index];
    } else if (arg === '--project') options.project = argv[++index];
    else if (arg === '--club') options.club = argv[++index];
    else if (arg === '--backup-dir') options.backupDir = argv[++index];
    else if (arg === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (arg === '--confirm-production') options.confirmProduction = argv[++index];
    else if (arg === '--confirm-writer-contract') options.confirmWriterContract = argv[++index];
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.club) throw new Error('--club requires a value');
  if (options.mode === 'restore' && !options.restoreManifest) {
    throw new Error('--restore requires a change-manifest path');
  }
  if (!Number.isInteger(options.batchSize)
    || options.batchSize < 1 || options.batchSize > MAX_BATCH) {
    throw new Error(`--batch-size must be an integer from 1 to ${MAX_BATCH}`);
  }
  return options;
}

function assertSafety(options, env = process.env) {
  if (env.FIRESTORE_EMULATOR_HOST) return;
  if (!options.project) {
    throw new Error('--project is required outside the Firestore emulator');
  }
  if (['apply', 'restore', 'finalize'].includes(options.mode)
    && options.confirmProduction !== options.project) {
    throw new Error(`--${options.mode} requires --confirm-production <same project id>`);
  }
  if (options.mode === 'finalize'
    && options.confirmWriterContract !== 'required') {
    throw new Error('--finalize requires --confirm-writer-contract required');
  }
}

function timestampParts(value) {
  if (!value) return null;
  if (Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (typeof value.toMillis === 'function') {
    const millis = value.toMillis();
    return {
      seconds: Math.floor(millis / 1000),
      nanoseconds: (millis % 1000) * 1e6,
    };
  }
  return null;
}

function sameTimestamp(left, right) {
  const a = timestampParts(left);
  const b = timestampParts(right);
  return !!a && !!b && a.seconds === b.seconds
    && a.nanoseconds === b.nanoseconds;
}

function laterTimestamp(left, right) {
  if (!timestampParts(left)) return right;
  if (!timestampParts(right)) return left;
  const a = timestampParts(left);
  const b = timestampParts(right);
  return a.seconds > b.seconds
    || (a.seconds === b.seconds && a.nanoseconds >= b.nanoseconds)
    ? left
    : right;
}

function timestampMillis(value) {
  const parts = timestampParts(value);
  return parts ? parts.seconds * 1000 + Math.floor(parts.nanoseconds / 1e6) : null;
}

function hasOwn(data, field) {
  return Object.prototype.hasOwnProperty.call(data, field);
}

function fieldState(data, field) {
  return hasOwn(data, field) ? data[field] : FIELD_ABSENT;
}

function hasPlannedChange(item) {
  return Object.keys(item.updates).length > 0 || item.deletes.length > 0;
}

function skewBucket(legacy, authoritative) {
  const legacyMs = timestampMillis(legacy);
  const authoritativeMs = timestampMillis(authoritative);
  if (legacyMs == null) return 'missing_or_malformed';
  const skew = legacyMs - authoritativeMs;
  const direction = skew > 0 ? 'future' : skew < 0 ? 'past' : 'exact';
  const absolute = Math.abs(skew);
  const size = absolute === 0 ? ''
    : absolute <= 60_000 ? '_lte_1m'
      : absolute <= 3_600_000 ? '_lte_1h'
        : absolute <= 86_400_000 ? '_lte_1d' : '_gt_1d';
  return `${direction}${size}`;
}

function planTimestampDocument(snapshot, family) {
  if (!timestampParts(snapshot.createTime)) {
    throw new Error(`Missing createTime for ${snapshot.ref.path}`);
  }
  const data = snapshot.data() || {};
  const authoritative = snapshot.createTime;
  const updates = {};
  if (!sameTimestamp(data.unread_created_at, authoritative)) {
    updates.unread_created_at = authoritative;
  }
  if (!sameTimestamp(data.created_at, authoritative)) {
    updates.created_at = authoritative;
  }
  return {
    ref: snapshot.ref,
    path: snapshot.ref.path,
    family,
    authoritative,
    skew: skewBucket(data.created_at, authoritative),
    before: Object.fromEntries(
      TIMESTAMP_FIELDS.map(field => [field, fieldState(data, field)]),
    ),
    updates,
    deletes: [],
  };
}

function buildTimestampPlan(families) {
  const changes = [];
  const skew = {};
  const skewExamples = {};
  const announcementReplies = new Map();

  const record = item => {
    skew[item.skew] = (skew[item.skew] || 0) + 1;
    if (!skewExamples[item.skew]) skewExamples[item.skew] = [];
    if (skewExamples[item.skew].length < 50) {
      skewExamples[item.skew].push(item.path);
    }
    if (hasPlannedChange(item)) changes.push(item);
  };

  for (const [family, snapshots] of Object.entries(families)) {
    for (const snapshot of snapshots) {
      const item = planTimestampDocument(snapshot, family);
      record(item);
      if (family === 'announcement_replies') {
        const parentPath = snapshot.ref.parent.parent.path;
        announcementReplies.set(
          parentPath,
          laterTimestamp(announcementReplies.get(parentPath), item.authoritative),
        );
      }
    }
  }

  for (const snapshot of families.announcements || []) {
    const own = snapshot.createTime;
    const reply = announcementReplies.get(snapshot.ref.path);
    const activity = laterTimestamp(own, reply);
    const data = snapshot.data() || {};
    const existing = changes.find(item => item.path === snapshot.ref.path);
    const item = existing || planTimestampDocument(snapshot, 'announcements');
    if (!sameTimestamp(data.unread_activity_at, activity)) {
      item.updates.unread_activity_at = activity;
    }
    if (!sameTimestamp(data.last_activity_at, activity)) {
      item.updates.last_activity_at = activity;
    }
    if (reply) {
      if (!sameTimestamp(data.unread_last_reply_at, reply)) {
        item.updates.unread_last_reply_at = reply;
      }
      if (!sameTimestamp(data.last_reply_at, reply)) {
        item.updates.last_reply_at = reply;
      }
    } else {
      for (const field of ['unread_last_reply_at', 'last_reply_at']) {
        if (hasOwn(data, field) && !item.deletes.includes(field)) {
          item.deletes.push(field);
        }
      }
    }
    if (!existing && hasPlannedChange(item)) changes.push(item);
  }

  return {
    scanned: Object.values(families).reduce((sum, docs) => sum + docs.length, 0),
    changes,
    skew,
    skewExamples,
  };
}

async function collectFamilies(db, clubId) {
  const club = db.collection('clubs').doc(clubId);
  const families = {
    announcements: [],
    announcement_replies: [],
    event_messages: [],
    team_messages: [],
    session_messages: [],
  };
  const announcements = await club.collection('announcements').get();
  families.announcements.push(...announcements.docs);
  const replies = await db.collectionGroup('replies').get();
  families.announcement_replies.push(...replies.docs.filter(snapshot =>
    classifyNestedPath(snapshot.ref.path, clubId) === 'announcement_replies'));

  // Collection-group enumeration is intentional. Firestore can retain a
  // messages subcollection while its team-channel parent document is absent;
  // canonical badge counting supports that historical/default-channel shape,
  // so a parent-first scan could falsely certify missing_count=0.
  const messages = await db.collectionGroup('messages').get();
  for (const snapshot of messages.docs) {
    const family = classifyNestedPath(snapshot.ref.path, clubId);
    if (family && family !== 'announcement_replies') {
      families[family].push(snapshot);
    }
  }
  return families;
}

function classifyNestedPath(documentPath, clubId) {
  const parts = documentPath.split('/');
  if (parts.length !== 6 || parts[0] !== 'clubs' || parts[1] !== clubId) {
    return null;
  }
  if (parts[2] === 'announcements' && parts[4] === 'replies') {
    return 'announcement_replies';
  }
  if (parts[4] !== 'messages') return null;
  if (parts[2] === 'operations') return 'event_messages';
  if (parts[2] === 'team_channels') return 'team_messages';
  if (parts[2] === 'piscine_sessions') return 'session_messages';
  return null;
}

function serialize(value) {
  if (value === FIELD_ABSENT || value?.__field_state === 'absent') {
    return { __field_state: 'absent' };
  }
  if (value == null) return value;
  const parts = timestampParts(value);
  if (parts) {
    return {
      __type: TIMESTAMP_TYPE,
      seconds: parts.seconds,
      nanoseconds: parts.nanoseconds,
    };
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function backupMarker(options, marker) {
  fs.mkdirSync(options.backupDir, { recursive: true });
  const destination = path.resolve(
    options.backupDir,
    `unread-timestamp-v2-marker_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(destination, JSON.stringify({
    path: marker.ref.path,
    exists: marker.exists,
    data: marker.exists ? serialize(marker.data()) : null,
  }, null, 2));
  return destination;
}

function changeFieldNames(change) {
  return [...new Set([...Object.keys(change.updates), ...change.deletes])];
}

function buildChangeManifest(options, changes, marker) {
  return {
    schemaVersion: SCHEMA_VERSION,
    authority: 'document_create_time',
    club: options.club,
    project: options.project || null,
    markerBefore: {
      path: marker.ref.path,
      exists: marker.exists,
      data: marker.exists ? serialize(marker.data()) : null,
    },
    changes: changes.map(change => {
      const fields = changeFieldNames(change);
      return {
        path: change.path,
        createTime: serialize(change.authoritative),
        before: Object.fromEntries(
          fields.map(field => [field, serialize(change.before[field])]),
        ),
        after: Object.fromEntries(fields.map(field => [
          field,
          change.deletes.includes(field)
            ? serialize(FIELD_ABSENT)
            : serialize(change.updates[field]),
        ])),
      };
    }),
  };
}

function backupChangeManifest(options, changes, marker) {
  fs.mkdirSync(options.backupDir, { recursive: true });
  const destination = path.resolve(
    options.backupDir,
    `unread-timestamp-v2-changes_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(
    destination,
    JSON.stringify(buildChangeManifest(options, changes, marker), null, 2),
  );
  return destination;
}

async function applyChanges(
  db,
  changes,
  batchSize,
  deleteField = () => admin.firestore.FieldValue.delete(),
) {
  for (let offset = 0; offset < changes.length; offset += batchSize) {
    const batch = db.batch();
    changes.slice(offset, offset + batchSize).forEach(change => {
      const updates = { ...change.updates };
      change.deletes.forEach(field => { updates[field] = deleteField(); });
      batch.update(change.ref, updates);
    });
    await batch.commit();
  }
}

function deserialize(value, timestampFactory = (seconds, nanoseconds) =>
  new admin.firestore.Timestamp(seconds, nanoseconds)) {
  if (value == null) return value;
  if (value.__field_state === 'absent') return FIELD_ABSENT;
  if (value.__type === TIMESTAMP_TYPE
    && Number.isInteger(value.seconds)
    && Number.isInteger(value.nanoseconds)) {
    return timestampFactory(value.seconds, value.nanoseconds);
  }
  if (Array.isArray(value)) {
    return value.map(item => deserialize(item, timestampFactory));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, deserialize(item, timestampFactory)]));
  }
  return value;
}

function sameSerializedState(data, field, expected) {
  return JSON.stringify(serialize(fieldState(data, field)))
    === JSON.stringify(expected);
}

function validateRestoreManifest(manifest, options, markerPath) {
  if (manifest?.schemaVersion !== SCHEMA_VERSION
    || manifest.authority !== 'document_create_time'
    || manifest.club !== options.club
    || !Array.isArray(manifest.changes)
    || manifest.markerBefore?.path !== markerPath) {
    throw new Error('Restore manifest is incompatible with this club/schema');
  }
}

async function readRestoreState(db, manifest) {
  const states = [];
  for (const change of manifest.changes) {
    const snapshot = await db.doc(change.path).get();
    if (!snapshot.exists) {
      throw new Error(`Restore refused: document disappeared: ${change.path}`);
    }
    const data = snapshot.data() || {};
    for (const [field, expected] of Object.entries(change.after || {})) {
      if (!sameSerializedState(data, field, expected)) {
        throw new Error(
          `Restore refused: ${change.path}.${field} changed after backfill`,
        );
      }
    }
    states.push({ snapshot, change });
  }
  return states;
}

function backupRestoreState(options, states, marker) {
  fs.mkdirSync(options.backupDir, { recursive: true });
  const destination = path.resolve(
    options.backupDir,
    `unread-timestamp-v2-pre-restore_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(destination, JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    club: options.club,
    marker: {
      path: marker.ref.path,
      exists: marker.exists,
      data: marker.exists ? serialize(marker.data()) : null,
    },
    documents: states.map(({ snapshot, change }) => ({
      path: snapshot.ref.path,
      fields: Object.fromEntries(Object.keys(change.after || {}).map(field => [
        field,
        serialize(fieldState(snapshot.data() || {}, field)),
      ])),
    })),
  }, null, 2));
  return destination;
}

async function restoreFromManifest({
  db,
  markerRef,
  manifest,
  options,
  deleteField = () => admin.firestore.FieldValue.delete(),
  timestampFactory,
}) {
  validateRestoreManifest(manifest, options, markerRef.path);
  const marker = await markerRef.get();
  const markerData = marker.data() || {};
  if (!marker.exists || markerData.schema_version !== SCHEMA_VERSION
    || !['backfilled', 'enforcing', 'complete'].includes(markerData.status)
    || markerData.authority !== 'document_create_time') {
    throw new Error('Restore refused: current migration marker is not complete');
  }
  const states = await readRestoreState(db, manifest);
  const backup = backupRestoreState(options, states, marker);

  for (let offset = 0; offset < states.length; offset += options.batchSize) {
    const batch = db.batch();
    states.slice(offset, offset + options.batchSize)
      .forEach(({ snapshot, change }) => {
        const updates = {};
        for (const [field, encoded] of Object.entries(change.before || {})) {
          const restored = deserialize(encoded, timestampFactory);
          updates[field] = restored === FIELD_ABSENT ? deleteField() : restored;
        }
        batch.update(snapshot.ref, updates);
      });
    await batch.commit();
  }

  const markerBefore = manifest.markerBefore;
  if (markerBefore.exists) {
    await markerRef.set(deserialize(markerBefore.data, timestampFactory));
  } else {
    await markerRef.delete();
  }

  for (const change of manifest.changes) {
    const restored = await db.doc(change.path).get();
    for (const [field, expected] of Object.entries(change.before || {})) {
      if (!sameSerializedState(restored.data() || {}, field, expected)) {
        throw new Error(`Restore verification failed: ${change.path}.${field}`);
      }
    }
  }
  console.log(`RESTORE_BACKUP ${backup}`);
  return 0;
}

async function finalizeWriterContract({
  markerRef,
  options,
  collectFamiliesFn,
  serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp(),
  backupMarkerFn = backupMarker,
}) {
  const before = await markerRef.get();
  const markerData = before.data() || {};
  if (!before.exists || markerData.schema_version !== SCHEMA_VERSION
    || !['backfilled', 'enforcing', 'complete'].includes(markerData.status)
    || markerData.missing_count !== 0
    || markerData.authority !== 'document_create_time') {
    throw new Error('Finalize refused: a verified backfill marker is required');
  }

  const backup = backupMarkerFn(options, before);
  if (markerData.status !== 'complete') {
    // This marker transition activates the required-field Firestore rules.
    // It must happen before the final collection scan so an old/malformed
    // client write cannot slip into the certified cohort between scan and
    // marker publication.
    await markerRef.set({
      ...markerData,
      status: 'enforcing',
      writer_contract: 'required',
      enforcement_started_at:
        markerData.enforcement_started_at || serverTimestamp(),
    });
  }

  const verification = buildTimestampPlan(await collectFamiliesFn());
  if (verification.changes.length !== 0) {
    throw new Error(
      `Finalize refused after enforcement: ${verification.changes.length} documents still need repair`,
    );
  }
  await markerRef.set({
    ...markerData,
    status: 'complete',
    writer_contract: 'required',
    enforcement_started_at:
      markerData.enforcement_started_at || serverTimestamp(),
    missing_count: 0,
    verified_documents: verification.scanned,
    finalized_at: serverTimestamp(),
  });
  return { backup, scanned: verification.scanned };
}

async function run(options, { firestore } = {}) {
  assertSafety(options);
  if (!admin.apps.length) {
    admin.initializeApp(options.project ? { projectId: options.project } : undefined);
  }
  const db = firestore || admin.firestore();
  const markerRef = db.doc(
    `clubs/${options.club}/settings/unread_timestamp_v2_migration`,
  );
  if (options.mode === 'restore') {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(options.restoreManifest), 'utf8'),
    );
    return restoreFromManifest({ db, markerRef, manifest, options });
  }
  const before = await markerRef.get();
  if (options.mode === 'finalize') {
    const result = await finalizeWriterContract({
      markerRef,
      options,
      collectFamiliesFn: () => collectFamilies(db, options.club),
    });
    console.log(`ENFORCEMENT_BACKUP ${result.backup}`);
    console.log(`FINALIZED_DOCUMENTS ${result.scanned}`);
    return 0;
  }
  const plan = buildTimestampPlan(await collectFamilies(db, options.club));
  console.log(JSON.stringify({
    mode: options.mode,
    club: options.club,
    scanned: plan.scanned,
    writesRequired: plan.changes.length,
    skew: plan.skew,
    skewExamples: plan.skewExamples,
    marker: before.exists ? serialize(before.data()) : null,
  }, null, 2));
  if (options.mode === 'dry-run') return plan.changes.length ? 2 : 0;
  if (options.mode === 'verify') return plan.changes.length ? 2 : 0;

  if (before.exists && (before.data()?.schema_version !== SCHEMA_VERSION
    || !['backfilled', 'enforcing', 'complete'].includes(before.data()?.status))) {
    throw new Error('Refusing to overwrite an incompatible timestamp marker');
  }
  const backup = backupMarker(options, before);
  const changeManifest = backupChangeManifest(
    options,
    plan.changes,
    before,
  );
  await applyChanges(db, plan.changes, options.batchSize);

  // A fresh collection pass catches races/new documents created during apply.
  const verification = buildTimestampPlan(
    await collectFamilies(db, options.club),
  );
  if (verification.changes.length !== 0) {
    throw new Error(
      `Verification failed: ${verification.changes.length} documents still need repair`,
    );
  }
  const priorMarker = before.data() || {};
  const contractAlreadyRequired =
    ['enforcing', 'complete'].includes(priorMarker.status)
    && priorMarker.writer_contract === 'required';
  await markerRef.set({
    ...priorMarker,
    schema_version: SCHEMA_VERSION,
    status: contractAlreadyRequired ? priorMarker.status : 'backfilled',
    missing_count: 0,
    verified_documents: verification.scanned,
    completed_at: admin.firestore.FieldValue.serverTimestamp(),
    authority: 'document_create_time',
    writer_contract:
      contractAlreadyRequired ? 'required' : 'optional_legacy',
  });
  console.log(`BACKUP ${backup}`);
  console.log(`CHANGE_MANIFEST ${changeManifest}`);
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
  timestampParts,
  sameTimestamp,
  laterTimestamp,
  skewBucket,
  planTimestampDocument,
  buildTimestampPlan,
  classifyNestedPath,
  collectFamilies,
  serialize,
  deserialize,
  buildChangeManifest,
  backupChangeManifest,
  applyChanges,
  validateRestoreManifest,
  restoreFromManifest,
  finalizeWriterContract,
  FIELD_ABSENT,
  run,
};
