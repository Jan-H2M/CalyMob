const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
