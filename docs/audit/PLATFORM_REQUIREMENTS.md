# CalyMob Platform Requirements

**Date:** November 25, 2025
**Version:** 1.0.4+6

---

## Android Requirements

### SDK Configuration

| Setting | Current | Required | Notes |
|---------|---------|----------|-------|
| compileSdk | 36 | 36 | OK |
| targetSdk | 34 | **35** | Must update by Aug 31, 2025 |
| minSdk | flutter.minSdkVersion | 21+ | OK (Flutter default) |
| Gradle | 8.11.1 | 8.8+ | OK |
| AGP | 8.9.1 | 8.7+ | OK |
| Kotlin | 2.1.0 | 2.0+ | OK |
| Java | 11 | 11+ | OK |

### Required AndroidManifest.xml Permissions

```xml
<!-- Network -->
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>

<!-- Camera (for expense receipts & profile photos) -->
<uses-permission android:name="android.permission.CAMERA"/>

<!-- Storage - Android 13+ (API 33+) -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO"/>

<!-- Storage - Android 12 and below -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32"/>
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
    android:maxSdkVersion="28"/>

<!-- Push Notifications (optional but recommended) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.VIBRATE"/>

<!-- Biometric (future enhancement) -->
<uses-permission android:name="android.permission.USE_BIOMETRIC"/>
```

### Required Features

```xml
<!-- Camera is optional - don't require it -->
<uses-feature android:name="android.hardware.camera" android:required="false"/>
<uses-feature android:name="android.hardware.camera.autofocus" android:required="false"/>
```

### Firebase Configuration

**File:** `android/app/google-services.json`

Must contain:
- `project_id`: "calycompta"
- `package_name`: "be.calypsodc.calymob"
- Correct API keys

### ProGuard/R8 Rules

Create `android/app/proguard-rules.pro`:

```proguard
# Firebase
-keepattributes Signature
-keepattributes *Annotation*
-keepclassmembers class * {
    @com.google.firebase.database.PropertyName *;
}

# Firestore
-keep class com.google.firebase.firestore.** { *; }

# Flutter
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.**  { *; }
-keep class io.flutter.plugins.**  { *; }

# Crashlytics
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception
```

Update `android/app/build.gradle`:

```gradle
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

### Google Play Store Requirements

1. **Target API Level 35** by August 31, 2025
2. **Privacy Policy URL** (already implemented)
3. **App Content Declaration**
4. **Data Safety Section**
   - Data collected: Email, name, photos
   - Data shared: None with third parties
   - Data encrypted: Yes (Firebase TLS)
   - Data deletion: On user request

### Signing Configuration

**File:** `android/key.properties` (not in git)

```properties
storePassword=<your-keystore-password>
keyPassword=<your-key-password>
keyAlias=<your-key-alias>
storeFile=<path-to-keystore.jks>
```

---

## iOS Requirements

### SDK Configuration

| Setting | Current | Required | Notes |
|---------|---------|----------|-------|
| Minimum iOS | 15.0 | 15.0 | OK (Firebase 12.x requires 15.0) |
| Xcode | - | 16+ | Required for App Store (April 2025) |
| Swift | 5.0 | 5.0+ | OK |
| CocoaPods | 1.16+ | 1.14+ | OK |

### Required Info.plist Entries

```xml
<!-- Camera Permission -->
<key>NSCameraUsageDescription</key>
<string>CalyMob needs camera access to take photos of expense receipts and profile pictures.</string>

<!-- Photo Library Permission -->
<key>NSPhotoLibraryUsageDescription</key>
<string>CalyMob needs photo library access to select receipt images and profile pictures.</string>

<!-- Microphone (if recording video) -->
<key>NSMicrophoneUsageDescription</key>
<string>CalyMob needs microphone access when recording videos.</string>

<!-- Background Modes -->
<key>UIBackgroundModes</key>
<array>
    <string>fetch</string>
    <string>remote-notification</string>
</array>

<!-- Firebase Proxy -->
<key>FirebaseAppDelegateProxyEnabled</key>
<false/>

<!-- Face ID (future enhancement) -->
<key>NSFaceIDUsageDescription</key>
<string>CalyMob uses Face ID for secure authentication.</string>
```

### Firebase Configuration

**File:** `ios/Runner/GoogleService-Info.plist`

Must contain:
- `PROJECT_ID`: "calycompta"
- `BUNDLE_ID`: "be.calypsodc.calymob"
- Correct API keys

### Podfile Configuration

```ruby
# ios/Podfile
platform :ios, '15.0'

# CocoaPods analytics
ENV['COCOAPODS_DISABLE_STATS'] = 'true'

project 'Runner', {
  'Debug' => :debug,
  'Profile' => :release,
  'Release' => :release,
}

