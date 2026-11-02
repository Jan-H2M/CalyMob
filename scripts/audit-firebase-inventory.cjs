#!/usr/bin/env node
'use strict';

// Offline metadata comparison only. Never load a handler, SDK or credential.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Script } = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = 'functions/config/function-inventory.json';
const NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function readLiveJson(file) {
  // SyntaxError.message can contain a fragment of the input, including secrets
  // from a truncated raw cloud response. Do not propagate parser or I/O text.
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('Cannot read live metadata JSON; provide a complete gcloud functions list response'); }
}

// The entrypoint uses three explicit CommonJS forms: named imports, module
// imports and direct require(...).export assignments. Reject other forms so a
// future refactor cannot silently shrink the inventory. Parsing never runs it.
function readExports(source) {
  new Script(source);
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  invariant(!/module\s*\.\s*exports|exports\s*\[|Object\.(?:assign|defineProperty)\s*\(\s*exports/.test(code),
    'Unsupported entrypoint export syntax; update the static inventory reader');
  const bindings = new Map();
  for (const m of code.matchAll(/const\s*\{([^{}]+)\}\s*=\s*require\(['"](\.\/src\/[^'"]+)['"]\)/g)) {
    for (const name of m[1].split(',').map(value => value.trim()).filter(Boolean)) {
      invariant(NAME.test(name), 'Unsupported destructured import');
      bindings.set(name, m[2]);
    }
  }
  for (const m of code.matchAll(/const\s+(\w+)\s*=\s*require\(['"](\.\/src\/[^'"]+)['"]\)/g)) {
    bindings.set(m[1], m[2]);
  }
  const result = new Map();
  for (const m of code.matchAll(/^exports\.(\w+)\s*=\s*([^;]+);/gm)) {
    const direct = /^require\(['"](\.\/src\/[^'"]+)['"]\)\.\w+$/.exec(m[2].trim());
    const imported = /^(\w+)(?:\.\w+)?$/.exec(m[2].trim());
    const modulePath = direct?.[1] || (imported && bindings.get(imported[1]));
    invariant(modulePath && !result.has(m[1]), 'Unresolved or duplicate entrypoint export');
    result.set(m[1], `functions/${modulePath.slice(2)}.js`);
  }
  invariant(result.size > 0 && (code.match(/\bexports\s*\./g) || []).length === result.size,
    'Unrecognized entrypoint exports; update the static inventory reader');
  return result;
}

// Retain only allowlisted deployment metadata, including Gen1's distinct
// field layout. Environment variables, signed URLs and IAM are never returned.
function normalizeLive(raw, project) {
  invariant(Array.isArray(raw) && raw.length > 0, 'Expected a non-empty gcloud functions list JSON array');
  const seen = new Set();
  return raw.map(item => {
    const match = /^projects\/([^/]+)\/locations\/([^/]+)\/functions\/([^/]+)$/.exec(item.name || '');
    invariant(match && match[1] === project && NAME.test(match[3]), 'Unexpected live function identity/project');
    const id = `${match[2]}/${match[3]}`;
    invariant(!seen.has(id), 'Duplicate live function identity');
    seen.add(id);
    invariant(!item.environment || ['GEN_1', 'GEN_2'].includes(item.environment), 'Unknown function generation');
    const generation = item.environment || 'GEN_1';
    const config = generation === 'GEN_2' ? item.buildConfig : item;
    const trigger = item.eventTrigger?.eventType
      || (generation === 'GEN_2' || item.httpsTrigger ? 'https' : null);
    invariant(config?.runtime && config.entryPoint && trigger && item.updateTime, 'Incomplete live metadata');
    return {
      name: match[3], region: match[2], generation,
      runtime: config.runtime, entryPoint: config.entryPoint,
      trigger, state: item.state || item.status,
      updatedAt: item.updateTime,
      deploymentTool: item.labels?.['deployment-tool'] || 'unknown',
    };
  }).sort((a, b) => `${a.region}/${a.name}`.localeCompare(`${b.region}/${b.name}`));
}

function compareLive(manifest, live) {
  const expected = [...manifest.firebaseFunctions, ...manifest.externalFunctions];
  const keyed = entries => new Map(entries.map(item => [`${item.region}/${item.name}`, item]));
  const before = keyed(expected), after = keyed(live);
  const differences = [];
  for (const [id, item] of before) {
    const current = after.get(id);
    if (!current) differences.push(`Missing live function: ${id}`);
    else for (const field of ['generation', 'runtime', 'entryPoint', 'trigger', 'state', 'updatedAt', 'deploymentTool']) {
      if (item[field] !== current[field]) differences.push(`Changed ${field}: ${id}`);
    }
  }
  for (const id of after.keys()) if (!before.has(id)) differences.push(`Uninventoried live function: ${id}`);
  return differences;
}

function validateManifest(manifest, exports, readFile) {
  invariant(manifest.schemaVersion === 1 && manifest.purpose === 'read-only-inventory'
    && manifest.project === 'calycompta' && manifest.firebaseCodebase === 'default', 'Invalid inventory header');
  const live = [...manifest.firebaseFunctions, ...manifest.externalFunctions];
  const identities = live.map(item => `${item.region}/${item.name}`);
  invariant(new Set(identities).size === identities.length, 'Duplicate inventory identity');
  invariant(live.every(item => NAME.test(item.name) && item.state === 'ACTIVE'), 'Invalid live inventory entry');
  invariant(manifest.firebaseFunctions.every(item => item.deploymentTool === 'cli-firebase'), 'Incorrect Firebase ownership');
  invariant(manifest.externalFunctions.every(item => item.deploymentTool === 'cli-gcloud' && !exports.has(item.name)),
    'External function must remain outside the Firebase codebase');
  const managed = [...manifest.firebaseFunctions, ...manifest.repoOnlyFunctions];
  invariant(new Set(managed.map(item => item.name)).size === managed.length, 'Duplicate managed function');
  const expectedNames = new Set(managed.map(item => item.name));
  const missing = [...expectedNames].filter(name => !exports.has(name));
  const added = [...exports.keys()].filter(name => !expectedNames.has(name));
  invariant(!missing.length && !added.length,
    `Entrypoint inventory mismatch; missing: ${missing.join(', ') || 'none'}; added: ${added.join(', ') || 'none'}`);
  for (const item of managed) {
    invariant(item.sourcePath === exports.get(item.name), `Handler mapping changed: ${item.name}`);
    invariant(/^functions\/src\/[A-Za-z0-9_/-]+\.js$/.test(item.sourcePath), 'Invalid handler path');
    readFile(item.sourcePath); // Also verify that the referenced source exists.
  }
  return { live: live.length, firebase: manifest.firebaseFunctions.length,
    external: manifest.externalFunctions.length, repoExports: exports.size,
    repoOnly: manifest.repoOnlyFunctions.map(item => item.name),
    missingFromMainAtAudit: manifest.firebaseFunctions.filter(item => !item.inMainAtAudit).map(item => item.name) };
}

function main(argv) {
  let liveFile, ref;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    invariant(['--live-json', '--repo-ref'].includes(flag) && argv[i + 1] && !argv[i + 1].startsWith('--'),
      'Usage: node scripts/audit-firebase-inventory.cjs [--live-json FILE] [--repo-ref REF]');
    if (flag === '--live-json') liveFile = argv[++i];
    else ref = argv[++i];
  }
  invariant(!ref || /^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(ref), 'Invalid repository ref');
  const readFile = file => ref
    ? execFileSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    : fs.readFileSync(path.join(ROOT, file), 'utf8');
  // The inventory belongs to this checkout; --repo-ref deliberately compares
  // its expected exports against another branch, including pre-inventory main.
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
  const summary = validateManifest(manifest, readExports(readFile('functions/index.js')), readFile);
  if (liveFile) {
    const differences = compareLive(manifest, normalizeLive(readLiveJson(liveFile), manifest.project));
    invariant(differences.length === 0, differences.join('\n'));
    summary.suppliedLiveMetadataMatched = true;
  }
  console.log(JSON.stringify(summary, null, 2));
  if (!liveFile) console.log('Offline snapshot validation only; no fresh production read was performed.');
}

module.exports = { readExports, normalizeLive, compareLive, validateManifest };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`Inventory check failed: ${error.message}`); process.exitCode = 1; }
}
