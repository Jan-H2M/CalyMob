---
name: flutter-build-deploy
description: Build CalyMob Flutter app and deploy to Google Play Store and/or Apple App Store. Use this skill whenever the user asks to build the app, deploy to Play Store or App Store, release a new version, bump the version, or publish CalyMob. Also trigger when the user mentions "build", "release", "deploy", "play store", "app store", "apple", "ios", "android", "aab", "appbundle", "ipa", "nieuwe versie", "store status", "état des stores", "verifi store", or "check store".
---

# Flutter Build & Deploy (Android + iOS) — Fully Automated

## IMPORTANT: Store Verification / Checking Store Status

When the user asks to check the store status ("vérifie l'état des stores", "check store status", etc.):

### Step 1: App Store Connect — LOGIN FIRST!
**CRITICAL: App Store Connect requires Apple ID login. ALWAYS navigate to App Store Connect first and verify the user is logged in before trying to access any ASC pages. The Apple login iframe CANNOT be automated — you must ask the user to sign in manually.**

1. Navigate to `https://appstoreconnect.apple.com` (NOT directly to the app page)
2. Read the page — check if "Sign In" link is visible or if user name "Jan Andriessens" appears
3. If NOT logged in → tell user to sign in, wait for confirmation, then proceed
4. Once logged in → navigate to `https://appstoreconnect.apple.com/apps/6755293289/distribution`
5. Read the sidebar navigation (ref for "Distribution" nav) to find:
   - Version number + status (Waiting for Review, In Review, Ready for Sale, etc.)
   - Look for "Waiting for Review" or "Ready for Distribution" links in the iOS App section
6. Also check for **License Agreement** warnings on the ASC homepage — these can block reviews!

### Step 2: Google Play Console
1. Navigate to `https://play.google.com/console/u/0/developers/4868133097597517725/app/4975215339505656603/tracks/production`
2. Read the page to check: active version, draft releases, installs, review status
3. **CRITICAL: If there is a Draft release, ask the user if it should be submitted for review!** Don't leave drafts unsubmitted.

### Step 3: Compare with local version
```bash
grep "^version:" /Users/jan/Dev/GitHub/Calypso/CalyMob/pubspec.yaml
```

Present a summary table with both stores side by side.

### Step 4: Action items
Always list pending actions:
- Draft releases that need submitting
- License agreements that need accepting
- Versions that are mismatched between stores

## IMPORTANT: After uploading to Play Store, ALWAYS submit for review!

**NEVER leave a draft release unsubmitted.** After fastlane uploads, ALWAYS complete the full submission flow:
1. Go to Production → Releases tab → click **Edit release** on the draft
2. Click **Next** (Step 1 → Step 2)
3. Click **Save** (confirms the release)
4. In the "Go to Publishing overview?" dialog → click **Go to overview**
5. Click **"Send 1 change for review"**
6. Confirm with **"Send changes for review"**
7. Verify status shows **"Changes in review"**

If you skip this, the release stays as a draft and never gets published!

This skill automates the CalyMob Flutter app build and deployment to both Google Play Console (Android) and Apple App Store (iOS). **Both platforms are fully automated via CLI — no browser interaction required for uploads.**

## Overview

### Android Workflow (fully automated)
1. **Environment Check** - Verify Android SDK, Java, Flutter are ready
2. **Version Bump** (optional) - Increment version in `pubspec.yaml`, review and commit it
3. **Build AAB** - Run `flutter build appbundle --release`
4. **Upload to Play Store** - `fastlane supply` uploads AAB via Google Play Developer API
5. **Submit for Review** - Browser automation in Play Console: Edit draft → Next → Save → Send for review

### iOS Workflow (fully automated)
1. **Environment Check** - Verify Xcode, Flutter, CocoaPods are ready
2. **Version Bump** (shared with Android) - Same `bump_version.sh` script
3. **Build IPA** - Run `flutter build ipa --release`
4. **Upload to App Store Connect** - `xcrun altool` uploads IPA via API key
5. **Submit for Review** - Browser automation in App Store Connect (only step needing Chrome)

## Prerequisites

### Shared
- **Flutter SDK** at `/Users/jan/flutter/bin/flutter`

### Android
- **Android Studio** at `/Applications/Android Studio.app`
- **Android SDK** at `~/Library/Android/sdk` with:
  - `platforms;android-36`, `build-tools;36.0.0`, `build-tools;35.0.0`
  - `ndk/27.0.12077973`
  - `cmake/3.22.1`