def flutter_root
  generated_xcode_build_settings_path = File.expand_path(File.join('..', 'Flutter', 'Generated.xcconfig'), __FILE__)
  unless File.exist?(generated_xcode_build_settings_path)
    raise "#{generated_xcode_build_settings_path} must exist. Run flutter pub get first."
  end
  File.foreach(generated_xcode_build_settings_path) do |line|
    matches = line.match(/FLUTTER_ROOT\=(.*)/)
    return matches[1].strip if matches
  end
  raise "FLUTTER_ROOT not found"
end

require File.expand_path(File.join('packages', 'flutter_tools', 'bin', 'podhelper'), flutter_root)

flutter_ios_podfile_setup

target 'Runner' do
  use_frameworks!
  use_modular_headers!

  flutter_install_all_ios_pods File.dirname(File.realpath(__FILE__))
end

post_install do |installer|
  installer.pods_project.targets.each do |target|
    flutter_additional_ios_build_settings(target)

    # Ensure minimum iOS 15.0 for all pods
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
    end
  end
end
```

### App Store Connect Requirements

1. **Xcode 16** build required from April 24, 2025
2. **Privacy Manifest** (privacy-manifest.xcprivacy)
3. **App Privacy Details** declaration
4. **Export Compliance** (encryption declaration)
5. **Age Rating**
6. **App Review Guidelines** compliance

### Code Signing

| Certificate Type | Usage |
|-----------------|-------|
| Development | Debug builds |
| Distribution (App Store) | App Store release |
| Distribution (Ad Hoc) | TestFlight/Internal testing |

### Capabilities (Xcode)

Enable in Signing & Capabilities:
- Push Notifications
- Background Modes (Remote notifications, Background fetch)
- Associated Domains (if using deep links)

---

## Cross-Platform Configuration Checklist

### Before Building

- [ ] Firebase projects configured for both platforms
- [ ] GoogleService-Info.plist in ios/Runner/
- [ ] google-services.json in android/app/
- [ ] All permissions declared
- [ ] Signing certificates configured
- [ ] App icons for all sizes

### Build Commands

**Debug APK (Android):**
```bash
flutter build apk --debug
```

**Release APK (Android):**
```bash
flutter build apk --release
```

**App Bundle (Android - recommended):**
```bash
flutter build appbundle --release
```

**Debug iOS (Simulator):**
```bash
flutter build ios --debug --simulator
```

**Release iOS:**
```bash
flutter build ios --release
```

**IPA for App Store:**
```bash
flutter build ipa --release --export-options-plist=ExportOptions.plist
```

---

## Environment Configuration Template

### .env.example (create at project root)

```env
# Firebase (optional - use for web, keys in native configs for mobile)
FIREBASE_API_KEY=
FIREBASE_PROJECT_ID=calycompta

# App Configuration
DEFAULT_CLUB_ID=calypso
ENABLE_ANALYTICS=true
ENABLE_CRASHLYTICS=true

# Feature Flags
ENABLE_PAYMENTS=false
ENABLE_CHAT=true
```

### Using Environment Variables

```dart
// Install flutter_dotenv
// In main.dart:
import 'package:flutter_dotenv/flutter_dotenv.dart';

Future<void> main() async {
  await dotenv.load(fileName: ".env");
  // ...
}

// Usage:
final clubId = dotenv.env['DEFAULT_CLUB_ID'] ?? 'calypso';
```

---

## Version Compatibility Matrix

| Flutter Version | Android SDK | iOS SDK | Firebase BoM |
|----------------|-------------|---------|--------------|
| 3.35.x | 36 | 15.0+ | 3.8.x+ |
| 3.32.x | 35 | 14.0+ | 3.6.x+ |
| 3.24.x | 34 | 13.0+ | 3.3.x+ |

### Current Configuration Compatibility

| Component | Version | Compatible |
|-----------|---------|------------|
| Flutter | 3.35.7 | Yes |
| Dart | 3.9.2 | Yes |
| Firebase BoM | 3.8.x | Yes |
| Android compileSdk | 36 | Yes |
| iOS deployment | 15.0 | Yes |

---

## Testing Matrix

### Android Devices to Test

| Category | Android Version | API Level |
|----------|-----------------|-----------|
| Minimum | Android 5.0 | 21 |
| Target | Android 14 | 34 |
| Latest | Android 15 | 35 |

### iOS Devices to Test

| Category | iOS Version |
|----------|-------------|
| Minimum | iOS 15.0 |
| Current | iOS 17.x |
| Latest | iOS 18.x |

---

## Sources

- [Google Play Target API Requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Apple App Store Requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Flutter iOS Deployment](https://docs.flutter.dev/deployment/ios)
- [Flutter Android Deployment](https://docs.flutter.dev/deployment/android)
- [Firebase Flutter Setup](https://firebase.google.com/docs/flutter/setup)
- [image_picker Permissions](https://pub.dev/packages/image_picker)
