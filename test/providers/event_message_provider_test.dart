import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/foundation.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:calymob/models/event_message.dart';

/// Standalone testable provider that does NOT extend EventMessageProvider
/// (which would trigger EventMessageService → FirebaseFirestore.instance).
/// Instead, it reimplements the same state management logic for testing.
class TestableEventMessageProvider extends ChangeNotifier {
  final Map<String, List<EventMessage>> _messagesByOperation = {};
  final Map<String, bool> _loadingByOperation = {};
  final Map<String, String?> _errorByOperation = {};
  final Map<String, bool> _isParticipantByOperation = {};

  List<EventMessage> getMessages(String operationId) {
    return _messagesByOperation[operationId] ?? [];
  }

  bool isLoading(String operationId) {
    return _loadingByOperation[operationId] ?? false;
  }

  String? getError(String operationId) {
    return _errorByOperation[operationId];
  }

  bool isParticipant(String operationId) {
    return _isParticipantByOperation[operationId] ?? false;
  }

  void setMessages(String operationId, List<EventMessage> messages) {
    _messagesByOperation[operationId] = messages;
    notifyListeners();
  }

  void setLoading(String operationId, bool loading) {
    _loadingByOperation[operationId] = loading;
    notifyListeners();
  }

  void setError(String operationId, String? error) {
    _errorByOperation[operationId] = error;
    notifyListeners();
  }

  void setParticipant(String operationId, bool isParticipant) {
    _isParticipantByOperation[operationId] = isParticipant;
    notifyListeners();
  }

  void clearError(String operationId) {
    _errorByOperation[operationId] = null;
    notifyListeners();
  }

  void clearOperationData(String operationId) {
    _messagesByOperation.remove(operationId);
    _loadingByOperation.remove(operationId);
    _errorByOperation.remove(operationId);
    _isParticipantByOperation.remove(operationId);
    notifyListeners();
  }

  void deleteMessage(String operationId, String messageId) {
    _messagesByOperation[operationId]?.removeWhere((m) => m.id == messageId);
    notifyListeners();
  }
}

