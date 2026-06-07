import 'package:calymob/models/event_message.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('EventMessage', () {
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
      expect(msg.replyToId, isNull);
      expect(msg.replyToPreview, isNull);
      expect(msg.attachments, isEmpty);
      expect(msg.reactions, isEmpty);
      expect(msg.poll, isNull);
    });

    test('copyWith updates mutable message fields', () {
      final original = EventMessage(
        id: 'msg1',
        senderId: 'user1',
        senderName: 'Jan',
        message: 'Original message',
        createdAt: DateTime(2026, 1, 1),
      );

      final updated = original.copyWith(message: 'Updated message');

      expect(updated.id, original.id);
      expect(updated.senderId, original.senderId);
      expect(updated.senderName, original.senderName);
      expect(updated.createdAt, original.createdAt);
      expect(updated.message, 'Updated message');
    });

    test('hasAttachments and isReply reflect message content', () {
      final plain = EventMessage(
        id: 'msg1',
        senderId: 'user1',
        senderName: 'Jan',
        message: 'Test',
        createdAt: DateTime.now(),
      );
      final reply = plain.copyWith(replyToId: 'original_msg');

      expect(plain.hasAttachments, isFalse);
      expect(plain.isReply, isFalse);
      expect(reply.isReply, isTrue);
    });

    group('Firestore serialization', () {
      test('toFirestore does not write legacy read_by arrays', () {
        final msg = EventMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Bonjour',
          createdAt: DateTime(2026, 2, 14, 10, 0),
        );

        final map = msg.toFirestore();

        expect(map['sender_id'], 'user1');
        expect(map['sender_name'], 'Jan');
        expect(map['message'], 'Bonjour');
        expect(map['created_at'], isA<Timestamp>());
        expect(map.containsKey('read_by'), isFalse);
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
        );

        final docRef = await firestore
            .collection('clubs/club1/operations/op1/messages')
            .add(original.toFirestore());
        final doc = await docRef.get();
        final restored = EventMessage.fromFirestore(doc);

        expect(restored.id, docRef.id);
        expect(restored.senderId, 'user1');
        expect(restored.senderName, 'Jan');
        expect(restored.message, 'Test roundtrip');
      });

      test('fromFirestore ignores legacy read_by data if present', () async {
        final firestore = FakeFirebaseFirestore();
        final docRef = await firestore
            .collection('clubs/club1/operations/op1/messages')
            .add({
          'sender_id': 'user1',
          'sender_name': 'Jan',
          'message': 'Legacy read_by',
          'read_by': ['user1'],
          'created_at': Timestamp.now(),
        });

        final doc = await docRef.get();
        final msg = EventMessage.fromFirestore(doc);

        expect(msg.message, 'Legacy read_by');
        expect(msg.toFirestore().containsKey('read_by'), isFalse);
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
