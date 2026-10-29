#!/usr/bin/env node
'use strict';

// Local safety interlock, not a cryptographic approval or build attestation.
// Deliberately never creates a manifest or grants an approval itself.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validateBuildNumberRecord } = require('./build_number_sync.cjs');
const PLATFORMS = ['android', 'ios'];
const ARTIFACTS = {
  android: 'build/app/outputs/bundle/release/app-release.aab',
};
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
function requireThat(condition, message) {
  if (!condition) throw new Error(`Store release blocked: ${message}`);
}
function evidence(record) {
  return typeof record?.evidence === 'string' && record.evidence.trim().length > 0;
}

function validateManifest(manifest, context) {
  const { platform, action, head, tree, clean, version, build, artifactPath, artifactHash, notes,
    requestedVersion, requestedBuild, channel = 'public' } = context;
  requireThat(PLATFORMS.includes(platform), 'unknown platform');
  requireThat(['upload', 'submit', 'notes'].includes(action), 'unknown action');
  requireThat(!(platform === 'ios' && action === 'upload'),
    'local iOS upload is disabled; Xcode Cloud owns build, signing, and distribution');
  requireThat(['internal', 'public'].includes(channel), 'unknown release channel');
  const requiredActions = [action];
  requireThat(manifest?.schemaVersion === 2, 'missing/unsupported manifest');
  requireThat(manifest.draft === false, 'manifest is still a draft');
  requireThat(clean, 'source checkout is dirty');
  requireThat(/^[a-f0-9]{40}$/.test(head) && manifest.sourceCommit === head, 'source commit mismatch');
  requireThat(/^[a-f0-9]{40}$/.test(tree) && manifest.sourceTree === tree, 'source tree mismatch');
  requireThat(manifest.version === version && String(manifest.build) === build, 'version/build mismatch');
  validateBuildNumberRecord(manifest.buildNumberSource, version, build);
  requireThat(Array.isArray(manifest.platforms) && manifest.platforms.includes(platform), 'platform not approved');
  requireThat(Array.isArray(manifest.allowedActions?.[platform])
    && requiredActions.every((entry) => manifest.allowedActions[platform].includes(entry)), 'action not approved');
  requireThat(typeof notes === 'string' && notes.trim().length > 0
    && manifest.notes?.['fr-FR'] === notes, 'approved French notes differ from metadata');
  const approval = manifest.janApproval;
  requireThat(approval?.approvedBy === 'Jan Andriessens' && evidence(approval)
    && Number.isFinite(Date.parse(approval.approvedAt)), 'explicit Jan approval evidence missing');
  requireThat(approval.sourceCommit === head && approval.sourceTree === tree && approval.version === version
    && String(approval.build) === build && approval.notesSha256 === sha256(notes)
    && Array.isArray(approval.platforms) && approval.platforms.includes(platform)
    && Array.isArray(approval.allowedActions?.[platform])
    && requiredActions.every((entry) => approval.allowedActions[platform].includes(entry)), 'Jan approval not bound to this release');
  const internalUpload = false;
  if (channel === 'internal') {
    requireThat(internalUpload, 'internal channel is only supported for TestFlight uploads');
    requireThat(Array.isArray(manifest.allowedChannels?.[platform])
      && manifest.allowedChannels[platform].includes('internal')
      && Array.isArray(approval.allowedChannels?.[platform])
      && approval.allowedChannels[platform].includes('internal'),
    'internal channel not explicitly approved');
  }
  const code = manifest.codeReview;
  requireThat(code?.verdict === 'approved' && code.sourceCommit === head && code.sourceTree === tree
    && typeof code.reviewer === 'string' && code.reviewer.trim() && evidence(code), 'code review missing or stale');
  requireThat(manifest.testEvidence?.sourceCommit === head && manifest.testEvidence?.sourceTree === tree
    && manifest.testEvidence?.result === 'passed' && evidence(manifest.testEvidence),
  'passing automated test evidence missing or stale');
  const artifact = manifest.artifacts?.[platform];
  if (platform === 'android') {
    requireThat(artifact?.kind === 'local-aab' && artifact.path === ARTIFACTS.android
      && artifactPath === ARTIFACTS.android && artifact.sourceCommit === head && artifact.sourceTree === tree
      && artifact.version === version && String(artifact.build) === build,
    'artifact provenance does not match exact source/version/path');
    requireThat(/^[a-f0-9]{64}$/.test(artifactHash) && artifact.sha256 === artifactHash, 'artifact SHA256 mismatch');
  } else {
    requireThat(artifact?.kind === 'xcode-cloud-build'
      && artifact.workflowId === manifest.buildNumberSource.workflowId
      && artifact.runId === manifest.buildNumberSource.latestRunId
      && String(artifact.runNumber) === build
      && artifact.executionProgress === 'COMPLETE' && artifact.completionStatus === 'SUCCEEDED'
      && /^[a-f0-9-]+$/i.test(artifact.appStoreBuildId)
      && artifact.sourceCommit === head && artifact.sourceTree === tree
      && artifact.version === version && String(artifact.build) === build,
    'Xcode Cloud build provenance does not match exact workflow/run/source/version');
  }
  const native = manifest.nativeReview?.[platform];
  const nativeArtifactMatches = platform === 'android'
    ? native?.artifactSha256 === artifactHash
    : native?.xcodeCloudRunId === artifact.runId && native?.appStoreBuildId === artifact.appStoreBuildId;
  const approvedNativeReview = native?.verdict === 'approved' && native.sourceCommit === head
    && native.sourceTree === tree && nativeArtifactMatches && typeof native.reviewer === 'string'
    && native.reviewer.trim() && evidence(native);
  const waivedInternalNativeReview = internalUpload && native?.verdict === 'waived'
    && native.waivedBy === 'Jan Andriessens' && native.sourceCommit === head
    && native.sourceTree === tree && nativeArtifactMatches && typeof native.reason === 'string'
    && native.reason.trim() && evidence(native);
  const ownerWaivedPublicNativeReview = channel === 'public' && native?.verdict === 'owner-waived'
    && native.owner === 'Jan Andriessens' && typeof native.waivedAt === 'string'
    && /(?:Z|[+-]\d{2}:\d{2})$/.test(native.waivedAt.trim())
    && Number.isFinite(Date.parse(native.waivedAt))
    && typeof native.verbatimQuote === 'string' && native.verbatimQuote.trim()
    && native.sourceCommit === head && native.sourceTree === tree
    && nativeArtifactMatches && evidence(native);
  requireThat(approvedNativeReview || waivedInternalNativeReview || ownerWaivedPublicNativeReview,
    'native visual/functional review missing, stale, or not eligible for the requested waiver');
  if (action === 'submit') {
    requireThat(requestedVersion === version && requestedBuild === build,
      'submit requires explicit matching version and build; no defaults');
    if (platform === 'android') {
      const uploaded = manifest.uploadedBuilds?.android;
      requireThat(uploaded?.version === version && String(uploaded.build) === build
        && uploaded.artifactSha256 === artifactHash && evidence(uploaded), 'uploaded build evidence missing/mismatched');
    }
  }
  return { sourceCommit: head, sourceTree: tree, version, build, platform, channel, notes, artifactPath, artifactHash };
}