void main() {
  const clubId = 'club1';
  const operationId = 'op1';
  const userId = 'user1';

  group('EventMessageProvider - State Management', () {
    late TestableEventMessageProvider provider;

    setUp(() {
      provider = TestableEventMessageProvider();
    });

    tearDown(() {
      provider.dispose();
    });

    group('initial state', () {
      test('returns empty messages for unknown operation', () {
        expect(provider.getMessages('unknown'), isEmpty);
      });

      test('isLoading is false for unknown operation', () {
        expect(provider.isLoading('unknown'), isFalse);
      });

      test('error is null for unknown operation', () {
        expect(provider.getError('unknown'), isNull);
      });

      test('isParticipant is false for unknown operation', () {
        expect(provider.isParticipant('unknown'), isFalse);
      });
    });

    group('state setters and notification', () {
      test('setMessages stores and notifies', () {
        int notifyCount = 0;
        provider.addListener(() => notifyCount++);

        final messages = [
          EventMessage(
            id: 'msg1',
            senderId: 'sender1',
            senderName: 'Sender',
            message: 'Hello',
            createdAt: DateTime.now(),
            readBy: [],
          ),
        ];

        provider.setMessages(operationId, messages);

        expect(provider.getMessages(operationId), hasLength(1));
        expect(provider.getMessages(operationId).first.message, 'Hello');
        expect(notifyCount, 1);
      });

      test('setLoading stores and notifies', () {
        int notifyCount = 0;
        provider.addListener(() => notifyCount++);

        provider.setLoading(operationId, true);
        expect(provider.isLoading(operationId), isTrue);
        expect(notifyCount, 1);

        provider.setLoading(operationId, false);
        expect(provider.isLoading(operationId), isFalse);
        expect(notifyCount, 2);
      });

      test('setError stores and notifies', () {
        int notifyCount = 0;
        provider.addListener(() => notifyCount++);

        provider.setError(operationId, 'Something went wrong');
        expect(provider.getError(operationId), 'Something went wrong');
        expect(notifyCount, 1);
      });

      test('setParticipant stores and notifies', () {
        int notifyCount = 0;
        provider.addListener(() => notifyCount++);

        provider.setParticipant(operationId, true);
        expect(provider.isParticipant(operationId), isTrue);
        expect(notifyCount, 1);
      });
    });

    group('clearOperationData', () {
      test('removes all cached data for an operation', () {
        // Pre-populate some state
        provider.setMessages(operationId, [
          EventMessage(
            id: 'msg1',
            senderId: 'sender1',
            senderName: 'Sender',
            message: 'Hello',
            createdAt: DateTime.now(),
            readBy: [],
          ),
        ]);
        provider.setLoading(operationId, true);
        provider.setError(operationId, 'some error');
        provider.setParticipant(operationId, true);

        int notifyCount = 0;
        provider.addListener(() => notifyCount++);

        provider.clearOperationData(operationId);

        expect(provider.getMessages(operationId), isEmpty);
        expect(provider.isLoading(operationId), isFalse);
        expect(provider.getError(operationId), isNull);
        expect(provider.isParticipant(operationId), isFalse);
        expect(notifyCount, 1);
      });

      test('does not affect other operations', () {
        provider.setMessages('op_other', [
          EventMessage(
            id: 'msg2',
            senderId: 'sender1',
            senderName: 'Sender',
            message: 'Other op',
            createdAt: DateTime.now(),
            readBy: [],
          ),
        ]);
        provider.setMessages(operationId, [
          EventMessage(
            id: 'msg1',
            senderId: 'sender1',
            senderName: 'Sender',
            message: 'This op',
            createdAt: DateTime.now(),
            readBy: [],
          ),
        ]);

        provider.clearOperationData(operationId);

        expect(provider.getMessages(operationId), isEmpty);
        expect(provider.getMessages('op_other'), hasLength(1));
      });
    });

    group('clearError', () {
      test('clears error and notifies listeners', () {
        provider.setError(operationId, 'some error');

        int notifyCount = 0;
        provider.addListener(() => notifyCount++);

        provider.clearError(operationId);

        expect(provider.getError(operationId), isNull);
        expect(notifyCount, 1);
      });
    });

    group('deleteMessage', () {
      test('removes message from local cache', () {
        provider.setMessages(operationId, [
          EventMessage(
            id: 'msg1',
            senderId: 'sender1',
            senderName: 'Sender',
            message: 'Keep',
            createdAt: DateTime.now(),
            readBy: [],
          ),
          EventMessage(
            id: 'msg2',
            senderId: 'sender1',
            senderName: 'Sender',
            message: 'Delete me',
            createdAt: DateTime.now(),
            readBy: [],
          ),
        ]);

        int notifyCount = 0;
        provider.addListener(() => notifyCount++);

        provider.deleteMessage(operationId, 'msg2');

        expect(provider.getMessages(operationId), hasLength(1));
        expect(provider.getMessages(operationId).first.id, 'msg1');
        expect(notifyCount, 1);
      });

      test('does nothing when message not found', () {
        provider.setMessages(operationId, [
          EventMessage(
            id: 'msg1',
            senderId: 'sender1',
            senderName: 'Sender',
            message: 'Keep',
            createdAt: DateTime.now(),
            readBy: [],
          ),
        ]);

        provider.deleteMessage(operationId, 'nonexistent');

        expect(provider.getMessages(operationId), hasLength(1));
      });
    });

    group('multi-operation isolation', () {
      test('operations are independent', () {
        provider.setLoading('op1', true);
        provider.setLoading('op2', false);
        provider.setError('op1', 'error1');
        provider.setParticipant('op2', true);

        expect(provider.isLoading('op1'), isTrue);
        expect(provider.isLoading('op2'), isFalse);
        expect(provider.getError('op1'), 'error1');
        expect(provider.getError('op2'), isNull);
        expect(provider.isParticipant('op1'), isFalse);
        expect(provider.isParticipant('op2'), isTrue);
      });
    });
  });

  group('EventMessageProvider - Mark As Read Flow', () {
    /// Test the mark-as-read flow by simulating the Firestore operations
    /// that the provider coordinates between EventMessageService and UnreadCountProvider
    late FakeFirebaseFirestore firestore;

    final messagesPath = 'clubs/$clubId/operations/$operationId/messages';

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    Future<void> addTestMessage({
      String message = 'Test',
      List<String> readBy = const [],
    }) async {
      await firestore.collection(messagesPath).add({
        'sender_id': 'sender1',
        'sender_name': 'Sender',
        'message': message,
        'created_at': Timestamp.now(),
        'read_by': readBy,
      });
    }

    test('markAsRead flow: counts unread, marks all, decrements counter',
        () async {
      // Setup: 3 messages, 1 already read by userId
      await addTestMessage(message: 'msg1', readBy: [userId]);
      await addTestMessage(message: 'msg2', readBy: ['other']);
      await addTestMessage(message: 'msg3', readBy: []);

      // Step 1: Count unread (same as service.getUnreadCount)
      final snapshot = await firestore.collection(messagesPath).get();
      final unreadCount = snapshot.docs.where((doc) {
        final readBy =
            (doc.data()['read_by'] as List<dynamic>?)?.cast<String>() ?? [];
        return !readBy.contains(userId);
      }).length;

      expect(unreadCount, 2);

      // Step 2: Mark all as read (same as service.markMessagesAsRead)
      final batch = firestore.batch();
      for (final doc in snapshot.docs) {
        final readBy =
            (doc.data()['read_by'] as List<dynamic>?)?.cast<String>() ?? [];
        if (!readBy.contains(userId)) {
          batch.update(doc.reference, {
            'read_by': FieldValue.arrayUnion([userId]),
          });
        }
      }
      await batch.commit();

      // Step 3: Verify all messages are now read
      final updatedSnapshot = await firestore.collection(messagesPath).get();
      for (final doc in updatedSnapshot.docs) {
        final readBy = List<String>.from(doc.data()['read_by']);
        expect(readBy, contains(userId));
      }

      // Step 4: Simulate UnreadCountProvider decrement
      await firestore
          .collection('clubs/$clubId/members')
          .doc(userId)
          .set({
        'unread_counts': {
          'total': 5,
          'event_messages': 2,
        }
      });

      await firestore
          .collection('clubs/$clubId/members')
          .doc(userId)
          .update({
        'unread_counts.event_messages':
            FieldValue.increment(-unreadCount),
        'unread_counts.total': FieldValue.increment(-unreadCount),
      });

      final memberDoc = await firestore
          .collection('clubs/$clubId/members')
          .doc(userId)
          .get();
      final counts =
          memberDoc.data()!['unread_counts'] as Map<String, dynamic>;

      expect(counts['event_messages'], 0);
      expect(counts['total'], 3);
    });

    test('markAsRead with zero unread messages does nothing', () async {
      await addTestMessage(readBy: [userId]);
      await addTestMessage(readBy: [userId, 'other']);

      final snapshot = await firestore.collection(messagesPath).get();
      final unreadCount = snapshot.docs.where((doc) {
        final readBy = List<String>.from(doc.data()['read_by'] ?? []);
        return !readBy.contains(userId);
      }).length;

      expect(unreadCount, 0);
    });

    test('markAsRead idempotent: calling twice has same result', () async {
      await addTestMessage(readBy: []);
      await addTestMessage(readBy: []);

      // First pass
      var snapshot = await firestore.collection(messagesPath).get();
      var batch = firestore.batch();
      for (final doc in snapshot.docs) {
        final readBy = List<String>.from(doc.data()['read_by'] ?? []);
        if (!readBy.contains(userId)) {
          batch.update(doc.reference, {
            'read_by': FieldValue.arrayUnion([userId]),
          });
        }
      }
      await batch.commit();

      // Second pass: should find 0 unread
      snapshot = await firestore.collection(messagesPath).get();
      final unreadAfterSecondPass = snapshot.docs.where((doc) {
        final readBy = List<String>.from(doc.data()['read_by'] ?? []);
        return !readBy.contains(userId);
      }).length;

      expect(unreadAfterSecondPass, 0);
    });
  });
}
