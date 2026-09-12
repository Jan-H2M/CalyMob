import 'package:calymob/screens/communication/notification_history_screen.dart';
import 'package:calymob/services/notification_navigation_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() {
    NotificationHistoryNavigationDispatcher.instance.handler = null;
  });

  testWidgets('preview filters unread items and forwards a card destination',
      (tester) async {
    Map<String, dynamic>? openedPayload;
    NotificationHistoryNavigationDispatcher.instance.handler =
        (data) => openedPayload = data;

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: NotificationHistoryContent(
            clubId: 'calypso',
            memberId: 'member-1',
            previewMode: true,
          ),
        ),
      ),
    );

    expect(find.text('Non lues  3'), findsOneWidget);
    expect(find.text('Une action vous attend'), findsNothing);

    await tester.tap(find.text('Non lues  3'));
    await tester.pump();
    expect(find.text('Information du club'), findsOneWidget);
    await tester.tap(find.text('Nouveau message dans Équipe encadrants'));
    await tester.pump();

    expect(openedPayload?['type'], 'team_message');
    expect(openedPayload?['channel_id'], 'preview');
  });
}
