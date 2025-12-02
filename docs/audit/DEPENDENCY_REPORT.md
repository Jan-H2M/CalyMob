# CalyMob Dependency Report

**Date:** November 25, 2025
**Version:** 1.0.4+6

---

## Dependency Overview

### Direct Dependencies

| Package | Current | Latest | Status | Update Priority |
|---------|---------|--------|--------|-----------------|
| firebase_core | ^4.2.1 | 4.2.1 | Up to date | - |
| firebase_auth | ^6.1.2 | 6.1.2 | Up to date | - |
| cloud_firestore | ^6.1.0 | 6.1.0 | Up to date | - |
| firebase_storage | ^13.0.4 | 13.0.4 | Up to date | - |
| firebase_analytics | ^12.0.4 | 12.0.4 | Up to date | - |
| firebase_crashlytics | ^5.0.5 | 5.0.5 | Up to date | - |
| firebase_messaging | ^16.0.4 | 16.0.4 | Up to date | - |
| provider | ^6.1.2 | 6.1.2 | Up to date | - |
| cupertino_icons | ^1.0.6 | 1.0.8 | Minor update | Low |
| intl | ^0.20.2 | 0.20.2 | Up to date | - |
| url_launcher | ^6.1.14 | 6.3.1 | Minor update | Low |
| shared_preferences | ^2.2.2 | 2.3.3 | Minor update | Low |
| path_provider | ^2.1.1 | 2.1.5 | Patch update | Low |
| image_picker | ^1.0.4 | 1.1.2 | Minor update | Medium |
| pdfrx | ^1.0.0 | 2.2.16 | Major update | Low |

### Dev Dependencies

| Package | Current | Latest | Status |
|---------|---------|--------|--------|
| flutter_test | sdk | sdk | - |
| flutter_lints | ^2.0.3 | 6.0.0 | Major update available |

---

## Missing Dependencies (Critical)

### 1. cached_network_image

**Required by:** ProfileScreen, WhoIsWhoScreen

**Import found:** `import 'package:cached_network_image/cached_network_image.dart';`

**Fix:**
```yaml
# Add to pubspec.yaml
cached_network_image: ^3.3.1
```

**Package Details:**
- Purpose: Cache and display network images with placeholders
- Latest version: 3.3.1
- Platform support: Android, iOS, Web (limited caching on web)
- License: MIT
- Pub.dev: https://pub.dev/packages/cached_network_image

**Known Issues:**
- Web platform has minimal caching support
- Flutter 3.27+ may have issues with HTML renderer on web

---

## Detailed Dependency Analysis

### Firebase Packages

All Firebase packages are using the latest versions compatible with Firebase BoM 3.8.x:

| Package | Min Dart | Min Flutter | Android SDK | iOS SDK |
|---------|----------|-------------|-------------|---------|
| firebase_core | >=3.2.0 | >=3.3.0 | 34.4.0 | 12.4.0 |
| firebase_auth | >=3.2.0 | >=3.3.0 | 23.3.0 | 11.3.0 |
| cloud_firestore | >=3.2.0 | >=3.3.0 | 25.5.0 | 11.3.0 |
| firebase_storage | >=3.2.0 | >=3.3.0 | 21.0.1 | 11.3.0 |
| firebase_analytics | >=3.2.0 | >=3.3.0 | 22.2.0 | 11.3.0 |
| firebase_crashlytics | >=3.2.0 | >=3.3.0 | 19.3.0 | 11.3.0 |
| firebase_messaging | >=3.2.0 | >=3.3.0 | 24.1.0 | 11.3.0 |

**Breaking Changes Notice:**
- Firebase iOS SDK 12.0.0 and Android SDK 34.0.0 introduced breaking changes
- Current versions are post-breaking-change

### State Management

**provider ^6.1.2**
- Latest and stable
- Recommended by Flutter team for simple state management
- Good DevTools integration
- Well-maintained

**Alternatives to Consider:**
| Package | Pros | Cons | Migration Effort |
|---------|------|------|------------------|
| Riverpod | Compile-time safety, better testing | Learning curve | Medium |
| Bloc | Separation of concerns, scalable | More boilerplate | High |
| GetX | Simple, includes routing | Less structured | Low |

**Recommendation:** Keep Provider for current scope; consider Riverpod for future refactoring.

### Image Handling

**image_picker ^1.0.4 → 1.1.2**

Changes in newer versions:
- Bug fixes for iOS PHPicker
- Better Android 14 support
- Improved error handling

