---
name: flutter-build-deploy
description: Build CalyMob Flutter app and deploy to Google Play Store and/or Apple App Store. Use this skill whenever the user asks to build the app, deploy to Play Store or App Store, release a new version, bump the version, or publish CalyMob. Also trigger when the user mentions "build", "release", "deploy", "play store", "app store", "apple", "ios", "android", "aab", "appbundle", "ipa", or "nieuwe versie".
---

# Flutter Build & Deploy (Android + iOS) — Fully Automated

This skill automates the CalyMob Flutter app build and deployment to both Google Play Console (Android) and Apple App Store (iOS). **Both platforms are fully automated via CLI — no browser interaction required for uploads.**

## Overview

### Android Workflow (fully automated)
1. **Environment Check** - Verify Android SDK, Java, Flutter are ready
2. **Version Bump** (optional) - Increment version in pubspec.yaml + sync to Firestore
3. **Build AAB** - Run `flutter build appbundle --release`
4. **Upload to Play Store** - `fastlane supply` uploads AAB via Google Play Developer API
5. **Submit for Review** - Fastlane creates a draft production release automatically

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
- **fastlane** at `/opt/homebrew/bin/fastlane`
- **Google Play service account key** at `~/.private_keys/google-play-deploy.json`
  - Service account: `google-play-deploy@calycompta.iam.gserviceaccount.com`
  - Linked to CalyMob (club.caly.calymob) in Play Console with release permissions

### iOS
- **Xcode** (currently 26.2) with iOS SDK
- **CocoaPods** (`pod` command available)
- **Apple Developer Account** with signing identity
- **App Store Connect API Key** (.p8 file) at `~/.private_keys/AuthKey_BHUKT6FFGF.p8`

### Signing & API Credentials

**Android**:
- Google Play manages app signing ("Releases signed by Google Play")
- Service account: `google-play-deploy@calycompta.iam.gserviceaccount.com`
- JSON key: `~/.private_keys/google-play-deploy.json`

**iOS**:
- Signing Identity: "Apple Development: Jan Andriessens (WZ23889U97)"
- Team ID: 53455KKD9G
- Bundle ID: `be.calypsodc.calymob`
- Deployment Target: iOS 15.5
- App Store Connect API Key:
  - Issuer ID: `280e011a-f492-43fb-b0eb-727ddaa8c6c9`
  - Key ID: `BHUKT6FFGF`
  - P8 file: `~/.private_keys/AuthKey_BHUKT6FFGF.p8`
  - Backup: `/Users/jan/Documents/GitHub/Vet-Genius-Mobile-App/ios/fastlane/keys/AuthKey_BHUKT6FFGF.p8`

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

The project already has a bump script that handles both pubspec.yaml AND Firestore sync:

```bash
cd /Users/jan/Documents/GitHub/Calypso/CalyMob
./scripts/bump_version.sh patch   # or minor, or major
```

This script:
- Reads current version from `pubspec.yaml` (format: `MAJOR.MINOR.PATCH+BUILD`)
- Increments the specified part + always increments build number
- Updates `pubspec.yaml`
- Syncs version to Firestore (for CalyCompta maintenance page)

If the user doesn't want to bump, read the current version:
```bash
grep "^version:" /Users/jan/Documents/GitHub/Calypso/CalyMob/pubspec.yaml
```

## Phase 3: Build AAB

The build takes several minutes. Use a background script approach to avoid timeouts:

```bash
# Create build script
cat > /tmp/build_calymob.sh << 'SCRIPT'
#!/bin/bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
export PATH="/Users/jan/flutter/bin:$PATH"

cd /Users/jan/Documents/GitHub/Calypso/CalyMob
flutter build appbundle --release 2>&1 | tee /tmp/build_calymob.log
echo "EXIT_CODE=$?" >> /tmp/build_calymob.log
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

Wait until you see either "BUILD SUCCESSFUL" or "BUILD FAILED" in the log. The AAB output will be at:
```
/Users/jan/Documents/GitHub/Calypso/CalyMob/build/app/outputs/bundle/release/app-release.aab
```

Verify the build:
```bash
ls -lh /Users/jan/Documents/GitHub/Calypso/CalyMob/build/app/outputs/bundle/release/app-release.aab
```

## Phase 4: Upload to Google Play Store (Fully Automated via fastlane)

**This is fully automated — no browser needed!**

Fastlane is configured in `CalyMob/android/fastlane/` with:
- `Appfile` - package name + JSON key path
- `Fastfile` - upload lanes (deploy, internal, validate)

### Option A: Quick upload (single command)

```bash
cd /Users/jan/Documents/GitHub/Calypso/CalyMob/android
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
export PATH="/opt/homebrew/bin:$PATH"

cd /Users/jan/Documents/GitHub/Calypso/CalyMob/android

echo "=== Uploading AAB to Google Play Store ==="
fastlane deploy 2>&1 | tee /tmp/upload_play_store.log

echo "EXIT_CODE=$?" >> /tmp/upload_play_store.log
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

Wait for "fastlane.tools finished successfully" or check for errors.

### Option C: Upload with release notes

To include release notes (French), create the changelog file before uploading:

```bash
# Get the current version code from pubspec.yaml
VERSION_CODE=$(grep "^version:" /Users/jan/Documents/GitHub/Calypso/CalyMob/pubspec.yaml | sed 's/.*+//')

# Create changelog file (fastlane looks for this automatically)
mkdir -p /Users/jan/Documents/GitHub/Calypso/CalyMob/android/fastlane/metadata/android/fr-FR/changelogs
echo "Améliorations de stabilité et corrections de bugs." > "/Users/jan/Documents/GitHub/Calypso/CalyMob/android/fastlane/metadata/android/fr-FR/changelogs/${VERSION_CODE}.txt"

# Then run deploy
cd /Users/jan/Documents/GitHub/Calypso/CalyMob/android
fastlane deploy
```

### Verifying the upload

After fastlane succeeds, verify in Play Console:
- The new version should appear in Production > Releases as a draft
- Review the release and click "Start rollout to Production" to submit for review

### Fastlane validate (test connection only)

To test the service account connection without uploading:
```bash
cd /Users/jan/Documents/GitHub/Calypso/CalyMob/android
/opt/homebrew/bin/fastlane validate
```

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
3. Verify JSON key: `cat ~/.private_keys/google-play-deploy.json | head -5`
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
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="/Users/jan/flutter/bin:$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

cd /Users/jan/Documents/GitHub/Calypso/CalyMob

echo "=== Flutter Clean ==="
flutter clean 2>&1

echo "=== Flutter Pub Get ==="
flutter pub get 2>&1

echo "=== Pod Install ==="
cd ios && pod install --repo-update 2>&1
cd ..

echo "=== Flutter Build IPA ==="
flutter build ipa --release 2>&1 | tee /tmp/build_ios.log

echo "EXIT_CODE=$?" >> /tmp/build_ios.log
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

Wait until you see "Build Successful" or an error. Output files:
- **Archive**: `build/ios/archive/Runner.xcarchive` (~556MB)
- **IPA**: `build/ios/ipa/calymob.ipa` (~62-67MB)

Verify the build:
```bash
ls -lh /Users/jan/Documents/GitHub/Calypso/CalyMob/build/ios/ipa/calymob.ipa
```

## iOS Phase 4: Upload to App Store Connect (Fully Automated)

Upload uses `xcrun altool` with the App Store Connect API key. **This is fully automated — no browser needed.**

### Step 1: Verify API Key Setup

```bash
# Check the .p8 key file exists
ls -la ~/.private_keys/AuthKey_BHUKT6FFGF.p8

# If missing, copy from backup location
mkdir -p ~/.private_keys
cp /Users/jan/Documents/GitHub/Vet-Genius-Mobile-App/ios/fastlane/keys/AuthKey_BHUKT6FFGF.p8 ~/.private_keys/
```

### Step 2: Validate + Upload (combined script, recommended)

```bash
cat > /tmp/upload_ios.sh << 'SCRIPT'
#!/bin/bash
IPA_PATH="/Users/jan/Documents/GitHub/Calypso/CalyMob/build/ios/ipa/calymob.ipa"
KEY_ID="BHUKT6FFGF"
ISSUER_ID="280e011a-f492-43fb-b0eb-727ddaa8c6c9"

echo "=== Validating IPA ==="
xcrun altool --validate-app -f "$IPA_PATH" --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID" 2>&1 | tee /tmp/upload_ios.log

echo "=== Uploading IPA ==="
xcrun altool --upload-app -f "$IPA_PATH" --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID" 2>&1 | tee -a /tmp/upload_ios.log

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

Wait for "UPLOAD SUCCEEDED with no errors". Upload takes ~20-30 seconds for ~65MB.

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
- **Password**: CalyMob2025!
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
cd /Users/jan/Documents/GitHub/Calypso/CalyMob/ios
pod repo update
pod install --repo-update
```

### Signing Issues
If build fails with signing errors:
```bash
# List available signing identities
security find-identity -v -p codesigning

# Check Xcode settings
open /Users/jan/Documents/GitHub/Calypso/CalyMob/ios/Runner.xcworkspace
```

### Missing .p8 Key
If `xcrun altool` fails with authentication error:
```bash
# Ensure key is in the right place
mkdir -p ~/.private_keys
cp /Users/jan/Documents/GitHub/Vet-Genius-Mobile-App/ios/fastlane/keys/AuthKey_BHUKT6FFGF.p8 ~/.private_keys/
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
cd /Users/jan/Documents/GitHub/Calypso/CalyMob
./scripts/bump_version.sh patch

# 2. Build Android AAB (in Terminal via AppleScript, wait for completion)
# 3. Upload Android to Play Store
cd android && /opt/homebrew/bin/fastlane deploy

# 4. Build iOS IPA (in Terminal via AppleScript, wait for completion)
# 5. Upload iOS to App Store Connect
xcrun altool --upload-app -f build/ios/ipa/calymob.ipa --apiKey BHUKT6FFGF --apiIssuer 280e011a-f492-43fb-b0eb-727ddaa8c6c9

# 6. Submit iOS for review (browser automation in App Store Connect)
```

**Android**: Fully automated end-to-end (build → upload → draft release)
**iOS**: Build + upload automated; only App Store Connect review submission needs browser
