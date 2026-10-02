'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateExternalSubmit } = require('./verify_release_tooling.cjs');

const head = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const releaseHead = 'c'.repeat(40);
const releaseTree = 'd'.repeat(40);

function fixture() {
  const base = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'calymob-release-tooling-')),
  );
  const toolingRoot = path.join(base, 'tooling');
  const releaseRoot = path.join(base, 'release');
  const manifestPath = path.join(base, 'release-manifest.json');
  fs.mkdirSync(path.join(toolingRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(releaseRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(releaseRoot, 'scripts', 'verify_store_release.cjs'), '// fixture verifier\n');
  fs.writeFileSync(manifestPath, '{}\n');
  const manifest = {
    schemaVersion: 2,
    sourceCommit: releaseHead,
    sourceTree: releaseTree,
    toolingReview: {
      toolingCommit: head,
      toolingTree: tree,
      reviewer: 'independent reviewer',
      verdict: 'approved',
      evidence: 'Exact tooling commit reviewed in a separate read-only task.',
    },
  };
  const context = {
    platform: 'android',
    action: 'submit',
    releaseRoot,
    releaseGitRoot: releaseRoot,
    releaseHead,
    releaseTree,
    releaseClean: true,
    toolingRoot,
    toolingHead: head,
    toolingTree: tree,
    toolingClean: true,
    manifestPath,
  };
  return { base, manifest, context };
}

function withFixture(run) {
  const value = fixture();
  try {
    run(value);
  } finally {
    fs.rmSync(value.base, { recursive: true, force: true });
  }
}

test('accepts an absolute real release root with exact tooling review evidence', () => {
  withFixture(({ manifest, context }) => {
    const result = validateExternalSubmit(manifest, context);
    assert.equal(result.releaseRoot, context.releaseRoot);
    assert.equal(result.verifierPath,
      path.join(context.releaseRoot, 'scripts', 'verify_store_release.cjs'));
    assert.equal(result.toolingCommit, head);
    assert.equal(result.toolingTree, tree);
    assert.equal(result.reviewer, 'independent reviewer');
  });
});

test('rejects relative, missing and non-canonical release roots', () => {
  withFixture(({ manifest, context, base }) => {
    assert.throws(() => validateExternalSubmit(manifest, { ...context, releaseRoot: 'release' }));
    assert.throws(() => validateExternalSubmit(manifest, {
      ...context,
      releaseRoot: path.join(base, 'missing'),
    }));
    const link = path.join(base, 'release-link');
    fs.symlinkSync(context.releaseRoot, link);
    assert.throws(() => validateExternalSubmit(manifest, { ...context, releaseRoot: link }));
  });
});

test('rejects dirty tooling and stale or incomplete tooling reviews', () => {
  withFixture(({ manifest, context }) => {
    assert.throws(() => validateExternalSubmit(manifest, { ...context, toolingClean: false }));
    for (const mutate of [
      (review) => { review.toolingCommit = 'c'.repeat(40); },
      (review) => { review.toolingTree = 'c'.repeat(40); },
      (review) => { review.reviewer = ' '; },
      (review) => { review.verdict = 'pending'; },
      (review) => { review.evidence = ''; },
    ]) {
      const changed = structuredClone(manifest);
      mutate(changed.toolingReview);
      assert.throws(() => validateExternalSubmit(changed, context));
    }
  });
});

test('rejects dirty or stale external release checkouts before verifier execution', () => {
  withFixture(({ manifest, context }) => {
    assert.throws(() => validateExternalSubmit(manifest, { ...context, releaseClean: false }));
    assert.throws(() => validateExternalSubmit(manifest, {
      ...context,
      releaseHead: 'e'.repeat(40),
    }));
    assert.throws(() => validateExternalSubmit(manifest, {
      ...context,
      releaseTree: 'e'.repeat(40),
    }));
    const staleCommit = structuredClone(manifest);
    staleCommit.sourceCommit = 'e'.repeat(40);
    assert.throws(() => validateExternalSubmit(staleCommit, context));
    const staleTree = structuredClone(manifest);
    staleTree.sourceTree = 'e'.repeat(40);
    assert.throws(() => validateExternalSubmit(staleTree, context));
  });
});

test('rejects every external-root action or platform except Android submit', () => {
  withFixture(({ manifest, context }) => {
    for (const override of [
      { action: 'upload' },
      { action: 'notes' },
      { platform: 'ios' },
    ]) {
      assert.throws(() => validateExternalSubmit(manifest, { ...context, ...override }));
    }
  });
});

test('rejects a missing verifier, wrong Git root or in-repository manifest', () => {
  withFixture(({ manifest, context }) => {
    fs.rmSync(path.join(context.releaseRoot, 'scripts', 'verify_store_release.cjs'));
    assert.throws(() => validateExternalSubmit(manifest, context));
  });
  withFixture(({ manifest, context }) => {
    assert.throws(() => validateExternalSubmit(manifest, {
      ...context,
      releaseGitRoot: context.toolingRoot,
    }));
    assert.throws(() => validateExternalSubmit(manifest, {
      ...context,
      manifestPath: path.join(context.releaseRoot, 'manifest.json'),
    }));
  });
});
