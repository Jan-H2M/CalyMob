import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/foundation.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

void main() {
  const clubId = 'club1';
  const userId = 'user1';
  final memberPath = 'clubs/$clubId/members';

  group('Concurrency & Race Condition Tests', () {
    late FakeFirebaseFirestore firestore;

    setUp(() async {
      firestore = FakeFirebaseFirestore();
      await firestore.collection(memberPath).doc(userId).set({
        'unread_counts': {
          'total': 0,
          'announcements': 0,
          'event_messages': 0,
          'team_messages': 0,
          'session_messages': 0,
          'medical_certificates': 0,
        },
      });
    });

    // ========== Simultaneous Increments ==========

    group('simultaneous increments', () {
      test('multiple simultaneous increments on same category', () async {
        // Simulate 5 Cloud Functions firing at the same time
        final futures = <Future>[];
        for (int i = 0; i < 5; i++) {
          futures.add(
            firestore.collection(memberPath).doc(userId).update({
              'unread_counts.event_messages': FieldValue.increment(1),
              'unread_counts.total': FieldValue.increment(1),
            }),
          );
        }

        await Future.wait(futures);

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        final counts =
            doc.data()!['unread_counts'] as Map<String, dynamic>;

        // FieldValue.increment is atomic, all should apply
        expect(counts['event_messages'], 5);
        expect(counts['total'], 5);
      });

      test('simultaneous increments across different categories', () async {
        await Future.wait([
          firestore.collection(memberPath).doc(userId).update({
            'unread_counts.event_messages': FieldValue.increment(1),
            'unread_counts.total': FieldValue.increment(1),
          }),
          firestore.collection(memberPath).doc(userId).update({
            'unread_counts.announcements': FieldValue.increment(1),
            'unread_counts.total': FieldValue.increment(1),
          }),
          firestore.collection(memberPath).doc(userId).update({
            'unread_counts.team_messages': FieldValue.increment(1),
            'unread_counts.total': FieldValue.increment(1),
          }),
        ]);

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        final counts =
            doc.data()!['unread_counts'] as Map<String, dynamic>;

        expect(counts['event_messages'], 1);
        expect(counts['announcements'], 1);
        expect(counts['team_messages'], 1);
        expect(counts['total'], 3);
      });
    });

    // ========== Read While New Messages Arrive ==========

    group('read while new messages arrive', () {
      test('reading messages while new ones are added', () async {
        // Setup: 3 unread messages
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 3,
          'unread_counts.total': 3,
        });

        // User reads 3 messages (decrement 3)
        // At the same time, 2 new messages arrive (increment 2)
        await Future.wait([
          firestore.collection(memberPath).doc(userId).update({
            'unread_counts.event_messages': FieldValue.increment(-3),
            'unread_counts.total': FieldValue.increment(-3),
          }),
          firestore.collection(memberPath).doc(userId).update({
            'unread_counts.event_messages': FieldValue.increment(2),
            'unread_counts.total': FieldValue.increment(2),
          }),
        ]);

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        final counts =
            doc.data()!['unread_counts'] as Map<String, dynamic>;

        // Net result: 3 - 3 + 2 = 2
        expect(counts['event_messages'], 2);
        expect(counts['total'], 2);
      });
    });

    // ========== Batch Limits ==========

    group('batch limits', () {
      test('Firestore batch limit of 500: handles correctly', () async {
        // badge-helper.js handles batches of 500
        // Test the batching logic
        const totalRecipients = 750;
        const batchSize = 500;

        final batches = <List<int>>[];
        for (int i = 0; i < totalRecipients; i += batchSize) {
          final end = (i + batchSize > totalRecipients)
              ? totalRecipients
              : i + batchSize;
          batches.add(List.generate(end - i, (j) => i + j));
        }

        expect(batches.length, 2);
        expect(batches[0].length, 500);
        expect(batches[1].length, 250);
      });

      test('large batch mark-as-read (50 messages)', () async {
        final messagesPath =
            'clubs/$clubId/operations/op1/messages';

        // Create 50 messages
        for (int i = 0; i < 50; i++) {
          await firestore.collection(messagesPath).add({
            'sender_id': 'sender',
            'message': 'Message $i',
            'created_at': Timestamp.now(),
            'read_by': ['sender'],
          });
        }

        // Mark all as read in batch
        final snapshot = await firestore.collection(messagesPath).get();
        expect(snapshot.docs.length, 50);

        final batch = firestore.batch();
        int updated = 0;
        for (final doc in snapshot.docs) {
          final readBy =
              List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            batch.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
            updated++;
          }
        }
        await batch.commit();

        expect(updated, 50);

        // Verify all are read
        final after = await firestore.collection(messagesPath).get();
        for (final doc in after.docs) {
          expect(
              List<String>.from(doc.data()['read_by']), contains(userId));
        }
      });
    });

    // ========== Decrement Race Protection ==========

    group('decrement race protection', () {
      test('simultaneous decrements are safe with FieldValue.increment',
          () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 10,
          'unread_counts.total': 10,
        });

        // Two screens decrement simultaneously
        await Future.wait([
          firestore.collection(memberPath).doc(userId).update({
            'unread_counts.event_messages': FieldValue.increment(-3),
            'unread_counts.total': FieldValue.increment(-3),
          }),
          firestore.collection(memberPath).doc(userId).update({
            'unread_counts.event_messages': FieldValue.increment(-2),
            'unread_counts.total': FieldValue.increment(-2),
          }),
        ]);

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        final counts =
            doc.data()!['unread_counts'] as Map<String, dynamic>;

        expect(counts['event_messages'], 5);
        expect(counts['total'], 5);
      });

      test('markAsRead idempotent: second call on same messages does nothing',
          () async {
        final messagesPath =
            'clubs/$clubId/operations/op1/messages';

        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Test',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });

        // First mark-as-read
        var snapshot = await firestore.collection(messagesPath).get();
        int firstCount = 0;
        for (final doc in snapshot.docs) {
          final readBy =
              List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            await doc.reference.update({
              'read_by': FieldValue.arrayUnion([userId]),
            });
            firstCount++;
          }
        }
        expect(firstCount, 1);

        // Second mark-as-read (should find 0 unread)
        snapshot = await firestore.collection(messagesPath).get();
        int secondCount = 0;
        for (final doc in snapshot.docs) {
          final readBy =
              List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            secondCount++;
          }
        }
        expect(secondCount, 0);
      });
    });

    // ========== Provider Notification Deduplication ==========

    group('provider notification deduplication', () {
      test('_mapsAreEqual prevents redundant rebuilds', () {
        bool mapsAreEqual(Map<String, dynamic> a, Map<String, dynamic> b) {
          if (a.length != b.length) return false;
          for (final key in a.keys) {
            if (a[key] != b[key]) return false;
          }
          return true;
        }

        // Same maps → no rebuild
        expect(
          mapsAreEqual(
            {'total': 5, 'event_messages': 3},
            {'total': 5, 'event_messages': 3},
          ),
          isTrue,
        );

        // Different values → rebuild
        expect(
          mapsAreEqual(
            {'total': 5, 'event_messages': 3},
            {'total': 6, 'event_messages': 3},
          ),
          isFalse,
        );

        // Different keys → rebuild
        expect(
          mapsAreEqual(
            {'total': 5},
            {'total': 5, 'event_messages': 0},
          ),
          isFalse,
        );

        // Both empty → no rebuild
        expect(mapsAreEqual({}, {}), isTrue);
      });
    });
  });
}
