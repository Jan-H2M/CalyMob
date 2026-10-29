'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WORKFLOW_ID,
  assessBuildNumberSync,
  validateBuildNumberRecord,
} = require('./build_number_sync.cjs');

const live = (overrides = {}) => ({
  localVersion: '1.27.1', localBuild: '536', cloudBuild: '535',
  latestVersion: '1.27.1', latestBuild: '535', ...overrides,
});

test('accepts the exact latest cloud build only for its uploaded marketing version', () => {
  assert.equal(assessBuildNumberSync(live({ localBuild: '535' })).relation, 'matches-latest-cloud');
  assert.throws(() => assessBuildNumberSync(live({
    localVersion: '1.28.0', localBuild: '535',
  })), /already belongs/);
});

test('reserves exactly the next Xcode Cloud build, including after failed cloud runs', () => {
  assert.equal(assessBuildNumberSync(live()).relation, 'reserved-next-cloud');
  assert.equal(assessBuildNumberSync(live({ localVersion: '1.28.0' })).relation, 'reserved-next-cloud');
  assert.equal(assessBuildNumberSync(live({
    localVersion: '1.28.0', localBuild: '537', cloudBuild: '536',
  })).relation, 'reserved-next-cloud');
});

test('rejects stale, skipped and version-regressing reservations with clear errors', () => {
  assert.throws(() => assessBuildNumberSync(live({ localBuild: '531' })), /stale.*reserve build 536/);
  assert.throws(() => assessBuildNumberSync(live({ localBuild: '537' })), /skips.*536/);
  assert.throws(() => assessBuildNumberSync(live({ localVersion: '1.26.9' })), /older/);
  assert.throws(() => assessBuildNumberSync(live({ cloudBuild: '534' })), /behind App Store Connect/);
});

test('release manifest record is bound to workflow, live cloud counter and reservation', () => {
  const record = {
    provider: 'xcode-cloud', workflowId: WORKFLOW_ID,
    observedAt: '2026-10-29T16:32:00Z',
    latestRunId: '11111111-2222-3333-4444-555555555555', latestRunNumber: 535,
    latestUploadedVersion: '1.27.1', latestUploadedBuild: 535,
    reservedVersion: '1.27.1', reservedBuild: 536, relation: 'reserved-next-cloud',
  };
  assert.equal(validateBuildNumberRecord(record, '1.27.1', '536').relation, 'reserved-next-cloud');
  for (const mutate of [
    (value) => { value.workflowId = 'wrong'; },
    (value) => { value.observedAt = 'invalid'; },
    (value) => { value.latestRunNumber = 204; },
    (value) => { value.reservedBuild = 537; },
    (value) => { value.relation = 'matches-latest-cloud'; },
  ]) {
    const changed = structuredClone(record);
    mutate(changed);
    assert.throws(() => validateBuildNumberRecord(changed, '1.27.1', '536'));
  }
});