- **Java** bundled with Android Studio (JBR)
- **fastlane** via `scripts/run_fastlane.sh`, using the Bundler version pinned in `android/Gemfile.lock`
- **Google Play service account key** at `~/.private_keys/google-play-deploy.json`
  - Service account: `google-play-deploy@calycompta.iam.gserviceaccount.com`
  - Linked to CalyMob (club.caly.calymob) in Play Console with release permissions

### iOS
- **Xcode** (currently 26.2) with iOS SDK
- **CocoaPods** (`pod` command available)
- **Apple Developer Account** with signing identity
- **App Store Connect API Key** (.p8 file) at `~/.private_keys/AuthKey_ZK62KYKA4T.p8`

### Signing & API Credentials

**Android**:
- Google Play manages app signing ("Releases signed by Google Play")
- The upload keystore and one-line password file live outside every repository
  with mode `0600`; never restore `key.properties` or a keystore into the checkout.
- `android/local.properties` is generated machine state and must remain
  untracked and ignored so Flutter cannot dirty release provenance.
- Before a release build, export only `CALYMOB_UPLOAD_STORE_FILE`,
  `CALYMOB_UPLOAD_PASSWORD_FILE`, and `CALYMOB_UPLOAD_KEY_ALIAS`. The password
  itself must never be placed in an environment variable, command, log, Gradle
  property, or repository file.
- Gradle opens the keystore, requires the alias to be a private-key entry, and
  checks its certificate against the pinned public CalyMob upload certificate.
- Service account: `google-play-deploy@calycompta.iam.gserviceaccount.com`
- JSON key: `~/.private_keys/google-play-deploy.json`

**iOS**:
- Signing Identity: "Apple Development: Jan Andriessens (WZ23889U97)"
- Team ID: 53455KKD9G
- Bundle ID: `be.calypsodc.calymob`
- Deployment Target: iOS 15.5
- App Store Connect API Key:
  - Issuer ID: `280e011a-f492-43fb-b0eb-727ddaa8c6c9`
  - Key ID: `ZK62KYKA4T`
  - P8 file: `~/.private_keys/AuthKey_ZK62KYKA4T.p8`
  - Never reuse or copy a key from another product or account.

## Environment Variables

These must be set in the shell before building. They should already be in `~/.zshrc`:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

---

# ANDROID: Full Automated Deploy

## Phase 1: Environment Check

Before building, verify the environment is ready:

```bash
source ~/.zshrc
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

# Quick check
flutter doctor -v 2>&1 | head -40
```

If `flutter doctor` shows issues, resolve them before proceeding. Common fixes:
- "Android SDK not found" → Check ANDROID_HOME path
- "Java not found" → Check JAVA_HOME path
- "Android license not accepted" → Run `yes | sdkmanager --licenses`
- Missing SDK component → Install via `sdkmanager "component-name"`

## Phase 2: Version Bump (Optional)

Ask the user if they want to bump the version. If yes, ask which type (patch/minor/major).

The project has a bump script for `pubspec.yaml`; it deliberately does not
publish the Firestore app version:

```bash
cd /Users/jan/Dev/GitHub/Calypso/CalyMob
./scripts/bump_version.sh patch   # or minor, or major
```

This script:
- Reads current version from `pubspec.yaml` (format: `MAJOR.MINOR.PATCH+BUILD`)
- Increments the specified part + always increments build number
- Updates `pubspec.yaml`
- Leaves Firestore publication for Jan's separate post-store action

Review and commit the version change before building. Release builds must start
from a completely clean checkout; never describe an uncommitted bump as an
artifact built from the current commit.

If the user doesn't want to bump, read the current version:
```bash
grep "^version:" /Users/jan/Dev/GitHub/Calypso/CalyMob/pubspec.yaml
```

## Phase 3: Build AAB

The build takes several minutes. Use a background script approach to avoid timeouts:

