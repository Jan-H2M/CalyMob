const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

// This is a source-preservation gate, not native acceptance or store approval.
test('published formation/history/depth regression suites stay in the package', () => {
  for (const file of [
    'test/services/mil_depth_cumulative_test.dart',
    'test/screens/compact_stats_test.dart',
    'test/screens/apnee_dossier_screen_test.dart',
    'test/screens/pool_formation_tabs_test.dart',
    'test/services/pool_student_history_test.dart',
    'test/screens/palanquee_simulation_persistence_test.dart',
  ]) assert.ok(read(file).length > 100, file);
});

test('planning roster serialization is retained independently of assigned groups', () => {
  const model = read('lib/models/palanquee.dart');
  assert.match(model, /final List<PalanqueeParticipant> simulationParticipants/);
  assert.match(model, /data\['simulation_participants'\]/);
  assert.match(model, /'simulation_participants':/);
  assert.match(read('lib/services/palanquee_service.dart'), /\.toFirestore\(\)/);
});

test('new DEV payment and action-first regressions are not lost in consolidation', () => {
  for (const file of [
    'test/widgets/event_payment_options_dialog_test.dart',
    'test/widgets/boutique_current_payment_panel_test.dart',
    'test/screens/boutique_action_wizard_test.dart',
    'test/dev/isolated_dev_test.dart',
    'functions/src/boutique/paymentContext.test.js',
  ]) assert.ok(read(file).length > 100, file);
  assert.match(read('functions/src/boutique/paymentContext.js'), /requestPaymentReference/);
  assert.match(read('lib/widgets/boutique/boutique_current_payment_panel.dart'), /current\['communication'\] != shown\['communication'\]/);
});

test('prepared French and Dutch notes agree between platforms for reserved build', () => {
  const version = /^version: (\d+\.\d+\.\d+)\+(\d+)$/m.exec(read('pubspec.yaml'));
  assert.ok(version, 'numeric marketing version and reservation required');
  for (const locale of ['fr-FR', 'nl-NL']) {
    const ios = read(`ios/fastlane/metadata/${locale}/release_notes.txt`).trim();
    const android = read(`android/fastlane/metadata/android/${locale}/changelogs/${version[2]}.txt`).trim();
    assert.ok(ios.length > 30 && ios.length < 500, locale);
    assert.equal(android, ios, locale);
  }
});

test('workflow snapshot is manual and has both mandatory App Store eligible actions', () => {
  const workflow = JSON.parse(read('ci_scripts/xcode-cloud-workflow.json'));
  assert.match(workflow._snapshot.notice, /never apply/i);
  assert.equal(workflow.data.id, 'D11B66EC-6E95-43A4-B345-727D1992D72A');
  const attrs = workflow.data.attributes;
  for (const key of ['branchStartCondition', 'tagStartCondition', 'pullRequestStartCondition', 'scheduledStartCondition']) {
    assert.equal(attrs[key], null, key);
  }
  for (const type of ['TEST', 'ARCHIVE']) {
    assert.equal(attrs.actions.filter(a => a.actionType === type && a.isRequiredToPass).length, 1, type);
  }
  assert.equal(attrs.actions.find(a => a.actionType === 'ARCHIVE').buildDistributionAudience, 'APP_STORE_ELIGIBLE');
});

test('future Cloud run still enforces the committed reservation and restored regressions', () => {
  const clone = read('ci_scripts/ci_post_clone.sh');
  assert.match(clone, /check_xcode_cloud_environment\.sh/);
  for (const file of [
    'test/services/mil_depth_cumulative_test.dart',
    'test/screens/palanquee_simulation_persistence_test.dart',
    'test/screens/boutique_action_wizard_test.dart',
    'test/widgets/event_payment_options_dialog_test.dart',
  ]) assert.ok(clone.includes(file), file);
});

test('historical scan exceptions are only exact public identifiers, never file/rule wildcards', () => {
  assert.match(read('.github/workflows/secret-scan.yml'), /pull_request:\s*\n\s*branches: \[main, dev\]/,
    'DEV PRs must scan the full base-to-head range, not only the last pushed fix');
  const fingerprints = read('.gitleaksignore').split('\n')
    .filter(line => line && !line.startsWith('#'));
  const catalogueLines = [130, 430, 610, 790, 802, 862, 874, 886, 898, 910];
  for (const file of ['assets/apnee/lifras-preparation-cards-2025-08.json',
    'functions/src/training/apnee/catalog.json']) {
    const commit = 'c37e7e09ce6f1001921afcaac0da570082799c8a';
    const historical = execFileSync('git', ['show', `${commit}:${file}`],
      { cwd: root, encoding: 'utf8' });
    assert.equal(historical, read(file), 'Only the reviewed catalogue content is eligible');
    const lines = historical.split('\n');
    for (const number of catalogueLines) {
      const entry = JSON.parse(`{${lines[number - 1].trim().replace(/,$/, '')}}`);
      assert.match(entry.key, /^apnee\.(a1|a2)\.[a-z0-9_.]+$/);
      assert.ok(fingerprints.includes(`${commit}:${file}:generic-api-key:${number}`));
    }
  }
  const qaCommit = '91065758d92817da8b0698e0688ce28f50003e2c';
  const qaFile = 'scripts/qa/live-preview-login.cjs';
  const historicalQa = execFileSync('git', ['show', `${qaCommit}:${qaFile}`],
    { cwd: root, encoding: 'utf8' });
  const line = historicalQa.split('\n')[156];
  const literals = line.match(/AIza[A-Za-z0-9_-]{35}/g) || [];
  assert.ok(line.includes('builtApp.includes') && literals.length === 1,
    'The exception must remain a comparison guard, not an authentication secret');
  assert.ok(read('lib/firebase_options.dart').includes(literals[0]),
    'Only the public client configuration identifier is eligible');
  assert.ok(fingerprints.includes(`${qaCommit}:${qaFile}:gcp-api-key:157`));
  for (const fingerprint of fingerprints) {
    assert.match(fingerprint, /^[a-f0-9]{40}:[^*?]+:[a-z0-9-]+:[0-9]+$/);
  }
});
