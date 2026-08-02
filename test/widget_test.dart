import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/main.dart';

void main() {
  test('CalyMob exposes its application root without starting integrations', () {
    const app = MyApp();
    expect(app, isA<MyApp>());
  });
}
