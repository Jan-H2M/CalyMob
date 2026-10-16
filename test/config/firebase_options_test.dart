import 'package:calymob/firebase_options.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('iOS uses the verified CalyMob Firebase app in calycompta', () {
    const options = DefaultFirebaseOptions.ios;
    expect(options.projectId, 'calycompta');
    expect(options.appId, '1:328464166969:ios:59423f69116580ea8f5de8');
    expect(options.iosBundleId, 'be.calypsodc.calymob');
  });
}
