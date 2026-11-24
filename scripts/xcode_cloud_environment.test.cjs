'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { WORKFLOW_ID } = require('./build_number_sync.cjs');

function run(overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'calymob-xcc-check-'));
  const pubspec = path.join(directory, 'pubspec.yaml');
  fs.writeFileSync(pubspec, 'name: fixture\nversion: 1.27.1+536\n');
  const result = spawnSync(path.join(__dirname, 'check_xcode_cloud_environment.sh'), [pubspec], {
    encoding: 'utf8',
    env: { ...process.env, CI_XCODE_CLOUD: 'TRUE', CI_WORKFLOW_ID: WORKFLOW_ID,
      CI_BUILD_NUMBER: '536', ...overrides },
  });
  fs.rmSync(directory, { recursive: true, force: true });
  return result;
}

test('exact reviewed Xcode Cloud workflow and reserved build pass', () => {
  assert.equal(run().status, 0);
});

test('wrong workflow, non-cloud execution and consumed reservation fail clearly', () => {
  assert.notEqual(run({ CI_WORKFLOW_ID: 'wrong' }).status, 0);
  assert.notEqual(run({ CI_XCODE_CLOUD: 'FALSE' }).status, 0);
  const consumed = run({ CI_BUILD_NUMBER: '537' });
  assert.notEqual(consumed.status, 0);
  assert.match(consumed.stderr, /does not match pubspec reservation/);
});
