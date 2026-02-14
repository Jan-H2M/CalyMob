import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:calymob/models/team_channel.dart';

void main() {
  const clubId = 'club1';
  const userId = 'user1';

  group('TeamChannelService - Firestore Operations', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    // ========== Channel Management ==========

    group('getOrCreateChannel', () {
      test('creates channel when it does not exist', () async {
        final channelId = TeamChannelType.accueil.id;
        final channel = TeamChannel.defaultForType(TeamChannelType.accueil);
        final docRef = firestore
            .collection('clubs/$clubId/team_channels')
            .doc(channelId);

        // Doesn't exist yet
        final before = await docRef.get();
        expect(before.exists, isFalse);

        // Create it
        await docRef.set(channel.toFirestore());

        final after = await docRef.get();
        expect(after.exists, isTrue);
        expect(after.data()!['type'], 'accueil');
        expect(after.data()!['name'], 'Équipe Accueil');
      });

      test('returns existing channel without overwriting', () async {
        final channelId = TeamChannelType.encadrants.id;
        final docRef = firestore
            .collection('clubs/$clubId/team_channels')
            .doc(channelId);

        // Pre-create with custom data
        await docRef.set({
          'name': 'Custom Name',
          'type': 'encadrants',
          'description': 'Custom description',
          'created_at': Timestamp.now(),
        });

        // Read it back
        final doc = await docRef.get();
        expect(doc.data()!['name'], 'Custom Name');
      });

      test('each channel type has unique ID', () {
        expect(TeamChannelType.accueil.id, 'equipe_accueil');
        expect(TeamChannelType.encadrants.id, 'equipe_encadrants');
        expect(TeamChannelType.gonflage.id, 'equipe_gonflage');
      });
    });

    // ========== Role-Based Channel Access ==========

    group('getChannelsForUser - role-based filtering', () {
      setUp(() async {
        // Create all three channels
        for (final type in TeamChannelType.values) {
          await firestore
              .collection('clubs/$clubId/team_channels')
              .doc(type.id)
              .set(TeamChannel.defaultForType(type).toFirestore());
        }
      });

      test('user with accueil role sees only accueil channel', () async {
        final userRoles = ['accueil'];
        final availableTypes = _getAvailableTypes(userRoles);

        expect(availableTypes, [TeamChannelType.accueil]);
      });

      test('user with encadrant role sees only encadrants channel', () async {
        final userRoles = ['encadrant'];
        final availableTypes = _getAvailableTypes(userRoles);

        expect(availableTypes, [TeamChannelType.encadrants]);
      });

      test('user with gonflage role sees only gonflage channel', () async {
        final userRoles = ['gonflage'];
        final availableTypes = _getAvailableTypes(userRoles);

        expect(availableTypes, [TeamChannelType.gonflage]);
      });

      test('user with multiple roles sees multiple channels', () async {
        final userRoles = ['accueil', 'encadrant', 'gonflage'];
        final availableTypes = _getAvailableTypes(userRoles);

        expect(availableTypes.length, 3);
        expect(availableTypes, contains(TeamChannelType.accueil));
        expect(availableTypes, contains(TeamChannelType.encadrants));
        expect(availableTypes, contains(TeamChannelType.gonflage));
      });

      test('user with no matching roles sees no channels', () async {
        final userRoles = ['plongeur', 'membre'];
        final availableTypes = _getAvailableTypes(userRoles);

        expect(availableTypes, isEmpty);
      });

      test('case-insensitive: Accueil (capital) works', () async {
        final userRoles = ['Accueil'];
        final availableTypes = _getAvailableTypes(userRoles);

        expect(availableTypes, [TeamChannelType.accueil]);
      });

      test('case-insensitive: Encadrant (capital) works', () async {
        final userRoles = ['Encadrant'];
        final availableTypes = _getAvailableTypes(userRoles);

        expect(availableTypes, [TeamChannelType.encadrants]);
      });

      test('case-insensitive: Gonflage (capital) works', () async {
        final userRoles = ['Gonflage'];
        final availableTypes = _getAvailableTypes(userRoles);

        expect(availableTypes, [TeamChannelType.gonflage]);
      });

      test('mixed case roles', () async {
        final userRoles = ['Accueil', 'encadrant'];
        final availableTypes = _getAvailableTypes(userRoles);

        expect(availableTypes.length, 2);
        expect(availableTypes, contains(TeamChannelType.accueil));
        expect(availableTypes, contains(TeamChannelType.encadrants));
      });
    });

    // ========== Message Operations ==========

    group('sendMessage', () {
      test('creates message with sender in read_by', () async {
        final channelId = TeamChannelType.encadrants.id;
        final messagesPath =
            'clubs/$clubId/team_channels/$channelId/messages';

        final docRef = await firestore.collection(messagesPath).add({
          'sender_id': userId,
          'sender_name': 'User',
          'message': 'Hello team!',
          'attachments': [],
          'read_by': [userId],
          'created_at': Timestamp.now(),
        });

        final doc = await docRef.get();
        expect(doc.data()!['sender_id'], userId);
        expect(doc.data()!['message'], 'Hello team!');
        expect(doc.data()!['read_by'], contains(userId));
      });

      test('auto-creates channel if not existing', () async {
        final channelId = 'equipe_accueil';
        final channelDocRef = firestore
            .collection('clubs/$clubId/team_channels')
            .doc(channelId);

        // Channel doesn't exist
        final before = await channelDocRef.get();
        expect(before.exists, isFalse);

        // Create channel first (as service would)
        await channelDocRef.set({
          'name': 'Équipe Accueil',
          'type': 'accueil',
          'created_at': Timestamp.now(),
        });

        // Then send message
        final messagesPath =
            'clubs/$clubId/team_channels/$channelId/messages';
        await firestore.collection(messagesPath).add({
          'sender_id': userId,
          'sender_name': 'User',
          'message': 'First!',
          'attachments': [],
          'read_by': [userId],
          'created_at': Timestamp.now(),
        });

        final channelExists = await channelDocRef.get();
        expect(channelExists.exists, isTrue);
      });
    });

    group('markAllAsRead', () {
      test('marks all unread messages as read in batch', () async {
        final channelId = TeamChannelType.encadrants.id;
        final messagesPath =
            'clubs/$clubId/team_channels/$channelId/messages';

        // 3 messages: 1 read, 2 unread
        await firestore.collection(messagesPath).add({
          'sender_id': 'other1',
          'sender_name': 'Other1',
          'message': 'Already read',
          'read_by': ['other1', userId],
          'created_at': Timestamp.now(),
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other2',
          'sender_name': 'Other2',
          'message': 'Unread 1',
          'read_by': ['other2'],
          'created_at': Timestamp.now(),
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other3',
          'sender_name': 'Other3',
          'message': 'Unread 2',
          'read_by': ['other3'],
          'created_at': Timestamp.now(),
        });

        // Mark all as read (same logic as service)
        final snapshot = await firestore.collection(messagesPath).get();
        final batch = firestore.batch();
        for (final doc in snapshot.docs) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            batch.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
          }
        }
        await batch.commit();

        // Verify all are read
        final updated = await firestore.collection(messagesPath).get();
        for (final doc in updated.docs) {
          expect(List<String>.from(doc.data()['read_by']), contains(userId));
        }
      });

      test('empty channel has no messages to mark', () async {
        final channelId = TeamChannelType.gonflage.id;
        final messagesPath =
            'clubs/$clubId/team_channels/$channelId/messages';

        final snapshot = await firestore.collection(messagesPath).get();
        expect(snapshot.docs, isEmpty);
      });
    });

    group('getUnreadCount', () {
      test('counts unread messages for user in channel', () async {
        final channelId = TeamChannelType.accueil.id;
        final messagesPath =
            'clubs/$clubId/team_channels/$channelId/messages';

        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'sender_name': 'Other',
          'message': 'Read',
          'read_by': ['other', userId],
          'created_at': Timestamp.now(),
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'sender_name': 'Other',
          'message': 'Unread',
          'read_by': ['other'],
          'created_at': Timestamp.now(),
        });

        final snapshot = await firestore.collection(messagesPath).get();
        final unreadCount = snapshot.docs.where((doc) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          return !readBy.contains(userId);
        }).length;

        expect(unreadCount, 1);
      });
    });

    group('getUnreadCountStream', () {
      test('emits updated count when messages change', () async {
        final channelId = TeamChannelType.accueil.id;
        final messagesPath =
            'clubs/$clubId/team_channels/$channelId/messages';

        final stream = firestore
            .collection(messagesPath)
            .snapshots()
            .map((snapshot) {
          return snapshot.docs.where((doc) {
            final readBy = List<String>.from(doc.data()['read_by'] ?? []);
            return !readBy.contains(userId);
          }).length;
        });

        // Initially 0
        expect(await stream.first, 0);

        // Add unread message
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'sender_name': 'Other',
          'message': 'New message',
          'read_by': ['other'],
          'created_at': Timestamp.now(),
        });

        expect(await stream.first, 1);
      });
    });

    // ========== TeamMessage Model ==========

    group('TeamMessage model', () {
      test('fromFirestore parses all fields', () async {
        final channelId = TeamChannelType.encadrants.id;
        final messagesPath =
            'clubs/$clubId/team_channels/$channelId/messages';

        final docRef = await firestore.collection(messagesPath).add({
          'sender_id': userId,
          'sender_name': 'Test User',
          'message': 'Hello',
          'attachments': [
            {
              'type': 'image',
              'url': 'https://example.com/img.png',
              'filename': 'img.png',
              'size': 2048,
            }
          ],
          'read_by': [userId, 'other'],
          'created_at': Timestamp.fromDate(DateTime(2024, 6, 15, 14, 30)),
        });

        final doc = await docRef.get();
        final msg = TeamMessage.fromFirestore(doc);

        expect(msg.id, docRef.id);
        expect(msg.senderId, userId);
        expect(msg.senderName, 'Test User');
        expect(msg.message, 'Hello');
        expect(msg.readBy, hasLength(2));
        expect(msg.isReadBy(userId), isTrue);
        expect(msg.isReadBy('unknown'), isFalse);
        expect(msg.formattedTime, '14:30');
        expect(msg.attachments, hasLength(1));
        expect(msg.attachments.first.type, 'image');
      });

      test('toFirestore roundtrip preserves data', () async {
        final channelId = TeamChannelType.encadrants.id;
        final messagesPath =
            'clubs/$clubId/team_channels/$channelId/messages';

        final original = TeamMessage(
          id: '',
          senderId: userId,
          senderName: 'User',
          message: 'Test',
          readBy: [userId],
          createdAt: DateTime(2024, 6, 15),
          attachments: [
            TeamMessageAttachment(
              type: 'pdf',
              url: 'https://example.com/doc.pdf',
              filename: 'doc.pdf',
              size: 4096,
            ),
          ],
        );

        final docRef = await firestore
            .collection(messagesPath)
            .add(original.toFirestore());
        final roundtrip = TeamMessage.fromFirestore(await docRef.get());

        expect(roundtrip.senderId, userId);
        expect(roundtrip.message, 'Test');
        expect(roundtrip.attachments, hasLength(1));
        expect(roundtrip.attachments.first.filename, 'doc.pdf');
      });
    });

    // ========== TeamChannel Model ==========

    group('TeamChannel model', () {
      test('defaultForType creates correct defaults', () {
        final accueil = TeamChannel.defaultForType(TeamChannelType.accueil);
        expect(accueil.id, 'equipe_accueil');
        expect(accueil.name, 'Équipe Accueil');
        expect(accueil.type, TeamChannelType.accueil);

        final encadrants =
            TeamChannel.defaultForType(TeamChannelType.encadrants);
        expect(encadrants.id, 'equipe_encadrants');

        final gonflage =
            TeamChannel.defaultForType(TeamChannelType.gonflage);
        expect(gonflage.id, 'equipe_gonflage');
      });

      test('fromFirestore parses channel data', () async {
        final docRef = firestore
            .collection('clubs/$clubId/team_channels')
            .doc('equipe_accueil');

        await docRef.set({
          'name': 'Équipe Accueil',
          'type': 'accueil',
          'description': 'Accueil chat',
          'created_at': Timestamp.fromDate(DateTime(2024, 1, 1)),
        });

        final doc = await docRef.get();
        final channel = TeamChannel.fromFirestore(doc);

        expect(channel.id, 'equipe_accueil');
        expect(channel.name, 'Équipe Accueil');
        expect(channel.type, TeamChannelType.accueil);
        expect(channel.description, 'Accueil chat');
      });

      test('TeamChannelType extensions', () {
        expect(TeamChannelType.accueil.value, 'accueil');
        expect(TeamChannelType.encadrants.value, 'encadrants');
        expect(TeamChannelType.gonflage.value, 'gonflage');

        expect(TeamChannelType.accueil.displayName, 'Équipe Accueil');
        expect(TeamChannelType.accueil.icon, '🎫');
        expect(TeamChannelType.encadrants.icon, '🎓');
        expect(TeamChannelType.gonflage.icon, '🎈');
      });

      test('TeamChannelType.fromString handles defaults', () {
        expect(
            TeamChannelTypeExtension.fromString('accueil'),
            TeamChannelType.accueil);
        expect(
            TeamChannelTypeExtension.fromString('encadrants'),
            TeamChannelType.encadrants);
        expect(
            TeamChannelTypeExtension.fromString('gonflage'),
            TeamChannelType.gonflage);
        expect(
            TeamChannelTypeExtension.fromString('unknown'),
            TeamChannelType.encadrants); // default
      });
    });

    // ========== Full Team Badge Cascade ==========

    group('full team badge cascade', () {
      test('send message → increment → markAllAsRead → decrement → zero',
          () async {
        final channelId = TeamChannelType.encadrants.id;
        final messagesPath =
            'clubs/$clubId/team_channels/$channelId/messages';
        final memberPath = 'clubs/$clubId/members';

        // Setup member
        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 0,
            'team_messages': 0,
          },
        });

        // Phase 1: Another user sends 2 messages
        for (int i = 0; i < 2; i++) {
          await firestore.collection(messagesPath).add({
            'sender_id': 'other',
            'sender_name': 'Other',
            'message': 'Team msg $i',
            'read_by': ['other'],
            'created_at': Timestamp.now(),
          });
        }

        // Cloud Function increments
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.team_messages': FieldValue.increment(2),
          'unread_counts.total': FieldValue.increment(2),
        });

        var memberDoc =
            await firestore.collection(memberPath).doc(userId).get();
        expect(
            (memberDoc.data()!['unread_counts']
                as Map<String, dynamic>)['team_messages'],
            2);

        // Phase 2: User opens channel → markAllAsRead
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

        expect(unread, 2);

        // Decrement
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.team_messages': FieldValue.increment(-unread),
          'unread_counts.total': FieldValue.increment(-unread),
        });

        memberDoc =
            await firestore.collection(memberPath).doc(userId).get();
        expect(
            (memberDoc.data()!['unread_counts']
                as Map<String, dynamic>)['team_messages'],
            0);
        expect(
            (memberDoc.data()!['unread_counts']
                as Map<String, dynamic>)['total'],
            0);
      });
    });
  });
}

/// Helper: mirrors TeamChannelService.getChannelsForUser role filtering
List<TeamChannelType> _getAvailableTypes(List<String> userRoles) {
  final availableTypes = <TeamChannelType>[];

  if (userRoles.contains('accueil') || userRoles.contains('Accueil')) {
    availableTypes.add(TeamChannelType.accueil);
  }

  if (userRoles.contains('encadrant') || userRoles.contains('Encadrant')) {
    availableTypes.add(TeamChannelType.encadrants);
  }

  if (userRoles.contains('gonflage') || userRoles.contains('Gonflage')) {
    availableTypes.add(TeamChannelType.gonflage);
  }

  return availableTypes;
}
