import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/screens/home/landing_screen.dart';
import 'package:calymob/services/read_state_service.dart';
import 'package:calymob/models/read_state.dart';

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

  group('screen acknowledgement semantics', () {
    test(
        'opening a list itself has no acknowledgement; a conversation writes once',
        () async {
      var writes = 0;
      final service = ReadStateService(
        firestore: FakeFirebaseFirestore(),
        visibleAcknowledgementCall: (_) async {
          writes += 1;
          return {
            'status': 'acknowledged',
            'visibleThroughMs':
                DateTime.utc(2026, 9, 26).millisecondsSinceEpoch,
          };
        },
      );
      await service.markEventConversationSeen(
        'c',
        'u',
        'op',
        visibleMessageId: 'message-1',
      );
      await service.markEventConversationSeen(
        'c',
        'u',
        'op',
        visibleMessageId: 'message-1',
      );
      expect(writes, 1,
          reason: 'repeated exact-detail acknowledgements are coalesced');
    });

    test(
        'mark-all is an explicit section action; no action leaves cursor absent',
        () async {
      final db = FakeFirebaseFirestore();
      final service = ReadStateService(firestore: db);
      final ref =
          db.doc('clubs/c/members/u/read_state/${ReadStateSection.events.id}');
      expect((await ref.get()).exists, isFalse,
          reason: 'dialog cancellation performs no write');
      await service.markSectionSeen('c', 'u', ReadStateSection.events);
      expect((await ref.get()).exists, isTrue,
          reason: 'confirmation advances the section cursor');
    });
  });
}