```bash
# Create build script
cat > /tmp/build_calymob.sh << 'SCRIPT'
#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/Users/jan/Dev/GitHub/Calypso/CalyMob"
LOG_PATH="/tmp/build_calymob.log"
AAB_PATH="$PROJECT_ROOT/build/app/outputs/bundle/release/app-release.aab"
BUNDLE_MANIFEST="$PROJECT_ROOT/build/app/intermediates/bundle_manifest/release/processApplicationManifestReleaseForBundle/AndroidManifest.xml"
BUILD_START_MARKER=""

cleanup() {
  local status=$?
  set +e
  unset CALYMOB_UPLOAD_STORE_FILE CALYMOB_UPLOAD_PASSWORD_FILE CALYMOB_UPLOAD_KEY_ALIAS
  if [ "$status" -ne 0 ]; then
    rm -f -- "$AAB_PATH" "$BUNDLE_MANIFEST"
  fi
  if [ -n "$BUILD_START_MARKER" ]; then
    rm -f -- "$BUILD_START_MARKER"
  fi
  printf 'EXIT_CODE=%s\n' "$status" >> "$LOG_PATH"
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

require_clean_checkout() {
  local checkout_status
  if ! checkout_status=$(git status --porcelain=v1 --untracked-files=all); then
    echo "Unable to verify Git checkout cleanliness." >&2
    return 1
  fi
  if [ -n "$checkout_status" ]; then
    echo "Release build requires a completely clean Git checkout." >&2
    exit 1
  fi
}

require_source_unchanged() {
  local phase="$1"
  local current_commit current_tree checkout_status
  if ! current_commit=$(git rev-parse --verify HEAD) \
    || ! current_tree=$(git rev-parse --verify 'HEAD^{tree}'); then
    echo "Unable to verify Git source during $phase." >&2
    return 1
  fi
  if [ "$current_commit" != "$SOURCE_COMMIT" ] || [ "$current_tree" != "$SOURCE_TREE" ]; then
    echo "Git HEAD/tree changed during $phase." >&2
    return 1
  fi
  if ! checkout_status=$(git status --porcelain=v1 --untracked-files=all); then
    echo "Unable to verify Git checkout during $phase." >&2
    return 1
  fi
  if [ -n "$checkout_status" ]; then
    echo "Git checkout changed during $phase." >&2
    return 1
  fi
}

export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
export PATH="/Users/jan/flutter/bin:$PATH"
export CALYMOB_UPLOAD_STORE_FILE="$HOME/.private_keys/android-upload-2026-09-26.jks"
export CALYMOB_UPLOAD_PASSWORD_FILE="$HOME/.private_keys/android-upload-2026-09-26.password"
export CALYMOB_UPLOAD_KEY_ALIAS="upload-2026-09-26"

cd "$PROJECT_ROOT"
require_clean_checkout
SOURCE_COMMIT=$(git rev-parse --verify HEAD)
SOURCE_TREE=$(git rev-parse --verify 'HEAD^{tree}')
VERSION_LINE=$(awk '$1 == "version:" { print $2; exit }' pubspec.yaml)
if [[ ! "$VERSION_LINE" =~ ^([0-9]+\.[0-9]+\.[0-9]+)\+([0-9]+)$ ]]; then
  echo "Invalid pubspec version: $VERSION_LINE" >&2
  exit 1
fi
EXPECTED_VERSION="${BASH_REMATCH[1]}"
EXPECTED_BUILD="${BASH_REMATCH[2]}"

# A failed command must not leave an older/partial AAB that looks successful.
rm -f -- "$AAB_PATH" "$BUNDLE_MANIFEST"
BUILD_START_MARKER=$(mktemp "${TMPDIR:-/tmp}/calymob-aab-build.XXXXXX")

set +e
flutter build appbundle --release 2>&1 | tee "$LOG_PATH"
pipeline_status=("${PIPESTATUS[@]}")
set -e
flutter_status="${pipeline_status[0]:-1}"
tee_status="${pipeline_status[1]:-1}"
printf 'FLUTTER_EXIT_CODE=%s\nTEE_EXIT_CODE=%s\n' "$flutter_status" "$tee_status" >> "$LOG_PATH"
if [ "$flutter_status" -ne 0 ]; then
  exit "$flutter_status"
fi
if [ "$tee_status" -ne 0 ]; then
  exit "$tee_status"
fi

if [ ! -s "$AAB_PATH" ] || [ "$AAB_PATH" -ot "$BUILD_START_MARKER" ]; then
  echo "Build did not create a fresh non-empty AAB." >&2
  exit 1
fi
if [ ! -s "$BUNDLE_MANIFEST" ] || [ "$BUNDLE_MANIFEST" -ot "$BUILD_START_MARKER" ]; then
  echo "Build did not create a fresh bundle manifest." >&2
  exit 1
fi

ARTIFACT_VERSION=$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' "$BUNDLE_MANIFEST")
ARTIFACT_BUILD=$(sed -n 's/.*android:versionCode="\([^"]*\)".*/\1/p' "$BUNDLE_MANIFEST")
if [ "$ARTIFACT_VERSION" != "$EXPECTED_VERSION" ] || [ "$ARTIFACT_BUILD" != "$EXPECTED_BUILD" ]; then
  echo "AAB version/build does not match pubspec.yaml." >&2
  exit 1
fi
if [ "$(awk '$1 == "version:" { print $2; exit }' pubspec.yaml)" != "$VERSION_LINE" ]; then
  echo "pubspec version changed during the build." >&2
  exit 1
fi
require_source_unchanged "the release build"

AAB_SHA256=$(shasum -a 256 "$AAB_PATH" | awk '{print $1}')
if [[ ! "$AAB_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Could not calculate the AAB SHA-256." >&2
  exit 1
fi
AAB_MTIME=$(stat -f '%m' "$AAB_PATH")
printf 'SOURCE_COMMIT=%s\nSOURCE_TREE=%s\nVERSION=%s\nBUILD=%s\nAAB_MTIME_EPOCH=%s\nAAB_SHA256=%s\n' \
  "$SOURCE_COMMIT" "$SOURCE_TREE" "$EXPECTED_VERSION" "$EXPECTED_BUILD" "$AAB_MTIME" "$AAB_SHA256" >> "$LOG_PATH"
SCRIPT
chmod +x /tmp/build_calymob.sh
```

