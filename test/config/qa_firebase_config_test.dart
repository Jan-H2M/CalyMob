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
}