**Update recommended:** Medium priority

```yaml
image_picker: ^1.1.2
```

### PDF Handling

**pdfrx ^1.0.0 → 2.2.16**

Major version jump includes:
- Significant API changes
- Performance improvements
- Better memory management

**Update recommended:** Low priority (current works, but test thoroughly if updating)

---

## Transitive Dependencies

Key transitive dependencies pulled in by direct dependencies:

| Package | Pulled by | Version | Notes |
|---------|-----------|---------|-------|
| http | Multiple | 0.13.x | May conflict with newer projects |
| collection | Flutter SDK | 1.18.x | Core utilities |
| async | Flutter SDK | 2.11.x | Async utilities |
| meta | Flutter SDK | 1.12.x | Annotations |
| path | path_provider | 1.9.x | Path manipulation |

### Potential Conflicts

**http package:**
- cached_network_image depends on flutter_cache_manager which depends on http ^0.13.0
- Some newer packages require http ^1.0.0
- **Workaround:** Use dependency_overrides if needed

---

## Security Vulnerabilities

### Scan Results

| Package | Vulnerability | Severity | Status |
|---------|--------------|----------|--------|
| All Firebase | None known | - | OK |
| provider | None known | - | OK |
| image_picker | None known | - | OK |
| url_launcher | None known | - | OK |

**Security Recommendations:**
1. Enable Dependabot in GitHub for automated alerts
2. Regularly run `flutter pub outdated`
3. Subscribe to security advisories for critical packages

---

## License Compliance

| Package | License | Commercial Use | Modification | Distribution |
|---------|---------|----------------|--------------|--------------|
| firebase_* | Apache 2.0 / BSD | Yes | Yes | Yes |
| provider | MIT | Yes | Yes | Yes |
| cupertino_icons | MIT | Yes | Yes | Yes |
| intl | BSD-3 | Yes | Yes | Yes |
| url_launcher | BSD-3 | Yes | Yes | Yes |
| shared_preferences | BSD-3 | Yes | Yes | Yes |
| path_provider | BSD-3 | Yes | Yes | Yes |
| image_picker | Apache 2.0 | Yes | Yes | Yes |
| pdfrx | MIT | Yes | Yes | Yes |
| cached_network_image | MIT | Yes | Yes | Yes |

**Compliance Status:** All licenses are permissive and suitable for commercial use.

---

## Recommended Updates

### Immediate (Before Release)

```yaml
dependencies:
  # ADD MISSING
  cached_network_image: ^3.3.1
```

### Short-term (Within 1 Month)

```yaml
dependencies:
  image_picker: ^1.1.2
  url_launcher: ^6.3.1
  path_provider: ^2.1.5
  shared_preferences: ^2.3.3
  cupertino_icons: ^1.0.8

dev_dependencies:
  flutter_lints: ^5.0.0  # Or ^6.0.0 if ready for breaking changes
```

### Optional Additions

```yaml
dependencies:
  # Improved logging
  logger: ^2.4.0

  # Network connectivity
  connectivity_plus: ^6.0.5

  # Secure storage
  flutter_secure_storage: ^9.2.2

  # Environment configuration
  flutter_dotenv: ^5.1.0

  # Local notifications
  flutter_local_notifications: ^17.2.3
```

---

## Dependency Resolution Command

Run to check for updates:

```bash
flutter pub outdated
```

Run to upgrade to latest compatible versions:

```bash
flutter pub upgrade
```

Run to see dependency tree:

```bash
flutter pub deps
```

---

## Package Maintenance Status

| Package | Last Update | Maintainer | Activity |
|---------|-------------|------------|----------|
| firebase_* | Nov 2025 | Google | Very Active |
| provider | Oct 2025 | Remi Rousselet | Active |
| image_picker | Nov 2025 | Flutter Team | Very Active |
| cached_network_image | Oct 2025 | Baseflow | Active |
| pdfrx | Nov 2025 | espresso3389 | Active |
| url_launcher | Nov 2025 | Flutter Team | Very Active |

All critical packages are actively maintained.

---

## Sources

- [pub.dev](https://pub.dev)
- [Firebase Flutter SDK Release Notes](https://firebase.google.com/support/release-notes/flutter)
- [FlutterFire Versions](https://github.com/firebase/flutterfire/blob/main/VERSIONS.md)
- [cached_network_image](https://pub.dev/packages/cached_network_image)
- [image_picker](https://pub.dev/packages/image_picker)