Launch via AppleScript to run in Terminal (avoids timeout issues):
```applescript
tell application "Terminal"
    do script "/tmp/build_calymob.sh"
    activate
end tell
```

Monitor progress by checking the log:
```bash
tail -20 /tmp/build_calymob.log 2>/dev/null
```

Only `EXIT_CODE=0` together with matching `SOURCE_COMMIT`, `SOURCE_TREE`,
`VERSION`, `BUILD`, `AAB_MTIME_EPOCH`, and `AAB_SHA256` lines is success. The
checkout must have been completely clean before the build and remain clean of
nonignored drift afterwards. A Flutter or `tee` failure removes the
release AAB, so a stale artifact cannot pass. The AAB output will be at:
```
/Users/jan/Dev/GitHub/Calypso/CalyMob/build/app/outputs/bundle/release/app-release.aab
```

Verify the build:
```bash
test -s /Users/jan/Dev/GitHub/Calypso/CalyMob/build/app/outputs/bundle/release/app-release.aab
tail -10 /tmp/build_calymob.log
```

## Phase 4: Upload to Google Play Store (Fully Automated via fastlane)

**This is fully automated — no browser needed!**

Fastlane is configured in `CalyMob/android/fastlane/` with:
- `Appfile` - package name + JSON key path
- `Fastfile` - upload lanes (deploy, internal, validate)

The upload lane runs the fail-closed store gate. It requires a clean checkout
and external approval/artifact evidence bound to both the exact Git commit and
its tree; a build log alone never authorizes an upload.
`CALYMOB_RELEASE_MANIFEST` must use schema version 2 and carry both
`sourceCommit` and `sourceTree` on the manifest, approval, reviews, test
evidence, and platform artifact record.

### Option A: Quick upload (single command)

```bash
cd /Users/jan/Dev/GitHub/Calypso/CalyMob/android
/opt/homebrew/bin/fastlane deploy 2>&1
```

This will:
- Upload the AAB to the Production track as a **draft** release
- Skip metadata/screenshots/images (managed in Play Console)
- The draft can then be reviewed and rolled out in Play Console

### Option B: Background script (recommended for reliability)

```bash
cat > /tmp/upload_play_store.sh << 'SCRIPT'
#!/bin/bash
set -euo pipefail

LOG_PATH="/tmp/upload_play_store.log"
cleanup() {
  local status=$?
  set +e
  printf 'EXIT_CODE=%s\n' "$status" >> "$LOG_PATH"
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

export PATH="/opt/homebrew/bin:$PATH"

cd /Users/jan/Dev/GitHub/Calypso/CalyMob/android

echo "=== Uploading AAB to Google Play Store ==="
set +e
fastlane deploy 2>&1 | tee "$LOG_PATH"
pipeline_status=("${PIPESTATUS[@]}")
set -e
fastlane_status="${pipeline_status[0]:-1}"
tee_status="${pipeline_status[1]:-1}"
printf 'FASTLANE_EXIT_CODE=%s\nTEE_EXIT_CODE=%s\n' "$fastlane_status" "$tee_status" >> "$LOG_PATH"
if [ "$fastlane_status" -ne 0 ]; then
  exit "$fastlane_status"
fi
if [ "$tee_status" -ne 0 ]; then
  exit "$tee_status"
fi
echo "=== Done ==="
SCRIPT
chmod +x /tmp/upload_play_store.sh
```

Launch via AppleScript:
```applescript
tell application "Terminal"
    do script "/tmp/upload_play_store.sh"
    activate
end tell
```

Monitor:
```bash
tail -20 /tmp/upload_play_store.log 2>/dev/null
```

Require `FASTLANE_EXIT_CODE=0`, `TEE_EXIT_CODE=0`, and final `EXIT_CODE=0`;
a success-looking Fastlane line alone is not sufficient.

