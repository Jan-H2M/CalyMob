const test = require('node:test');
const assert = require('node:assert/strict');
const { validateManifest, sha256, ARTIFACTS } = require('./verify_store_release.cjs');

function fixture(platform = 'ios') {
  const head = 'a'.repeat(40);
  const hash = 'b'.repeat(64);
  const context = { platform, action: 'upload', head, clean: true, version: '1.21.0', build: '204',
    artifactPath: ARTIFACTS[platform], artifactHash: hash, notes: 'Texte approuvé.' };
  const manifest = { schemaVersion: 1, sourceCommit: head, version: context.version, build: context.build,
    platforms: [platform], allowedActions: { [platform]: ['upload', 'submit', 'notes'] },
    notes: { 'fr-FR': context.notes },
    janApproval: { approvedBy: 'Jan Andriessens', approvedAt: '2026-08-31T10:00:00Z', evidence: 'synthetic approval fixture',
      allowedActions: { [platform]: ['upload', 'submit', 'notes'] },
      sourceCommit: head, version: context.version, build: context.build, platforms: [platform], notesSha256: sha256(context.notes) },
    codeReview: { reviewer: 'independent synthetic reviewer', verdict: 'approved', sourceCommit: head, evidence: 'synthetic review' },
    nativeReview: { [platform]: { reviewer: 'synthetic tester', verdict: 'approved', sourceCommit: head, artifactSha256: hash, evidence: 'synthetic native check' } },
    artifacts: { [platform]: { path: ARTIFACTS[platform], sha256: hash, sourceCommit: head, version: context.version, build: context.build } },
    uploadedBuilds: { [platform]: { version: context.version, build: context.build, artifactSha256: hash, evidence: 'synthetic store response' } },
  };
  return { manifest, context };
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
  for (const override of [{ clean: false }, { head: 'c'.repeat(40) }, { artifactHash: 'c'.repeat(64) },
    { artifactPath: 'old.ipa' }, { notes: 'Other notes' }, { version: '1.12.2' }, { build: '184' },
    { platform: 'android' }, { action: 'unknown' }]) {
    assert.throws(() => validateManifest(manifest, { ...context, ...override }));
  }
});

test('approval and both review records are mandatory and bound to release', () => {
  for (const mutate of [
    (m) => { delete m.janApproval; }, (m) => { m.janApproval.approvedBy = 'agent'; },
    (m) => { m.janApproval.notesSha256 = 'wrong'; }, (m) => { m.janApproval.build = '184'; },
    (m) => { m.janApproval.platforms = []; }, (m) => { m.janApproval.evidence = ''; },
    (m) => { m.codeReview.verdict = 'pending'; }, (m) => { m.codeReview.sourceCommit = 'wrong'; },
    (m) => { delete m.nativeReview.ios; }, (m) => { m.nativeReview.ios.artifactSha256 = 'wrong'; },
    (m) => { m.artifacts.ios.sourceCommit = 'wrong'; }, (m) => { m.allowedActions.ios = []; },
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

test('Android combined release requires separately authorized upload and submission', () => {
  const { manifest, context } = fixture('android');
  const combined = { ...context, action: 'upload-and-submit' };
  assert.equal(validateManifest(manifest, combined).platform, 'android');
  manifest.allowedActions.android = ['upload'];
  assert.throws(() => validateManifest(manifest, combined));
  manifest.allowedActions.android = ['upload', 'submit'];
  manifest.janApproval.allowedActions.android = ['upload'];
  assert.throws(() => validateManifest(manifest, combined));
});
