'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { readExports, normalizeLive, compareLive, validateManifest } = require('./audit-firebase-inventory.cjs');
const root = path.resolve(__dirname, '..');
const readFile = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(readFile('functions/config/function-inventory.json'));
const exported = readExports(readFile('functions/index.js'));

test('all DEV exports have source files; Gen1 remains separately owned', () => {
  const summary = validateManifest(manifest, exported, readFile);
  assert.equal(summary.live, 127);
  assert.equal(summary.firebase, 126);
  assert.equal(summary.external, 1);
  assert.equal(summary.repoExports, 127);
  assert.equal(summary.missingFromMainAtAudit.length, 15);
  assert.deepEqual(summary.repoOnly, ['dailyMedicalExpiryReminder']);
});

test('missing, new, remapped or externally adopted exports fail', () => {
  const missing = new Map(exported); missing.delete('recordPoolQrAttendance');
  assert.throws(() => validateManifest(manifest, missing, readFile), /missing: recordPoolQrAttendance/);
  assert.throws(() => validateManifest(manifest, new Map([...exported, ['newFunction', 'functions/src/new.js']]), readFile), /added: newFunction/);
  const remapped = new Map(exported); remapped.set('recordPoolQrAttendance', 'functions/src/new.js');
  assert.throws(() => validateManifest(manifest, remapped, readFile), /Handler mapping changed/);
  assert.throws(() => validateManifest(manifest, new Map([...exported, ['confirmResolution', 'functions/src/new.js']]), readFile), /External function/);
});

test('duplicate manifest entries and absent implementation files fail', () => {
  const duplicate = structuredClone(manifest);
  duplicate.firebaseFunctions.push(duplicate.firebaseFunctions[0]);
  assert.throws(() => validateManifest(duplicate, exported, readFile), /Duplicate inventory/);
  assert.throws(() => validateManifest(manifest, exported, () => { throw new Error('missing source file'); }), /missing source file/);
});

test('restricted static reader supports current forms without loading modules', () => {
  assert.deepEqual([...readExports(`
const { a } = require('./src/a');
const b = require('./src/b');
exports.a = a;
exports.b = b.handler;
exports.c = require('./src/c').handler;
`)], [['a', 'functions/src/a.js'], ['b', 'functions/src/b.js'], ['c', 'functions/src/c.js']]);
  for (const code of ["exports['a'] = 1;", 'module.exports = {};', 'exports.a = unknown;',
    "const {a} = require('./src/a'); exports.a = a;", 'Object.assign(exports, {});']) {
    assert.throws(() => readExports(code));
  }
});

test('Gen1/Gen2 normalization drops secrets and signed URLs, rejects other projects and duplicates', () => {
  const base = {name:'projects/calycompta/locations/europe-west1/functions/example',
    runtime:'nodejs22', entryPoint:'example', status:'ACTIVE', updateTime:'2026-11-02T12:00:00Z',
    httpsTrigger:{url:'https://example.invalid'}, labels:{'deployment-tool':'cli-gcloud'},
    environmentVariables:{secret:'do-not-retain'}, sourceUploadUrl:'do-not-retain'};
  const gen1 = normalizeLive([base], 'calycompta')[0];
  assert.equal(gen1.generation, 'GEN_1');
  assert.equal(gen1.state, 'ACTIVE');
  assert.equal(JSON.stringify(gen1).includes('do-not-retain'), false);
  const gen2 = normalizeLive([{...base, environment:'GEN_2', state:'ACTIVE',
    buildConfig:{runtime:'nodejs22', entryPoint:'example'},
    eventTrigger:{eventType:'google.cloud.firestore.document.v1.created'}}], 'calycompta')[0];
  assert.equal(gen2.trigger, 'google.cloud.firestore.document.v1.created');
  assert.throws(() => normalizeLive([base], 'another-project'), /project/);
  assert.throws(() => normalizeLive([base, base], 'calycompta'), /Duplicate/);
  assert.throws(() => normalizeLive([{...base, entryPoint:null}], 'calycompta'), /Incomplete/);
});

test('live additions, removals, regions, state, runtime and redeploys are visible', () => {
  const snapshot = [...manifest.firebaseFunctions, ...manifest.externalFunctions];
  assert.deepEqual(compareLive(manifest, snapshot), []);
  assert.match(compareLive(manifest, snapshot.slice(1)).join('\n'), /Missing live/);
  assert.match(compareLive(manifest, [...snapshot, {...snapshot[0], name:'newFunction'}]).join('\n'), /Uninventoried/);
  for (const [field, value] of Object.entries({region:'europe-west9', state:'FAILED', runtime:'nodejs24', updatedAt:'later'})) {
    const changed = structuredClone(snapshot); changed[0][field] = value;
    assert.ok(compareLive(manifest, changed).length > 0, field);
  }
});

test('CLI never echoes malformed cloud JSON or a sensitive input path', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'com155-redaction-'));
  const marker = 'SYNTHETIC_SENSITIVE_MARKER';
  const file = path.join(directory, `${marker}.json`);
  try {
    for (const input of [marker, `[{"environmentVariables":{"secret":"${marker}"}`]) {
      fs.writeFileSync(file, input);
      const result = spawnSync(process.execPath, ['scripts/audit-firebase-inventory.cjs', '--live-json', file],
        { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Cannot read live metadata JSON/);
      assert.equal((result.stdout + result.stderr).includes(marker), false);
    }
    fs.unlinkSync(file);
    const result = spawnSync(process.execPath, ['scripts/audit-firebase-inventory.cjs', '--live-json', file],
      { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal((result.stdout + result.stderr).includes(marker), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