### Option C: Upload with release notes

To include release notes (French), create the changelog file before uploading:

```bash
# Get the current version code from pubspec.yaml
VERSION_CODE=$(grep "^version:" /Users/jan/Dev/GitHub/Calypso/CalyMob/pubspec.yaml | sed 's/.*+//')

# Create changelog file (fastlane looks for this automatically)
mkdir -p /Users/jan/Dev/GitHub/Calypso/CalyMob/android/fastlane/metadata/android/fr-FR/changelogs
echo "Améliorations de stabilité et corrections de bugs." > "/Users/jan/Dev/GitHub/Calypso/CalyMob/android/fastlane/metadata/android/fr-FR/changelogs/${VERSION_CODE}.txt"

# Then run deploy
cd /Users/jan/Dev/GitHub/Calypso/CalyMob/android
fastlane deploy
```

### Verifying the upload

After fastlane succeeds, verify in Play Console:
- The new version should appear in Production > Releases as a draft
- Review the release and click "Start rollout to Production" to submit for review

### Fastlane validate (test connection only)

To test the service account connection without uploading:
```bash
cd /Users/jan/Dev/GitHub/Calypso/CalyMob/android
/opt/homebrew/bin/fastlane validate
```

## Phase 5: Submit for Google Play Review (Browser automation)

After fastlane uploads the AAB as a draft, submit it for review via Chrome browser automation.

### Play Console gegevens
- Developer ID: `4868133097597517725`
- App ID: `4975215339505656603`
- Production URL: `https://play.google.com/console/u/0/developers/4868133097597517725/app/4975215339505656603/tracks/production`
- Managed publishing: **Uit** (auto-publish na goedkeuring)

### Step 1: Find Play Console tab

```
mcp__Claude_in_Chrome__tabs_context_mcp → look for "play.google.com/console" tab
```

If not open, navigate to the Production URL above.

### Step 2: Go to Production → Releases tab

Look for the **Draft** release created by fastlane. Click **"Edit release"**.

### Step 3: Complete the release wizard

**Page 1 — Create release:**
- Verify app bundle is uploaded (version visible in table)
- Verify release name is filled in
- Verify release notes are present (in `<fr-FR>...</fr-FR>` tags)
- Click **"Next"** button

**Page 2 — Preview and confirm:**
- Review delivery info (size, download time)
- Click **"Save"** button

### Step 4: Send for review

After Save, the **Publishing overview** page loads showing:
"Changes not yet sent for review"

Click the blue **"Send 1 change for review"** button.

Status changes to **"Changes in review"** — Google runs quick checks (~15 min),
then auto-publishes since managed publishing is off.

## Android Important Notes

- **App signing**: Google Play manages signing automatically ("Releases signed by Google Play")
- **Deobfuscation warning**: A warning about missing deobfuscation file is normal for Flutter apps
- **Review time**: Google typically reviews within hours to a few days
- **Build number**: Must be unique and higher than any previously uploaded version. The bump script handles this automatically.
- **Release status**: Fastlane creates a `draft` release by default. You can change `release_status` in the Fastfile to `'completed'` to auto-submit for review (not recommended without manual check).

## Android Troubleshooting

### NDK Issues
If build fails with "NDK did not have a source.properties file":
```bash
rm -rf ~/Library/Android/sdk/ndk/27.0.12077973
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
sdkmanager "ndk;27.0.12077973"
```

### Missing Build Tools
If build fails with "Failed to install SDK components":
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
sdkmanager "build-tools;35.0.0" "build-tools;36.0.0"
```

### Gradle Network Errors
Gradle downloads may fail on first attempt. Simply retry the build - Gradle will resume from where it left off.

### Java Not Found
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```
This uses the JDK bundled with Android Studio. Do NOT try to install a separate JDK.

### Fastlane Authentication Error
If fastlane fails with "Google Api Error: forbidden":
1. Verify service account exists: Check Google Cloud Console > IAM > Service Accounts
2. Verify Play Console access: Check Play Console > Users and permissions
3. Verify the JSON key without printing it:
   `node -e 'JSON.parse(require("fs").readFileSync(process.env.HOME + "/.private_keys/google-play-deploy.json", "utf8")); console.log("key file is readable JSON")'`
4. Re-validate: `cd android && fastlane validate`

### Fastlane Version Code Conflict
If fastlane says "Version code already exists":
- The build number (version code) must be higher than any previous upload
- Run `./scripts/bump_version.sh patch` to increment
- Rebuild the AAB

---

# iOS: Full Automated Deploy

## iOS Phase 1: Environment Check

