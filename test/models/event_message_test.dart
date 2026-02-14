import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/models/event_message.dart';

void main() {
  group('EventMessage', () {
    group('construction', () {
      test('creates with required fields and defaults', () {
        final msg = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Bonjour tout le monde',
          createdAt: DateTime(2026, 2, 14, 10, 30),
        );

        expect(msg.id, 'msg1');
        expect(msg.senderId, 'user1');
        expect(msg.senderName, 'Jan');
        expect(msg.message, 'Bonjour tout le monde');
        expect(msg.readBy, isEmpty);
        expect(msg.replyToId, isNull);
        expect(msg.replyToPreview, isNull);
        expect(msg.attachments, isEmpty);
      });

      test('creates with readBy list', () {
        final msg = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Hello',
          createdAt: DateTime.now(),
          readBy: ['user1', 'user2', 'user3'],
        );

        expect(msg.readBy, hasLength(3));
        expect(msg.readBy, contains('user1'));
      });
    });

    group('isReadBy', () {
      late EventMessage message;

      setUp(() {
        message = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test',
          createdAt: DateTime.now(),
          readBy: ['user1', 'user2'],
        );
      });

      test('returns true for user in readBy list', () {
        expect(message.isReadBy('user1'), isTrue);
        expect(message.isReadBy('user2'), isTrue);
      });

      test('returns false for user not in readBy list', () {
        expect(message.isReadBy('user3'), isFalse);
        expect(message.isReadBy('unknown'), isFalse);
      });

      test('returns false for empty string', () {
        expect(message.isReadBy(''), isFalse);
      });

      test('handles message with empty readBy', () {
        final emptyMsg = EventMessage(
          id: 'msg2',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test',
          createdAt: DateTime.now(),
        );
        expect(emptyMsg.isReadBy('user1'), isFalse);
      });
    });

    group('readCount', () {
      test('returns 0 for no readers', () {
        final msg = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test',
          createdAt: DateTime.now(),
        );
        expect(msg.readCount, 0);
      });

      test('returns correct count for multiple readers', () {
        final msg = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test',
          createdAt: DateTime.now(),
          readBy: ['user1', 'user2', 'user3'],
        );
        expect(msg.readCount, 3);
      });
    });

    group('copyWith', () {
      late EventMessage original;

      setUp(() {
        original = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Original message',
          createdAt: DateTime(2026, 1, 1),
          readBy: ['user1'],
        );
      });

      test('copies with new readBy list', () {
        final updated = original.copyWith(readBy: ['user1', 'user2', 'user3']);
        expect(updated.readBy, hasLength(3));
        expect(updated.message, 'Original message'); // unchanged
        expect(updated.id, 'msg1'); // unchanged
      });

      test('copies with new message text', () {
        final updated = original.copyWith(message: 'Updated message');
        expect(updated.message, 'Updated message');
        expect(updated.readBy, ['user1']); // unchanged
      });

      test('preserves all fields when no changes', () {
        final copy = original.copyWith();
        expect(copy.id, original.id);
        expect(copy.senderId, original.senderId);
        expect(copy.senderName, original.senderName);
        expect(copy.message, original.message);
        expect(copy.readBy, original.readBy);
      });
    });

    group('hasAttachments', () {
      test('returns false when no attachments', () {
        final msg = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test',
          createdAt: DateTime.now(),
        );
        expect(msg.hasAttachments, isFalse);
      });
    });

    group('isReply', () {
      test('returns false when no replyToId', () {
        final msg = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test',
          createdAt: DateTime.now(),
        );
        expect(msg.isReply, isFalse);
      });

      test('returns true when replyToId is set', () {
        final msg = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test',
          createdAt: DateTime.now(),
          replyToId: 'original_msg',
        );
        expect(msg.isReply, isTrue);
      });
    });

    group('Firestore serialization', () {
      test('toFirestore produces correct map', () {
        final msg = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Bonjour',
          createdAt: DateTime(2026, 2, 14, 10, 0),
          readBy: ['user1', 'user2'],
        );

        final map = msg.toFirestore();
        expect(map['sender_id'], 'user1');
        expect(map['sender_name'], 'Jan');
        expect(map['message'], 'Bonjour');
        expect(map['read_by'], ['user1', 'user2']);
        expect(map['created_at'], isA<Timestamp>());
        expect(map.containsKey('reply_to_id'), isFalse);
      });

      test('toFirestore includes reply fields when present', () {
        final msg = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Reply',
          createdAt: DateTime.now(),
          replyToId: 'original',
          replyToPreview: ReplyPreview(
            senderName: 'Pierre',
            messagePreview: 'Original message...',
          ),
        );

        final map = msg.toFirestore();
        expect(map['reply_to_id'], 'original');
        expect(map['reply_to_preview']['sender_name'], 'Pierre');
      });

      test('roundtrip through fake Firestore', () async {
        final firestore = FakeFirebaseFirestore();
        final original = EventMessage(
          id: '',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test roundtrip',
          createdAt: DateTime(2026, 2, 14, 10, 0),
          readBy: ['user1'],
        );

        // Write to Firestore
        final docRef = await firestore
            .collection('clubs/club1/operations/op1/messages')
            .add(original.toFirestore());

        // Read back
        final doc = await docRef.get();
        final restored = EventMessage.fromFirestore(doc);

        expect(restored.id, docRef.id);
        expect(restored.senderId, 'user1');
        expect(restored.senderName, 'Jan');
        expect(restored.message, 'Test roundtrip');
        expect(restored.readBy, ['user1']);
      });

      test('fromFirestore handles missing read_by gracefully', () async {
        final firestore = FakeFirebaseFirestore();

        // Write raw data without read_by
        final docRef = await firestore
            .collection('clubs/club1/operations/op1/messages')
            .add({
          'sender_id': 'user1',
          'sender_name': 'Jan',
          'message': 'No readBy',
          'created_at': Timestamp.now(),
        });

        final doc = await docRef.get();
        final msg = EventMessage.fromFirestore(doc);
        expect(msg.readBy, isEmpty);
        expect(msg.isReadBy('user1'), isFalse);
      });
    });
  });

  group('ReplyPreview', () {
    test('creates from map', () {
      final preview = ReplyPreview.fromMap({
        'sender_name': 'Pierre',
        'message_preview': 'Salut tout le monde...',
      });
      expect(preview.senderName, 'Pierre');
      expect(preview.messagePreview, 'Salut tout le monde...');
    });

    test('toMap produces correct map', () {
      final preview = ReplyPreview(
        senderName: 'Pierre',
        messagePreview: 'Salut',
      );
      final map = preview.toMap();
      expect(map['sender_name'], 'Pierre');
      expect(map['message_preview'], 'Salut');
    });

    test('handles empty strings from map', () {
      final preview = ReplyPreview.fromMap({});
      expect(preview.senderName, '');
      expect(preview.messagePreview, '');
    });
  });
}
