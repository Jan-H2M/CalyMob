#!/usr/bin/env node
'use strict';

// Repairs the trusted marker for clubs migrated before the marker existed.
// Dry-run is the default. It derives a baseline only when every active
// non-pilot member has four valid, identical seed roots and every selected
// member belongs to the same cohort. No cursor document is ever changed.
const fs = require('fs');
const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');
const { isActiveMember } = require('../functions/src/utils/memberStatus');

const sections = ['announcements', 'events', 'teams', 'sessions'];

function parseArgs(argv) {
  const options = { mode: 'dry-run', club: 'calypso', backupDir: 'tmp' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dry-run' || value === '--apply') options.mode = value.slice(2);
    else if (value === '--club') options.club = argv[++index];
    else if (value === '--project') options.project = argv[++index];
    else if (value === '--expected-baseline') options.expectedBaseline = argv[++index];
    else if (value === '--backup-dir') options.backupDir = argv[++index];
    else if (value === '--confirm-production') options.confirmProduction = argv[++index];
    else throw new Error(`Unknown option: ${value}`);
  }
  if (!options.club) throw new Error('--club requires a value');
  if (options.expectedBaseline
    && !Number.isFinite(Date.parse(options.expectedBaseline))) {
    throw new Error('--expected-baseline must be an ISO timestamp');
  }
  return options;
}

function assertSafety(options, env = process.env) {
  if (options.mode !== 'apply') return;
  if (!options.expectedBaseline) {
    throw new Error('--apply requires --expected-baseline');
  }
  if (env.FIRESTORE_EMULATOR_HOST) return;
  if (!options.project) throw new Error('--project is required outside the emulator');
  if (options.confirmProduction !== options.project) {
    throw new Error('--apply requires --confirm-production <same project id>');
  }
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return null;
}

function rootSeedMillis(section, data) {
  if (data?.schema_version !== 1) return null;
  const cursor = timestampMillis(
    section === 'announcements' ? data.last_seen_at : data.global_last_seen_at,
  );
  const updated = timestampMillis(data.updated_at);
  return cursor != null && cursor === updated ? cursor : null;
}

function analyzeStrictCohort(members) {
  const invalidMembers = [];
  const baselines = new Set();
  for (const member of members) {
    if (!Array.isArray(member.roots) || member.roots.length !== sections.length
      || member.roots.some(root => root.seedMs == null)) {
      invalidMembers.push(member.id);
      continue;
    }
    const memberBaselines = new Set(member.roots.map(root => root.seedMs));
    if (memberBaselines.size !== 1) {
      invalidMembers.push(member.id);
      continue;
    }
    baselines.add(member.roots[0].seedMs);
  }
  return {
    memberCount: members.length,
    rootCount: members.length * sections.length,
    invalidMembers,
    cohortBaselines: [...baselines].sort(),
    baselineMs: members.length > 0
      && invalidMembers.length === 0
      && baselines.size === 1
      ? [...baselines][0]
      : null,
  };
}

async function collectCohort(db, clubId) {
  const flags = await db.doc(`clubs/${clubId}/settings/feature_flags`).get();
  const flagData = flags.data() || {};
  if (flagData.unreadCursorV1Mode === 'on') {
    throw new Error('Refusing cohort inference while cursor mode is globally ON');
  }
  const pilots = new Set(
    Array.isArray(flagData.unreadCursorV1PilotMemberIds)
      ? flagData.unreadCursorV1PilotMemberIds
      : [],
  );
  const allActive = (await db.collection(`clubs/${clubId}/members`).get()).docs
    .filter(member => isActiveMember(member.data()));
  const selected = allActive.filter(member => !pilots.has(member.id));
  if (selected.length === 0) {
    throw new Error('No active non-pilot members available for baseline proof');
  }

  const members = [];
  for (const member of selected) {
    const snapshots = await Promise.all(sections.map(section =>
      member.ref.collection('read_state').doc(section).get()));
    members.push({
      id: member.id,
      roots: snapshots.map((snapshot, index) => ({
        section: sections[index],
        path: snapshot.ref.path,
        exists: snapshot.exists,
        seedMs: rootSeedMillis(sections[index], snapshot.data()),
      })),
    });
  }
  return {
    members,
    activeMembers: allActive.length,
    excludedPilotIds: [...pilots]
      .filter(id => allActive.some(member => member.id === id)),
  };
}

