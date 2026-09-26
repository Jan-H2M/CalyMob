'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDraft, parseArgs } = require('./scaffold_release_manifest.cjs');
const { validateManifest, sha256, ARTIFACTS } = require('./verify_store_release.cjs');

function fixture() {
  const sourceCommit = 'a'.repeat(40);
  const sourceTree = 'd'.repeat(40);
  const artifactHash = 'b'.repeat(64);
  const notes = 'Texte approuvé.';
  const platform = 'ios';
  const draft = createDraft({
    sourceCommit,
    sourceTree,
    version: '1.23.0',
    build: '214',
    platforms: [platform],
    notes,
    artifacts: { [platform]: { path: ARTIFACTS[platform], sha256: artifactHash } },
  });
  const context = {
    platform,
    action: 'upload',
    head: sourceCommit,
    tree: sourceTree,
    clean: true,
    version: '1.23.0',
    build: '214',
    artifactPath: ARTIFACTS[platform],
    artifactHash,
    notes,
  };
  return { draft, context };
}

test('CLI requires an external output and explicit supported platforms', () => {
  assert.deepEqual(parseArgs(['--output', '/tmp/release.json', '--platforms', 'android,ios']), {
    output: '/tmp/release.json', platforms: ['android', 'ios'],
  });
  assert.throws(() => parseArgs(['--output', '/tmp/release.json']));
  assert.throws(() => parseArgs(['--output', '/tmp/release.json', '--platforms', 'windows']));
});

test('scaffold never fabricates approval, review, test, or artifact provenance', () => {
  const { draft, context } = fixture();
  assert.equal(draft.schemaVersion, 2);
  assert.equal(draft.draft, true);
  assert.deepEqual(draft.allowedActions.ios, []);
  assert.equal(draft.janApproval.approvedBy, null);
  assert.equal(draft.janApproval.evidence, null);
  assert.equal(draft.codeReview.verdict, 'pending');
  assert.equal(draft.testEvidence.result, 'pending');
  assert.equal(draft.nativeReview.ios.verdict, 'pending');
  assert.equal(draft.artifacts.ios.sourceCommit, null);
  assert.throws(() => validateManifest(draft, context));
});

test('only separately recorded complete evidence turns the draft into a valid manifest', () => {
  const { draft, context } = fixture();
  const { head, tree, version, build, platform, artifactHash, notes } = context;
  draft.allowedActions[platform] = ['upload'];
  Object.assign(draft.janApproval, {
    approvedBy: 'Jan Andriessens', approvedAt: '2026-09-26T10:00:00Z',
    evidence: 'synthetic explicit approval fixture', sourceCommit: head, sourceTree: tree,
    version, build, platforms: [platform], allowedActions: { [platform]: ['upload'] },
    notesSha256: sha256(notes),
  });
  Object.assign(draft.codeReview, {
    reviewer: 'synthetic independent reviewer', verdict: 'approved',
    sourceCommit: head, sourceTree: tree, evidence: 'synthetic review fixture',
  });
  Object.assign(draft.testEvidence, {
    result: 'passed', sourceCommit: head, sourceTree: tree, evidence: 'synthetic test fixture',
  });
  Object.assign(draft.nativeReview[platform], {
    reviewer: 'synthetic native reviewer', verdict: 'approved', sourceCommit: head,
    sourceTree: tree, evidence: 'synthetic native fixture', artifactSha256: artifactHash,
  });
  Object.assign(draft.artifacts[platform], { sourceCommit: head, sourceTree: tree, version, build });
  assert.throws(() => validateManifest(draft, context), /manifest is still a draft/);
  draft.draft = false;
  assert.equal(validateManifest(draft, context).sourceTree, tree);
});
