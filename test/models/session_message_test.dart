import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:calymob/models/session_message.dart';

void main() {
  group('SessionMessage', () {
    group('construction', () {
      test('creates with required fields and defaults', () {
        final msg = SessionMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Message de session',
          groupType: SessionGroupType.encadrants,
          createdAt: DateTime(2026, 2, 14, 10, 0),
        );

        expect(msg.readBy, isEmpty);
        expect(msg.attachments, isEmpty);
        expect(msg.groupLevel, isNull);
      });

      test('creates niveau message with group level', () {
        final msg = SessionMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Niveau message',
          groupType: SessionGroupType.niveau,
          groupLevel: 'N2',
          createdAt: DateTime.now(),
        );

        expect(msg.groupType, SessionGroupType.niveau);
        expect(msg.groupLevel, 'N2');
      });
    });

    group('isReadBy', () {
      test('returns true for user in readBy', () {
        final msg = SessionMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test',
          groupType: SessionGroupType.accueil,
          createdAt: DateTime.now(),
          readBy: ['user1', 'user2'],
        );
        expect(msg.isReadBy('user1'), isTrue);
      });

      test('returns false for user not in readBy', () {
        final msg = SessionMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test',
          groupType: SessionGroupType.accueil,
          createdAt: DateTime.now(),
          readBy: ['user1'],
        );
        expect(msg.isReadBy('user2'), isFalse);
      });
    });

    group('formattedTime', () {
      test('formats time with leading zeros', () {
        final msg = SessionMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test',
          groupType: SessionGroupType.encadrants,
          createdAt: DateTime(2026, 2, 14, 9, 5),
        );
        expect(msg.formattedTime, '09:05');
      });

      test('formats afternoon time', () {
        final msg = SessionMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Test',
          groupType: SessionGroupType.encadrants,
          createdAt: DateTime(2026, 2, 14, 14, 30),
        );
        expect(msg.formattedTime, '14:30');
      });
    });

    group('copyWith', () {
      test('copies with new readBy preserving other fields', () {
        final original = SessionMessage(
          id: 'msg1',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Original',
          groupType: SessionGroupType.encadrants,
          createdAt: DateTime(2026, 1, 1),
          readBy: ['user1'],
        );

        final updated = original.copyWith(readBy: ['user1', 'user2']);
        expect(updated.readBy, hasLength(2));
        expect(updated.message, 'Original');
        expect(updated.groupType, SessionGroupType.encadrants);
      });
    });

    group('Firestore serialization', () {
      test('roundtrip through fake Firestore', () async {
        final firestore = FakeFirebaseFirestore();
        final original = SessionMessage(
          id: '',
          senderId: 'user1',
          senderName: 'Jan',
          message: 'Session test',
          groupType: SessionGroupType.accueil,
          createdAt: DateTime(2026, 2, 14, 10, 0),
          readBy: ['user1'],
        );

        final docRef = await firestore
            .collection('clubs/club1/piscine_sessions/sess1/messages')
            .add(original.toFirestore());

        final doc = await docRef.get();
        final restored = SessionMessage.fromFirestore(doc);

        expect(restored.senderId, 'user1');
        expect(restored.message, 'Session test');
        expect(restored.groupType, SessionGroupType.accueil);
        expect(restored.readBy, ['user1']);
      });

      test('fromFirestore handles missing read_by', () async {
        final firestore = FakeFirebaseFirestore();
        final docRef = await firestore
            .collection('clubs/club1/piscine_sessions/sess1/messages')
            .add({
          'sender_id': 'user1',
          'sender_name': 'Jan',
          'message': 'No read_by',
          'group_type': 'encadrants',
          'created_at': Timestamp.now(),
        });

        final doc = await docRef.get();
        final msg = SessionMessage.fromFirestore(doc);
        expect(msg.readBy, isEmpty);
      });
    });
  });

  group('SessionGroupType', () {
    test('value returns correct string', () {
      expect(SessionGroupType.accueil.value, 'accueil');
      expect(SessionGroupType.encadrants.value, 'encadrants');
      expect(SessionGroupType.niveau.value, 'niveau');
    });

    test('fromString parses correctly', () {
      expect(SessionGroupTypeExtension.fromString('accueil'),
          SessionGroupType.accueil);
      expect(SessionGroupTypeExtension.fromString('encadrants'),
          SessionGroupType.encadrants);
      expect(SessionGroupTypeExtension.fromString('niveau'),
          SessionGroupType.niveau);
    });

    test('fromString defaults to encadrants for unknown', () {
      expect(SessionGroupTypeExtension.fromString('unknown'),
          SessionGroupType.encadrants);
      expect(
          SessionGroupTypeExtension.fromString(''), SessionGroupType.encadrants);
    });

    test('displayName returns French labels', () {
      expect(SessionGroupType.accueil.displayName, 'Équipe Accueil');
      expect(SessionGroupType.encadrants.displayName, 'Encadrants');
      expect(SessionGroupType.niveau.displayName, 'Niveau');
    });
  });

  group('SessionChatGroup', () {
    test('id for regular type', () {
      final group = SessionChatGroup(
        type: SessionGroupType.encadrants,
        displayName: 'Encadrants',
      );
      expect(group.id, 'encadrants');
    });

    test('id for niveau type includes level', () {
      final group = SessionChatGroup(
        type: SessionGroupType.niveau,
        level: 'N2',
        displayName: 'Niveau N2',
      );
      expect(group.id, 'niveau_N2');
    });

    test('unreadCount defaults to 0', () {
      final group = SessionChatGroup(
        type: SessionGroupType.accueil,
        displayName: 'Accueil',
      );
      expect(group.unreadCount, 0);
    });

    test('unreadCount stores custom value', () {
      final group = SessionChatGroup(
        type: SessionGroupType.accueil,
        displayName: 'Accueil',
        unreadCount: 5,
      );
      expect(group.unreadCount, 5);
    });
  });

  group('MessageAttachment', () {
    test('creates from map', () {
      final attachment = MessageAttachment.fromMap({
        'type': 'image',
        'url': 'https://example.com/photo.jpg',
        'filename': 'photo.jpg',
        'size': 1024,
      });

      expect(attachment.isImage, isTrue);
      expect(attachment.isPdf, isFalse);
      expect(attachment.filename, 'photo.jpg');
    });

    test('toMap produces correct map', () {
      final attachment = MessageAttachment(
        type: 'pdf',
        url: 'https://example.com/doc.pdf',
        filename: 'doc.pdf',
        size: 2048,
      );

      final map = attachment.toMap();
      expect(map['type'], 'pdf');
      expect(map['size'], 2048);
    });

    test('handles missing fields in fromMap', () {
      final attachment = MessageAttachment.fromMap({});
      expect(attachment.type, 'image');
      expect(attachment.url, '');
      expect(attachment.filename, '');
      expect(attachment.size, 0);
    });
  });
}
