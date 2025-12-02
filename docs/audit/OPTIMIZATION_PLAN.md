# CalyMob Optimization Plan

**Date:** November 25, 2025
**Version:** 1.0.4+6

---

## Priority 1: Critical Fixes (Before Any Release)

### 1.1 Add Missing Dependency

**Issue:** Build will fail due to missing `cached_network_image`

**Fix:**

```yaml
# pubspec.yaml - Add to dependencies
cached_network_image: ^3.3.1
```

Then run:
```bash
flutter pub get
```

---

### 1.2 Fix Missing AuthProvider Method

**Issue:** `sendPasswordResetEmail()` called but doesn't exist

**Location:** `lib/providers/auth_provider.dart`

**Add the following method:**

```dart
/// Send password reset email
Future<void> sendPasswordResetEmail() async {
  try {
    final email = _currentUser?.email;
    if (email == null) {
      throw Exception('No email address found');
    }
    await _authService.sendPasswordResetEmail(email);
    debugPrint('✅ Password reset email sent to: $email');
  } catch (e) {
    debugPrint('❌ Password reset error: $e');
    rethrow;
  }
}
```

**Also add to AuthService (`lib/services/auth_service.dart`):**

```dart
/// Send password reset email
Future<void> sendPasswordResetEmail(String email) async {
  await _auth.sendPasswordResetEmail(email: email);
}
```

---

### 1.3 Create ProfileService

**Location:** `lib/services/profile_service.dart`

**Restore from git or create new:**

```dart
import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import '../models/member_profile.dart';

class ProfileService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;

  /// Get user profile
  Future<MemberProfile?> getProfile(String clubId, String userId) async {
    try {
      final doc = await _firestore
          .collection('clubs/$clubId/members')
          .doc(userId)
          .get();

      if (!doc.exists) return null;
      return MemberProfile.fromFirestore(doc);
    } catch (e) {
      debugPrint('❌ Error loading profile: $e');
      return null;
    }
  }

  /// Watch user profile stream
  Stream<MemberProfile?> watchProfile(String clubId, String userId) {
    return _firestore
        .collection('clubs/$clubId/members')
        .doc(userId)
        .snapshots()
        .map((doc) {
      if (!doc.exists) return null;
      return MemberProfile.fromFirestore(doc);
    });
  }

  /// Get all member profiles (for Who's Who)
  Future<List<MemberProfile>> getAllProfiles(String clubId) async {
    try {
      final snapshot = await _firestore
          .collection('clubs/$clubId/members')
          .orderBy('nom')
          .get();

      return snapshot.docs
          .map((doc) => MemberProfile.fromFirestore(doc))
          .toList();
    } catch (e) {
      debugPrint('❌ Error loading all profiles: $e');
      return [];
    }
  }

  /// Update profile photo
  Future<String?> updateProfilePhoto({
    required String clubId,
    required String userId,
    required File photoFile,
  }) async {
    try {
      final fileName = 'profile_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final ref = _storage.ref('clubs/$clubId/members/$userId/$fileName');

      await ref.putFile(photoFile);
      final url = await ref.getDownloadURL();

      await _firestore.collection('clubs/$clubId/members').doc(userId).update({
        'photo_url': url,
        'photo_uploaded_at': FieldValue.serverTimestamp(),
        'updated_at': FieldValue.serverTimestamp(),
      });

      return url;
    } catch (e) {
      debugPrint('❌ Error updating profile photo: $e');
      return null;
    }
  }

  /// Update photo consents
  Future<void> updatePhotoConsents({
    required String clubId,
    required String userId,
    required bool consentInternal,
    required bool consentExternal,
  }) async {
    await _firestore.collection('clubs/$clubId/members').doc(userId).update({
      'consent_internal_photo': consentInternal,
      'consent_external_photo': consentExternal,
      'consent_internal_photo_date': consentInternal ? FieldValue.serverTimestamp() : null,
      'consent_external_photo_date': consentExternal ? FieldValue.serverTimestamp() : null,
      'updated_at': FieldValue.serverTimestamp(),
    });
  }

  /// Update contact sharing preferences
  Future<void> updateContactSharing({
    required String clubId,
    required String userId,
    required bool shareEmail,
    required bool sharePhone,
    String? phoneNumber,
  }) async {
    await _firestore.collection('clubs/$clubId/members').doc(userId).update({
      'share_email': shareEmail,
      'share_phone': sharePhone,
      'phone_number': phoneNumber,
      'updated_at': FieldValue.serverTimestamp(),
    });
  }
}
```

---

### 1.4 Add Missing Android Permissions

**File:** `android/app/src/main/AndroidManifest.xml`

