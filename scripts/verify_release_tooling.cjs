#!/usr/bin/env node
'use strict';

// Safety gate for the exceptional Android-submit flow where reviewed release
// tooling runs separately from the immutable checkout that produced the AAB.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function requireThat(condition, message) {
  if (!condition) throw new Error(`Store release blocked: ${message}`);
}

function evidence(record) {
  return typeof record?.evidence === 'string' && record.evidence.trim().length > 0;
}

function isOutside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function canonicalDirectory(candidate, label) {
  requireThat(typeof candidate === 'string' && path.isAbsolute(candidate), `${label} must be absolute`);
  requireThat(fs.existsSync(candidate), `${label} does not exist`);
  const real = fs.realpathSync(candidate);
  requireThat(real === candidate, `${label} must be its canonical real path`);
  requireThat(fs.statSync(real).isDirectory(), `${label} must be a directory`);
  return real;
}

function validateExternalSubmit(manifest, context) {
  const {
    platform,
    action,
    releaseRoot: requestedReleaseRoot,
    releaseGitRoot,
    releaseHead,
    releaseTree,
    releaseClean,
    toolingRoot: requestedToolingRoot,
    toolingHead,
    toolingTree,
    toolingClean,
    manifestPath,
  } = context;

  requireThat(platform === 'android', 'external release root is Android-only');
  requireThat(action === 'submit', 'external release root is submit-only');
  const releaseRoot = canonicalDirectory(requestedReleaseRoot, 'external release root');
  const toolingRoot = canonicalDirectory(requestedToolingRoot, 'tooling checkout');
  requireThat(releaseRoot !== toolingRoot, 'release and tooling checkouts must be separate');
  requireThat(releaseGitRoot === releaseRoot, 'external release root is not a Git checkout root');
  requireThat(releaseClean, 'external release checkout is dirty');
  requireThat(/^[a-f0-9]{40}$/.test(releaseHead)
    && manifest?.sourceCommit === releaseHead, 'external release commit mismatch');
  requireThat(/^[a-f0-9]{40}$/.test(releaseTree)
    && manifest?.sourceTree === releaseTree, 'external release tree mismatch');
  requireThat(toolingClean, 'tooling checkout is dirty');
  requireThat(/^[a-f0-9]{40}$/.test(toolingHead), 'invalid tooling commit');
  requireThat(/^[a-f0-9]{40}$/.test(toolingTree), 'invalid tooling tree');

  requireThat(typeof manifestPath === 'string' && path.isAbsolute(manifestPath),
    'CALYMOB_RELEASE_MANIFEST must name an external absolute JSON file');
  requireThat(fs.existsSync(manifestPath), 'release manifest does not exist');
  const realManifestPath = fs.realpathSync(manifestPath);
  requireThat(isOutside(releaseRoot, realManifestPath) && isOutside(toolingRoot, realManifestPath),
    'manifest must be outside both release and tooling checkouts');
  requireThat(manifest?.schemaVersion === 2, 'missing/unsupported manifest');

  const review = manifest.toolingReview;
  requireThat(review?.verdict === 'approved'
    && review.toolingCommit === toolingHead
    && review.toolingTree === toolingTree
    && typeof review.reviewer === 'string'
    && review.reviewer.trim().length > 0
    && evidence(review), 'tooling review missing or stale');

  const verifierPath = path.join(releaseRoot, 'scripts', 'verify_store_release.cjs');
  requireThat(fs.existsSync(verifierPath), 'release checkout verifier is missing');
  requireThat(fs.realpathSync(verifierPath) === verifierPath,
    'release checkout verifier must not redirect through symlinks');
  requireThat(fs.statSync(verifierPath).isFile(), 'release checkout verifier is not a file');

  return {
    releaseRoot,
    verifierPath,
    toolingCommit: toolingHead,
    toolingTree,
    reviewer: review.reviewer.trim(),
  };
}

function main(argv = process.argv.slice(2), env = process.env) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    requireThat(['--platform', '--action', '--release-root'].includes(argv[index])
      && argv[index + 1] && !Object.hasOwn(args, argv[index]), 'invalid CLI arguments');
    args[argv[index]] = argv[index + 1];
  }

  const toolingRoot = fs.realpathSync(path.resolve(__dirname, '..'));
  const manifestPath = env.CALYMOB_RELEASE_MANIFEST;
  requireThat(manifestPath && path.isAbsolute(manifestPath),
    'CALYMOB_RELEASE_MANIFEST must name an external absolute JSON file');
  const realManifestPath = fs.realpathSync(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(realManifestPath, 'utf8'));
  const git = (root, ...gitArgs) => execFileSync(
    'git', ['-C', root, ...gitArgs], { encoding: 'utf8' },
  ).trim();
  const releaseRoot = args['--release-root'];
  const canonicalReleaseRoot = canonicalDirectory(releaseRoot, 'external release root');
  const result = validateExternalSubmit(manifest, {
    platform: args['--platform'],
    action: args['--action'],
    releaseRoot,
    releaseGitRoot: fs.realpathSync(git(canonicalReleaseRoot, 'rev-parse', '--show-toplevel')),
    releaseHead: git(canonicalReleaseRoot, 'rev-parse', 'HEAD'),
    releaseTree: git(canonicalReleaseRoot, 'rev-parse', 'HEAD^{tree}'),
    releaseClean: git(canonicalReleaseRoot, 'status', '--porcelain', '--untracked-files=all') === '',
    toolingRoot,
    toolingHead: git(toolingRoot, 'rev-parse', 'HEAD'),
    toolingTree: git(toolingRoot, 'rev-parse', 'HEAD^{tree}'),
    toolingClean: git(toolingRoot, 'status', '--porcelain', '--untracked-files=all') === '',
    manifestPath: realManifestPath,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateExternalSubmit };
