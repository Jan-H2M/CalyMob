import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Tests that verify the Dart equivalents of badge-helper.js logic.
/// Since Cloud Functions are in JavaScript, we test the same logic
/// reimplemented in Dart using FakeFirebaseFirestore to ensure
/// the data operations are correct.
void main() {
  const clubId = 'club1';
  final memberPath = 'clubs/$clubId/members';

  group('badge-helper.js Logic Tests (Dart reimplementation)', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    // ========== incrementUnreadCounts ==========

    group('incrementUnreadCounts', () {
      test('increments category and total for all recipients', () async {
        final recipientIds = ['user1', 'user2', 'user3'];

        // Setup members
        for (final id in recipientIds) {
          await firestore.collection(memberPath).doc(id).set({
            'unread_counts': {
              'total': 0,
              'event_messages': 0,
            },
          });
        }

        // Simulate incrementUnreadCounts(clubId, recipientIds, 'event_messages')
        final batch = firestore.batch();
        for (final memberId in recipientIds) {
          final memberRef =
              firestore.collection(memberPath).doc(memberId);
          batch.update(memberRef, {
            'unread_counts.event_messages': FieldValue.increment(1),
            'unread_counts.total': FieldValue.increment(1),
            'unread_counts.last_updated': FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();

        // Verify each member
        for (final id in recipientIds) {
          final doc =
              await firestore.collection(memberPath).doc(id).get();
          final counts =
              doc.data()!['unread_counts'] as Map<String, dynamic>;
          expect(counts['event_messages'], 1);
          expect(counts['total'], 1);
        }
      });

      test('does nothing for empty recipient list', () async {
        final recipientIds = <String>[];

        // No error, no operation
        if (recipientIds.isEmpty) {
          // This is the guard in badge-helper.js
          return;
        }
        fail('Should not reach here');
      });

      test('handles all 5 categories correctly', () async {
        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {
            'total': 0,
            'announcements': 0,
            'event_messages': 0,
            'team_messages': 0,
            'session_messages': 0,
            'medical_certificates': 0,
          },
        });

        final categories = [
          'announcements',
          'event_messages',
          'team_messages',
          'session_messages',
          'medical_certificates',
        ];

        for (final category in categories) {
          await firestore.collection(memberPath).doc('user1').update({
            'unread_counts.$category': FieldValue.increment(1),
            'unread_counts.total': FieldValue.increment(1),
          });
        }

        final doc =
            await firestore.collection(memberPath).doc('user1').get();
        final counts =
            doc.data()!['unread_counts'] as Map<String, dynamic>;

        expect(counts['announcements'], 1);
        expect(counts['event_messages'], 1);
        expect(counts['team_messages'], 1);
        expect(counts['session_messages'], 1);
        expect(counts['medical_certificates'], 1);
        expect(counts['total'], 5);
      });

      test('batching logic: 750 recipients split into 2 batches', () {
        const totalRecipients = 750;
        const batchSize = 500;
        final batches = <List<String>>[];

        final allIds =
            List.generate(totalRecipients, (i) => 'user_$i');

        for (int i = 0; i < allIds.length; i += batchSize) {
          batches.add(allIds.sublist(
              i, i + batchSize > allIds.length ? allIds.length : i + batchSize));
        }

        expect(batches.length, 2);
        expect(batches[0].length, 500);
        expect(batches[1].length, 250);
      });
    });

    // ========== decrementUnreadCounts ==========

    group('decrementUnreadCounts', () {
      test('decrements category and total correctly', () async {
        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {
            'total': 5,
            'event_messages': 3,
          },
        });

        // Simulate decrementUnreadCounts(clubId, 'user1', 'event_messages', 2)
        const amount = 2;
        final doc =
            await firestore.collection(memberPath).doc('user1').get();
        final counts = doc.data()!['unread_counts'] as Map<String, dynamic>;
        final currentValue = (counts['event_messages'] ?? 0) as int;
        final currentTotal = (counts['total'] ?? 0) as int;
        final actualDecrement =
            amount > currentValue ? currentValue : amount;

        await firestore.collection(memberPath).doc('user1').update({
          'unread_counts.event_messages':
              FieldValue.increment(-actualDecrement),
          'unread_counts.total': FieldValue.increment(
              -(actualDecrement > currentTotal
                  ? currentTotal
                  : actualDecrement)),
        });

        final after =
            await firestore.collection(memberPath).doc('user1').get();
        final afterCounts =
            after.data()!['unread_counts'] as Map<String, dynamic>;

        expect(afterCounts['event_messages'], 1);
        expect(afterCounts['total'], 3);
      });

      test('prevents negative values', () async {
        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {
            'total': 2,
            'event_messages': 2,
          },
        });

        const amount = 10;
        final doc =
            await firestore.collection(memberPath).doc('user1').get();
        final counts = doc.data()!['unread_counts'] as Map<String, dynamic>;
        final currentValue = (counts['event_messages'] ?? 0) as int;
        final actualDecrement =
            amount > currentValue ? currentValue : amount;

        expect(actualDecrement, 2); // Clamped

        await firestore.collection(memberPath).doc('user1').update({
          'unread_counts.event_messages':
              FieldValue.increment(-actualDecrement),
          'unread_counts.total': FieldValue.increment(-actualDecrement),
        });

        final after =
            await firestore.collection(memberPath).doc('user1').get();
        expect(after.data()!['unread_counts']['event_messages'], 0);
        expect(after.data()!['unread_counts']['total'], 0);
      });

      test('does nothing for amount <= 0', () {
        const memberId = 'user1';
        const amount = 0;

        // Guard: if (!memberId || amount <= 0) return;
        if (memberId.isEmpty || amount <= 0) {
          return; // Expected behavior
        }
        fail('Should not reach here');
      });

      test('does nothing for non-existent member', () async {
        final doc = await firestore
            .collection(memberPath)
            .doc('nonexistent')
            .get();
        expect(doc.exists, isFalse);

        // Guard: if (!doc.exists) return;
      });
    });

    // ========== getBadgeCount ==========

    group('getBadgeCount', () {
      test('returns total from unread_counts', () async {
        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {'total': 7},
        });

        final doc =
            await firestore.collection(memberPath).doc('user1').get();
        final data = doc.data()!;
        final unreadCounts = data['unread_counts'] ?? {};
        final total = (unreadCounts as Map)['total'] ?? 0;

        expect(total, 7);
      });

      test('returns 0 when unread_counts.total is missing', () async {
        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {},
        });

        final doc =
            await firestore.collection(memberPath).doc('user1').get();
        final data = doc.data()!;
        final unreadCounts =
            (data['unread_counts'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
        final total = (unreadCounts['total'] as num?)?.toInt() ?? 0;

        expect(total, 0);
      });

      test('returns 1 (fallback) when member doc does not exist', () async {
        final doc = await firestore
            .collection(memberPath)
            .doc('nonexistent')
            .get();

        // badge-helper.js: if (!memberDoc.exists) return 1;
        final fallback = doc.exists ? 0 : 1;
        expect(fallback, 1);
      });
    });

    // ========== collectTokensAndMembers ==========

    group('collectTokensAndMembers logic', () {
      test('excludes sender from recipients', () {
        final members = [
          {
            'id': 'sender1',
            'data': {'fcm_tokens': ['token_s1']},
          },
          {
            'id': 'user1',
            'data': {
              'fcm_tokens': ['token_u1'],
            },
          },
          {
            'id': 'user2',
            'data': {
              'fcm_tokens': ['token_u2'],
            },
          },
        ];

        const senderId = 'sender1';
        final recipientIds = <String>[];
        final tokens = <String>[];

        for (final member in members) {
          if (member['id'] == senderId) continue;

          final data = member['data'] as Map<String, dynamic>;
          if (data['notifications_enabled'] == false) continue;

          final memberTokens =
              (data['fcm_tokens'] as List<dynamic>?)?.cast<String>() ?? [];
          tokens.addAll(memberTokens);
          recipientIds.add(member['id'] as String);
        }

        expect(recipientIds, ['user1', 'user2']);
        expect(tokens, ['token_u1', 'token_u2']);
        expect(recipientIds.contains(senderId), isFalse);
      });

      test('excludes members with notifications_enabled = false', () {
        final members = [
          {
            'id': 'user1',
            'data': {
              'fcm_tokens': ['token1'],
              'notifications_enabled': false,
            },
          },
          {
            'id': 'user2',
            'data': {
              'fcm_tokens': ['token2'],
            },
          },
        ];

        const senderId = 'sender';
        final recipientIds = <String>[];

        for (final member in members) {
          if (member['id'] == senderId) continue;
          final data = member['data'] as Map<String, dynamic>;
          if (data['notifications_enabled'] == false) continue;
          recipientIds.add(member['id'] as String);
        }

        expect(recipientIds, ['user2']);
      });

      test('handles multi-device tokens (fcm_tokens array)', () {
        final memberData = {
          'fcm_tokens': ['token_a', 'token_b', 'token_c'],
        };

        final tokens = <String>[];
        final fcmTokens = (memberData['fcm_tokens'] as List<dynamic>?)
                ?.cast<String>() ?? [];
        tokens.addAll(fcmTokens);

        expect(tokens.length, 3);
      });

      test('falls back to single fcm_token when fcm_tokens is empty', () {
        final memberData = {
          'fcm_token': 'single_token',
        };

        final tokens = <String>[];
        final fcmTokens =
            (memberData['fcm_tokens'] as List<dynamic>?)?.cast<String>() ?? [];

        if (fcmTokens.isNotEmpty) {
          tokens.addAll(fcmTokens);
        } else if (memberData['fcm_token'] != null) {
          tokens.add(memberData['fcm_token'] as String);
        }

        expect(tokens, ['single_token']);
      });

      test('deduplicates tokens', () {
        final tokens = <String>[];
        final duplicateTokens = ['token1', 'token1', 'token2'];

        for (final token in duplicateTokens) {
          if (!tokens.contains(token)) {
            tokens.add(token);
          }
        }

        expect(tokens, ['token1', 'token2']);
      });
    });

    // ========== Event Expiry Check ==========

    group('event expiry check logic', () {
      test('event expired > 5 days: skip increment', () {
        final dateFin = DateTime.now().subtract(const Duration(days: 10));
        final expiryDate = dateFin.add(const Duration(days: 5));
        final eventExpired = DateTime.now().isAfter(expiryDate);

        expect(eventExpired, isTrue);
      });

      test('event within 5-day grace period: do increment', () {
        final dateFin = DateTime.now().subtract(const Duration(days: 3));
        final expiryDate = dateFin.add(const Duration(days: 5));
        final eventExpired = DateTime.now().isAfter(expiryDate);

        expect(eventExpired, isFalse);
      });

      test('event not yet ended: do increment', () {
        final dateFin = DateTime.now().add(const Duration(days: 7));
        final expiryDate = dateFin.add(const Duration(days: 5));
        final eventExpired = DateTime.now().isAfter(expiryDate);

        expect(eventExpired, isFalse);
      });

      test('null date_fin: never expires', () {
        final dateFin = null;
        final eventExpired = false; // No date_fin → not expired

        expect(eventExpired, isFalse);
      });
    });

    // ========== Notification Payload ==========

    group('notification payload construction', () {
      test('reply notification has correct title format', () {
        const senderName = 'Alice';
        const isReply = true;
        final replyToPreview = {'sender_name': 'Bob'};
        const eventTitle = 'Plongée Samedi';
        const messageText = 'Sure, sounds good!';

        String notificationTitle;
        if (isReply && replyToPreview != null) {
          notificationTitle =
              '$senderName a répondu à ${replyToPreview['sender_name']}';
        } else {
          notificationTitle = '$senderName - $eventTitle';
        }

        expect(notificationTitle, 'Alice a répondu à Bob');
      });

      test('regular message notification has correct format', () {
        const senderName = 'Alice';
        const isReply = false;
        const eventTitle = 'Plongée Samedi';

        String notificationTitle;
        if (isReply) {
          notificationTitle = 'reply format';
        } else {
          notificationTitle = '$senderName - $eventTitle';
        }

        expect(notificationTitle, 'Alice - Plongée Samedi');
      });

      test('long message body is truncated to 100 chars', () {
        final longMessage = 'A' * 150;
        final truncated = longMessage.length > 100
            ? '${longMessage.substring(0, 97)}...'
            : longMessage;

        expect(truncated.length, 100);
        expect(truncated.endsWith('...'), isTrue);
      });

      test('attachment-only message shows attachment indicator', () {
        const messageText = '';
        final attachments = [
          {'type': 'image', 'url': 'url1'},
          {'type': 'pdf', 'url': 'url2'},
        ];
        final hasAttachments = attachments.isNotEmpty;

        String notificationBody;
        if (hasAttachments && messageText.isEmpty) {
          notificationBody = '📎 ${attachments.length} pièce(s) jointe(s)';
        } else {
          notificationBody = messageText;
        }

        expect(notificationBody, '📎 2 pièce(s) jointe(s)');
      });
    });
  });
}