```bash
# Verify Xcode
xcodebuild -version

# Verify Flutter sees iOS
flutter doctor -v 2>&1 | grep -A 5 "Xcode"

# Verify signing identity
security find-identity -v -p codesigning 2>&1 | head -10

# Verify CocoaPods
pod --version
```

## iOS Phase 2: Version Bump

Same as Android - use the shared bump script (see Phase 2 above). Both platforms share the same version from `pubspec.yaml`.

## iOS Phase 3: Build IPA

The iOS build takes several minutes. Use a background script approach to avoid timeouts:

```bash
# Create build script
cat > /tmp/build_ios.sh << 'SCRIPT'
#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/Users/jan/Dev/GitHub/Calypso/CalyMob"
LOG_PATH="/tmp/build_ios.log"
IPA_PATH="$PROJECT_ROOT/build/ios/ipa/calymob.ipa"
APP_INFO_PLIST="$PROJECT_ROOT/build/ios/archive/Runner.xcarchive/Products/Applications/Runner.app/Info.plist"
BUILD_START_MARKER=""

cleanup() {
  local status=$?
  set +e
  if [ "$status" -ne 0 ]; then
    rm -f -- "$IPA_PATH"
  fi
  if [ -n "$BUILD_START_MARKER" ]; then
    rm -f -- "$BUILD_START_MARKER"
  fi
  printf 'EXIT_CODE=%s\n' "$status" >> "$LOG_PATH"
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

require_clean_checkout() {
  local checkout_status
  if ! checkout_status=$(git status --porcelain=v1 --untracked-files=all); then
    echo "Unable to verify Git checkout cleanliness." >&2
    return 1
  fi
  if [ -n "$checkout_status" ]; then
    echo "Release build requires a completely clean Git checkout." >&2
    exit 1
  fi
}

require_source_unchanged() {
  local phase="$1"
  local current_commit current_tree checkout_status
  if ! current_commit=$(git rev-parse --verify HEAD) \
    || ! current_tree=$(git rev-parse --verify 'HEAD^{tree}'); then
    echo "Unable to verify Git source during $phase." >&2
    return 1
  fi
  if [ "$current_commit" != "$SOURCE_COMMIT" ] || [ "$current_tree" != "$SOURCE_TREE" ]; then
    echo "Git HEAD/tree changed during $phase." >&2
    return 1
  fi
  if ! checkout_status=$(git status --porcelain=v1 --untracked-files=all); then
    echo "Unable to verify Git checkout during $phase." >&2
    return 1
  fi
  if [ -n "$checkout_status" ]; then
    echo "Git checkout changed during $phase." >&2
    return 1
  fi
}

export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="/Users/jan/flutter/bin:$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

cd "$PROJECT_ROOT"
require_clean_checkout
SOURCE_COMMIT=$(git rev-parse --verify HEAD)
SOURCE_TREE=$(git rev-parse --verify 'HEAD^{tree}')
VERSION_LINE=$(awk '$1 == "version:" { print $2; exit }' pubspec.yaml)
if [[ ! "$VERSION_LINE" =~ ^([0-9]+\.[0-9]+\.[0-9]+)\+([0-9]+)$ ]]; then
  echo "Invalid pubspec version: $VERSION_LINE" >&2
  exit 1
fi
EXPECTED_VERSION="${BASH_REMATCH[1]}"
EXPECTED_BUILD="${BASH_REMATCH[2]}"

echo "=== Flutter Clean ==="
flutter clean 2>&1

echo "=== Flutter Pub Get ==="
flutter pub get 2>&1

echo "=== Pod Install ==="
cd ios && pod install --repo-update 2>&1
cd ..
require_source_unchanged "dependency setup"

echo "=== Flutter Build IPA ==="
rm -f -- "$IPA_PATH"
BUILD_START_MARKER=$(mktemp "${TMPDIR:-/tmp}/calymob-ipa-build.XXXXXX")
set +e
flutter build ipa --release 2>&1 | tee "$LOG_PATH"
pipeline_status=("${PIPESTATUS[@]}")
set -e
flutter_status="${pipeline_status[0]:-1}"
tee_status="${pipeline_status[1]:-1}"
printf 'FLUTTER_EXIT_CODE=%s\nTEE_EXIT_CODE=%s\n' "$flutter_status" "$tee_status" >> "$LOG_PATH"
if [ "$flutter_status" -ne 0 ]; then
  exit "$flutter_status"
fi
if [ "$tee_status" -ne 0 ]; then
  exit "$tee_status"
fi

if [ ! -s "$IPA_PATH" ] || [ "$IPA_PATH" -ot "$BUILD_START_MARKER" ]; then
  echo "Build did not create a fresh non-empty IPA." >&2
  exit 1
fi
if [ ! -s "$APP_INFO_PLIST" ] || [ "$APP_INFO_PLIST" -ot "$BUILD_START_MARKER" ]; then
  echo "Build did not create a fresh app Info.plist." >&2
  exit 1
fi
ARTIFACT_VERSION=$(plutil -extract CFBundleShortVersionString raw -o - "$APP_INFO_PLIST")
ARTIFACT_BUILD=$(plutil -extract CFBundleVersion raw -o - "$APP_INFO_PLIST")
if [ "$ARTIFACT_VERSION" != "$EXPECTED_VERSION" ] || [ "$ARTIFACT_BUILD" != "$EXPECTED_BUILD" ]; then
  echo "IPA version/build does not match pubspec.yaml." >&2
  exit 1
fi
if [ "$(awk '$1 == "version:" { print $2; exit }' pubspec.yaml)" != "$VERSION_LINE" ]; then
  echo "pubspec version changed during the build." >&2
  exit 1
fi
require_source_unchanged "the release build"
IPA_SHA256=$(shasum -a 256 "$IPA_PATH" | awk '{print $1}')
if [[ ! "$IPA_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Could not calculate the IPA SHA-256." >&2
  exit 1
fi
IPA_MTIME=$(stat -f '%m' "$IPA_PATH")
printf 'SOURCE_COMMIT=%s\nSOURCE_TREE=%s\nVERSION=%s\nBUILD=%s\nIPA_MTIME_EPOCH=%s\nIPA_SHA256=%s\n' \
  "$SOURCE_COMMIT" "$SOURCE_TREE" "$EXPECTED_VERSION" "$EXPECTED_BUILD" "$IPA_MTIME" "$IPA_SHA256" >> "$LOG_PATH"
SCRIPT
chmod +x /tmp/build_ios.sh
```

