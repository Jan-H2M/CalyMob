#!/usr/bin/env node

/**
 * Historical piscine carnet v2 backfill.
 *
 * Default is always DRY-RUN. Applying writes requires BOTH `--apply` and one
 * or more preview-bound `--session=<document-id>:<preview_fingerprint>` entries.
 *
 * Usage (from functions/):
 *   npm run backfill:pool-carnet-v2 -- --club=calypso
 *   npm run backfill:pool-carnet-v2 -- --club=calypso --session=<id>
 *   npm run backfill:pool-carnet-v2 -- --club=calypso --apply --session=<id>:<fingerprint>
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const {
  runHistoricalCarnetBackfill,
} = require('../src/training/poolSessionCarnetBackfill');

function parseArgs(argv) {
  let apply = false;
  let clubId = 'calypso';
  const allowlist = [];
  let help = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg.startsWith('--club=')) {
      clubId = arg.slice('--club='.length);
    } else if (arg === '--club') {
      clubId = argv[++index] || '';
    } else if (arg.startsWith('--session=')) {
      allowlist.push(arg.slice('--session='.length));
    } else if (arg === '--session') {
      allowlist.push(argv[++index] || '');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { apply, clubId, allowlist, help };
}

function printUsage() {
  console.log([
    'Historical piscine carnet v2 backfill (dry-run by default)',
    '',
    'Preview all candidates:',
    '  npm run backfill:pool-carnet-v2 -- --club=calypso',
    '',
    'Preview an explicit allowlist:',
    '  npm run backfill:pool-carnet-v2 -- --club=calypso --session=<id>',
    '',
    'Apply only an explicit allowlist:',
    '  Copy preview_fingerprint from the immediately preceding dry-run:',
    '  npm run backfill:pool-carnet-v2 -- --club=calypso --apply --session=<id>:<preview_fingerprint>',
  ].join('\n'));
}

function initializeAdmin(projectId) {
  if (admin.apps.length > 0) return;
  const localCredential = path.join(__dirname, '..', 'service-account-key.json');
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId });
  } else if (fs.existsSync(localCredential)) {
    // The credential file is local-only and gitignored.
    admin.initializeApp({
      credential: admin.credential.cert(require(localCredential)),
      projectId,
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return null;
  }

  const projectId = process.env.GCLOUD_PROJECT || 'calycompta';
  initializeAdmin(projectId);
  const result = await runHistoricalCarnetBackfill({
    db: admin.firestore(),
    clubId: args.clubId,
    apply: args.apply,
    allowlist: args.allowlist,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!args.apply) {
    console.log('\nDRY-RUN: no writes were made.');
  } else {
    console.log(`\nAPPLY complete: ${result.appliedCount} allowlisted session(s) marked for v2 fan-out.`);
  }
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Backfill refused: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { initializeAdmin, main, parseArgs, printUsage };
