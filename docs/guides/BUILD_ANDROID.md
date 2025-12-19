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

For release builds, ensure `android/key.properties` exists with:
```properties
storePassword=<password>
keyPassword=<password>
keyAlias=<alias>
storeFile=<path-to-keystore>
```

Then run:
```bash
flutter build apk --release
```

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
