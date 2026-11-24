'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDraft, parseArgs } = require('./scaffold_release_manifest.cjs');
const { validateManifest, sha256, ARTIFACTS } = require('./verify_store_release.cjs');
const { WORKFLOW_ID } = require('./build_number_sync.cjs');

function fixture() {
  const sourceCommit = 'a'.repeat(40);
  const sourceTree = 'd'.repeat(40);
  const artifactHash = 'b'.repeat(64);
  const notes = 'Texte approuvé.';
  const platform = 'ios';
  const buildNumberSource = {
    provider: 'xcode-cloud', workflowId: WORKFLOW_ID,
    observedAt: '2026-10-29T16:32:00Z',
    latestRunId: '11111111-2222-3333-4444-555555555555', latestRunNumber: 214,
    latestUploadedVersion: '1.23.0', latestUploadedBuild: 214,
    reservedVersion: '1.23.0', reservedBuild: 214, relation: 'matches-latest-cloud',
  };
  const cloudArtifact = {
    workflowId: WORKFLOW_ID, runId: buildNumberSource.latestRunId, runNumber: 214,
    executionProgress: 'COMPLETE', completionStatus: 'SUCCEEDED',
    createdAt: '2026-10-29T16:00:00Z', finishedAt: '2026-10-29T16:20:00Z',
    appStoreBuildId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', processingState: 'VALID',
    sourceCommit, sourceTree, version: '1.23.0', build: '214',
  };
  const draft = createDraft({
    sourceCommit,
    sourceTree,
    version: '1.23.0',
    build: '214',
    platforms: [platform],
    notes,
    artifacts: { [platform]: cloudArtifact },
    buildNumberSource,
  });
  const context = {
    platform,
    action: 'submit',
    head: sourceCommit,
    tree: sourceTree,
    clean: true,
    version: '1.23.0',
    build: '214',
    artifactPath: null,
    artifactHash: null,
    notes,
    requestedVersion: '1.23.0',
    requestedBuild: '214',
  };
  return { draft, context, buildNumberSource, sourceCommit };
}

test('CLI requires an external output and explicit supported platforms', () => {
  assert.deepEqual(parseArgs(['--output', '/tmp/release.json', '--platforms', 'android,ios']), {
    output: '/tmp/release.json', platforms: ['android', 'ios'],
  });
  assert.throws(() => parseArgs(['--output', '/tmp/release.json']));
  assert.throws(() => parseArgs(['--output', '/tmp/release.json', '--platforms', 'windows']));
});

test('scaffold never fabricates approval, review, test, or artifact provenance', () => {
  const { draft, context, buildNumberSource, sourceCommit } = fixture();
  assert.equal(draft.schemaVersion, 2);
  assert.deepEqual(draft.buildNumberSource, buildNumberSource);
  assert.equal(draft.draft, true);
  assert.deepEqual(draft.allowedActions.ios, []);
  assert.equal(draft.janApproval.approvedBy, null);
  assert.equal(draft.janApproval.evidence, null);
  assert.equal(draft.codeReview.verdict, 'pending');
  assert.equal(draft.testEvidence.result, 'pending');
  assert.equal(draft.nativeReview.ios.verdict, 'pending');
  assert.equal(draft.artifacts.ios.sourceCommit, context.head);
  assert.throws(() => validateManifest(draft, context));
});

test('only separately recorded complete evidence turns the draft into a valid manifest', () => {
  const { draft, context } = fixture();
  const { head, tree, version, build, platform, artifactHash, notes } = context;
  draft.allowedActions[platform] = ['submit'];
  Object.assign(draft.janApproval, {
    approvedBy: 'Jan Andriessens', approvedAt: '2026-09-26T10:00:00Z',
    evidence: 'synthetic explicit approval fixture', sourceCommit: head, sourceTree: tree,
    version, build, platforms: [platform], allowedActions: { [platform]: ['submit'] },
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
    sourceTree: tree, evidence: 'synthetic native fixture',
    xcodeCloudRunId: draft.artifacts.ios.runId,
    appStoreBuildId: draft.artifacts.ios.appStoreBuildId,
  });
  assert.throws(() => validateManifest(draft, context), /manifest is still a draft/);
  draft.draft = false;
  assert.equal(validateManifest(draft, context).sourceTree, tree);
});
