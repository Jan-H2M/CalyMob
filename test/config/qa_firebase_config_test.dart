import 'dart:io';

import 'package:calymob/config/firebase_config.dart';
import 'package:calymob/config/qa_firebase_config.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('QA options stay isolated from production Firebase', () {
    expect(QaFirebaseConfig.options.projectId, 'demo-calycompta-qa');
    expect(QaFirebaseConfig.options.authDomain, '127.0.0.1');
    expect(FirebaseConfig.projectId, isNot(QaFirebaseConfig.options.projectId));
    expect(QaFirebaseConfig.transportFunctionName, 'qaCaptureSideEffect');
    expect(QaFirebaseConfig.transportProbeData, {
      'kind': 'fcm',
      'payload': {
        'action': 'external-notifications-disabled',
        'client': 'calymob',
      },
    });
  });

  test('QA host mapping is loopback-only', () {
    expect(
      QaFirebaseConfig.emulatorHost(
          web: false, platform: TargetPlatform.android),
      '10.0.2.2',
    );
    expect(
      QaFirebaseConfig.emulatorHost(web: false, platform: TargetPlatform.iOS),
      '127.0.0.1',
    );
    expect(
      QaFirebaseConfig.emulatorHost(web: false, platform: TargetPlatform.macOS),
      '127.0.0.1',
    );
  });

  test('QA safety checks fail closed', () {
    expect(
      () => QaFirebaseConfig.assertSafe(
        qaEnabled: true,
        releaseMode: true,
        candidateProjectId: 'demo-calycompta-qa',
        candidateHost: '127.0.0.1',
      ),
      throwsStateError,
    );
    expect(
      () => QaFirebaseConfig.assertSafe(
        qaEnabled: true,
        releaseMode: false,
        candidateProjectId: FirebaseConfig.projectId,
        candidateHost: '127.0.0.1',
      ),
      throwsStateError,
    );
    expect(
      () => QaFirebaseConfig.assertSafe(
        qaEnabled: true,
        releaseMode: false,
        candidateProjectId: 'demo-calycompta-qa',
        candidateHost: 'qa.example.com',
      ),
      throwsStateError,
    );
  });

  test('QA bootstrap skips external telemetry initialization', () {
    final source = File('lib/main.dart').readAsStringSync();
    final qaBranch = source.indexOf('if (QaFirebaseConfig.enabled) {');
    final qaRunner = source.indexOf('await _runCalyMobApp();', qaBranch);
    final sentryInit = source.indexOf('await SentryFlutter.init(');
    expect(qaBranch, greaterThanOrEqualTo(0));
    expect(qaRunner, greaterThan(qaBranch));
    expect(sentryInit, greaterThan(qaRunner));
    expect(source.substring(qaBranch, sentryInit), contains('return;'));
  });

  test('QA browser progress exposes only a closed diagnostic stage set', () {
    final bridge =
        File('lib/config/qa_browser_bridge_web.dart').readAsStringSync();
    final main = File('lib/main.dart').readAsStringSync();
    for (final stage in <String>[
      'command_received',
      'auth_start',
      'auth_ready',
      'member_start',
      'member_ready',
      'fixture_start',
      'fixture_ready',
      'navigation_start',
      'navigation_ready',
      'side_effect_start',
      'side_effect_ready',
      'result_ready',
    ]) {
      expect(bridge, contains("'$stage'"));
      expect(main, contains("setStage('$stage')"));
    }
    expect(bridge, contains("_stages.contains(stage)"));
    expect(bridge, contains("dataset['calypsoQaStage'] = stage"));
  });

  test('communication QA assertions use exact real UI semantics', () {
    final source =
        File('lib/screens/communication/communication_hub_screen.dart')
            .readAsStringSync();
    expect(source, contains("label: 'Filtre \${filter.label}'"));
    expect(source, contains('selected: selected'));
    expect(source, contains('label: title'));
    expect(source, contains('container: true'));
    expect(source, contains('excludeSemantics: true'));
  });
}
