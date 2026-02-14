import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/foundation.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Testable UnreadCountProvider that mirrors production logic with injected Firestore.
class TestableUnreadCountProvider extends ChangeNotifier {
  final FakeFirebaseFirestore firestore;
  StreamSubscription? _subscription;
  Map<String, dynamic> _counts = {};
  bool _isListening = false;

  TestableUnreadCountProvider(this.firestore);

  int get total => (_counts['total'] as num?)?.toInt() ?? 0;
  int get announcements => (_counts['announcements'] as num?)?.toInt() ?? 0;
  int get eventMessages => (_counts['event_messages'] as num?)?.toInt() ?? 0;
  int get teamMessages => (_counts['team_messages'] as num?)?.toInt() ?? 0;
  int get sessionMessages =>
      (_counts['session_messages'] as num?)?.toInt() ?? 0;
  int get medicalCertificates =>
      (_counts['medical_certificates'] as num?)?.toInt() ?? 0;
  bool get isListening => _isListening;

  void listen(String clubId, String userId) {
    if (_isListening) return;
    _subscription = firestore
        .collection('clubs/$clubId/members')
        .doc(userId)
        .snapshots()
        .listen((doc) {
      if (doc.exists && doc.data() != null) {
        final data = doc.data()!;
        final newCounts =
            data['unread_counts'] as Map<String, dynamic>? ?? {};
        if (!_mapsAreEqual(_counts, newCounts)) {
          _counts = Map<String, dynamic>.from(newCounts);
          notifyListeners();
        }
      }
    });
    _isListening = true;
  }

  void stopListening() {
    _subscription?.cancel();
    _subscription = null;
    _isListening = false;
  }

  void clear() {
    stopListening();
    _counts = {};
    notifyListeners();
  }

  Future<void> decrementCategory({
    required String clubId,
    required String userId,
    required String category,
    int amount = 1,
  }) async {
    final currentValue = (_counts[category] as num?)?.toInt() ?? 0;
    final actualDecrement = amount > currentValue ? currentValue : amount;
    if (actualDecrement <= 0) return;

    await firestore
        .collection('clubs/$clubId/members')
        .doc(userId)
        .update({
      'unread_counts.$category': FieldValue.increment(-actualDecrement),
      'unread_counts.total': FieldValue.increment(-actualDecrement),
      'unread_counts.last_updated': FieldValue.serverTimestamp(),
    });
  }

  Future<void> resetCategory({
    required String clubId,
    required String userId,
    required String category,
  }) async {
    final currentValue = (_counts[category] as num?)?.toInt() ?? 0;
    if (currentValue <= 0) return;

    await firestore
        .collection('clubs/$clubId/members')
        .doc(userId)
        .update({
      'unread_counts.$category': 0,
      'unread_counts.total': FieldValue.increment(-currentValue),
      'unread_counts.last_updated': FieldValue.serverTimestamp(),
    });
  }

  bool _mapsAreEqual(Map<String, dynamic> a, Map<String, dynamic> b) {
    if (a.length != b.length) return false;
    for (final key in a.keys) {
      if (a[key] != b[key]) return false;
    }
    return true;
  }

  @override
  void dispose() {
    stopListening();
    super.dispose();
  }
}

