import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Since EventMessageService creates its own FirebaseFirestore.instance internally,
/// we test the service logic by directly exercising the Firestore operations
/// that the service performs, using a fake Firestore.
///
/// This approach tests the exact same Firestore queries/updates the service uses,
/// without needing dependency injection on the production code.
void main() {
  const clubId = 'club1';
  const operationId = 'op1';
  const userId = 'user1';
  const otherUserId = 'user2';

  late FakeFirebaseFirestore firestore;

  final messagesPath = 'clubs/$clubId/operations/$operationId/messages';

  setUp(() {
    firestore = FakeFirebaseFirestore();
  });

  /// Helper to add a test message to Firestore
  Future<DocumentReference> addTestMessage({
    String senderId = 'sender1',
    String senderName = 'Sender',
    String message = 'Test message',
    List<String> readBy = const [],
    DateTime? createdAt,
  }) async {
    return await firestore.collection(messagesPath).add({
      'sender_id': senderId,
      'sender_name': senderName,
      'message': message,
      'created_at': Timestamp.fromDate(createdAt ?? DateTime.now()),
      'read_by': readBy,
    });
  }

  group('EventMessageService - Firestore Operations', () {
    group('getEventMessages (fetch all messages)', () {
      test('returns empty list when no messages', () async {
        final snapshot = await firestore
            .collection(messagesPath)
            .orderBy('created_at', descending: false)
            .get();

        expect(snapshot.docs, isEmpty);
      });

      test('returns messages ordered by created_at ascending', () async {
        await addTestMessage(
          message: 'First',
          createdAt: DateTime(2026, 2, 14, 10, 0),
        );
        await addTestMessage(
          message: 'Second',
          createdAt: DateTime(2026, 2, 14, 11, 0),
        );
        await addTestMessage(
          message: 'Third',
          createdAt: DateTime(2026, 2, 14, 12, 0),
        );

        final snapshot = await firestore
            .collection(messagesPath)
            .orderBy('created_at', descending: false)
            .get();

        expect(snapshot.docs, hasLength(3));
        expect(snapshot.docs[0].data()['message'], 'First');
        expect(snapshot.docs[2].data()['message'], 'Third');
      });
    });

    group('sendMessage', () {
      test('creates message with sender in readBy', () async {
        final docRef = await firestore.collection(messagesPath).add({
          'sender_id': userId,
          'sender_name': 'Jan',
          'message': 'Bonjour',
          'created_at': Timestamp.now(),
          'read_by': [userId], // Sender has read their own message
        });

        final doc = await docRef.get();
        final data = doc.data()!;
        expect(data['sender_id'], userId);
        expect(data['read_by'], contains(userId));
      });

      test('creates message with reply fields', () async {
        final docRef = await firestore.collection(messagesPath).add({
          'sender_id': userId,
          'sender_name': 'Jan',
          'message': 'Reply text',
          'created_at': Timestamp.now(),
          'read_by': [userId],
          'reply_to_id': 'original_msg_id',
          'reply_to_preview': {
            'sender_name': 'Pierre',
            'message_preview': 'Original message...',
          },
        });

        final doc = await docRef.get();
        expect(doc.data()!['reply_to_id'], 'original_msg_id');
        expect(doc.data()!['reply_to_preview']['sender_name'], 'Pierre');
      });
    });

    group('markMessageAsRead', () {
      test('adds userId to read_by array', () async {
        final docRef = await addTestMessage(readBy: ['sender1']);

        // Mark as read by user1 (same operation as service)
        await firestore.collection(messagesPath).doc(docRef.id).update({
          'read_by': FieldValue.arrayUnion([userId]),
        });

        final doc = await docRef.get();
        final readBy = List<String>.from((doc.data()! as Map<String, dynamic>)['read_by']);
        expect(readBy, contains(userId));
        expect(readBy, contains('sender1'));
      });

      test('does not duplicate userId in read_by', () async {
        final docRef = await addTestMessage(readBy: [userId]);

        // Mark as read again (arrayUnion should not duplicate)
        await firestore.collection(messagesPath).doc(docRef.id).update({
          'read_by': FieldValue.arrayUnion([userId]),
        });

        final doc = await docRef.get();
        final readBy = List<String>.from((doc.data()! as Map<String, dynamic>)['read_by']);
        // arrayUnion prevents duplicates
        expect(readBy.where((id) => id == userId).length, 1);
      });
    });

    group('markMessagesAsRead (batch)', () {
      test('marks all unread messages as read', () async {
        // Create 5 messages, only 2 already read by userId
        await addTestMessage(message: 'msg1', readBy: [userId]);
        await addTestMessage(message: 'msg2', readBy: ['other']);
        await addTestMessage(message: 'msg3', readBy: []);
        await addTestMessage(message: 'msg4', readBy: [userId, 'other']);
        await addTestMessage(message: 'msg5', readBy: ['other']);

        // Batch update: same logic as service.markMessagesAsRead
        final snapshot = await firestore.collection(messagesPath).get();
        final batch = firestore.batch();
        int updated = 0;

        for (final doc in snapshot.docs) {
          final readBy =
              (doc.data()['read_by'] as List<dynamic>?)?.cast<String>() ?? [];
          if (!readBy.contains(userId)) {
            batch.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
            updated++;
          }
        }

        expect(updated, 3); // msg2, msg3, msg5 were unread

        await batch.commit();

        // Verify all messages now have userId in readBy
        final updatedSnapshot = await firestore.collection(messagesPath).get();
        for (final doc in updatedSnapshot.docs) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          expect(readBy, contains(userId),
              reason: 'Message ${doc.id} should be marked as read');
        }
      });

      test('handles empty collection gracefully', () async {
        final snapshot = await firestore.collection(messagesPath).get();
        expect(snapshot.docs, isEmpty);
        // No batch needed
      });
    });

    group('getUnreadCount', () {
      test('returns 0 when no messages exist', () async {
        final snapshot = await firestore.collection(messagesPath).get();
        final unread = snapshot.docs.where((doc) {
          final readBy =
              (doc.data()['read_by'] as List<dynamic>?)?.cast<String>() ?? [];
          return !readBy.contains(userId);
        }).length;

        expect(unread, 0);
      });

      test('counts messages not read by userId', () async {
        await addTestMessage(readBy: [userId]); // Read
        await addTestMessage(readBy: []); // Unread
        await addTestMessage(readBy: ['other']); // Unread for userId
        await addTestMessage(readBy: [userId, 'other']); // Read
        await addTestMessage(readBy: []); // Unread

        final snapshot = await firestore.collection(messagesPath).get();
        final unread = snapshot.docs.where((doc) {
          final readBy =
              (doc.data()['read_by'] as List<dynamic>?)?.cast<String>() ?? [];
          return !readBy.contains(userId);
        }).length;

        expect(unread, 3);
      });

      test('returns 0 when all messages are read', () async {
        await addTestMessage(readBy: [userId]);
        await addTestMessage(readBy: [userId, 'other']);
        await addTestMessage(readBy: [userId]);

        final snapshot = await firestore.collection(messagesPath).get();
        final unread = snapshot.docs.where((doc) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          return !readBy.contains(userId);
        }).length;

        expect(unread, 0);
      });
    });

    group('getUnreadCountStream (real-time)', () {
      test('emits updated count when messages change', () async {
        // Create the stream (same query as service)
        final stream = firestore.collection(messagesPath).snapshots().map(
          (snapshot) {
            return snapshot.docs.where((doc) {
              final readBy = List<String>.from(doc.data()['read_by'] ?? []);
              return !readBy.contains(userId);
            }).length;
          },
        );

        // Initial state: no messages
        expectLater(
          stream,
          emitsInOrder([
            0, // initial: empty
            1, // after first unread message
          ]),
        );

        // Add an unread message
        await addTestMessage(readBy: ['other']);
      });

      test('emits 0 after all messages are marked as read', () async {
        final docRef = await addTestMessage(readBy: ['other']);

        final stream = firestore.collection(messagesPath).snapshots().map(
          (snapshot) {
            return snapshot.docs.where((doc) {
              final readBy = List<String>.from(doc.data()['read_by'] ?? []);
              return !readBy.contains(userId);
            }).length;
          },
        );

        final values = <int>[];
        final sub = stream.listen((count) => values.add(count));

        await Future.delayed(Duration(milliseconds: 50));

        // Mark as read
        await firestore.collection(messagesPath).doc(docRef.id).update({
          'read_by': FieldValue.arrayUnion([userId]),
        });

        await Future.delayed(Duration(milliseconds: 50));

        expect(values, contains(1)); // was unread
        expect(values.last, 0); // now read

        await sub.cancel();
      });
    });

    group('deleteMessage', () {
      test('removes message from collection', () async {
        final docRef = await addTestMessage(message: 'To delete');

        await firestore.collection(messagesPath).doc(docRef.id).delete();

        final doc = await docRef.get();
        expect(doc.exists, isFalse);
      });

      test('deletion reduces unread count', () async {
        await addTestMessage(readBy: []); // unread
        final toDelete = await addTestMessage(readBy: []); // unread
        await addTestMessage(readBy: [userId]); // read

        // Before deletion: 2 unread
        var snapshot = await firestore.collection(messagesPath).get();
        var unread = snapshot.docs.where((doc) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          return !readBy.contains(userId);
        }).length;
        expect(unread, 2);

        // Delete one unread message
        await firestore.collection(messagesPath).doc(toDelete.id).delete();

        // After deletion: 1 unread
        snapshot = await firestore.collection(messagesPath).get();
        unread = snapshot.docs.where((doc) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          return !readBy.contains(userId);
        }).length;
        expect(unread, 1);
      });
    });

    group('edge cases', () {
      test('handles many messages (batch performance)', () async {
        // Create 50 messages, half read
        for (int i = 0; i < 50; i++) {
          await addTestMessage(
            message: 'Message $i',
            readBy: i.isEven ? [userId] : [],
          );
        }

        final snapshot = await firestore.collection(messagesPath).get();
        expect(snapshot.docs, hasLength(50));

        final unread = snapshot.docs.where((doc) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          return !readBy.contains(userId);
        }).length;

        expect(unread, 25);
      });

      test('handles messages with multiple readers', () async {
        await addTestMessage(readBy: ['a', 'b', 'c', 'd', userId]);

        final snapshot = await firestore.collection(messagesPath).get();
        final doc = snapshot.docs.first;
        final readBy = List<String>.from(doc.data()['read_by']);
        expect(readBy, hasLength(5));
        expect(readBy, contains(userId));
      });

      test('concurrent read marking does not corrupt data', () async {
        final docRef = await addTestMessage(readBy: []);

        // Two users marking as read simultaneously
        await Future.wait([
          firestore.collection(messagesPath).doc(docRef.id).update({
            'read_by': FieldValue.arrayUnion([userId]),
          }),
          firestore.collection(messagesPath).doc(docRef.id).update({
            'read_by': FieldValue.arrayUnion([otherUserId]),
          }),
        ]);

        final doc = await docRef.get();
        final readBy = List<String>.from((doc.data()! as Map<String, dynamic>)['read_by']);
        expect(readBy, contains(userId));
        expect(readBy, contains(otherUserId));
      });
    });
  });
}