Launch via AppleScript to run in Terminal:
```applescript
tell application "Terminal"
    do script "/tmp/build_ios.sh"
    activate
end tell
```

Monitor progress:
```bash
tail -20 /tmp/build_ios.log 2>/dev/null
```

Only final `EXIT_CODE=0` with matching clean `SOURCE_COMMIT`/`SOURCE_TREE`,
version/build, fresh mtime and SHA-256 evidence is success. Output files:
- **Archive**: `build/ios/archive/Runner.xcarchive` (~556MB)
- **IPA**: `build/ios/ipa/calymob.ipa` (~62-67MB)

Verify the build:
```bash
test -s /Users/jan/Dev/GitHub/Calypso/CalyMob/build/ios/ipa/calymob.ipa
tail -10 /tmp/build_ios.log
```

## iOS Phase 4: Upload to App Store Connect (Fully Automated)

Upload uses `xcrun altool` with the App Store Connect API key. **This is fully automated — no browser needed.**

### Step 1: Verify API Key Setup

```bash
# Check the .p8 key file exists
ls -la ~/.private_keys/AuthKey_ZK62KYKA4T.p8

# If missing, restore only the verified CalyMob key from the approved secret backup.
```

### Step 2: Validate + Upload (combined script, recommended)

```bash
cat > /tmp/upload_ios.sh << 'SCRIPT'
#!/bin/bash
set -euo pipefail

IPA_PATH="/Users/jan/Dev/GitHub/Calypso/CalyMob/build/ios/ipa/calymob.ipa"
KEY_ID="ZK62KYKA4T"
ISSUER_ID="280e011a-f492-43fb-b0eb-727ddaa8c6c9"
LOG_PATH="/tmp/upload_ios.log"

cleanup() {
  local status=$?
  set +e
  printf 'EXIT_CODE=%s\n' "$status" >> "$LOG_PATH"
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

if [ ! -s "$IPA_PATH" ]; then
  echo "Missing or empty IPA: $IPA_PATH" >&2
  exit 1
fi

run_logged() {
  local mode="$1"
  shift
  local pipeline_status
  set +e
  if [ "$mode" = "append" ]; then
    "$@" 2>&1 | tee -a "$LOG_PATH"
    pipeline_status=("${PIPESTATUS[@]}")
  else
    "$@" 2>&1 | tee "$LOG_PATH"
    pipeline_status=("${PIPESTATUS[@]}")
  fi
  set -e
  if [ "${pipeline_status[0]:-1}" -ne 0 ]; then
    return "${pipeline_status[0]:-1}"
  fi
  if [ "${pipeline_status[1]:-1}" -ne 0 ]; then
    return "${pipeline_status[1]:-1}"
  fi
}

echo "=== Validating IPA ==="
run_logged overwrite xcrun altool --validate-app -f "$IPA_PATH" --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"

echo "=== Uploading IPA ==="
run_logged append xcrun altool --upload-app -f "$IPA_PATH" --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"

echo "=== Done ==="
SCRIPT
chmod +x /tmp/upload_ios.sh
```

