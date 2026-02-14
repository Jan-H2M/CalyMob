import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/foundation.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Standalone testable provider that does NOT extend UnreadCountProvider
/// (which would trigger FirebaseFirestore.instance in its constructor).
/// Instead, it reimplements the same logic using a fake Firestore.
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
  int get sessionMessages => (_counts['session_messages'] as num?)?.toInt() ?? 0;
  int get medicalCertificates => (_counts['medical_certificates'] as num?)?.toInt() ?? 0;
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
        final newCounts = data['unread_counts'] as Map<String, dynamic>? ?? {};
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

  group('UnreadCountProvider - Unit Tests', () {
    late FakeFirebaseFirestore fakeFirestore;
    late TestableUnreadCountProvider provider;

    setUp(() {
      fakeFirestore = FakeFirebaseFirestore();
      provider = TestableUnreadCountProvider(fakeFirestore);
    });

    tearDown(() {
      provider.dispose();
    });

    group('initial state', () {
      test('all counters start at zero', () {
        expect(provider.total, 0);
        expect(provider.announcements, 0);
        expect(provider.eventMessages, 0);
        expect(provider.teamMessages, 0);
        expect(provider.sessionMessages, 0);
        expect(provider.medicalCertificates, 0);
        expect(provider.isListening, isFalse);
      });
    });

    group('listening to Firestore', () {
      test('updates counters when Firestore document changes', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {
            'total': 7,
            'announcements': 2,
            'event_messages': 3,
            'team_messages': 1,
            'session_messages': 1,
          }
        });

        int notifyCount = 0;
        provider.addListener(() => notifyCount++);
        provider.listen(clubId, userId);

        await Future.delayed(Duration(milliseconds: 100));

        expect(provider.total, 7);
        expect(provider.announcements, 2);
        expect(provider.eventMessages, 3);
        expect(provider.teamMessages, 1);
        expect(provider.sessionMessages, 1);
        expect(notifyCount, greaterThanOrEqualTo(1));
      });

      test('updates reactively on Firestore changes', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {'total': 3, 'event_messages': 3}
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 100));
        expect(provider.eventMessages, 3);

        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).update({
          'unread_counts.total': 5,
          'unread_counts.event_messages': 5,
        });
        await Future.delayed(Duration(milliseconds: 100));

        expect(provider.eventMessages, 5);
        expect(provider.total, 5);
      });

      test('handles missing unread_counts field gracefully', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'name': 'Jan',
          'email': 'jan@test.com',
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 100));

        expect(provider.total, 0);
        expect(provider.eventMessages, 0);
      });
    });

    group('clear', () {
      test('resets all counters to zero and stops listening', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {'total': 5, 'event_messages': 5}
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 100));
        expect(provider.total, 5);

        provider.clear();

        expect(provider.total, 0);
        expect(provider.eventMessages, 0);
        expect(provider.isListening, isFalse);
      });
    });

    group('decrementCategory', () {
      test('decrements counter in Firestore', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {'total': 5, 'event_messages': 3}
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 100));

        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
          amount: 2,
        );

        final doc = await fakeFirestore.collection('clubs/$clubId/members').doc(userId).get();
        final counts = doc.data()!['unread_counts'] as Map<String, dynamic>;
        expect(counts['event_messages'], 1);
        expect(counts['total'], 3);
      });

      test('does not decrement below zero', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {'total': 2, 'event_messages': 2}
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 100));

        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
          amount: 5,
        );

        final doc = await fakeFirestore.collection('clubs/$clubId/members').doc(userId).get();
        final counts = doc.data()!['unread_counts'] as Map<String, dynamic>;
        expect(counts['event_messages'], 0);
        expect(counts['total'], 0);
      });

      test('does nothing when counter is already zero', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {'total': 0, 'event_messages': 0}
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 100));

        await provider.decrementCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
          amount: 1,
        );

        final doc = await fakeFirestore.collection('clubs/$clubId/members').doc(userId).get();
        final counts = doc.data()!['unread_counts'] as Map<String, dynamic>;
        expect(counts['event_messages'], 0);
      });
    });

    group('resetCategory', () {
      test('resets category to zero and decrements total', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {'total': 10, 'event_messages': 4, 'announcements': 6}
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 100));

        await provider.resetCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
        );

        final doc = await fakeFirestore.collection('clubs/$clubId/members').doc(userId).get();
        final counts = doc.data()!['unread_counts'] as Map<String, dynamic>;
        expect(counts['event_messages'], 0);
        expect(counts['total'], 6);
      });

      test('does nothing when category is already zero', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {'total': 3, 'event_messages': 0, 'announcements': 3}
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 100));

        await provider.resetCategory(
          clubId: clubId,
          userId: userId,
          category: 'event_messages',
        );

        final doc = await fakeFirestore.collection('clubs/$clubId/members').doc(userId).get();
        final counts = doc.data()!['unread_counts'] as Map<String, dynamic>;
        expect(counts['total'], 3);
      });
    });

    group('edge cases', () {
      test('handles rapid sequential updates', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {'total': 0, 'event_messages': 0}
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 50));

        for (int i = 1; i <= 10; i++) {
          await fakeFirestore.collection('clubs/$clubId/members').doc(userId).update({
            'unread_counts.total': i,
            'unread_counts.event_messages': i,
          });
        }

        await Future.delayed(Duration(milliseconds: 200));
        expect(provider.eventMessages, 10);
        expect(provider.total, 10);
      });

      test('handles very large unread counts', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {'total': 9999, 'event_messages': 5000, 'announcements': 4999}
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 100));

        expect(provider.total, 9999);
        expect(provider.eventMessages, 5000);
      });

      test('handles counters stored as doubles', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {'total': 5.0, 'event_messages': 3.0}
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 100));

        expect(provider.total, 5);
        expect(provider.eventMessages, 3);
      });

      test('multiple categories update independently', () async {
        await fakeFirestore.collection('clubs/$clubId/members').doc(userId).set({
          'unread_counts': {
            'total': 15,
            'event_messages': 5,
            'announcements': 4,
            'team_messages': 3,
            'session_messages': 2,
            'medical_certificates': 1,
          }
        });

        provider.listen(clubId, userId);
        await Future.delayed(Duration(milliseconds: 100));

        expect(provider.total, 15);
        expect(provider.eventMessages, 5);
        expect(provider.announcements, 4);
        expect(provider.teamMessages, 3);
        expect(provider.sessionMessages, 2);
        expect(provider.medicalCertificates, 1);
      });
    });
  });
}
