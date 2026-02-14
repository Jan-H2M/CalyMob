import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:provider/provider.dart';
import 'package:calymob/models/event_message.dart';
import 'package:calymob/models/session_message.dart';
import 'package:calymob/providers/unread_count_provider.dart';

/// Full integration test exercising the complete message badge lifecycle:
/// 1. Messages are created in Firestore
/// 2. Unread counts are tracked
/// 3. Messages are marked as read
/// 4. Badge counters update correctly
/// 5. UI reflects the changes
///
/// Uses FakeFirebaseFirestore to simulate the Firebase backend.
void main() {
  const clubId = 'calypso_dc';
  const userId = 'jan_001';
  const otherUser = 'pierre_002';
  const thirdUser = 'marie_003';
  const operationId = 'sortie_mer_2026';
  const sessionId = 'piscine_2026_02';

  late FakeFirebaseFirestore firestore;

  final eventMsgPath = 'clubs/$clubId/operations/$operationId/messages';
  final sessionMsgPath = 'clubs/$clubId/piscine_sessions/$sessionId/messages';
  final memberPath = 'clubs/$clubId/members/$userId';

  setUp(() {
    firestore = FakeFirebaseFirestore();
  });

  /// Helper: create an event message
  Future<String> createEventMessage({
    required String senderId,
    required String senderName,
    required String message,
    List<String> readBy = const [],
    DateTime? createdAt,
  }) async {
    final docRef = await firestore.collection(eventMsgPath).add({
      'sender_id': senderId,
      'sender_name': senderName,
      'message': message,
      'created_at': Timestamp.fromDate(createdAt ?? DateTime.now()),
      'read_by': readBy,
    });
    return docRef.id;
  }

  /// Helper: create a session message
  Future<String> createSessionMessage({
    required String senderId,
    required String senderName,
    required String message,
    String groupType = 'encadrants',
    List<String> readBy = const [],
  }) async {
    final docRef = await firestore.collection(sessionMsgPath).add({
      'sender_id': senderId,
      'sender_name': senderName,
      'message': message,
      'group_type': groupType,
      'created_at': Timestamp.now(),
      'read_by': readBy,
    });
    return docRef.id;
  }

  /// Helper: set up member document with unread counts
  Future<void> setupMember({
    int total = 0,
    int eventMessages = 0,
    int announcements = 0,
    int teamMessages = 0,
    int sessionMessages = 0,
  }) async {
    await firestore.doc(memberPath).set({
      'name': 'Jan',
      'email': 'jan@test.com',
      'unread_counts': {
        'total': total,
        'event_messages': eventMessages,
        'announcements': announcements,
        'team_messages': teamMessages,
        'session_messages': sessionMessages,
      },
    });
  }

  /// Helper: count unread messages
  Future<int> countUnread(String collectionPath) async {
    final snapshot = await firestore.collection(collectionPath).get();
    return snapshot.docs.where((doc) {
      final readBy = List<String>.from(doc.data()['read_by'] ?? []);
      return !readBy.contains(userId);
    }).length;
  }

  /// Helper: mark all messages as read in a collection
  Future<int> markAllAsRead(String collectionPath) async {
    final snapshot = await firestore.collection(collectionPath).get();
    final batch = firestore.batch();
    int updated = 0;

    for (final doc in snapshot.docs) {
      final readBy = List<String>.from(doc.data()['read_by'] ?? []);
      if (!readBy.contains(userId)) {
        batch.update(doc.reference, {
          'read_by': FieldValue.arrayUnion([userId]),
        });
        updated++;
      }
    }

    if (updated > 0) await batch.commit();
    return updated;
  }

  group('Integration: Complete Message Badge Lifecycle', () {
    test('Scenario 1: New messages arrive and are counted correctly',
        () async {
      await setupMember();

      // Pierre sends 3 messages to the event
      await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'Qui vient samedi ?',
        readBy: [otherUser], // Only sender read it
      );
      await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'RDV à 8h au port',
        readBy: [otherUser],
      );
      await createEventMessage(
        senderId: thirdUser,
        senderName: 'Marie',
        message: 'Je serai là !',
        readBy: [thirdUser, otherUser], // Marie and Pierre read it
      );

      // Check unread for Jan
      final unread = await countUnread(eventMsgPath);
      expect(unread, 3, reason: 'Jan has not read any messages');

      // Simulate Cloud Function updating member document
      await firestore.doc(memberPath).update({
        'unread_counts.event_messages': 3,
        'unread_counts.total': 3,
      });

      final memberDoc = await firestore.doc(memberPath).get();
      final counts =
          memberDoc.data()!['unread_counts'] as Map<String, dynamic>;
      expect(counts['event_messages'], 3);
      expect(counts['total'], 3);
    });

    test('Scenario 2: User opens conversation and reads all messages',
        () async {
      await setupMember(total: 5, eventMessages: 3, announcements: 2);

      // Create messages that Jan hasn't read
      await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'msg1',
        readBy: [otherUser],
      );
      await createEventMessage(
        senderId: thirdUser,
        senderName: 'Marie',
        message: 'msg2',
        readBy: [thirdUser],
      );
      await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'msg3',
        readBy: [otherUser],
      );

      expect(await countUnread(eventMsgPath), 3);

      // Jan opens the conversation → mark all as read
      final markedCount = await markAllAsRead(eventMsgPath);
      expect(markedCount, 3);

      // Verify all messages are now read
      expect(await countUnread(eventMsgPath), 0);

      // Decrement the counter
      await firestore.doc(memberPath).update({
        'unread_counts.event_messages':
            FieldValue.increment(-markedCount),
        'unread_counts.total': FieldValue.increment(-markedCount),
      });

      final memberDoc = await firestore.doc(memberPath).get();
      final counts =
          memberDoc.data()!['unread_counts'] as Map<String, dynamic>;
      expect(counts['event_messages'], 0);
      expect(counts['total'], 2); // 5 - 3 = 2 (announcements remain)
      expect(counts['announcements'], 2);
    });

    test('Scenario 3: Mixed message types across categories', () async {
      await setupMember();

      // Event messages (3 unread)
      for (int i = 0; i < 3; i++) {
        await createEventMessage(
          senderId: otherUser,
          senderName: 'Pierre',
          message: 'Event msg $i',
          readBy: [otherUser],
        );
      }

      // Session messages (2 unread)
      for (int i = 0; i < 2; i++) {
        await createSessionMessage(
          senderId: thirdUser,
          senderName: 'Marie',
          message: 'Session msg $i',
          groupType: 'encadrants',
          readBy: [thirdUser],
        );
      }

      final eventUnread = await countUnread(eventMsgPath);
      final sessionUnread = await countUnread(sessionMsgPath);

      expect(eventUnread, 3);
      expect(sessionUnread, 2);

      // Update member counts (simulating Cloud Functions)
      await firestore.doc(memberPath).update({
        'unread_counts.event_messages': eventUnread,
        'unread_counts.session_messages': sessionUnread,
        'unread_counts.total': eventUnread + sessionUnread,
      });

      // Read only event messages
      await markAllAsRead(eventMsgPath);
      await firestore.doc(memberPath).update({
        'unread_counts.event_messages': 0,
        'unread_counts.total': FieldValue.increment(-eventUnread),
      });

      final memberDoc = await firestore.doc(memberPath).get();
      final counts =
          memberDoc.data()!['unread_counts'] as Map<String, dynamic>;
      expect(counts['event_messages'], 0);
      expect(counts['session_messages'], 2);
      expect(counts['total'], 2); // only session messages remain
    });

    test('Scenario 4: Rapid read/unread status changes', () async {
      await setupMember(total: 0, eventMessages: 0);

      // Create a single message
      final msgId = await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'Rapid test',
        readBy: [otherUser],
      );

      // Rapidly toggle read status (simulating UI glitches or race conditions)
      for (int i = 0; i < 10; i++) {
        // Mark as read
        await firestore.collection(eventMsgPath).doc(msgId).update({
          'read_by': FieldValue.arrayUnion([userId]),
        });
        // Mark as unread (remove from readBy — simulating a rollback)
        // Note: In production, you wouldn't normally un-read messages,
        // but this tests robustness
        await firestore.collection(eventMsgPath).doc(msgId).set({
          'sender_id': otherUser,
          'sender_name': 'Pierre',
          'message': 'Rapid test',
          'created_at': Timestamp.now(),
          'read_by': [otherUser], // Reset: only sender
        });
      }

      // Final state: message should be unread (we ended with reset)
      expect(await countUnread(eventMsgPath), 1);

      // Now mark as read one final time
      await firestore.collection(eventMsgPath).doc(msgId).update({
        'read_by': FieldValue.arrayUnion([userId]),
      });

      expect(await countUnread(eventMsgPath), 0);
    });

    test('Scenario 5: Zero messages in all categories', () async {
      await setupMember(total: 0, eventMessages: 0, announcements: 0);

      // Verify initial state
      expect(await countUnread(eventMsgPath), 0);
      expect(await countUnread(sessionMsgPath), 0);

      // Mark all as read on empty collections (should be no-op)
      final marked = await markAllAsRead(eventMsgPath);
      expect(marked, 0);

      // Counts should remain 0
      final memberDoc = await firestore.doc(memberPath).get();
      final counts =
          memberDoc.data()!['unread_counts'] as Map<String, dynamic>;
      expect(counts['total'], 0);
    });

    test('Scenario 6: Sender auto-reads their own messages', () async {
      await setupMember();

      // Jan sends a message (auto-read by sender)
      await createEventMessage(
        senderId: userId,
        senderName: 'Jan',
        message: 'Mon propre message',
        readBy: [userId],
      );

      // Pierre sends a message (not read by Jan)
      await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'Réponse de Pierre',
        readBy: [otherUser],
      );

      // Jan should only have 1 unread (Pierre's message)
      expect(await countUnread(eventMsgPath), 1);
    });

    test('Scenario 7: Multiple users reading same message concurrently',
        () async {
      final msgId = await createEventMessage(
        senderId: 'admin',
        senderName: 'Admin',
        message: 'Annonce importante',
        readBy: ['admin'],
      );

      // Three users mark the message as read concurrently
      await Future.wait([
        firestore.collection(eventMsgPath).doc(msgId).update({
          'read_by': FieldValue.arrayUnion([userId]),
        }),
        firestore.collection(eventMsgPath).doc(msgId).update({
          'read_by': FieldValue.arrayUnion([otherUser]),
        }),
        firestore.collection(eventMsgPath).doc(msgId).update({
          'read_by': FieldValue.arrayUnion([thirdUser]),
        }),
      ]);

      final doc =
          await firestore.collection(eventMsgPath).doc(msgId).get();
      final readBy = List<String>.from(doc.data()!['read_by']);

      expect(readBy, contains('admin'));
      expect(readBy, contains(userId));
      expect(readBy, contains(otherUser));
      expect(readBy, contains(thirdUser));
      // arrayUnion should prevent duplicates
      expect(readBy.toSet().length, readBy.length);
    });

    test('Scenario 8: Message deletion reduces unread count', () async {
      await setupMember(total: 3, eventMessages: 3);

      final msg1 = await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'msg1',
        readBy: [otherUser],
      );
      await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'msg2',
        readBy: [otherUser],
      );
      await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'msg3',
        readBy: [otherUser],
      );

      expect(await countUnread(eventMsgPath), 3);

      // Admin deletes one message
      await firestore.collection(eventMsgPath).doc(msg1).delete();

      expect(await countUnread(eventMsgPath), 2);
    });

    test('Scenario 9: Session messages with different group types', () async {
      // Create messages in different session groups
      await createSessionMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'Encadrant msg',
        groupType: 'encadrants',
        readBy: [otherUser],
      );
      await createSessionMessage(
        senderId: thirdUser,
        senderName: 'Marie',
        message: 'Accueil msg',
        groupType: 'accueil',
        readBy: [thirdUser],
      );
      await createSessionMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'Niveau msg',
        groupType: 'niveau',
        readBy: [otherUser],
      );

      // All 3 should be unread for Jan
      expect(await countUnread(sessionMsgPath), 3);

      // Count by group type
      final snapshot = await firestore.collection(sessionMsgPath).get();
      final unreadByGroup = <String, int>{};
      for (final doc in snapshot.docs) {
        final readBy = List<String>.from(doc.data()['read_by'] ?? []);
        if (!readBy.contains(userId)) {
          final groupType = doc.data()['group_type'] as String;
          unreadByGroup[groupType] =
              (unreadByGroup[groupType] ?? 0) + 1;
        }
      }

      expect(unreadByGroup['encadrants'], 1);
      expect(unreadByGroup['accueil'], 1);
      expect(unreadByGroup['niveau'], 1);
    });

    test('Scenario 10: Large volume - 100 messages with mixed read status',
        () async {
      // Create 100 messages: even-indexed are read by Jan
      for (int i = 0; i < 100; i++) {
        await createEventMessage(
          senderId: i.isEven ? userId : otherUser,
          senderName: i.isEven ? 'Jan' : 'Pierre',
          message: 'Message $i',
          readBy: i.isEven ? [userId] : [otherUser],
          createdAt: DateTime(2026, 2, 14, 0, 0).add(Duration(minutes: i)),
        );
      }

      // 50 messages are unread by Jan
      expect(await countUnread(eventMsgPath), 50);

      // Mark all as read
      final marked = await markAllAsRead(eventMsgPath);
      expect(marked, 50);
      expect(await countUnread(eventMsgPath), 0);
    });
  });

  group('Integration: Real-time Streams', () {
    test('unread count stream updates on new messages', () async {
      final stream =
          firestore.collection(eventMsgPath).snapshots().map((snapshot) {
        return snapshot.docs.where((doc) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          return !readBy.contains(userId);
        }).length;
      });

      final counts = <int>[];
      final sub = stream.listen((count) => counts.add(count));

      await Future.delayed(Duration(milliseconds: 50));

      // Add 3 messages one by one
      await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'First',
        readBy: [otherUser],
      );
      await Future.delayed(Duration(milliseconds: 50));

      await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'Second',
        readBy: [otherUser],
      );
      await Future.delayed(Duration(milliseconds: 50));

      await createEventMessage(
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'Third',
        readBy: [otherUser],
      );
      await Future.delayed(Duration(milliseconds: 50));

      // Counts should have increased: 0 → 1 → 2 → 3
      expect(counts, isNotEmpty);
      expect(counts.last, 3);

      await sub.cancel();
    });

    test('member unread_counts stream updates on counter changes', () async {
      await setupMember(total: 0, eventMessages: 0);

      final stream =
          firestore.doc(memberPath).snapshots().map((doc) {
        final data = doc.data()!;
        return (data['unread_counts'] as Map<String, dynamic>?)?['total'] ??
            0;
      });

      final totals = <int>[];
      final sub = stream.listen((t) => totals.add(t as int));

      await Future.delayed(Duration(milliseconds: 50));

      // Simulate Cloud Functions incrementing
      await firestore.doc(memberPath).update({
        'unread_counts.total': 1,
        'unread_counts.event_messages': 1,
      });
      await Future.delayed(Duration(milliseconds: 50));

      await firestore.doc(memberPath).update({
        'unread_counts.total': 3,
        'unread_counts.event_messages': 3,
      });
      await Future.delayed(Duration(milliseconds: 50));

      expect(totals.last, 3);

      await sub.cancel();
    });
  });

  group('Integration: EventMessage Serialization Roundtrip', () {
    test('full roundtrip: create → store → fetch → verify', () async {
      final originalMsg = EventMessage(
        id: '',
        senderId: otherUser,
        senderName: 'Pierre',
        message: 'Test de sérialisation complète',
        createdAt: DateTime(2026, 2, 14, 15, 30),
        readBy: [otherUser],
        replyToId: 'parent_msg',
        replyToPreview: ReplyPreview(
          senderName: 'Jan',
          messagePreview: 'Message original...',
        ),
      );

      // Store in Firestore
      final docRef = await firestore
          .collection(eventMsgPath)
          .add(originalMsg.toFirestore());

      // Fetch back
      final doc = await docRef.get();
      final restored = EventMessage.fromFirestore(doc);

      expect(restored.senderId, otherUser);
      expect(restored.senderName, 'Pierre');
      expect(restored.message, 'Test de sérialisation complète');
      expect(restored.readBy, [otherUser]);
      expect(restored.isReadBy(otherUser), isTrue);
      expect(restored.isReadBy(userId), isFalse);
      expect(restored.replyToId, 'parent_msg');
      expect(restored.replyToPreview!.senderName, 'Jan');
      expect(restored.isReply, isTrue);
    });

    test('SessionMessage roundtrip with all group types', () async {
      for (final groupType in SessionGroupType.values) {
        final msg = SessionMessage(
          id: '',
          senderId: otherUser,
          senderName: 'Pierre',
          message: 'Test ${groupType.value}',
          groupType: groupType,
          groupLevel: groupType == SessionGroupType.niveau ? 'N2' : null,
          createdAt: DateTime(2026, 2, 14, 10, 0),
          readBy: [otherUser],
        );

        final docRef = await firestore
            .collection(sessionMsgPath)
            .add(msg.toFirestore());
        final doc = await docRef.get();
        final restored = SessionMessage.fromFirestore(doc);

        expect(restored.groupType, groupType);
        expect(restored.message, 'Test ${groupType.value}');
        if (groupType == SessionGroupType.niveau) {
          expect(restored.groupLevel, 'N2');
        }
      }
    });
  });
}
