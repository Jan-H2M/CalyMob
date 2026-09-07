import 'package:calymob/config/qa_firebase_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('QA emulator bootstrap uses only demo and loopback resources', () {
    expect(QaFirebaseConfig.options.projectId, startsWith('demo-'));
    expect(QaFirebaseConfig.emulatorHost(web: true), '127.0.0.1');
    expect(
      QaFirebaseConfig.options.storageBucket,
      'demo-calycompta-qa.appspot.com',
    );
  });
}
