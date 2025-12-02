# CalyMob Cross-Platform Strategy

**Date:** November 25, 2025
**Version:** 1.0.4+6

---

## Current State Analysis

CalyMob is already a **Flutter application**, which means it's inherently cross-platform. This document analyzes the current cross-platform readiness and provides recommendations for ensuring smooth operation on both Android and iOS.

### Framework Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| Framework | Flutter 3.35.7 | Excellent cross-platform support |
| Language | Dart 3.9.2 | Unified codebase |
| UI Framework | Material + Cupertino | Both supported |
| State Management | Provider | Platform-agnostic |
| Backend | Firebase | Native SDKs for both platforms |

**Verdict:** Flutter is the optimal choice for this application. No framework migration needed.

---

## Platform Parity Analysis

### Feature Availability

| Feature | Android | iOS | Notes |
|---------|---------|-----|-------|
| Authentication | Full | Full | Firebase Auth native |
| Expense Management | Full | Full | - |
| Photo Capture | Full | Full | PHPicker on iOS 14+ |
| Push Notifications | Full | Full | FCM → APNs bridge |
| PDF Viewing | Full | Full | pdfrx cross-platform |
| Offline Mode | Full | Full | Firestore persistence |
| Member Directory | Full | Full | - |
| Event Registration | Full | Full | - |
| Deep Linking | Partial | Partial | Not implemented |
| Biometrics | Not impl. | Not impl. | Recommended addition |

### UI/UX Differences

| Component | Android | iOS | Recommendation |
|-----------|---------|-----|----------------|
| Navigation | Material back button | iOS swipe-back | Both supported by Flutter |
| Date Picker | Material | Cupertino | Use adaptive picker |
| Action Sheets | Bottom sheet | iOS action sheet | Consider adaptive |
| Alerts | AlertDialog | CupertinoAlertDialog | Consider adaptive |

---

## Platform-Specific Code Inventory

### Current Platform Checks

```dart
// Found in: lib/screens/expenses/create_expense_screen.dart
import 'package:flutter/foundation.dart' show kIsWeb;

// Web-specific handling
if (_selectedPhotos.isNotEmpty && !kIsWeb) {
  // Show photo preview
}
```

### Platform-Specific Files

| File | Purpose | Platform |
|------|---------|----------|
| `android/app/build.gradle` | Build config | Android |
| `android/app/src/main/AndroidManifest.xml` | Permissions | Android |
| `ios/Podfile` | Dependencies | iOS |
| `ios/Runner/Info.plist` | Permissions | iOS |
| `lib/firebase_options.dart` | Firebase config | Both |

---

## iOS Deployment Readiness

### Current Status: **85% Ready**

### Completed:
- [x] Podfile configured with iOS 15.0 minimum
- [x] Info.plist permissions configured
- [x] Firebase iOS configuration present
- [x] Background modes enabled

### Pending:
- [ ] GoogleService-Info.plist verified in project
- [ ] Code signing configured
- [ ] App Store Connect setup
- [ ] TestFlight testing

### iOS-Specific Fixes Required

**1. Ensure GoogleService-Info.plist is present:**

```bash
# Check file exists
ls -la ios/Runner/GoogleService-Info.plist
```

**2. Add to Xcode project (if not already):**
- Open `ios/Runner.xcworkspace` in Xcode
- Drag GoogleService-Info.plist to Runner folder
- Ensure "Copy items if needed" is checked
- Target membership: Runner

**3. Update AppDelegate.swift for FCM:**

```swift
import UIKit
import Flutter
import FirebaseCore
import FirebaseMessaging

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    FirebaseApp.configure()

    // Push notification setup
    UNUserNotificationCenter.current().delegate = self
    application.registerForRemoteNotifications()

    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Messaging.messaging().apnsToken = deviceToken
  }
}
```

---

## Android Deployment Readiness

### Current Status: **90% Ready**

### Completed:
- [x] Gradle configured correctly
- [x] Firebase Android configuration present
- [x] Multi-dex enabled
- [x] Signing configuration present

### Pending:
- [ ] Update targetSdk to 35
- [ ] Add missing permissions
- [ ] Enable ProGuard/R8
- [ ] Google Play Console setup

### Android-Specific Fixes Required

**1. Update AndroidManifest.xml** (see OPTIMIZATION_PLAN.md)

**2. Create proguard-rules.pro** (see OPTIMIZATION_PLAN.md)

**3. Update targetSdk:**
```gradle
targetSdk 35
```

---

## Adaptive UI Recommendations

### Use Platform-Aware Widgets

**Current (Material only):**
```dart
showDialog(
  context: context,
  builder: (_) => AlertDialog(
    title: Text('Title'),
    content: Text('Message'),
    actions: [
      TextButton(onPressed: () {}, child: Text('Cancel')),
      TextButton(onPressed: () {}, child: Text('OK')),
    ],
  ),
);
```

