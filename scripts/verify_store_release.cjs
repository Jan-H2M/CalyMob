#!/usr/bin/env node
'use strict';

// Local safety interlock, not a cryptographic approval or build attestation.
// Deliberately never creates a manifest or grants an approval itself.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ARTIFACTS = {
  android: 'build/app/outputs/bundle/release/app-release.aab',
  ios: 'build/ios/ipa/calymob.ipa',
};
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
function requireThat(condition, message) {
  if (!condition) throw new Error(`Store release blocked: ${message}`);
}
function evidence(record) {
  return typeof record?.evidence === 'string' && record.evidence.trim().length > 0;
}

function validateManifest(manifest, context) {
  const { platform, action, head, clean, version, build, artifactPath, artifactHash, notes,
    requestedVersion, requestedBuild } = context;
  requireThat(Object.hasOwn(ARTIFACTS, platform), 'unknown platform');
  requireThat(['upload', 'submit', 'upload-and-submit', 'notes'].includes(action), 'unknown action');
  const requiredActions = action === 'upload-and-submit' ? ['upload', 'submit'] : [action];
  requireThat(manifest?.schemaVersion === 1, 'missing/unsupported manifest');
  requireThat(clean, 'source checkout is dirty');
  requireThat(/^[a-f0-9]{40}$/.test(head) && manifest.sourceCommit === head, 'source commit mismatch');
  requireThat(manifest.version === version && String(manifest.build) === build, 'version/build mismatch');
  requireThat(Array.isArray(manifest.platforms) && manifest.platforms.includes(platform), 'platform not approved');
  requireThat(Array.isArray(manifest.allowedActions?.[platform])
    && requiredActions.every((entry) => manifest.allowedActions[platform].includes(entry)), 'action not approved');
  requireThat(typeof notes === 'string' && notes.trim().length > 0
    && manifest.notes?.['fr-FR'] === notes, 'approved French notes differ from metadata');
  const approval = manifest.janApproval;
  requireThat(approval?.approvedBy === 'Jan Andriessens' && evidence(approval)
    && Number.isFinite(Date.parse(approval.approvedAt)), 'explicit Jan approval evidence missing');
  requireThat(approval.sourceCommit === head && approval.version === version
    && String(approval.build) === build && approval.notesSha256 === sha256(notes)
    && Array.isArray(approval.platforms) && approval.platforms.includes(platform)
    && Array.isArray(approval.allowedActions?.[platform])
    && requiredActions.every((entry) => approval.allowedActions[platform].includes(entry)), 'Jan approval not bound to this release');
  const code = manifest.codeReview;
  requireThat(code?.verdict === 'approved' && code.sourceCommit === head
    && typeof code.reviewer === 'string' && code.reviewer.trim() && evidence(code), 'code review missing or stale');
  const artifact = manifest.artifacts?.[platform];
  requireThat(artifact?.path === ARTIFACTS[platform] && artifactPath === ARTIFACTS[platform]
    && artifact.sourceCommit === head && artifact.version === version && String(artifact.build) === build,
  'artifact provenance does not match exact source/version/path');
  requireThat(/^[a-f0-9]{64}$/.test(artifactHash) && artifact.sha256 === artifactHash, 'artifact SHA256 mismatch');
  const native = manifest.nativeReview?.[platform];
  requireThat(native?.verdict === 'approved' && native.sourceCommit === head
    && native.artifactSha256 === artifactHash && typeof native.reviewer === 'string'
    && native.reviewer.trim() && evidence(native), 'native visual/functional review missing or stale');
  if (action === 'submit') {
    requireThat(requestedVersion === version && requestedBuild === build,
      'submit requires explicit matching version and build; no defaults');
    const uploaded = manifest.uploadedBuilds?.[platform];
    requireThat(uploaded?.version === version && String(uploaded.build) === build
      && uploaded.artifactSha256 === artifactHash && evidence(uploaded), 'uploaded build evidence missing/mismatched');
  }
  return { sourceCommit: head, version, build, platform, notes, artifactPath, artifactHash };
}

function main(argv = process.argv.slice(2), env = process.env) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    requireThat(['--platform', '--action', '--version', '--build'].includes(argv[index])
      && argv[index + 1] && !Object.hasOwn(args, argv[index]), 'invalid CLI arguments');
    args[argv[index]] = argv[index + 1];
  }
  const root = path.resolve(__dirname, '..');
  const manifestPath = env.CALYMOB_RELEASE_MANIFEST;
  requireThat(manifestPath && path.isAbsolute(manifestPath), 'CALYMOB_RELEASE_MANIFEST must name an external absolute JSON file');
  const realManifestPath = fs.realpathSync(manifestPath);
  const relativeManifest = path.relative(fs.realpathSync(root), realManifestPath);
  requireThat(relativeManifest.startsWith(`..${path.sep}`) || path.isAbsolute(relativeManifest), 'manifest must be outside the repository');
  const manifest = JSON.parse(fs.readFileSync(realManifestPath, 'utf8'));
  const git = (...gitArgs) => execFileSync('git', ['-C', root, ...gitArgs], { encoding: 'utf8' }).trim();
  const match = fs.readFileSync(path.join(root, 'pubspec.yaml'), 'utf8').match(/^version:\s*(\d+\.\d+\.\d+)\+(\d+)\s*$/m);
  requireThat(match, 'invalid pubspec version');
  const [, version, build] = match;
  const platform = args['--platform'];
  requireThat(Object.hasOwn(ARTIFACTS, platform), 'unknown platform');
  const artifactPath = ARTIFACTS[platform];
  const absoluteArtifact = path.join(root, artifactPath);
  requireThat(fs.realpathSync(absoluteArtifact) === absoluteArtifact, 'artifact path must not redirect through symlinks');
  const notesPath = platform === 'android'
    ? `android/fastlane/metadata/android/fr-FR/changelogs/${build}.txt`
    : 'ios/fastlane/metadata/fr-FR/release_notes.txt';
  const result = validateManifest(manifest, {
    platform, action: args['--action'], head: git('rev-parse', 'HEAD'),
    clean: git('status', '--porcelain', '--untracked-files=all') === '', version, build,
    artifactPath, artifactHash: sha256(fs.readFileSync(absoluteArtifact)),
    notes: fs.readFileSync(path.join(root, notesPath), 'utf8').trim(),
    requestedVersion: args['--version'], requestedBuild: args['--build'],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validateManifest, sha256, ARTIFACTS };
