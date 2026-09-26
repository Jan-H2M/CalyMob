const test = require('node:test');
const assert = require('node:assert/strict');
const { validateManifest, sha256, ARTIFACTS } = require('./verify_store_release.cjs');

function fixture(platform = 'ios') {
  const head = 'a'.repeat(40);
  const tree = 'd'.repeat(40);
  const hash = 'b'.repeat(64);
  const context = { platform, action: 'upload', head, tree, clean: true, version: '1.21.0', build: '204',
    artifactPath: ARTIFACTS[platform], artifactHash: hash, notes: 'Texte approuvé.' };
  const manifest = { schemaVersion: 2, draft: false, sourceCommit: head, sourceTree: tree,
    version: context.version, build: context.build,
    platforms: [platform], allowedActions: { [platform]: ['upload', 'submit', 'notes'] },
    notes: { 'fr-FR': context.notes },
    janApproval: { approvedBy: 'Jan Andriessens', approvedAt: '2026-08-31T10:00:00Z', evidence: 'synthetic approval fixture',
      allowedActions: { [platform]: ['upload', 'submit', 'notes'] },
      sourceCommit: head, sourceTree: tree, version: context.version, build: context.build,
      platforms: [platform], notesSha256: sha256(context.notes) },
    codeReview: { reviewer: 'independent synthetic reviewer', verdict: 'approved',
      sourceCommit: head, sourceTree: tree, evidence: 'synthetic review' },
    testEvidence: { sourceCommit: head, sourceTree: tree, result: 'passed', evidence: 'synthetic CI fixture, not a real run' },
    nativeReview: { [platform]: { reviewer: 'synthetic tester', verdict: 'approved',
      sourceCommit: head, sourceTree: tree, artifactSha256: hash, evidence: 'synthetic native check' } },
    artifacts: { [platform]: { path: ARTIFACTS[platform], sha256: hash,
      sourceCommit: head, sourceTree: tree, version: context.version, build: context.build } },
    uploadedBuilds: { [platform]: { version: context.version, build: context.build, artifactSha256: hash, evidence: 'synthetic store response' } },
  };
  return { manifest, context };
}

function applyInternalWaiver(manifest, platform = 'ios') {
  manifest.allowedChannels = { [platform]: ['internal'] };
  manifest.janApproval.allowedChannels = { [platform]: ['internal'] };
  manifest.nativeReview[platform] = {
    verdict: 'waived',
    waivedBy: 'Jan Andriessens',
    reason: 'The internal track is the hands-on review channel.',
    sourceCommit: manifest.sourceCommit,
    sourceTree: manifest.sourceTree,
    artifactSha256: manifest.artifacts[platform].sha256,
    evidence: 'Explicit internal-testing waiver fixture.',
  };
}

test('only fully matching approval, review and artifact context is accepted for each platform', () => {
  for (const platform of ['ios', 'android']) {
    const { manifest, context } = fixture(platform);
    assert.equal(validateManifest(manifest, context).build, '204');
  }
});

test('missing manifest and stale source/artifact/notes/version/platform fail closed', () => {
  const { manifest, context } = fixture();
  assert.throws(() => validateManifest(undefined, context));
  for (const override of [{ clean: false }, { head: 'c'.repeat(40) }, { tree: 'c'.repeat(40) },
    { artifactHash: 'c'.repeat(64) },
    { artifactPath: 'old.ipa' }, { notes: 'Other notes' }, { version: '1.12.2' }, { build: '184' },
    { platform: 'android' }, { action: 'unknown' }]) {
    assert.throws(() => validateManifest(manifest, { ...context, ...override }));
  }
  manifest.schemaVersion = 1;
  assert.throws(() => validateManifest(manifest, context));
});

