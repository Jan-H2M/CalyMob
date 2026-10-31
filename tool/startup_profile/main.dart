// Native-only Instruments target. It deliberately does not import the app,
// authentication, notifications, deep links or Sentry initialization. Native
// Firebase is demo-only: prepare_native_startup_profile.py and AppDelegate guard
// must sanitize and verify configuration BEFORE generated plugin registration.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void main() {
  const enabled = String.fromEnvironment('ENV') == 'dev' &&
      bool.fromEnvironment('STARTUP_PROFILING');
  if (!enabled) {
    throw StateError('Native startup profiling requires DEV opt-in.');
  }
  final stopwatch = Stopwatch()..start();
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MaterialApp(
      home: Scaffold(
          body: Center(
    child: Text('DEV · native startup profiling'),
  ))));
  unawaited(WidgetsBinding.instance.endOfFrame.then((_) async {
    debugPrint('STARTUP native_profile Dart-to-framework-frame: '
        '${stopwatch.elapsedMicroseconds / 1000} ms');
    try {
      final timings = await const MethodChannel('calymob/startup')
          .invokeMapMethod<String, num>('getTimings');
      debugPrint('STARTUP native_profile registrant: '
          '${timings?['registrationDurationMs']} ms');
    } on MissingPluginException {
      // Baseline AppDelegate may predate the timing bridge; Instruments still
      // captures the unchanged generated registrant and engine call stacks.
      debugPrint('STARTUP native_profile no timing bridge on this baseline');
    }
  }));
}
