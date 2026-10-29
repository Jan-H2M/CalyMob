'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WORKFLOW_ID,
  assessBuildNumberSync,
  validateBuildNumberRecord,
} = require('./build_number_sync.cjs');

test('accepts the exact latest build only for its matching marketing version', () => {
  assert.equal(assessBuildNumberSync({
    localVersion: '1.27.1', localBuild: '535', latestVersion: '1.27.1', latestBuild: '535',
  }).relation, 'matches-latest');
  assert.throws(() => assessBuildNumberSync({
    localVersion: '1.28.0', localBuild: '535', latestVersion: '1.27.1', latestBuild: '535',
  }), /already belongs/);
});

test('accepts exactly the next build as the Xcode Cloud reservation', () => {
  assert.equal(assessBuildNumberSync({
    localVersion: '1.27.1', localBuild: '536', latestVersion: '1.27.1', latestBuild: '535',
  }).relation, 'reserved-next');
  assert.equal(assessBuildNumberSync({
    localVersion: '1.28.0', localBuild: '536', latestVersion: '1.27.1', latestBuild: '535',
  }).relation, 'reserved-next');
});

test('rejects stale, skipped and version-regressing reservations with clear errors', () => {
  assert.throws(() => assessBuildNumberSync({
    localVersion: '1.27.1', localBuild: '531', latestVersion: '1.27.1', latestBuild: '535',
  }), /stale.*reserve build 536/);
  assert.throws(() => assessBuildNumberSync({
    localVersion: '1.27.1', localBuild: '537', latestVersion: '1.27.1', latestBuild: '535',
  }), /skips.*536/);
  assert.throws(() => assessBuildNumberSync({
    localVersion: '1.26.9', localBuild: '536', latestVersion: '1.27.1', latestBuild: '535',
  }), /older/);
});

test('release manifest record is bound to workflow, observation and reserved build', () => {
  const record = {
    provider: 'app-store-connect',
    workflowId: WORKFLOW_ID,
    observedAt: '2026-10-29T16:32:00Z',
    observedVersion: '1.27.1',
    observedBuild: 535,
    reservedVersion: '1.27.1',
    reservedBuild: 536,
    relation: 'reserved-next',
  };
  assert.equal(validateBuildNumberRecord(record, '1.27.1', '536').relation, 'reserved-next');
  for (const mutate of [
    (value) => { value.workflowId = 'wrong'; },
    (value) => { value.observedAt = 'invalid'; },
    (value) => { value.reservedBuild = 537; },
    (value) => { value.relation = 'matches-latest'; },
  ]) {
    const changed = structuredClone(record);
    mutate(changed);
    assert.throws(() => validateBuildNumberRecord(changed, '1.27.1', '536'));
  }
});
