# CalyMob Comprehensive Code Audit Report

**Date:** November 25, 2025
**Version Audited:** 1.0.4+6
**Auditor:** Claude Code Professional Audit System

---

## Executive Summary

CalyMob is a Flutter mobile application for the Calypso Diving Club, providing expense management, event registration, member directory, and communication features. The codebase demonstrates **good architecture fundamentals** but has several areas requiring attention for production deployment.

### Overall Code Quality Score: **7.2/10**

| Category | Score | Status |
|----------|-------|--------|
| Architecture | 8/10 | Good |
| Code Organization | 8/10 | Good |
| Memory Management | 7/10 | Acceptable |
| Security | 6/10 | Needs Improvement |
| Cross-Platform Compatibility | 7/10 | Acceptable |
| Performance | 7/10 | Acceptable |
| Documentation | 5/10 | Needs Improvement |
| Test Coverage | 2/10 | Critical |

---

## Critical Issues Requiring Immediate Attention

### 1. [CRITICAL] Missing Dependency: `cached_network_image`

**Location:** `lib/screens/profile/profile_screen.dart:4`, `lib/screens/profile/who_is_who_screen.dart:4`

**Issue:** The profile screens import `cached_network_image` but it's not declared in `pubspec.yaml`.

```dart
import 'package:cached_network_image/cached_network_image.dart';
```

**Impact:** Build will fail when these screens are accessed.

**Fix:** Add to `pubspec.yaml`:
```yaml
cached_network_image: ^3.3.1
```

### 2. [CRITICAL] Missing Method in AuthProvider

**Location:** `lib/screens/profile/profile_screen.dart:167`

**Issue:** `sendPasswordResetEmail()` method is called but doesn't exist in `AuthProvider`.

```dart
await context.read<AuthProvider>().sendPasswordResetEmail();
```

**Impact:** Runtime crash when user attempts password reset.

**Fix:** Add method to `AuthProvider`:
```dart
Future<void> sendPasswordResetEmail() async {
  final email = _currentUser?.email;
  if (email != null) {
    await _authService.sendPasswordResetEmail(email);
  }
}
```

### 3. [CRITICAL] Android Target SDK Non-Compliance

**Location:** `android/app/build.gradle:41`

**Issue:** `targetSdk 34` will be rejected by Google Play after **August 31, 2025**.

**Google Play Requirement:** New apps must target API 35 (Android 15) or higher.

**Fix:** Update to `targetSdk 35` and test thoroughly.

### 4. [CRITICAL] No Test Coverage

**Impact:** Zero automated tests means regressions cannot be detected.

**Recommendation:** Implement at minimum:
- Unit tests for all services
- Widget tests for critical screens
- Integration tests for auth flow

---

## High Priority Issues

### 5. [HIGH] Missing Services Import in Profile Screens

**Location:** `lib/screens/profile/profile_screen.dart`, `lib/screens/profile/who_is_who_screen.dart`

**Issue:** `ProfileService` class doesn't exist in the codebase or is missing implementation.

### 6. [HIGH] Android Permissions Missing

**Location:** `android/app/src/main/AndroidManifest.xml`

**Issue:** Camera and storage permissions for expense receipt photos are missing.

**Current:**
```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
```

**Required additions:**
```xml
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO"/>
<!-- For older Android versions -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32"/>
```

### 7. [HIGH] Firebase API Keys in Source Control

**Location:** `lib/firebase_options.dart`

**Issue:** API keys are committed to git. While Firebase API keys are designed to be public, best practice is to use environment variables or restrict key access.

**Recommendation:**
- Enable App Check in Firebase Console
- Restrict API key usage to specific bundle IDs
- Consider using `--dart-define` for sensitive configuration

### 8. [HIGH] Session Service Singleton Memory Risk

**Location:** `lib/services/session_service.dart:17-19`

**Issue:** Singleton pattern with `WidgetsBindingObserver` may not be properly cleaned up.

```dart
static final SessionService _instance = SessionService._internal();
factory SessionService() => _instance;
```

**Risk:** Observer may persist across app restarts in certain conditions.

### 9. [HIGH] Missing Proguard/R8 Configuration

**Location:** `android/app/build.gradle:64-65`

**Issue:** Minification and shrinking disabled for release builds.

```gradle
minifyEnabled false
shrinkResources false
```

**Impact:**
- Larger APK size
- No code obfuscation
- Potentially exposing sensitive logic

**Recommendation:** Enable with proper rules:
```gradle
minifyEnabled true
shrinkResources true
proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
```

---

## Medium Priority Issues

### 10. [MEDIUM] Hardcoded Club ID

**Location:** Multiple files including `lib/config/firebase_config.dart:8`

```dart
static const String defaultClubId = 'calypso';
```

**Impact:** Cannot easily support multiple clubs or white-label deployments.

**Recommendation:** Make configurable via environment or runtime selection.

### 11. [MEDIUM] Missing Error Boundaries

**Location:** Throughout screens

**Issue:** No global error handling widget wrapping the app.