**Recommended (Adaptive):**
```dart
import 'dart:io' show Platform;

void showAdaptiveDialog(BuildContext context, String title, String message) {
  if (Platform.isIOS) {
    showCupertinoDialog(
      context: context,
      builder: (_) => CupertinoAlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(context),
            child: const Text('Annuler'),
          ),
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  } else {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}
```

### Adaptive Date Picker

```dart
Future<DateTime?> showAdaptiveDatePicker(BuildContext context, DateTime initial) {
  if (Platform.isIOS) {
    return showCupertinoModalPopup<DateTime>(
      context: context,
      builder: (_) => Container(
        height: 300,
        color: Colors.white,
        child: CupertinoDatePicker(
          mode: CupertinoDatePickerMode.date,
          initialDateTime: initial,
          onDateTimeChanged: (date) {
            // Handle date change
          },
        ),
      ),
    );
  } else {
    return showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
  }
}
```

---

## Testing Strategy

### Device Matrix

**Android:**
| Device Type | OS Version | Priority |
|-------------|------------|----------|
| Low-end | Android 8.0 (API 26) | Medium |
| Mid-range | Android 12 (API 31) | High |
| High-end | Android 14 (API 34) | High |
| Latest | Android 15 (API 35) | High |

**iOS:**
| Device Type | OS Version | Priority |
|-------------|------------|----------|
| iPhone SE | iOS 15 | Medium |
| iPhone 13/14 | iOS 17 | High |
| iPhone 15 | iOS 18 | High |
| iPad | iPadOS 17 | Low |

### Test Scenarios

1. **Installation & Launch**
   - Fresh install
   - Update from previous version
   - App launch time

2. **Authentication**
   - Sign in
   - Sign out
   - Password reset
   - Session persistence

3. **Core Features**
   - Create expense with photo
   - View expense list
   - Approve/reject expense
   - Event registration

4. **Platform-Specific**
   - Android: Back button behavior
   - iOS: Swipe-back gesture
   - Both: Orientation changes

5. **Edge Cases**
   - No network connectivity
   - Low memory conditions
   - Background/foreground transitions

---

## CI/CD Recommendations

### GitHub Actions Workflow

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.35.7'
      - run: flutter pub get
      - run: flutter analyze
      - run: flutter test
      - run: flutter build apk --debug

  build-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.35.7'
      - run: flutter pub get
      - run: flutter analyze
      - run: flutter build ios --no-codesign
```

### Codemagic Configuration

```yaml
# codemagic.yaml
workflows:
  android-workflow:
    name: Android Build
    max_build_duration: 60
    environment:
      flutter: 3.35.7
    scripts:
      - flutter pub get
      - flutter build apk --release
    artifacts:
      - build/**/outputs/**/*.apk

  ios-workflow:
    name: iOS Build
    max_build_duration: 60
    environment:
      flutter: 3.35.7
      xcode: latest
      cocoapods: default
    scripts:
      - flutter pub get
      - pod install --project-directory=ios
      - flutter build ipa --export-options-plist=/path/to/ExportOptions.plist
    artifacts:
      - build/ios/ipa/*.ipa
```

---

## Migration Considerations

### NOT Recommended: Native Migration

Converting to native would require:
- Rewriting entire codebase twice (Kotlin + Swift)
- Maintaining two separate codebases
- Higher development and maintenance costs
- Loss of shared business logic

**Estimated effort:** 6-12 months for full feature parity
**Cost multiplier:** 2-3x ongoing maintenance

### NOT Recommended: React Native Migration

While possible, it would require:
- Rewriting all UI components
- New state management setup
- Different Firebase integration
- Learning new ecosystem

**No benefit over current Flutter implementation.**

### Recommended: Stay with Flutter

Flutter advantages for CalyMob:
- Single codebase for both platforms
- Hot reload for rapid development
- Native performance
- Excellent Firebase integration
- Growing ecosystem and community
- Strong typing with Dart

---

## Conclusion

CalyMob is well-positioned for cross-platform deployment with Flutter. The primary focus should be on:

1. **Completing iOS configuration** (minor items)
2. **Updating Android SDK** (compliance)
3. **Adding adaptive UI** (nice-to-have)
4. **Setting up CI/CD** (recommended)

No framework change is needed. The current architecture supports both platforms effectively.

---

## Sources

- [Flutter Platform-Specific Code](https://docs.flutter.dev/platform-integration/platform-channels)
- [Flutter iOS Deployment](https://docs.flutter.dev/deployment/ios)
- [Flutter Android Deployment](https://docs.flutter.dev/deployment/android)
- [Firebase Flutter Setup](https://firebase.google.com/docs/flutter/setup)
- [Codemagic Documentation](https://docs.codemagic.io/)
