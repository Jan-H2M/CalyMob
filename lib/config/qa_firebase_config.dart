import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';

/// Strict Firebase Emulator bootstrap used only by the COM-094 QA harness.
class QaFirebaseConfig {
  static const bool enabled =
      bool.fromEnvironment('CALYPSO_QA_EMULATOR', defaultValue: false);
  static const String projectId = 'demo-calycompta-qa';
  static const String loopbackHost = '127.0.0.1';
  static const String androidEmulatorHost = '10.0.2.2';

  static const FirebaseOptions options = FirebaseOptions(
    apiKey: 'demo-only-api-key',
    appId: '1:000000000000:app:demoqa',
    messagingSenderId: '000000000000',
    projectId: projectId,
    authDomain: loopbackHost,
    storageBucket: '$projectId.appspot.com',
  );

  static String emulatorHost({bool? web, TargetPlatform? platform}) {
    final isWeb = web ?? kIsWeb;
    final target = platform ?? defaultTargetPlatform;
    return !isWeb && target == TargetPlatform.android
        ? androidEmulatorHost
        : loopbackHost;
  }

  static void assertSafe({
    bool? qaEnabled,
    bool? releaseMode,
    String candidateProjectId = projectId,
    String? candidateHost,
  }) {
    if (!(qaEnabled ?? enabled)) return;
    if (releaseMode ?? kReleaseMode) {
      throw StateError('Firebase Emulator QA is forbidden in release mode.');
    }
    if (!candidateProjectId.startsWith('demo-') ||
        candidateProjectId != projectId) {
      throw StateError('Firebase Emulator QA refuses non-demo project.');
    }
    if (candidateHost != null &&
        candidateHost != loopbackHost &&
        candidateHost != androidEmulatorHost) {
      throw StateError('Firebase Emulator QA refuses non-local host.');
    }
  }

  static Future<void> configureEmulators() async {
    if (!enabled) return;
    final host = emulatorHost();
    assertSafe(
      candidateProjectId: Firebase.app().options.projectId,
      candidateHost: host,
    );
    await FirebaseAuth.instance.useAuthEmulator(host, 9099);
    FirebaseFirestore.instance.useFirestoreEmulator(host, 8080);
    await FirebaseStorage.instance.useStorageEmulator(host, 9199);
    FirebaseFunctions.instanceFor(region: 'europe-west1')
        .useFunctionsEmulator(host, 5001);
  }
}