function main(argv = process.argv.slice(2), env = process.env) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    requireThat(['--platform', '--action', '--version', '--build', '--channel'].includes(argv[index])
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
  requireThat(PLATFORMS.includes(platform), 'unknown platform');
  const artifactPath = ARTIFACTS[platform] || null;
  const absoluteArtifact = artifactPath ? path.join(root, artifactPath) : null;
  if (absoluteArtifact) requireThat(fs.realpathSync(absoluteArtifact) === absoluteArtifact,
    'artifact path must not redirect through symlinks');
  const notesPath = platform === 'android'
    ? `android/fastlane/metadata/android/fr-FR/changelogs/${build}.txt`
    : 'ios/fastlane/metadata/fr-FR/release_notes.txt';
  const result = validateManifest(manifest, {
    platform, action: args['--action'], head: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    clean: git('status', '--porcelain', '--untracked-files=all') === '', version, build,
    artifactPath, artifactHash: absoluteArtifact ? sha256(fs.readFileSync(absoluteArtifact)) : null,
    notes: fs.readFileSync(path.join(root, notesPath), 'utf8').trim(),
    requestedVersion: args['--version'], requestedBuild: args['--build'], channel: args['--channel'] || 'public',
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validateManifest, sha256, ARTIFACTS, PLATFORMS };