test('approval and both review records are mandatory and bound to release', () => {
  for (const mutate of [
    (m) => { delete m.janApproval; }, (m) => { m.janApproval.approvedBy = 'agent'; },
    (m) => { m.sourceTree = 'wrong'; },
    (m) => { m.janApproval.notesSha256 = 'wrong'; }, (m) => { m.janApproval.build = '184'; },
    (m) => { m.janApproval.sourceTree = 'wrong'; },
    (m) => { m.janApproval.platforms = []; }, (m) => { m.janApproval.evidence = ''; },
    (m) => { m.codeReview.verdict = 'pending'; }, (m) => { m.codeReview.sourceCommit = 'wrong'; },
    (m) => { m.codeReview.sourceTree = 'wrong'; },
    (m) => { delete m.nativeReview.ios; }, (m) => { m.nativeReview.ios.artifactSha256 = 'wrong'; },
    (m) => { m.artifacts.ios.sourceCommit = 'wrong'; }, (m) => { m.artifacts.ios.sourceTree = 'wrong'; },
    (m) => { m.allowedActions.ios = []; },
    (m) => { delete m.testEvidence; }, (m) => { m.testEvidence.result = 'failed'; },
    (m) => { m.testEvidence.sourceCommit = 'wrong'; }, (m) => { m.testEvidence.sourceTree = 'wrong'; },
    (m) => { m.nativeReview.ios.sourceTree = 'wrong'; }, (m) => { m.testEvidence.evidence = ''; },
  ]) {
    const { manifest, context } = fixture();
    mutate(manifest);
    assert.throws(() => validateManifest(manifest, context));
  }
});

test('submit has no historical defaults and requires matching uploaded artifact evidence', () => {
  const { manifest, context } = fixture();
  const submit = { ...context, action: 'submit', requestedVersion: '1.21.0', requestedBuild: '204' };
  assert.equal(validateManifest(manifest, submit).version, '1.21.0');
  assert.throws(() => validateManifest(manifest, { ...context, action: 'submit' }));
  assert.throws(() => validateManifest(manifest, { ...submit, requestedBuild: '184' }));
  manifest.uploadedBuilds.ios.artifactSha256 = 'wrong';
  assert.throws(() => validateManifest(manifest, submit));
});

test('combined upload and submission is never accepted', () => {
  const { manifest, context } = fixture('android');
  const combined = { ...context, action: 'upload-and-submit' };
  assert.throws(() => validateManifest(manifest, combined));
});

test('internal upload tracks accept an explicitly approved Jan hands-on-review waiver', () => {
  const { manifest, context } = fixture('ios');
  applyInternalWaiver(manifest, 'ios');
  assert.equal(validateManifest(manifest, { ...context, action: 'upload', channel: 'internal' }).channel, 'internal');
});

test('internal waivers cannot authorize Android or a combined upload and submission', () => {
  const { manifest, context } = fixture('android');
  applyInternalWaiver(manifest, 'android');
  assert.throws(() => validateManifest(manifest, { ...context, action: 'upload', channel: 'internal' }));
  assert.throws(() => validateManifest(manifest, { ...context, action: 'upload-and-submit', channel: 'internal' }));
});

test('a hands-on-review waiver is rejected for the public channel', () => {
  const { manifest, context } = fixture();
  applyInternalWaiver(manifest);
  assert.throws(() => validateManifest(manifest, { ...context, channel: 'public' }));
});

test('a hands-on-review waiver is rejected for submit actions', () => {
  const { manifest, context } = fixture();
  applyInternalWaiver(manifest);
  assert.throws(() => validateManifest(manifest, {
    ...context, action: 'submit', channel: 'internal', requestedVersion: '1.21.0', requestedBuild: '204',
  }));
});

test('an internal hands-on-review waiver fails closed for stale provenance or empty reason', () => {
  for (const mutate of [
    (m) => { m.nativeReview.ios.sourceCommit = 'c'.repeat(40); },
    (m) => { m.nativeReview.ios.sourceTree = 'c'.repeat(40); },
    (m) => { m.nativeReview.ios.artifactSha256 = 'c'.repeat(64); },
    (m) => { m.nativeReview.ios.reason = '   '; },
  ]) {
    const { manifest, context } = fixture();
    applyInternalWaiver(manifest);
    mutate(manifest);
    assert.throws(() => validateManifest(manifest, { ...context, channel: 'internal' }));
  }
});
