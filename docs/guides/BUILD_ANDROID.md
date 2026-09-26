# CalyMob Android Build Guide

## Quick Build Command

```bash
flutter clean && flutter pub get && flutter build apk --debug
```

Output: `build/app/outputs/flutter-apk/app-debug.apk`

---

## Current Configuration (Nov 2025)

### Flutter & Dart
- Flutter: 3.35.7
- Dart: 3.9.2

### Android Tooling
| Component | Version | File |
|-----------|---------|------|
| Gradle | 8.11.1 | `android/gradle/wrapper/gradle-wrapper.properties` |
| Android Gradle Plugin | 8.9.1 | `android/settings.gradle` + `android/build.gradle` |
| Kotlin | 2.1.0 | `android/settings.gradle` + `android/build.gradle` |
| compileSdk | 36 | `android/app/build.gradle` |
| targetSdk | 34 | `android/app/build.gradle` |
| minSdk | (flutter default) | `android/app/build.gradle` |

### Firebase Packages
| Package | Version |
|---------|---------|
| firebase_core | ^4.2.1 |
| firebase_auth | ^6.1.2 |
| cloud_firestore | ^6.1.0 |
| firebase_storage | ^13.0.4 |
| firebase_analytics | ^12.0.4 |
| firebase_crashlytics | ^5.0.5 |
| firebase_messaging | ^16.0.4 |

---

## Common Build Issues & Fixes

### 1. Gradle/Java Version Mismatch
**Error**: `Unsupported class file major version 65`

**Cause**: Java 21 requires Gradle 8.4+

**Fix**: Update `android/gradle/wrapper/gradle-wrapper.properties`:
```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.11.1-all.zip
```

### 2. AGP Version Too Low
**Error**: `Android Gradle Plugin version X.X.X is lower than minimum supported`

**Fix**: Update in both files:
- `android/settings.gradle`: `id "com.android.application" version "8.9.1"`
- `android/build.gradle`: `classpath 'com.android.tools.build:gradle:8.9.1'`

### 3. compileSdk Too Low
**Error**: `plugin requires Android SDK version 36 or higher`

**Fix**: In `android/app/build.gradle`:
```gradle
android {
    compileSdk 36
}
```

### 4. intl Version Conflict
**Error**: `intl is pinned to version 0.20.2 by flutter_localizations`

**Fix**: In `pubspec.yaml`:
```yaml
intl: ^0.20.2
```

### 5. Missing pdfrx Package
**Error**: `Couldn't resolve the package 'pdfrx'`

**Fix**: In `pubspec.yaml`:
```yaml
pdfrx: ^1.0.0
```

---

## Release Build

Release signing material must be stored outside the repository. Configure only
absolute paths and the non-secret alias; never put the password itself in an
environment variable, command, log, Gradle property, or tracked file.

The password file must contain one strong password on a single line. Restrict
both it and the keystore to the current user:

```bash
chmod 600 /absolute/private/path/upload.jks \
  /absolute/private/path/upload.password

export CALYMOB_UPLOAD_STORE_FILE='/absolute/private/path/upload.jks'
export CALYMOB_UPLOAD_PASSWORD_FILE='/absolute/private/path/upload.password'
export CALYMOB_UPLOAD_KEY_ALIAS='upload-alias'
```

Then run:

```bash
./scripts/build_release_aab.sh
unset CALYMOB_UPLOAD_STORE_FILE CALYMOB_UPLOAD_PASSWORD_FILE CALYMOB_UPLOAD_KEY_ALIAS
```

The resulting AAB may be uploaded only by
`./scripts/run_fastlane.sh android deploy` after the external schema-v2 release
manifest passes the verifier. Never upload it manually in Play Console.

Release and signing-report tasks fail closed if a variable or file is missing,
relative, inside the repository, unreadable, too broadly accessible, or empty.
Before Gradle configures signing, it also opens the keystore, verifies that the
alias is a private-key entry, checks certificate validity, and compares its
SHA-256 fingerprint with the public certificate pin in `android/app/build.gradle`.
Do not enable Gradle configuration cache for signing tasks. Debug builds and IDE
sync do not need these variables.

To inspect the configured public certificate without printing the password:

```bash
cd android
./gradlew :app:signingReport --no-daemon --no-configuration-cache
```

The exported PEM certificate is public and is used only when registering or
resetting the upload certificate in Google Play; it is not a build input.

---

## Troubleshooting

### Clean Build
```bash
flutter clean
rm -rf ~/.gradle/caches/
flutter pub get
flutter build apk --debug
```

### Check Flutter Doctor
```bash
flutter doctor --verbose
```

### Check Java Version
Java 21 is required for AGP 8.9.1. Android Studio 2025.2 includes OpenJDK 21.