void main() {
  const clubId = 'club1';
  const userId = 'user1';
  final memberPath = 'clubs/$clubId/members';

  group('Badge Cascade Tests - Full End-to-End Flow', () {
    late FakeFirebaseFirestore firestore;
    late TestableUnreadCountProvider provider;

    setUp(() async {
      firestore = FakeFirebaseFirestore();
      provider = TestableUnreadCountProvider(firestore);

      // Setup member doc with initial unread counts
      await firestore.collection(memberPath).doc(userId).set({
        'display_name': 'Test User',
        'unread_counts': {
          'total': 0,
          'announcements': 0,
          'event_messages': 0,
          'team_messages': 0,
          'session_messages': 0,
          'medical_certificates': 0,
        },
      });

      provider.listen(clubId, userId);
      // Allow listener to fire
      await Future.delayed(Duration.zero);
    });

    tearDown(() {
      provider.dispose();
    });

    group('Cascade A: Cloud Function increments → Provider reflects', () {
      test(
          'simulated Cloud Function increment on event_messages updates provider',
          () async {
        // Simulate what onNewEventMessage Cloud Function does
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': FieldValue.increment(1),
          'unread_counts.total': FieldValue.increment(1),
        });

        await Future.delayed(Duration.zero);

        expect(provider.eventMessages, 1);
        expect(provider.total, 1);
      });

      test('multiple Cloud Function increments across categories', () async {
        // Simulate 3 event messages
        for (int i = 0; i < 3; i++) {
          await firestore.collection(memberPath).doc(userId).update({
            'unread_counts.event_messages': FieldValue.increment(1),
            'unread_counts.total': FieldValue.increment(1),
          });
        }

        // Simulate 2 announcements
        for (int i = 0; i < 2; i++) {
          await firestore.collection(memberPath).doc(userId).update({
            'unread_counts.announcements': FieldValue.increment(1),
            'unread_counts.total': FieldValue.increment(1),
          });
        }

        // Simulate 1 team message
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.team_messages': FieldValue.increment(1),
          'unread_counts.total': FieldValue.increment(1),
        });

        await Future.delayed(Duration.zero);

        expect(provider.eventMessages, 3);
        expect(provider.announcements, 2);
        expect(provider.teamMessages, 1);
        expect(provider.sessionMessages, 0);
        expect(provider.total, 6);
      });

      test('session message increment updates piscine badge calculation',
          () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.session_messages': FieldValue.increment(4),
          'unread_counts.team_messages': FieldValue.increment(2),
          'unread_counts.total': FieldValue.increment(6),
        });

        await Future.delayed(Duration.zero);

        // Piscine badge = sessionMessages + teamMessages
        final piscineBadge = provider.sessionMessages + provider.teamMessages;
        expect(piscineBadge, 6);
        expect(provider.total, 6);
      });
    });

    group('Cascade B: User reads → markAsRead → decrement → badges update',
        () {
      setUp(() async {
        // Start with some unread messages
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 5,
          'unread_counts.announcements': 3,
          'unread_counts.team_messages': 2,
          'unread_counts.session_messages': 4,
          'unread_counts.total': 14,
        });
        await Future.delayed(Duration.zero);
      });

      test('reading event messages decrements event and total badges',
          () async {
        expect(provider.eventMessages, 5);
        expect(provider.total, 14);

        // User reads 3 event messages
        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
          amount: 3,
        );
        await Future.delayed(Duration.zero);

        expect(provider.eventMessages, 2);
        expect(provider.total, 11);
        // Other categories unchanged
        expect(provider.announcements, 3);
        expect(provider.teamMessages, 2);
        expect(provider.sessionMessages, 4);
      });

      test('reading all announcements brings badge to zero', () async {
        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'announcements',
          amount: 3,
        );
        await Future.delayed(Duration.zero);

        expect(provider.announcements, 0);
        expect(provider.total, 11);
      });

      test('resetCategory sets category to 0 and decrements total', () async {
        await provider.resetCategory(
          clubId: clubId,
          userId: userId,
          category: 'session_messages',
        );
        await Future.delayed(Duration.zero);

        expect(provider.sessionMessages, 0);
        expect(provider.total, 10); // 14 - 4
      });
    });

    group('Cascade C: Full lifecycle - new message to read to zero', () {
      test('event message lifecycle: create → badge appears → read → badge disappears',
          () async {
        // Phase 1: Initial state - no unread
        expect(provider.total, 0);
        expect(provider.eventMessages, 0);

        // Phase 2: Cloud Function creates 2 messages (simulated)
        final opId = 'op1';
        final messagesPath = 'clubs/$clubId/operations/$opId/messages';

        // Add messages to Firestore (simulated as Cloud Function writing)
        await firestore.collection(messagesPath).add({
          'sender_id': 'sender1',
          'sender_name': 'Alice',
          'message': 'Hello team',
          'created_at': Timestamp.now(),
          'read_by': ['sender1'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'sender1',
          'sender_name': 'Alice',
          'message': 'Meeting at 3pm',
          'created_at': Timestamp.now(),
          'read_by': ['sender1'],
        });

        // Cloud Function increments badge for userId
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': FieldValue.increment(2),
          'unread_counts.total': FieldValue.increment(2),
        });
        await Future.delayed(Duration.zero);

        // Phase 3: Badges appear
        expect(provider.eventMessages, 2);
        expect(provider.total, 2);

        // Phase 4: User opens event → marks as read
        // Count unread messages for this user
        final snapshot = await firestore.collection(messagesPath).get();
        int unreadCount = 0;
        final batch = firestore.batch();
        for (final doc in snapshot.docs) {
          final readBy =
              List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            batch.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
            unreadCount++;
          }
        }
        await batch.commit();

        expect(unreadCount, 2);

        // Phase 5: Decrement badges
        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
          amount: unreadCount,
        );
        await Future.delayed(Duration.zero);

        // Phase 6: Badges disappear
        expect(provider.eventMessages, 0);
        expect(provider.total, 0);

        // Phase 7: Verify messages are actually marked read in Firestore
        final updated = await firestore.collection(messagesPath).get();
        for (final doc in updated.docs) {
          expect(doc.data()['read_by'], contains(userId));
        }
      });

      test('announcement lifecycle: create → read announcement → read replies → zero',
          () async {
        final announcementsPath = 'clubs/$clubId/announcements';

        // Phase 1: Cloud function creates announcement + increments badge
        final announcementRef =
            await firestore.collection(announcementsPath).add({
          'title': 'Pool closed tomorrow',
          'message': 'Maintenance work scheduled',
          'sender_id': 'admin1',
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': ['admin1'],
          'reply_count': 0,
        });

        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.announcements': FieldValue.increment(1),
          'unread_counts.total': FieldValue.increment(1),
        });
        await Future.delayed(Duration.zero);

        expect(provider.announcements, 1);
        expect(provider.total, 1);

        // Phase 2: Someone replies → another increment
        await firestore
            .collection('$announcementsPath/${announcementRef.id}/replies')
            .add({
          'sender_id': 'user2',
          'sender_name': 'Bob',
          'message': 'Thanks for the info!',
          'created_at': Timestamp.now(),
          'read_by': ['user2'],
        });

        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.announcements': FieldValue.increment(1),
          'unread_counts.total': FieldValue.increment(1),
        });
        await Future.delayed(Duration.zero);

        expect(provider.announcements, 2);
        expect(provider.total, 2);

        // Phase 3: User opens announcement detail → marks announcement + replies as read
        // Mark announcement as read
        await firestore
            .collection(announcementsPath)
            .doc(announcementRef.id)
            .update({
          'read_by': FieldValue.arrayUnion([userId]),
        });

        // Mark all replies as read
        final repliesSnapshot = await firestore
            .collection('$announcementsPath/${announcementRef.id}/replies')
            .get();
        final replyBatch = firestore.batch();
        int unreadReplies = 0;
        for (final doc in repliesSnapshot.docs) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            replyBatch.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
            unreadReplies++;
          }
        }
        await replyBatch.commit();

        // Decrement: 1 for announcement + unreadReplies
        final totalToDecrement = 1 + unreadReplies;
        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'announcements',
          amount: totalToDecrement,
        );
        await Future.delayed(Duration.zero);

        // Phase 4: All badges cleared
        expect(provider.announcements, 0);
        expect(provider.total, 0);
      });

      test('team message lifecycle: send → badge → open chat → markAllAsRead → zero',
          () async {
        final channelId = 'equipe_encadrants';
        final messagesPath =
            'clubs/$clubId/team_channels/$channelId/messages';

        // Phase 1: 3 messages sent by others
        for (int i = 0; i < 3; i++) {
          await firestore.collection(messagesPath).add({
            'sender_id': 'sender${i + 1}',
            'sender_name': 'User ${i + 1}',
            'message': 'Message $i',
            'created_at': Timestamp.now(),
            'read_by': ['sender${i + 1}'],
          });
        }

        // Cloud Function increments
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.team_messages': FieldValue.increment(3),
          'unread_counts.total': FieldValue.increment(3),
        });
        await Future.delayed(Duration.zero);

        expect(provider.teamMessages, 3);

        // Phase 2: User opens team chat → markAllAsRead
        final snapshot = await firestore.collection(messagesPath).get();
        final batch = firestore.batch();
        int unread = 0;
        for (final doc in snapshot.docs) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            batch.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
            unread++;
          }
        }
        await batch.commit();

        expect(unread, 3);

        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'team_messages',
          amount: unread,
        );
        await Future.delayed(Duration.zero);

        expect(provider.teamMessages, 0);
        expect(provider.total, 0);
      });

      test('session message lifecycle: multiple groups → read one group → partial decrement',
          () async {
        final sessionId = 'session1';
        final messagesPath =
            'clubs/$clubId/piscine_sessions/$sessionId/messages';

        // Phase 1: Messages in different groups
        // 2 accueil messages
        for (int i = 0; i < 2; i++) {
          await firestore.collection(messagesPath).add({
            'sender_id': 'other',
            'sender_name': 'Other',
            'message': 'Accueil msg $i',
            'group_type': 'accueil',
            'created_at': Timestamp.now(),
            'read_by': ['other'],
          });
        }

        // 3 encadrants messages
        for (int i = 0; i < 3; i++) {
          await firestore.collection(messagesPath).add({
            'sender_id': 'other',
            'sender_name': 'Other',
            'message': 'Encadrants msg $i',
            'group_type': 'encadrants',
            'created_at': Timestamp.now(),
            'read_by': ['other'],
          });
        }

        // Total: 5 session messages
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.session_messages': FieldValue.increment(5),
          'unread_counts.total': FieldValue.increment(5),
        });
        await Future.delayed(Duration.zero);

        expect(provider.sessionMessages, 5);

        // Phase 2: User opens only accueil chat → reads 2 messages
        final accueilSnapshot = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'accueil')
            .get();
        final batch = firestore.batch();
        int accueilUnread = 0;
        for (final doc in accueilSnapshot.docs) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            batch.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
            accueilUnread++;
          }
        }
        await batch.commit();

        expect(accueilUnread, 2);

        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'session_messages',
          amount: accueilUnread,
        );
        await Future.delayed(Duration.zero);

        // Phase 3: Partial decrement — encadrants still unread
        expect(provider.sessionMessages, 3);
        expect(provider.total, 3);

        // Phase 4: User opens encadrants chat → reads remaining
        final encadrantsSnapshot = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'encadrants')
            .get();
        final batch2 = firestore.batch();
        int encadrantsUnread = 0;
        for (final doc in encadrantsSnapshot.docs) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            batch2.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
            encadrantsUnread++;
          }
        }
        await batch2.commit();

        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'session_messages',
          amount: encadrantsUnread,
        );
        await Future.delayed(Duration.zero);

        expect(provider.sessionMessages, 0);
        expect(provider.total, 0);
      });
    });

    group('Cascade D: Multi-category simultaneous updates', () {
      test('simultaneous updates across all 5 categories', () async {
        // All categories get messages at once
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 3,
          'unread_counts.announcements': 2,
          'unread_counts.team_messages': 1,
          'unread_counts.session_messages': 4,
          'unread_counts.medical_certificates': 1,
          'unread_counts.total': 11,
        });
        await Future.delayed(Duration.zero);

        expect(provider.total, 11);
        expect(provider.eventMessages, 3);
        expect(provider.announcements, 2);
        expect(provider.teamMessages, 1);
        expect(provider.sessionMessages, 4);
        expect(provider.medicalCertificates, 1);

        // Piscine combined badge
        final piscineBadge = provider.sessionMessages + provider.teamMessages;
        expect(piscineBadge, 5);
      });

      test('reading in one category does not affect others', () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 3,
          'unread_counts.announcements': 2,
          'unread_counts.total': 5,
        });
        await Future.delayed(Duration.zero);

        // Read all events
        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
          amount: 3,
        );
        await Future.delayed(Duration.zero);

        // Events cleared, announcements unchanged
        expect(provider.eventMessages, 0);
        expect(provider.announcements, 2);
        expect(provider.total, 2);
      });
    });

    group('Cascade E: Badge hide/show logic', () {
      test('badge should be hidden when count reaches zero', () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 1,
          'unread_counts.total': 1,
        });
        await Future.delayed(Duration.zero);

        // Badge visible
        expect(provider.eventMessages > 0, isTrue);

        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
          amount: 1,
        );
        await Future.delayed(Duration.zero);

        // Badge hidden
        expect(provider.eventMessages, 0);
        expect(provider.total, 0);
      });

      test('over-decrement is prevented', () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 2,
          'unread_counts.total': 2,
        });
        await Future.delayed(Duration.zero);

        // Try to decrement by 10 when only 2 exist
        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
          amount: 10,
        );
        await Future.delayed(Duration.zero);

        expect(provider.eventMessages, 0);
        expect(provider.total, 0);
      });

      test('decrement with zero amount does nothing', () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 3,
          'unread_counts.total': 3,
        });
        await Future.delayed(Duration.zero);

        int notifyCount = 0;
        provider.addListener(() => notifyCount++);

        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
          amount: 0,
        );
        await Future.delayed(Duration.zero);

        expect(provider.eventMessages, 3);
      });
    });

    group('Cascade F: App icon badge (total) integrity', () {
      test('app icon badge = sum of all categories', () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 3,
          'unread_counts.announcements': 2,
          'unread_counts.team_messages': 1,
          'unread_counts.session_messages': 4,
          'unread_counts.medical_certificates': 1,
          'unread_counts.total': 11,
        });
        await Future.delayed(Duration.zero);

        final calculatedTotal = provider.eventMessages +
            provider.announcements +
            provider.teamMessages +
            provider.sessionMessages +
            provider.medicalCertificates;

        expect(provider.total, calculatedTotal);
      });

      test('sequential decrements keep total in sync', () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 5,
          'unread_counts.announcements': 3,
          'unread_counts.total': 8,
        });
        await Future.delayed(Duration.zero);

        // Decrement events by 2
        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
          amount: 2,
        );
        await Future.delayed(Duration.zero);

        expect(provider.total, 6);

        // Decrement announcements by 1
        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'announcements',
          amount: 1,
        );
        await Future.delayed(Duration.zero);

        expect(provider.total, 5);
        expect(provider.eventMessages, 3);
        expect(provider.announcements, 2);
      });
    });

    group('Cascade G: Listener lifecycle', () {
      test('clear resets all counts and stops listening', () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 5,
          'unread_counts.total': 5,
        });
        await Future.delayed(Duration.zero);

        expect(provider.eventMessages, 5);
        expect(provider.isListening, isTrue);

        provider.clear();

        expect(provider.eventMessages, 0);
        expect(provider.total, 0);
        expect(provider.isListening, isFalse);
      });

      test('stopListening pauses updates but keeps last state', () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 3,
          'unread_counts.total': 3,
        });
        await Future.delayed(Duration.zero);

        expect(provider.eventMessages, 3);

        provider.stopListening();

        // Update Firestore after stopping
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 10,
          'unread_counts.total': 10,
        });
        await Future.delayed(Duration.zero);

        // Provider still shows old value
        expect(provider.eventMessages, 3);
        expect(provider.isListening, isFalse);
      });

      test('re-listen picks up current state', () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 3,
          'unread_counts.total': 3,
        });
        await Future.delayed(Duration.zero);

        provider.stopListening();

        // Update while not listening
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.event_messages': 7,
          'unread_counts.total': 7,
        });

        // Re-listen
        provider.listen(clubId, userId);
        await Future.delayed(Duration.zero);

        expect(provider.eventMessages, 7);
        expect(provider.total, 7);
      });
    });

    group('Cascade H: Piscine combined badge', () {
      test('piscine badge combines team + session messages', () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.team_messages': 3,
          'unread_counts.session_messages': 7,
          'unread_counts.total': 10,
        });
        await Future.delayed(Duration.zero);

        final piscineBadge = provider.teamMessages + provider.sessionMessages;
        expect(piscineBadge, 10);
      });

      test('reading team messages partially decrements piscine badge',
          () async {
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.team_messages': 3,
          'unread_counts.session_messages': 7,
          'unread_counts.total': 10,
        });
        await Future.delayed(Duration.zero);

        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'team_messages',
          amount: 3,
        );
        await Future.delayed(Duration.zero);

        final piscineBadge = provider.teamMessages + provider.sessionMessages;
        expect(piscineBadge, 7);
        expect(provider.teamMessages, 0);
        expect(provider.sessionMessages, 7);
      });
    });
  });
}
