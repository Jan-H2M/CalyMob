#!/usr/bin/env node
'use strict';

// Creates an external schema-v2 draft from observable checkout/artifact facts.
// It deliberately leaves every approval/review/test attestation pending so the
// draft cannot pass the upload gate until real evidence is recorded.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ARTIFACTS } = require('./verify_store_release.cjs');

const NOTES = {
  android: ({ build }) => `android/fastlane/metadata/android/fr-FR/changelogs/${build}.txt`,
  ios: () => 'ios/fastlane/metadata/fr-FR/release_notes.txt',
};

function requireThat(condition, message) {
  if (!condition) throw new Error(`Release manifest draft blocked: ${message}`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    requireThat(['--output', '--platforms'].includes(flag) && value && !Object.hasOwn(args, flag),
      'usage: scaffold_release_manifest.cjs --output <external-absolute.json> --platforms <android,ios>');
    args[flag] = value;
  }
  requireThat(Object.hasOwn(args, '--output') && Object.hasOwn(args, '--platforms'),
    'both --output and --platforms are required');
  const platforms = [...new Set(args['--platforms'].split(',').map((entry) => entry.trim()).filter(Boolean))];
  requireThat(platforms.length > 0 && platforms.every((entry) => Object.hasOwn(ARTIFACTS, entry)),
    'platforms must be android, ios, or android,ios');
  return { output: args['--output'], platforms };
}

function pendingRecord(extra = {}) {
  return { ...extra, sourceCommit: null, sourceTree: null, evidence: null };
}

function createDraft({ sourceCommit, sourceTree, version, build, platforms, notes, artifacts }) {
  const emptyActions = Object.fromEntries(platforms.map((platform) => [platform, []]));
  const nativeReview = Object.fromEntries(platforms.map((platform) => [platform, pendingRecord({
    reviewer: null,
    verdict: 'pending',
    artifactSha256: artifacts[platform].sha256,
  })]));
  const artifactRecords = Object.fromEntries(platforms.map((platform) => [platform, {
    path: artifacts[platform].path,
    sha256: artifacts[platform].sha256,
    sourceCommit: null,
    sourceTree: null,
    version: null,
    build: null,
  }]));

  return {
    schemaVersion: 2,
    draft: true,
    draftWarning: 'NOT APPROVED: replace pending/null attestation fields only from real, attributable evidence.',
    sourceCommit,
    sourceTree,
    version,
    build,
    platforms,
    allowedActions: emptyActions,
    notes: { 'fr-FR': notes },
    janApproval: {
      approvedBy: null,
      approvedAt: null,
      evidence: null,
      sourceCommit: null,
      sourceTree: null,
      version: null,
      build: null,
      platforms: [],
      allowedActions: emptyActions,
      notesSha256: null,
    },
    codeReview: pendingRecord({ reviewer: null, verdict: 'pending' }),
    testEvidence: pendingRecord({ result: 'pending' }),
    nativeReview,
    artifacts: artifactRecords,
    uploadedBuilds: {},
  };
}

function main(argv = process.argv.slice(2)) {
  const { output, platforms } = parseArgs(argv);
  const root = path.resolve(__dirname, '..');
  requireThat(path.isAbsolute(output), 'output path must be absolute');
  requireThat(!fs.existsSync(output), 'output already exists; refusing to overwrite evidence');
  const parent = fs.realpathSync(path.dirname(output));
  const resolvedOutput = path.join(parent, path.basename(output));
  const relativeOutput = path.relative(fs.realpathSync(root), resolvedOutput);
  requireThat(relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput),
    'output must be outside the repository');

  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  requireThat(git('status', '--porcelain=v1', '--untracked-files=all') === '',
    'checkout must be completely clean');
  const sourceCommit = git('rev-parse', '--verify', 'HEAD');
  const sourceTree = git('rev-parse', '--verify', 'HEAD^{tree}');
  const versionMatch = fs.readFileSync(path.join(root, 'pubspec.yaml'), 'utf8')
    .match(/^version:\s*(\d+\.\d+\.\d+)\+(\d+)\s*$/m);
  requireThat(versionMatch, 'invalid pubspec version');
  const [, version, build] = versionMatch;

  const notesByPlatform = platforms.map((platform) => fs.readFileSync(
    path.join(root, NOTES[platform]({ build })), 'utf8'
  ).trim());
  requireThat(notesByPlatform.every((entry) => entry.length > 0), 'French release notes are empty');
  requireThat(notesByPlatform.every((entry) => entry === notesByPlatform[0]),
    'selected platforms must use identical approved French release notes');

  const artifacts = Object.fromEntries(platforms.map((platform) => {
    const relativePath = ARTIFACTS[platform];
    const absolutePath = path.join(root, relativePath);
    requireThat(fs.statSync(absolutePath).isFile() && fs.statSync(absolutePath).size > 0,
      `${platform} artifact is missing or empty`);
    requireThat(fs.realpathSync(absolutePath) === absolutePath,
      `${platform} artifact path must not redirect through symlinks`);
    return [platform, {
      path: relativePath,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex'),
    }];
  }));

  const draft = createDraft({
    sourceCommit, sourceTree, version, build, platforms, notes: notesByPlatform[0], artifacts,
  });
  const descriptor = fs.openSync(resolvedOutput, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(draft, null, 2)}\n`, { encoding: 'utf8' });
    fs.fchmodSync(descriptor, 0o600);
  } finally {
    fs.closeSync(descriptor);
  }
  process.stdout.write(`${JSON.stringify({
    output: resolvedOutput, sourceCommit, sourceTree, version, build, platforms,
    draft: true, uploadAuthorized: false,
  })}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createDraft, parseArgs };
