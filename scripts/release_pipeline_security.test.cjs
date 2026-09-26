'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Codemagic is artifact-build-only and has no store publisher', () => {
  const yaml = read('codemagic.yaml');
  const lines = yaml.split('\n');
  let inPublishing = false;
  for (const line of lines) {
    if (/^    publishing:\s*$/.test(line)) {
      inPublishing = true;
      continue;
    }
    if (inPublishing && /^    \S/.test(line)) inPublishing = false;
    if (inPublishing) {
      assert.doesNotMatch(line, /^      (?:app_store_connect|google_play):/);
    }
  }
  assert.doesNotMatch(yaml, /^\s*submit_to_(?:testflight|app_store):/m);
  assert.match(yaml, /bash scripts\/build_release_ipa\.sh/);
});

test('supported release instructions use hardened build and upload entrypoints', () => {
  const instructionFiles = [
    '.claude/context.md',
    '.claude/skills/flutter-build-deploy/SKILL.md',
    'APP_STORE_PUBLICATIE.md',
    'CLAUDE.md',
    'docs/guides/BUILD_ANDROID.md',
    'docs/guides/CODEMAGIC_BUILD_GUIDE.md',
    'docs/audit/PLATFORM_REQUIREMENTS.md',
    'docs/audit/CROSS_PLATFORM_STRATEGY.md',
    'ios/fastlane/README.md',
  ];
  const forbiddenReleaseBuild = /flutter build (?:ipa|appbundle)(?! --debug)|flutter build apk --release|flutter build ios --release/;
  for (const file of instructionFiles) {
    const instructions = read(file);
    assert.doesNotMatch(instructions, forbiddenReleaseBuild, `${file} contains a raw release build`);
    assert.doesNotMatch(instructions, /\[bundle exec\] fastlane|(?<!run_fastlane\.sh )(?:fastlane|bundle exec fastlane) (?:ios|android)\b/,
      `${file} contains a bare Fastlane command`);
  }
  assert.doesNotMatch(read('scripts/build_release_aab.sh'), /Upload dit bestand naar de Google Play Console/);
  const repoSkill = read('.claude/skills/flutter-build-deploy/SKILL.md');
  assert.doesNotMatch(repoSkill, /Submit for (?:Google Play|Apple) Review \(Browser automation\)/);
  assert.match(repoSkill, /run_fastlane\.sh android submit/);
  assert.match(repoSkill, /run_fastlane\.sh ios submit/);
});

test('both store submission lanes are manifest-gated', () => {
  const android = read('android/fastlane/Fastfile');
  const ios = read('ios/fastlane/Fastfile');
  assert.match(android, /^skip_docs$/m);
  assert.match(ios, /^skip_docs$/m);
  assert.match(android, /lane :submit do \|options\|[\s\S]*verify_android_store_release\('submit', options\)/);
  assert.match(android, /skip_upload_aab: true/);
  assert.match(android, /version_code: release\['build'\]\.to_i/);
  assert.doesNotMatch(android, /upload-and-submit|lane :release|lane :internal/);
  assert.doesNotMatch(android, /release_status: 'completed'[\s\S]*lane :submit/);
  assert.match(ios, /lane :submit do \|options\|[\s\S]*verify_ios_store_release\('submit', options\)/);
  assert.doesNotMatch(ios, /reject_if_possible:\s*true/);
});

test('reviewer credential is external and never printed or embedded', () => {
  const script = read('scripts/create-demo-account.js');
  assert.match(script, /CALYMOB_REVIEWER_PASSWORD_FILE/);
  assert.match(script, /GOOGLE_APPLICATION_CREDENTIALS/);
  assert.match(script, /mode 0600/);
  assert.match(script, /must live outside the repository/);
  assert.doesNotMatch(script, /password:\s*['"][^'"]+['"]/);
  assert.doesNotMatch(script, /console\.log\([^\n]*CONFIG\.password/);
  assert.doesNotMatch(script, /functions\/certs|serviceAccountKey|path\.basename/);

  const guide = read('APP_STORE_PUBLICATIE.md');
  for (const line of guide.split('\n').filter((entry) => /^Password:/.test(entry))) {
    assert.match(line, /external secret manager\/keychain/);
  }
});

test('Fastlane wrapper resolves a working locked bundle or supported Homebrew launcher', () => {
  const wrapper = read('scripts/run_fastlane.sh');
  assert.doesNotMatch(wrapper, /Gem\.bindir|RUBY_BIN/);
  assert.match(wrapper, /BUNDLE_GEMFILE=.*"\$bundle_bin" check/);
  assert.match(wrapper, /\/opt\/homebrew\/bin\/fastlane/);
  assert.match(wrapper, /\/usr\/local\/bin\/fastlane/);
  assert.doesNotMatch(wrapper, /command -v fastlane/);
});
