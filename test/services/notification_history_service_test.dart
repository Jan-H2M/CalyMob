import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/services/notification_history_service.dart';

void main() {
  test('streams newest notifications first and preserves navigation payload',
      () async {
    final firestore = FakeFirebaseFirestore();
    final collection =
        firestore.collection('clubs/calypso/members/member-1/notifications');
    await collection.doc('old').set({
      'title': 'Ancienne',
      'body': 'Premier message',
      'type': 'announcement',
      'announcement_id': 'announcement-1',
      'created_at': Timestamp.fromDate(DateTime.utc(2026, 9, 10, 8)),
      'read': true,
    });
    await collection.doc('new').set({
      'title': 'Nouvelle',
      'body': 'Deuxième message',
      'type': 'event_message',
      'data': {'operation_id': 'operation-2'},
      'created_at': Timestamp.fromDate(DateTime.utc(2026, 9, 11, 9)),
      'read': false,
    });

    final service = NotificationHistoryService(firestore: firestore);
    final items =
        await service.watch(clubId: 'calypso', memberId: 'member-1').first;

    expect(items.map((item) => item.id), ['new', 'old']);
    expect(items.first.payload['operation_id'], 'operation-2');
    expect(items.first.category, 'Conversation');
    expect(items.first.isRead, isFalse);
    expect(items.last.payload['announcement_id'], 'announcement-1');
    expect(items.last.isRead, isTrue);
  });

  test('marks only the selected history item as read', () async {
    final firestore = FakeFirebaseFirestore();
    final reference = firestore
        .collection('clubs/calypso/members/member-1/notifications')
        .doc('notification-1');
    await reference.set({
      'title': 'Test',
      'body': 'Test',
      'type': 'announcement',
      'created_at': Timestamp.now(),
      'read': false,
      'read_at': null,
    });

    final service = NotificationHistoryService(firestore: firestore);
    await service.markRead(
      clubId: 'calypso',
      memberId: 'member-1',
      notificationId: 'notification-1',
    );

    final data = (await reference.get()).data()!;
    expect(data['read'], isTrue);
    expect(data['read_at'], isA<Timestamp>());
  });
}
