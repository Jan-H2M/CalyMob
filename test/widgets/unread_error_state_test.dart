import 'package:calymob/models/announcement.dart';
import 'package:calymob/screens/communication/communication_hub_screen.dart';
import 'package:calymob/widgets/announcement_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('unread filter never hides a row whose cursor query failed', () {
    expect(
      shouldHideCommunicationUnreadRow(
        hideIfRead: true,
        unreadCount: null,
        statusUnavailable: true,
      ),
      isFalse,
    );
    expect(
      shouldHideCommunicationUnreadRow(
        hideIfRead: true,
        unreadCount: 0,
        statusUnavailable: false,
      ),
      isTrue,
    );
  });

  testWidgets('announcement cursor failure is explicit instead of read',
      (tester) async {
    final announcement = Announcement(
      id: 'announcement-1',
      title: 'Test',
      message: 'Message',
      senderId: 'sender',
      senderName: 'Club',
      type: AnnouncementType.info,
      createdAt: DateTime.utc(2026, 9, 26),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AnnouncementCard(
            announcement: announcement,
            unreadStatusUnavailable: true,
          ),
        ),
      ),
    );

    expect(find.byKey(const ValueKey('announcement-unread-error')), findsOne);
    expect(find.text('À VÉRIFIER'), findsOne);
    expect(find.text('NOUVEAU'), findsNothing);
  });
}