**Replace current permissions with:**

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Network -->
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>

    <!-- Camera -->
    <uses-permission android:name="android.permission.CAMERA"/>

    <!-- Storage - Android 13+ -->
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO"/>

    <!-- Storage - Android 12 and below -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32"/>

    <!-- Notifications -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
    <uses-permission android:name="android.permission.VIBRATE"/>

    <!-- Camera feature (optional) -->
    <uses-feature android:name="android.hardware.camera" android:required="false"/>
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false"/>

    <application
        android:label="CalyMob"
        android:name="${applicationName}"
        android:icon="@mipmap/ic_launcher">
        <!-- ... rest of application config ... -->
    </application>
</manifest>
```

---

## Priority 2: High Priority (Within 1 Week)

### 2.1 Update Target SDK Version

**File:** `android/app/build.gradle`

**Change:**
```gradle
targetSdk 35
```

**Then test thoroughly on Android 15 device/emulator.**

---

### 2.2 Fix Nullable Timestamp Crash

**File:** `lib/models/operation.dart:66-67`

**Before:**
```dart
createdAt: (data['created_at'] as Timestamp).toDate(),
updatedAt: (data['updated_at'] as Timestamp).toDate(),
```

**After:**
```dart
createdAt: (data['created_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
updatedAt: (data['updated_at'] as Timestamp?)?.toDate() ?? DateTime.now(),
```

---

### 2.3 Enable ProGuard/R8 for Release Builds

**File:** `android/app/build.gradle`

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

**Create:** `android/app/proguard-rules.pro`

```proguard
# Flutter
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Firebase
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.firebase.** { *; }

# Crashlytics
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception
```

---

## Priority 3: Medium Priority (Within 1 Month)

### 3.1 Fix N+1 Query Pattern

**File:** `lib/providers/operation_provider.dart`

**Issue:** Each operation triggers a separate query for participant count.

**Current problematic code:**
```dart
Future<void> _loadAllParticipantCounts() async {
  for (final operation in _operations) {
    final count = await _operationService.countParticipants(
      _clubId,
      operation.id,
    );
    _participantCounts[operation.id] = count;
  }
}
```

**Optimized solution - Batch query:**

```dart
Future<void> _loadAllParticipantCounts() async {
  if (_operations.isEmpty) return;

  final operationIds = _operations.map((o) => o.id).toList();

  // Single query for all participants
  final snapshot = await FirebaseFirestore.instance
      .collection('clubs/$_clubId/operation_participants')
      .where('operation_id', whereIn: operationIds.take(10)) // Firestore limit
      .get();

  // Group by operation_id
  final Map<String, int> counts = {};
  for (final doc in snapshot.docs) {
    final opId = doc.data()['operation_id'] as String;
    counts[opId] = (counts[opId] ?? 0) + 1;
  }

  _participantCounts = counts;
  notifyListeners();
}
```

**Better solution - Denormalize:**
Store `participant_count` directly on the operation document and update it via Cloud Function when participants change.

---

### 3.2 Implement Offline Support

**File:** `lib/main.dart`

**Add Firestore offline settings:**

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // Enable offline persistence
  FirebaseFirestore.instance.settings = const Settings(
    persistenceEnabled: true,
    cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
  );

  // ...
}
```

**Add offline indicator widget:**

```dart
class ConnectivityBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<ConnectivityResult>(
      stream: Connectivity().onConnectivityChanged,
      builder: (context, snapshot) {
        if (snapshot.data == ConnectivityResult.none) {
          return Container(
            color: Colors.red,
            padding: const EdgeInsets.all(8),
            child: const Text(
              'Mode hors-ligne',
              style: TextStyle(color: Colors.white),
              textAlign: TextAlign.center,
            ),
          );
        }
        return const SizedBox.shrink();
      },
    );
  }
}
```

---

### 3.3 Add Global Error Handling

**File:** `lib/main.dart`

```dart
void main() async {
  // Catch Flutter framework errors
  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);
    // Send to Crashlytics
    FirebaseCrashlytics.instance.recordFlutterFatalError(details);
  };

  // Catch Dart errors
  PlatformDispatcher.instance.onError = (error, stack) {
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    return true;
  };

  runApp(const MyApp());
}
```

**Add ErrorBoundary widget:**

```dart
class ErrorBoundary extends StatefulWidget {
  final Widget child;
  const ErrorBoundary({required this.child, super.key});

  @override
  State<ErrorBoundary> createState() => _ErrorBoundaryState();
}

class _ErrorBoundaryState extends State<ErrorBoundary> {
  bool _hasError = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    ErrorWidget.builder = (FlutterErrorDetails details) {
      setState(() {
        _hasError = true;
        _error = details.exception;
      });
      return _buildErrorWidget();
    };
  }

  Widget _buildErrorWidget() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          const Text('Une erreur est survenue'),
          ElevatedButton(
            onPressed: () => setState(() => _hasError = false),
            child: const Text('Réessayer'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return _hasError ? _buildErrorWidget() : widget.child;
  }
}
```

---

## Priority 4: Performance Optimizations

### 4.1 Lazy Load Profile Photos

Use `cached_network_image` with proper placeholder and error handling:

```dart
CachedNetworkImage(
  imageUrl: member.photoUrl!,
  memCacheWidth: 200,  // Limit memory usage
  memCacheHeight: 200,
  maxWidthDiskCache: 400,  // Limit disk cache
  maxHeightDiskCache: 400,
  placeholder: (context, url) => const CircularProgressIndicator(),
  errorWidget: (context, url, error) => const Icon(Icons.person),
  fadeInDuration: const Duration(milliseconds: 200),
)
```

---

### 4.2 Debounce Stream Updates

**For rapid Firestore updates:**

```dart
import 'dart:async';

Stream<T> debounce<T>(Stream<T> stream, Duration duration) {
  StreamController<T>? controller;
  Timer? timer;

  controller = StreamController<T>(
    onListen: () {
      stream.listen((data) {
        timer?.cancel();
        timer = Timer(duration, () {
          controller?.add(data);
        });
      });
    },
    onCancel: () {
      timer?.cancel();
    },
  );

  return controller.stream;
}

// Usage in provider:
_subscription = debounce(
  _expenseService.getUserExpensesStream(clubId, userId),
  const Duration(milliseconds: 300),
).listen((expenses) {
  _expenses = expenses;
  notifyListeners();
});
```

---

### 4.3 Image Compression Before Upload

**File:** `lib/screens/expenses/create_expense_screen.dart`

```dart
Future<File?> compressImage(File file) async {
  final bytes = await file.readAsBytes();
  final image = img.decodeImage(bytes);

  if (image == null) return null;

  // Resize if too large
  img.Image resized = image;
  if (image.width > 1920 || image.height > 1920) {
    resized = img.copyResize(
      image,
      width: image.width > image.height ? 1920 : null,
      height: image.height >= image.width ? 1920 : null,
    );
  }

  // Compress as JPEG
  final compressed = img.encodeJpg(resized, quality: 80);

  // Write to temp file
  final tempDir = await getTemporaryDirectory();
  final tempFile = File('${tempDir.path}/compressed_${DateTime.now().millisecondsSinceEpoch}.jpg');
  await tempFile.writeAsBytes(compressed);

  return tempFile;
}
```

---

## Priority 5: Code Quality (Ongoing)

### 5.1 Add Unit Tests

**Create:** `test/services/auth_service_test.dart`

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:firebase_auth/firebase_auth.dart';

// Example test structure
void main() {
  group('AuthService', () {
    test('signIn returns user on success', () async {
      // Arrange
      // Act
      // Assert
    });

    test('signIn throws on invalid credentials', () async {
      // ...
    });
  });
}
```

### 5.2 Replace Debug Prints with Logger

```yaml
# pubspec.yaml
logger: ^2.4.0
```

```dart
import 'package:logger/logger.dart';

final logger = Logger(
  printer: PrettyPrinter(
    methodCount: 0,
    errorMethodCount: 5,
    lineLength: 80,
    colors: true,
    printEmojis: true,
    printTime: true,
  ),
);

// Usage:
logger.d('Debug message');
logger.i('Info message');
logger.w('Warning message');
logger.e('Error message', error: e, stackTrace: stack);
```

---

## Implementation Timeline

| Phase | Tasks | Estimated Effort |
|-------|-------|-----------------|
| Critical | 1.1 - 1.4 | 2-4 hours |
| High | 2.1 - 2.3 | 4-8 hours |
| Medium | 3.1 - 3.3 | 1-2 days |
| Performance | 4.1 - 4.3 | 1-2 days |
| Quality | 5.1 - 5.2 | Ongoing |

---

## Verification Checklist

After implementing fixes:

- [ ] `flutter pub get` succeeds
- [ ] `flutter analyze` shows no errors
- [ ] `flutter build apk --debug` succeeds
- [ ] `flutter build ios --debug` succeeds (if on Mac)
- [ ] App launches without crashes
- [ ] Profile screen loads correctly
- [ ] Who's Who screen loads correctly
- [ ] Password reset works
- [ ] Expense photos can be taken/selected
- [ ] All existing features still work

---

## Sources

- [Flutter Performance Best Practices](https://docs.flutter.dev/perf/best-practices)
- [Firebase Flutter Offline Support](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Flutter Testing](https://docs.flutter.dev/testing)
- [cached_network_image Best Practices](https://pub.dev/packages/cached_network_image)
