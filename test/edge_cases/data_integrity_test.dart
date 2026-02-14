import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

void main() {
  const clubId = 'club1';
  const userId = 'user1';
  final memberPath = 'clubs/$clubId/members';

  group('Data Integrity & Edge Case Tests', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    // ========== Missing/Corrupt Data ==========

    group('missing or corrupt data', () {
      test('member doc has no unread_counts field', () async {
        await firestore.collection(memberPath).doc(userId).set({
          'display_name': 'User',
          // No unread_counts field!
        });

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        final data = doc.data()!;
        final unreadCounts =
            data['unread_counts'] as Map<String, dynamic>? ?? {};

        // Should default to empty/0
        expect(unreadCounts, isEmpty);
        expect((unreadCounts['total'] as num?)?.toInt() ?? 0, 0);
        expect((unreadCounts['event_messages'] as num?)?.toInt() ?? 0, 0);
      });

      test('unread_counts missing individual categories', () async {
        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 3,
            'event_messages': 3,
            // Missing: announcements, team_messages, session_messages, medical_certificates
          },
        });

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        final counts =
            doc.data()!['unread_counts'] as Map<String, dynamic>;

        expect((counts['announcements'] as num?)?.toInt() ?? 0, 0);
        expect((counts['team_messages'] as num?)?.toInt() ?? 0, 0);
        expect((counts['session_messages'] as num?)?.toInt() ?? 0, 0);
        expect((counts['medical_certificates'] as num?)?.toInt() ?? 0, 0);
      });

      test('member doc does not exist at all', () async {
        final doc =
            await firestore.collection(memberPath).doc('nonexistent').get();
        expect(doc.exists, isFalse);
      });

      test('message with no read_by field', () async {
        final messagesPath =
            'clubs/$clubId/operations/op1/messages';

        await firestore.collection(messagesPath).add({
          'sender_id': 'sender',
          'message': 'Test',
          'created_at': Timestamp.now(),
          // No read_by field!
        });

        final snapshot = await firestore.collection(messagesPath).get();
        final doc = snapshot.docs.first;

        // Should safely default to empty
        final readBy =
            (doc.data()['read_by'] as List<dynamic>?)?.cast<String>() ?? [];
        expect(readBy, isEmpty);
        expect(readBy.contains(userId), isFalse);
      });

      test('message with null read_by', () async {
        final messagesPath =
            'clubs/$clubId/operations/op1/messages';

        await firestore.collection(messagesPath).add({
          'sender_id': 'sender',
          'message': 'Test',
          'created_at': Timestamp.now(),
          'read_by': null,
        });

        final snapshot = await firestore.collection(messagesPath).get();
        final readBy = List<String>.from(
            snapshot.docs.first.data()['read_by'] ?? []);
        expect(readBy, isEmpty);
      });
    });

    // ========== Total Out of Sync ==========

    group('total out of sync with categories', () {
      test('total less than sum of categories (data corruption)', () async {
        // This can happen due to race conditions or bugs
        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 3, // Should be 5
            'event_messages': 2,
            'announcements': 1,
            'team_messages': 2,
          },
        });

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        final counts =
            doc.data()!['unread_counts'] as Map<String, dynamic>;

        final calculatedTotal =
            ((counts['event_messages'] as num?)?.toInt() ?? 0) +
                ((counts['announcements'] as num?)?.toInt() ?? 0) +
                ((counts['team_messages'] as num?)?.toInt() ?? 0) +
                ((counts['session_messages'] as num?)?.toInt() ?? 0) +
                ((counts['medical_certificates'] as num?)?.toInt() ?? 0);

        // Provider would show total=3, but actual should be 5
        // This is a known potential issue
        expect(counts['total'], isNot(equals(calculatedTotal)));
      });
    });

    // ========== Negative Counter Protection ==========

    group('negative counter protection', () {
      test('decrement larger than current value: clamps to 0', () async {
        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 2,
            'event_messages': 2,
          },
        });

        // Client-side protection (from UnreadCountProvider.decrementCategory)
        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        final counts =
            doc.data()!['unread_counts'] as Map<String, dynamic>;
        final currentValue =
            (counts['event_messages'] as num?)?.toInt() ?? 0;
        final requestedDecrement = 10;
        final actualDecrement = requestedDecrement > currentValue
            ? currentValue
            : requestedDecrement;

        expect(actualDecrement, 2); // Clamped to current value

        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages':
              FieldValue.increment(-actualDecrement),
          'unread_counts.total': FieldValue.increment(-actualDecrement),
        });

        final after =
            await firestore.collection(memberPath).doc(userId).get();
        expect(after.data()!['unread_counts']['event_messages'], 0);
        expect(after.data()!['unread_counts']['total'], 0);
      });

      test('decrement when already at 0: does nothing', () async {
        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 0,
            'event_messages': 0,
          },
        });

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        final currentValue = (doc.data()!['unread_counts']
                ['event_messages'] as num?)
            ?.toInt() ??
            0;

        final actualDecrement = 5 > currentValue ? currentValue : 5;
        expect(actualDecrement, 0);

        // Should not execute any update
        if (actualDecrement > 0) {
          fail('Should not reach here');
        }
      });
    });

    // ========== Large read_by Arrays ==========

    group('large read_by arrays', () {
      test('message read by 100 users', () async {
        final messagesPath =
            'clubs/$clubId/operations/op1/messages';
        final manyUsers = List.generate(100, (i) => 'user_$i');

        await firestore.collection(messagesPath).add({
          'sender_id': 'sender',
          'message': 'Popular message',
          'created_at': Timestamp.now(),
          'read_by': manyUsers,
        });

        final snapshot = await firestore.collection(messagesPath).get();
        final readBy =
            List<String>.from(snapshot.docs.first.data()['read_by']);

        expect(readBy.length, 100);
        expect(readBy.contains('user_0'), isTrue);
        expect(readBy.contains('user_99'), isTrue);
        expect(readBy.contains('nonexistent'), isFalse);
      });
    });

    // ========== Doubles vs Ints ==========

    group('Firestore number types', () {
      test('doubles are safely converted to int for badge display', () async {
        // Firestore can return doubles for integer fields
        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 5.0,
            'event_messages': 3.0,
          },
        });

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        final counts =
            doc.data()!['unread_counts'] as Map<String, dynamic>;

        // Using the same pattern as UnreadCountProvider
        final total = (counts['total'] as num?)?.toInt() ?? 0;
        final events = (counts['event_messages'] as num?)?.toInt() ?? 0;

        expect(total, 5);
        expect(events, 3);
      });
    });

    // ========== Orphaned Messages ==========

    group('orphaned messages', () {
      test('messages exist but event document is deleted', () async {
        final opPath = 'clubs/$clubId/operations/deleted_op';
        final messagesPath = '$opPath/messages';

        // Messages exist but no operation doc
        await firestore.collection(messagesPath).add({
          'sender_id': 'sender',
          'message': 'Orphaned message',
          'created_at': Timestamp.now(),
          'read_by': [],
        });

        // Operation does not exist
        final opDoc = await firestore
            .collection('clubs/$clubId/operations')
            .doc('deleted_op')
            .get();
        expect(opDoc.exists, isFalse);

        // Messages still readable
        final msgSnapshot = await firestore.collection(messagesPath).get();
        expect(msgSnapshot.docs.length, 1);
      });

      test('replies exist but announcement is deleted', () async {
        final repliesPath =
            'clubs/$clubId/announcements/deleted_ann/replies';

        await firestore.collection(repliesPath).add({
          'sender_id': 'user',
          'message': 'Orphaned reply',
          'created_at': Timestamp.now(),
          'read_by': [],
        });

        // Announcement does not exist
        final annDoc = await firestore
            .collection('clubs/$clubId/announcements')
            .doc('deleted_ann')
            .get();
        expect(annDoc.exists, isFalse);

        // Replies still readable
        final replySnapshot =
            await firestore.collection(repliesPath).get();
        expect(replySnapshot.docs.length, 1);
      });
    });

    // ========== Medical Certificates ==========

    group('medical_certificates counter', () {
      test('increment and read medical_certificates', () async {
        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 0,
            'medical_certificates': 0,
          },
        });

        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.medical_certificates': FieldValue.increment(1),
          'unread_counts.total': FieldValue.increment(1),
        });

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        expect(doc.data()!['unread_counts']['medical_certificates'], 1);
        expect(doc.data()!['unread_counts']['total'], 1);
      });
    });

    // ========== Empty Collections ==========

    group('empty collection handling', () {
      test('empty messages collection returns 0 unread', () async {
        final snapshot = await firestore
            .collection('clubs/$clubId/operations/op1/messages')
            .get();
        expect(snapshot.docs.length, 0);

        final unreadCount = snapshot.docs.where((doc) {
          final readBy =
              List<String>.from(doc.data()['read_by'] ?? []);
          return !readBy.contains(userId);
        }).length;

        expect(unreadCount, 0);
      });

      test('empty announcements collection returns 0 unread', () async {
        final snapshot = await firestore
            .collection('clubs/$clubId/announcements')
            .get();
        expect(snapshot.docs.length, 0);
      });

      test('empty team channel messages returns 0 unread', () async {
        final snapshot = await firestore
            .collection(
                'clubs/$clubId/team_channels/equipe_accueil/messages')
            .get();
        expect(snapshot.docs.length, 0);
      });
    });

    // ========== Very Large Counts ==========

    group('very large counts', () {
      test('badge handles large number (999+)', () async {
        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 1500,
            'event_messages': 500,
            'announcements': 300,
            'team_messages': 400,
            'session_messages': 300,
          },
        });

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        final total = (doc.data()!['unread_counts']['total'] as num).toInt();

        expect(total, 1500);
        // UI should display "99+" but data should be accurate
      });
    });
  });
}
