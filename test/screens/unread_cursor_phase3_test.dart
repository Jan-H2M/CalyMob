import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/screens/home/landing_screen.dart';

void main() {
  group('unread cursor v1 landing formula', () {
    test('cursor mode includes session chats in Communication', () {
      expect(
        landingCommunicationBadgeCount(
          cursorMode: true,
          announcements: 2,
          teamMessages: 3,
          sessionMessages: 4,
        ),
        9,
      );
    });

    test('OFF mode preserves the legacy landing formula', () {
      expect(
        landingCommunicationBadgeCount(
          cursorMode: false,
          announcements: 2,
          teamMessages: 3,
          sessionMessages: 4,
        ),
        5,
      );
    });
  });
}
