import 'package:calymob/services/notification_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('shouldRegisterNotificationToken', () {
    test('preserves an explicit opt-out during login or app resume', () {
      expect(shouldRegisterNotificationToken(storedPreference: false), isFalse);
    });

    test('registers for new members and members who opted in', () {
      expect(shouldRegisterNotificationToken(storedPreference: null), isTrue);
      expect(shouldRegisterNotificationToken(storedPreference: true), isTrue);
    });

    test('explicit re-enable overrides a stored opt-out', () {
      expect(
        shouldRegisterNotificationToken(
          storedPreference: false,
          explicitEnable: true,
        ),
        isTrue,
      );
    });
  });
}
