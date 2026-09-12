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
    await collection.doc('action').set({
      'title': 'Action à traiter',
      'body': 'Validez une plongée.',
      'type': 'logbook_dive_confirmation',
      'category': 'Action',
      'created_at': Timestamp.fromDate(DateTime.utc(2026, 9, 12, 10)),
      'read': false,
    });

    final service = NotificationHistoryService(firestore: firestore);
    final items =
        await service.watch(clubId: 'calypso', memberId: 'member-1').first;

    expect(items.map((item) => item.id), ['action', 'new', 'old']);
    expect(items[1].payload['operation_id'], 'operation-2');
    expect(items[1].category, 'Conversation');
    expect(items[1].isRead, isFalse);
    expect(items.last.payload['announcement_id'], 'announcement-1');
    expect(items.last.isRead, isTrue);
  });

  test('retains every action delivery until it has complete durable coverage',
      () async {
    final firestore = FakeFirebaseFirestore();
    final collection =
        firestore.collection('clubs/calypso/members/member-1/notifications');
    const types = [
      'piscine_task_assigned',
      'exercice_declared',
      'exercice_digest',
      'formation_reminder',
      'claim_rejected',
      'logbook_dive_confirmation',
      'logbook_dive_confirmation_result',
    ];
    for (var index = 0; index < types.length; index++) {
      await collection.doc('action-$index').set({
        'title': 'Rappel',
        'body': 'Une action vous attend.',
        'type': types[index],
        // Includes malformed legacy categories and records without task IDs.
        'category': index.isEven ? 'Action' : 'Notification',
        'created_at': Timestamp.fromDate(DateTime.utc(2026, 9, index + 1)),
      });
    }

    final items = await NotificationHistoryService(firestore: firestore)
        .watch(clubId: 'calypso', memberId: 'member-1')
        .first;

    expect(items, hasLength(types.length));
    expect(items.map((item) => item.type).toSet(), types.toSet());
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
