'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const moduleRoot = path.join(root, 'lib', 'pool_scan');

// Deliberately update these pins in the same reviewed change when the module's
// file layout or public API is intentionally extended.
const expectedFiles = [
  'pool_scan.dart',
  'src/attendance_client.dart',
  'src/feedback.dart',
];
const expectedExports = [
  'PoolScanCallable',
  'PoolScanErrorBanner',
  'poolScanErrorMessage',
  'recordPoolQrAttendance',
];

function listFiles(directory, prefix = '') {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory()
      ? listFiles(path.join(directory, entry.name), relative)
      : [relative];
  });
}

const actualFiles = listFiles(moduleRoot).sort();
assert.deepEqual(actualFiles, expectedFiles,
  'lib/pool_scan file list changed; update the documented fence pins intentionally');

const barrel = fs.readFileSync(path.join(moduleRoot, 'pool_scan.dart'), 'utf8');
const actualExports = [...barrel.matchAll(/export\s+'[^']+'\s+show\s+([^;]+);/gs)]
  .flatMap(match => match[1].split(',').map(symbol => symbol.trim()))
  .sort();
assert.deepEqual(actualExports, expectedExports,
  'lib/pool_scan exported symbols changed; update the documented fence pins intentionally');

console.log(`Pool-scan fence intact: ${actualFiles.length} files, ${actualExports.length} exports.`);