function writeMarkerBackup(options, markerSnapshot) {
  fs.mkdirSync(options.backupDir, { recursive: true });
  const file = path.resolve(
    options.backupDir,
    `unread-cursor-marker-backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(file, JSON.stringify({
    path: markerSnapshot.ref.path,
    exists: markerSnapshot.exists,
    data: markerSnapshot.exists ? markerSnapshot.data() : null,
  }, (_key, value) => {
    if (value && typeof value.toDate === 'function') {
      return { __timestamp: value.toDate().toISOString() };
    }
    return value;
  }, 2));
  return file;
}

async function run(options, { firestore, onBackupWritten } = {}) {
  assertSafety(options);
  if (!admin.apps.length) {
    admin.initializeApp(options.project ? { projectId: options.project } : undefined);
  }
  const db = firestore || admin.firestore();
  const cohort = await collectCohort(db, options.club);
  const analysis = analyzeStrictCohort(cohort.members);
  const expectedBaselineMs = options.expectedBaseline
    ? Date.parse(options.expectedBaseline)
    : null;
  const exactExpectedMatch = expectedBaselineMs == null
    ? null
    : analysis.baselineMs === expectedBaselineMs;
  console.log(JSON.stringify({
    mode: options.mode,
    club: options.club,
    activeMembers: cohort.activeMembers,
    selectedNonPilotMembers: analysis.memberCount,
    excludedPilotIds: cohort.excludedPilotIds,
    invalidMembers: analysis.invalidMembers,
    cohortBaselines: analysis.cohortBaselines.map(value =>
      new Date(value).toISOString()),
    derivedBaseline: analysis.baselineMs == null
      ? null
      : new Date(analysis.baselineMs).toISOString(),
    expectedBaseline: expectedBaselineMs == null
      ? null
      : new Date(expectedBaselineMs).toISOString(),
    exactExpectedMatch,
    rootsChecked: analysis.rootCount,
  }, null, 2));
  if (options.mode !== 'apply') return analysis.baselineMs == null ? 1 : 0;
  if (analysis.baselineMs == null || exactExpectedMatch !== true) {
    throw new Error(
      'Refusing marker: active non-pilot roots do not prove the exact expected baseline',
    );
  }

  const markerRef = db.doc(`clubs/${options.club}/settings/unread_cursor_v1_migration`);
  const markerBefore = await markerRef.get();
  const backup = writeMarkerBackup(options, markerBefore);
  if (onBackupWritten) await onBackupWritten({ backup, markerBefore, db });
  await db.runTransaction(async transaction => {
    const current = await transaction.get(markerRef);
    const currentBaseline = timestampMillis(current.data()?.baseline_at);
    if (current.exists && (
      current.data()?.schema_version !== 1
      || current.data()?.status !== 'roots-seeded'
      || currentBaseline !== analysis.baselineMs
    )) {
      throw new Error('Refusing to overwrite a different migration marker');
    }
    if (!current.exists) {
      transaction.set(markerRef, {
        schema_version: 1,
        status: 'roots-seeded',
        baseline_at: admin.firestore.Timestamp.fromMillis(analysis.baselineMs),
        verified_at: admin.firestore.FieldValue.serverTimestamp(),
        verified_members: analysis.memberCount,
        verified_roots: analysis.rootCount,
        excluded_pilot_ids: cohort.excludedPilotIds,
      });
    }
  });
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
  }
  if (options) {
    run(options)
      .then(code => { process.exitCode = code; })
      .catch(error => {
        console.error(error.stack || error);
        process.exitCode = 1;
      });
  }
}

module.exports = {
  parseArgs,
  assertSafety,
  timestampMillis,
  rootSeedMillis,
  analyzeStrictCohort,
  collectCohort,
  writeMarkerBackup,
  run,
};
