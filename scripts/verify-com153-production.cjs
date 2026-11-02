'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'releases/com153-borg/manifest.json')));
const source = path.join(repo, manifest.source);
const config = JSON.parse(fs.readFileSync(path.join(repo, 'firebase.com153-production.json')));
const expectedExports = ['getMaterialLoanPaymentQr', 'sendMaterialLoanPaymentQrEmail'];
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

assert.equal(manifest.project, 'calycompta');
assert.equal(manifest.region, 'europe-west1');
assert.equal(manifest.source, 'releases/com153-borg/functions');
assert.deepEqual(manifest.exports, expectedExports);
assert.equal(config.functions.source, manifest.source);
assert.equal(config.functions.codebase, 'default');
assert.deepEqual(Object.keys(config), ['functions']);

const actualFiles = [];
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    assert(!entry.isSymbolicLink(), `Unexpected symlink: ${entry.name}`);
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(file);
    else actualFiles.push(path.relative(source, file).split(path.sep).join('/'));
  }
}
inspect(source);
assert.deepEqual(actualFiles.sort(), Object.keys(manifest.candidateFileSha256).sort());
for (const [file, expected] of Object.entries(manifest.candidateFileSha256)) {
  assert.equal(digest(path.join(source, file)), expected, `Candidate drift: ${file}`);
}
for (const file of ['package.json', 'package-lock.json', 'src/utils/emailDelivery.js', 'src/utils/communicationTemplates.js']) {
  assert.equal(digest(path.join(source, file)), manifest.baselineFileSha256[file], `Live baseline drift: ${file}`);
}
for (const file of manifest.backportFiles) {
  assert.equal(digest(path.join(source, file)), digest(path.join(repo, 'functions', file)), `Backport differs from main source: ${file}`);
}

// Loading definitions initializes the SDK but never invokes a callable or reads data.
const exported = require(path.join(source, 'index.js'));
assert.deepEqual(Object.keys(exported).sort(), [...expectedExports].sort());
for (const callable of Object.values(exported)) {
  assert.equal(callable.__endpoint.platform, 'gcfv2');
  assert.deepEqual(callable.__endpoint.region, ['europe-west1']);
  assert.equal(callable.__endpoint.timeoutSeconds, 60);
  assert.equal(callable.__endpoint.maxInstances, 10);
}
console.log('COM-153 production bundle verified: exactly two callables; live dependencies/transports unchanged.');