Launch via AppleScript:
```applescript
tell application "Terminal"
    do script "/tmp/upload_ios.sh"
    activate
end tell
```

Monitor:
```bash
tail -20 /tmp/upload_ios.log 2>/dev/null
```

Require both "UPLOAD SUCCEEDED with no errors" and final `EXIT_CODE=0`. Upload
takes ~20-30 seconds for ~65MB.

**Important**: After upload, Apple needs 5-30 minutes to process the build before it appears in App Store Connect.

## iOS Phase 5: Submit for Apple Review (Browser automation)

This is the only step that requires browser automation (Chrome). Everything else is CLI.

### Step 1: Navigate to App Store Connect

- URL: `https://appstoreconnect.apple.com/apps/6755293289/distribution/ios/version/inflight`
- App: CalyMob (App ID: `6755293289`)
- Bundle ID: `be.calypsodc.calymob`

### Step 2: Create New Version (if needed)

If the version doesn't exist yet:
- Click the "+" button next to iOS App in the sidebar
- Enter the version number (e.g., "1.0.25")
- Click "Create"

### Step 3: Fill Version Details

- **What's New**: Add French release notes (e.g., "Améliorations de stabilité et corrections de bugs.")
- **Release mode**: "Manually release this version" (default)

### Step 4: Add Build

- Scroll to "Build" section
- Click "Add Build" (blue button)
- Wait for the build to appear (may take 5-30 minutes after upload)
- Select the build number (e.g., 87) and click "Done"
- Click "Save"

### Step 5: Submit for Review

- Click "Add for Review" (top-right blue button)
- A "Draft Submissions" panel appears — click "Submit to App Review"
- Wait for confirmation: "1 Item Submitted"

### App Review Information (pre-filled)

These are already saved in App Store Connect:
- **Sign-in required**: Yes
- **Username**: demo.reviewer@calypsodc.be
- **Password**: use the existing saved App Store Connect review credential;
  never copy it into Git, logs, skills, or chat
- **Contact**: Jan Andriessens, +32476441837, jan@h2m.ai

## iOS Important Notes

- **Code signing**: Xcode handles signing automatically with the development certificate
- **Processing time**: Apple processes builds in 5-30 minutes after upload
- **Review time**: Apple typically reviews within 24-48 hours
- **Build number**: Must be unique and higher than any previously uploaded. The bump script handles this.
- **App Store Connect Chrome issue**: Screenshots and some click actions may fail with "Cannot access chrome-extension:// URL" error. Use `read_page`, `find`, `scroll_to`, and coordinate-based clicks as workarounds.

## iOS Troubleshooting

### CocoaPods Issues
If `pod install` fails:
```bash
cd /Users/jan/Dev/GitHub/Calypso/CalyMob/ios
pod repo update
pod install --repo-update
```

### Signing Issues
If build fails with signing errors:
```bash
# List available signing identities
security find-identity -v -p codesigning

# Check Xcode settings
open /Users/jan/Dev/GitHub/Calypso/CalyMob/ios/Runner.xcworkspace
```

### Missing .p8 Key
If `xcrun altool` fails with authentication error:
```bash
# Ensure the verified CalyMob key is present; never copy a key from another product.
ls -la ~/.private_keys/AuthKey_ZK62KYKA4T.p8
```

### Build Processing Stuck
If the build doesn't appear in App Store Connect after 30+ minutes:
- Check email for processing errors from Apple
- Go to TestFlight tab to see if the build appears there with issues
- Re-upload if necessary

---

# Quick Reference: Full Deploy Both Platforms

For a complete deploy to both stores, run these steps in order:

```bash
# 1. Bump version
cd /Users/jan/Dev/GitHub/Calypso/CalyMob
./scripts/bump_version.sh patch

# 2. Review and commit the bump; verify `git status --porcelain` is empty

# 3. Build Android AAB (in Terminal via AppleScript, wait for completion)
# 4. Upload Android to Play Store
./scripts/run_fastlane.sh android deploy

# 5. Build iOS IPA (in Terminal via AppleScript, wait for completion)
# 6. Upload iOS to App Store Connect
./scripts/run_fastlane.sh ios release

# 7. Submit iOS for review (browser automation in App Store Connect)
```

**Android**: Build, upload and review submission are automated via Fastlane.
**iOS**: Build, upload and review submission are automated via Fastlane.