**Recommendation:** Implement `ErrorWidget.builder` and a custom error boundary widget.

### 12. [MEDIUM] No Offline Support

**Impact:** App becomes unusable without network connectivity.

**Recommendation:**
- Enable Firestore offline persistence (already included in SDK)
- Add offline state indicators to UI
- Queue operations for retry when online

### 13. [MEDIUM] Inconsistent Loading States

**Location:** Various providers

**Issue:** Some screens show loading indicators, others don't.

**Recommendation:** Standardize loading/error/empty state handling across all screens.

### 14. [MEDIUM] Color.withOpacity Deprecation Warning

**Location:** `lib/widgets/operation_card.dart:124`

```dart
color: color.withOpacity(0.1),
```

**Issue:** `withOpacity` creates a new object; use `Color.withValues()` in Flutter 3.27+.

### 15. [MEDIUM] Date Parsing Without Null Safety

**Location:** `lib/models/operation.dart:66-67`

```dart
createdAt: (data['created_at'] as Timestamp).toDate(),
updatedAt: (data['updated_at'] as Timestamp).toDate(),
```

**Risk:** Crash if `created_at` or `updated_at` is null.

**Fix:**
```dart
createdAt: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
updatedAt: (data['updated_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
```

---

## Low Priority Issues

### 16. [LOW] Debug Print Statements in Production

**Location:** Throughout the codebase

**Example:** `lib/providers/auth_provider.dart:69`
```dart
debugPrint('✅ Nom affiché chargé: $_displayName');
```

**Recommendation:** Use conditional logging or a proper logging package like `logger`.

### 17. [LOW] Inconsistent Naming Conventions

**Examples:**
- Mix of French and English in code comments
- `appouveParNom` typo (should be `approuveParNom`)
- Inconsistent snake_case vs camelCase for Firestore fields

### 18. [LOW] Missing Accessibility Features

**Impact:** App may not be usable by visually impaired users.

**Recommendation:**
- Add `Semantics` widgets
- Ensure sufficient color contrast
- Test with TalkBack/VoiceOver

### 19. [LOW] No Analytics for UX Insights

**Impact:** Cannot measure user behavior or feature adoption.

**Recommendation:** Implement Firebase Analytics events for key user actions.

---

## Security Assessment

### Strengths:
1. Firebase Authentication properly implemented
2. Session management with timeout
3. Firestore security rules implemented

### Weaknesses:
1. No certificate pinning
2. No App Check enabled
3. API keys in source code
4. No input sanitization on user-provided text
5. Photo metadata not stripped before upload

### Recommendations:
1. Enable Firebase App Check
2. Implement certificate pinning for API calls
3. Strip EXIF data from photos before upload
4. Add rate limiting on sensitive operations
5. Implement biometric authentication option

---

## Performance Assessment

### Observed Issues:

1. **N+1 Query Pattern** in `OperationProvider._loadAllParticipantCounts()`
   - Each operation triggers separate Firestore query
   - Solution: Batch queries or denormalize participant counts

2. **Large APK Size** (~161 MB debug)
   - Enable ProGuard/R8 for release builds
   - Tree-shake unused assets
   - Consider app bundle instead of APK

3. **No Image Caching Strategy**
   - Profile photos re-downloaded each time
   - Solution: `cached_network_image` (once added)

4. **Stream Subscriptions Not Debounced**
   - Rapid Firestore updates trigger multiple rebuilds
   - Consider debouncing or batching updates

---

## Recommendations Summary

### Immediate Actions (Before Next Release):
1. Add `cached_network_image` to dependencies
2. Add `sendPasswordResetEmail` method to AuthProvider
3. Add missing Android permissions
4. Create ProfileService implementation or restore from git

### Short-Term (Within 1 Month):
1. Update targetSdk to 35
2. Enable ProGuard/R8 for release builds
3. Implement App Check
4. Add basic unit tests for services

### Medium-Term (Within 3 Months):
1. Implement offline support
2. Add comprehensive test coverage
3. Implement proper logging system
4. Add analytics events

### Long-Term:
1. Consider state management upgrade (Riverpod/Bloc)
2. Implement CI/CD pipeline
3. Add accessibility features
4. Consider white-label architecture

---

## Conclusion

CalyMob has a solid architectural foundation with proper separation of concerns using the Provider pattern. The main concerns are missing dependencies that will cause build/runtime failures, and the approaching Google Play SDK requirement deadline.

With the critical issues addressed, the app should be suitable for production deployment. The recommended improvements will enhance reliability, security, and user experience over time.

---

## Sources & References

- [Firebase Flutter SDK Release Notes](https://firebase.google.com/support/release-notes/flutter)
- [Google Play Target API Level Requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Apple App Store Requirements 2025](https://developer.apple.com/news/upcoming-requirements/)
- [Flutter Provider Package](https://pub.dev/packages/provider)
- [cached_network_image Package](https://pub.dev/packages/cached_network_image)
- [image_picker Package](https://pub.dev/packages/image_picker)
