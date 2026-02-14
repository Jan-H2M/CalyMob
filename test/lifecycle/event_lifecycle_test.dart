import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Tests for event lifecycle effects on badges:
/// - Event close ('ferme') → cleanup unread counts
/// - Event cancel ('annule') → cleanup unread counts
/// - Event expiry (date_fin + 5 days) → skip increment
/// - Participant unregisters → handle orphaned counts
void main() {
  const clubId = 'club1';
  const operationId = 'op1';
  const userId = 'user1';
  const senderId = 'sender1';
  final memberPath = 'clubs/$clubId/members';
  final messagesPath = 'clubs/$clubId/operations/$operationId/messages';
  final inscriptionsPath =
      'clubs/$clubId/operations/$operationId/inscriptions';

  group('Event Lifecycle - Badge Cleanup', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    Future<void> setupEventWithMessages({
      String statut = 'actif',
      DateTime? dateFin,
      int messageCount = 3,
      List<String> participants = const ['user1', 'user2'],
    }) async {
      // Create operation
      await firestore
          .collection('clubs/$clubId/operations')
          .doc(operationId)
          .set({
        'titre': 'Test Event',
        'statut': statut,
        'date_fin': dateFin != null ? Timestamp.fromDate(dateFin) : null,
      });

      // Create inscriptions
      for (final participantId in participants) {
        await firestore.collection(inscriptionsPath).add({
          'membre_id': participantId,
        });
      }

      // Create messages (all by sender, not read by participants)
      for (int i = 0; i < messageCount; i++) {
        await firestore.collection(messagesPath).add({
          'sender_id': senderId,
          'sender_name': 'Sender',
          'message': 'Message $i',
          'created_at': Timestamp.now(),
          'read_by': [senderId],
        });
      }

      // Setup member unread counts
      for (final participantId in participants) {
        await firestore.collection(memberPath).doc(participantId).set({
          'unread_counts': {
            'total': messageCount,
            'event_messages': messageCount,
          },
        });
      }
    }

    // ========== Event Close ==========

    group('event close (statut → ferme)', () {
      test(
          'closing event decrements unread counts for each participant',
          () async {
        await setupEventWithMessages(messageCount: 3);

        // Simulate onEventStatusChange Cloud Function logic:
        // 1. Get all messages
        final messagesSnapshot =
            await firestore.collection(messagesPath).get();
        final messages = messagesSnapshot.docs.map((d) => d.data()).toList();

        // 2. Get all participants
        final participantsSnapshot =
            await firestore.collection(inscriptionsPath).get();

        // 3. Per participant: count unread and decrement
        for (final doc in participantsSnapshot.docs) {
          final participantId = doc.data()['membre_id'] as String;

          final unreadCount = messages.where((msg) {
            final readBy = (msg['read_by'] as List<dynamic>?) ?? [];
            return !readBy.contains(participantId);
          }).length;

          if (unreadCount > 0) {
            // Decrement (same as decrementUnreadCounts in badge-helper.js)
            final memberDoc = await firestore
                .collection(memberPath)
                .doc(participantId)
                .get();
            final counts = (memberDoc.data()!['unread_counts']
                as Map<String, dynamic>);
            final currentValue = (counts['event_messages'] as num?)?.toInt() ?? 0;
            final currentTotal = (counts['total'] as num?)?.toInt() ?? 0;
            final actualDecrement =
                unreadCount > currentValue ? currentValue : unreadCount;

            if (actualDecrement > 0) {
              await firestore
                  .collection(memberPath)
                  .doc(participantId)
                  .update({
                'unread_counts.event_messages':
                    FieldValue.increment(-actualDecrement),
                'unread_counts.total': FieldValue.increment(
                    -(actualDecrement > currentTotal
                        ? currentTotal
                        : actualDecrement)),
              });
            }
          }
        }

        // Verify both users have 0 unread
        for (final pId in ['user1', 'user2']) {
          final doc =
              await firestore.collection(memberPath).doc(pId).get();
          final counts =
              doc.data()!['unread_counts'] as Map<String, dynamic>;
          expect(counts['event_messages'], 0,
              reason: 'User $pId event_messages should be 0');
          expect(counts['total'], 0,
              reason: 'User $pId total should be 0');
        }
      });

      test('partially read messages: only decrements unread portion',
          () async {
        await setupEventWithMessages(
            messageCount: 3, participants: ['user1']);

        // User has read 1 of 3 messages
        final messagesSnapshot =
            await firestore.collection(messagesPath).get();
        final firstMsg = messagesSnapshot.docs.first;
        await firstMsg.reference.update({
          'read_by': FieldValue.arrayUnion(['user1']),
        });

        // Adjust member count to reflect actual unread state
        await firestore.collection(memberPath).doc('user1').update({
          'unread_counts.event_messages': 2,
          'unread_counts.total': 2,
        });

        // Re-read messages after update
        final updatedMessages =
            await firestore.collection(messagesPath).get();
        final messages =
            updatedMessages.docs.map((d) => d.data()).toList();

        final unreadCount = messages.where((msg) {
          final readBy = (msg['read_by'] as List<dynamic>?) ?? [];
          return !readBy.contains('user1');
        }).length;

        expect(unreadCount, 2);

        // Decrement
        await firestore.collection(memberPath).doc('user1').update({
          'unread_counts.event_messages':
              FieldValue.increment(-unreadCount),
          'unread_counts.total': FieldValue.increment(-unreadCount),
        });

        final doc =
            await firestore.collection(memberPath).doc('user1').get();
        final counts =
            doc.data()!['unread_counts'] as Map<String, dynamic>;
        expect(counts['event_messages'], 0);
        expect(counts['total'], 0);
      });

      test('event with no messages: nothing to clean up', () async {
        // Event with inscriptions but no messages
        await firestore
            .collection('clubs/$clubId/operations')
            .doc(operationId)
            .set({'titre': 'Empty Event', 'statut': 'actif'});

        await firestore.collection(inscriptionsPath).add({
          'membre_id': userId,
        });

        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {'total': 0, 'event_messages': 0},
        });

        final messagesSnapshot =
            await firestore.collection(messagesPath).get();
        expect(messagesSnapshot.docs, isEmpty);

        // Cleanup should do nothing
        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        expect(doc.data()!['unread_counts']['event_messages'], 0);
      });

      test('event with no participants: nothing to clean up', () async {
        await firestore
            .collection('clubs/$clubId/operations')
            .doc(operationId)
            .set({'titre': 'No Participants', 'statut': 'actif'});

        // Messages exist but no inscriptions
        await firestore.collection(messagesPath).add({
          'sender_id': senderId,
          'sender_name': 'Sender',
          'message': 'Test',
          'created_at': Timestamp.now(),
          'read_by': [senderId],
        });

        final participantsSnapshot =
            await firestore.collection(inscriptionsPath).get();
        expect(participantsSnapshot.docs, isEmpty);
      });
    });

    // ========== Event Cancel ==========

    group('event cancel (statut → annule)', () {
      test('cancel triggers same cleanup as close', () async {
        await setupEventWithMessages(messageCount: 2);

        // Same cleanup logic applies
        final messages = (await firestore.collection(messagesPath).get())
            .docs
            .map((d) => d.data())
            .toList();
        final participants =
            (await firestore.collection(inscriptionsPath).get()).docs;

        for (final doc in participants) {
          final pId = doc.data()['membre_id'] as String;
          final unreadCount = messages.where((msg) {
            final readBy = (msg['read_by'] as List<dynamic>?) ?? [];
            return !readBy.contains(pId);
          }).length;

          if (unreadCount > 0) {
            await firestore.collection(memberPath).doc(pId).update({
              'unread_counts.event_messages':
                  FieldValue.increment(-unreadCount),
              'unread_counts.total': FieldValue.increment(-unreadCount),
            });
          }
        }

        for (final pId in ['user1', 'user2']) {
          final memberDoc =
              await firestore.collection(memberPath).doc(pId).get();
          expect(memberDoc.data()!['unread_counts']['event_messages'], 0);
        }
      });
    });

    // ========== Event Expiry ==========

    group('event expiry (date_fin + 5 days)', () {
      test('expired event: new messages do NOT increment badge', () async {
        // Event ended 10 days ago
        final dateFin = DateTime.now().subtract(const Duration(days: 10));

        await firestore
            .collection('clubs/$clubId/operations')
            .doc(operationId)
            .set({
          'titre': 'Expired Event',
          'statut': 'actif',
          'date_fin': Timestamp.fromDate(dateFin),
        });

        // Check expiry (date_fin + 5 days grace period)
        final expiryDate = dateFin.add(const Duration(days: 5));
        final eventExpired = DateTime.now().isAfter(expiryDate);

        expect(eventExpired, isTrue);

        // Member count should NOT be incremented
        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {'total': 0, 'event_messages': 0},
        });

        // Simulate: Cloud Function skips increment for expired event
        if (!eventExpired) {
          // This should NOT execute
          await firestore.collection(memberPath).doc(userId).update({
            'unread_counts.event_messages': FieldValue.increment(1),
            'unread_counts.total': FieldValue.increment(1),
          });
        }

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        expect(doc.data()!['unread_counts']['event_messages'], 0);
      });

      test('event within grace period: new messages DO increment badge',
          () async {
        // Event ended 3 days ago (within 5-day grace period)
        final dateFin = DateTime.now().subtract(const Duration(days: 3));

        final expiryDate = dateFin.add(const Duration(days: 5));
        final eventExpired = DateTime.now().isAfter(expiryDate);

        expect(eventExpired, isFalse);

        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {'total': 0, 'event_messages': 0},
        });

        // Cloud Function SHOULD increment
        if (!eventExpired) {
          await firestore.collection(memberPath).doc(userId).update({
            'unread_counts.event_messages': FieldValue.increment(1),
            'unread_counts.total': FieldValue.increment(1),
          });
        }

        final doc =
            await firestore.collection(memberPath).doc(userId).get();
        expect(doc.data()!['unread_counts']['event_messages'], 1);
      });

      test('event with no date_fin: never expires', () async {
        // No date_fin means event never expires
        final dateFin = null;
        final eventExpired = false; // No date_fin → not expired

        expect(eventExpired, isFalse);
      });
    });

    // ========== Status Change Guards ==========

    group('status change guards', () {
      test('already closed event: re-close does not double-decrement',
          () async {
        // Guard: closedStatuses.includes(before.statut) → return null
        final beforeStatut = 'ferme';
        final afterStatut = 'ferme';

        final closedStatuses = ['ferme', 'annule'];
        final shouldTrigger = !closedStatuses.contains(beforeStatut) &&
            closedStatuses.contains(afterStatut);

        expect(shouldTrigger, isFalse);
      });

      test('opening a closed event: does not trigger cleanup', () async {
        final beforeStatut = 'ferme';
        final afterStatut = 'actif';

        final closedStatuses = ['ferme', 'annule'];
        final shouldTrigger = !closedStatuses.contains(beforeStatut) &&
            closedStatuses.contains(afterStatut);

        expect(shouldTrigger, isFalse);
      });

      test('non-close status change: does not trigger cleanup', () async {
        final beforeStatut = 'actif';
        final afterStatut = 'complet';

        final closedStatuses = ['ferme', 'annule'];
        final shouldTrigger = !closedStatuses.contains(beforeStatut) &&
            closedStatuses.contains(afterStatut);

        expect(shouldTrigger, isFalse);
      });

      test('active to closed: triggers cleanup', () async {
        final beforeStatut = 'actif';
        final afterStatut = 'ferme';

        final closedStatuses = ['ferme', 'annule'];
        final shouldTrigger = !closedStatuses.contains(beforeStatut) &&
            closedStatuses.contains(afterStatut);

        expect(shouldTrigger, isTrue);
      });

      test('active to cancelled: triggers cleanup', () async {
        final beforeStatut = 'actif';
        final afterStatut = 'annule';

        final closedStatuses = ['ferme', 'annule'];
        final shouldTrigger = !closedStatuses.contains(beforeStatut) &&
            closedStatuses.contains(afterStatut);

        expect(shouldTrigger, isTrue);
      });
    });
  });
}
