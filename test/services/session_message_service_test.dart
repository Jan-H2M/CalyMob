import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:calymob/models/session_message.dart';

void main() {
  const clubId = 'club1';
  const sessionId = 'session1';
  const userId = 'user1';
  final messagesPath =
      'clubs/$clubId/piscine_sessions/$sessionId/messages';

  group('SessionMessageService - Firestore Operations', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    // ========== Message Operations ==========

    group('sendMessage', () {
      test('creates message with groupType and sender in readBy', () async {
        final docRef = await firestore.collection(messagesPath).add({
          'sender_id': userId,
          'sender_name': 'User',
          'message': 'Hello accueil!',
          'group_type': 'accueil',
          'group_level': null,
          'attachments': [],
          'read_by': [userId],
          'created_at': Timestamp.now(),
        });

        final doc = await docRef.get();
        expect(doc.data()!['sender_id'], userId);
        expect(doc.data()!['group_type'], 'accueil');
        expect(doc.data()!['read_by'], contains(userId));
      });

      test('creates niveau message with group_level', () async {
        final docRef = await firestore.collection(messagesPath).add({
          'sender_id': userId,
          'sender_name': 'User',
          'message': 'Niveau 1 update',
          'group_type': 'niveau',
          'group_level': '1',
          'attachments': [],
          'read_by': [userId],
          'created_at': Timestamp.now(),
        });

        final doc = await docRef.get();
        expect(doc.data()!['group_type'], 'niveau');
        expect(doc.data()!['group_level'], '1');
      });
    });

    // ========== Group-Based Filtering ==========

    group('getMessages - group-based filtering', () {
      setUp(() async {
        // Create messages in different groups
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'sender_name': 'Other',
          'message': 'Accueil msg 1',
          'group_type': 'accueil',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'sender_name': 'Other',
          'message': 'Accueil msg 2',
          'group_type': 'accueil',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'sender_name': 'Other',
          'message': 'Encadrants msg',
          'group_type': 'encadrants',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'sender_name': 'Other',
          'message': 'Niveau 1 msg',
          'group_type': 'niveau',
          'group_level': '1',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'sender_name': 'Other',
          'message': 'Niveau 2 msg',
          'group_type': 'niveau',
          'group_level': '2',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
      });

      test('filters by accueil group type', () async {
        final snapshot = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'accueil')
            .get();

        expect(snapshot.docs.length, 2);
      });

      test('filters by encadrants group type', () async {
        final snapshot = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'encadrants')
            .get();

        expect(snapshot.docs.length, 1);
      });

      test('filters by niveau with specific level', () async {
        final snapshot = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'niveau')
            .where('group_level', isEqualTo: '1')
            .get();

        expect(snapshot.docs.length, 1);
        expect(snapshot.docs.first.data()['message'], 'Niveau 1 msg');
      });

      test('niveau filter returns only matching level', () async {
        final level1 = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'niveau')
            .where('group_level', isEqualTo: '1')
            .get();

        final level2 = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'niveau')
            .where('group_level', isEqualTo: '2')
            .get();

        expect(level1.docs.length, 1);
        expect(level2.docs.length, 1);
        expect(level1.docs.first.data()['group_level'], '1');
        expect(level2.docs.first.data()['group_level'], '2');
      });
    });

    // ========== Mark as Read (Group-Filtered) ==========

    group('markAllAsRead - filtered by group', () {
      test('marks only accueil messages as read', () async {
        // Create mixed messages
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Accueil',
          'group_type': 'accueil',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Encadrants',
          'group_type': 'encadrants',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });

        // Mark only accueil as read
        final accueilSnapshot = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'accueil')
            .get();

        final batch = firestore.batch();
        for (final doc in accueilSnapshot.docs) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            batch.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
          }
        }
        await batch.commit();

        // Verify: accueil is read, encadrants is not
        final allDocs = await firestore.collection(messagesPath).get();
        for (final doc in allDocs.docs) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          if (doc.data()['group_type'] == 'accueil') {
            expect(readBy, contains(userId));
          } else {
            expect(readBy, isNot(contains(userId)));
          }
        }
      });

      test('marks only specific niveau level as read', () async {
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Niveau 1',
          'group_type': 'niveau',
          'group_level': '1',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Niveau 2',
          'group_type': 'niveau',
          'group_level': '2',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });

        // Mark only niveau 1 as read
        final niveau1Snapshot = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'niveau')
            .where('group_level', isEqualTo: '1')
            .get();

        final batch = firestore.batch();
        for (final doc in niveau1Snapshot.docs) {
          batch.update(doc.reference, {
            'read_by': FieldValue.arrayUnion([userId]),
          });
        }
        await batch.commit();

        // Verify
        final allDocs = await firestore.collection(messagesPath).get();
        for (final doc in allDocs.docs) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          if (doc.data()['group_level'] == '1') {
            expect(readBy, contains(userId));
          } else if (doc.data()['group_level'] == '2') {
            expect(readBy, isNot(contains(userId)));
          }
        }
      });
    });

    // ========== Unread Count (Group-Filtered) ==========

    group('getUnreadCount - per group', () {
      test('counts unread for specific group type', () async {
        // 2 unread accueil, 1 read accueil
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Unread 1',
          'group_type': 'accueil',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Unread 2',
          'group_type': 'accueil',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Read',
          'group_type': 'accueil',
          'created_at': Timestamp.now(),
          'read_by': ['other', userId],
        });

        final snapshot = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'accueil')
            .get();

        final unread = snapshot.docs.where((doc) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          return !readBy.contains(userId);
        }).length;

        expect(unread, 2);
      });

      test('counts unread for specific niveau level', () async {
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'N1 Unread',
          'group_type': 'niveau',
          'group_level': '1',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'N2 Unread',
          'group_type': 'niveau',
          'group_level': '2',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });

        final n1Snapshot = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'niveau')
            .where('group_level', isEqualTo: '1')
            .get();

        final n1Unread = n1Snapshot.docs.where((doc) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          return !readBy.contains(userId);
        }).length;

        expect(n1Unread, 1);
      });
    });

    // ========== Total Unread Count Stream ==========

    group('getTotalUnreadCountStream', () {
      test('sums unread across all accessible groups', () async {
        // Setup messages in multiple groups
        // 2 unread accueil
        for (int i = 0; i < 2; i++) {
          await firestore.collection(messagesPath).add({
            'sender_id': 'other',
            'message': 'Accueil $i',
            'group_type': 'accueil',
            'created_at': Timestamp.now(),
            'read_by': ['other'],
          });
        }
        // 3 unread encadrants
        for (int i = 0; i < 3; i++) {
          await firestore.collection(messagesPath).add({
            'sender_id': 'other',
            'message': 'Encadrants $i',
            'group_type': 'encadrants',
            'created_at': Timestamp.now(),
            'read_by': ['other'],
          });
        }
        // 1 read accueil (should not count)
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Accueil read',
          'group_type': 'accueil',
          'created_at': Timestamp.now(),
          'read_by': ['other', userId],
        });

        // Define user's groups
        final groups = [
          SessionChatGroup(
              type: SessionGroupType.accueil, displayName: 'Accueil'),
          SessionChatGroup(
              type: SessionGroupType.encadrants,
              displayName: 'Encadrants'),
        ];

        // Calculate total (mirrors getTotalUnreadCountStream logic)
        final allSnapshot =
            await firestore.collection(messagesPath).get();
        int total = 0;
        for (final group in groups) {
          final groupMessages = allSnapshot.docs.where((doc) {
            final data = doc.data();
            if (data['group_type'] != group.type.value) return false;
            if (group.type == SessionGroupType.niveau) {
              return data['group_level'] == group.level;
            }
            return true;
          });

          total += groupMessages.where((doc) {
            final readBy = List<String>.from(doc.data()['read_by'] ?? []);
            return !readBy.contains(userId);
          }).length;
        }

        expect(total, 5); // 2 accueil + 3 encadrants
      });

      test('excludes groups user has no access to', () async {
        // User only has accueil access, not encadrants
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Accueil msg',
          'group_type': 'accueil',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Encadrants msg',
          'group_type': 'encadrants',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });

        // User only has accueil group
        final groups = [
          SessionChatGroup(
              type: SessionGroupType.accueil, displayName: 'Accueil'),
        ];

        final allSnapshot =
            await firestore.collection(messagesPath).get();
        int total = 0;
        for (final group in groups) {
          final groupMessages = allSnapshot.docs.where((doc) {
            return doc.data()['group_type'] == group.type.value;
          });
          total += groupMessages.where((doc) {
            final readBy = List<String>.from(doc.data()['read_by'] ?? []);
            return !readBy.contains(userId);
          }).length;
        }

        expect(total, 1); // Only accueil
      });
    });

    // ========== Per-Group Unread Counts ==========

    group('getUnreadCountsStream - per-group map', () {
      test('returns map with unread count per group', () async {
        // Create messages
        for (int i = 0; i < 2; i++) {
          await firestore.collection(messagesPath).add({
            'sender_id': 'other',
            'message': 'Accueil $i',
            'group_type': 'accueil',
            'created_at': Timestamp.now(),
            'read_by': ['other'],
          });
        }
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Encadrants',
          'group_type': 'encadrants',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Niveau 1',
          'group_type': 'niveau',
          'group_level': '1',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });

        final groups = [
          SessionChatGroup(
              type: SessionGroupType.accueil, displayName: 'Accueil'),
          SessionChatGroup(
              type: SessionGroupType.encadrants,
              displayName: 'Encadrants'),
          SessionChatGroup(
            type: SessionGroupType.niveau,
            level: '1',
            displayName: 'Niveau 1',
          ),
        ];

        // Calculate per-group counts (mirrors getUnreadCountsStream)
        final allSnapshot =
            await firestore.collection(messagesPath).get();
        final counts = <String, int>{};

        for (final group in groups) {
          final groupMessages = allSnapshot.docs.where((doc) {
            final data = doc.data();
            if (data['group_type'] != group.type.value) return false;
            if (group.type == SessionGroupType.niveau) {
              return data['group_level'] == group.level;
            }
            return true;
          });

          counts[group.id] = groupMessages.where((doc) {
            final readBy = List<String>.from(doc.data()['read_by'] ?? []);
            return !readBy.contains(userId);
          }).length;
        }

        expect(counts['accueil'], 2);
        expect(counts['encadrants'], 1);
        expect(counts['niveau_1'], 1);
      });
    });

    // ========== SessionMessage Model ==========

    group('SessionMessage model - extended', () {
      test('fromFirestore parses all fields including group info', () async {
        final docRef = await firestore.collection(messagesPath).add({
          'sender_id': userId,
          'sender_name': 'User',
          'message': 'Test msg',
          'group_type': 'niveau',
          'group_level': '3',
          'attachments': [
            {
              'type': 'image',
              'url': 'https://example.com/img.png',
              'filename': 'photo.jpg',
              'size': 1024,
            }
          ],
          'read_by': [userId, 'other'],
          'created_at': Timestamp.fromDate(DateTime(2024, 6, 15, 10, 45)),
        });

        final doc = await docRef.get();
        final msg = SessionMessage.fromFirestore(doc);

        expect(msg.id, docRef.id);
        expect(msg.senderId, userId);
        expect(msg.groupType, SessionGroupType.niveau);
        expect(msg.groupLevel, '3');
        expect(msg.readBy, hasLength(2));
        expect(msg.isReadBy(userId), isTrue);
        expect(msg.isReadBy('unknown'), isFalse);
        expect(msg.attachments, hasLength(1));
        expect(msg.formattedTime, '10:45');
      });

      test('SessionGroupType values and extensions', () {
        expect(SessionGroupType.accueil.value, 'accueil');
        expect(SessionGroupType.encadrants.value, 'encadrants');
        expect(SessionGroupType.niveau.value, 'niveau');
      });

      test('SessionChatGroup.id is correct', () {
        final accueil = SessionChatGroup(
          type: SessionGroupType.accueil,
          displayName: 'Accueil',
        );
        expect(accueil.id, 'accueil');

        final encadrants = SessionChatGroup(
          type: SessionGroupType.encadrants,
          displayName: 'Encadrants',
        );
        expect(encadrants.id, 'encadrants');

        final niveau1 = SessionChatGroup(
          type: SessionGroupType.niveau,
          level: '1',
          displayName: 'Niveau 1',
        );
        expect(niveau1.id, 'niveau_1');

        final niveau3 = SessionChatGroup(
          type: SessionGroupType.niveau,
          level: '3',
          displayName: 'Niveau 3',
        );
        expect(niveau3.id, 'niveau_3');
      });
    });

    // ========== Full Session Badge Cascade ==========

    group('full session badge cascade', () {
      test('messages in groups → badge → markAllAsRead per group → decrement',
          () async {
        final memberPath = 'clubs/$clubId/members';

        // Setup member
        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 0,
            'session_messages': 0,
          },
        });

        // Phase 1: Messages arrive in multiple groups
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Accueil msg',
          'group_type': 'accueil',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Enc msg 1',
          'group_type': 'encadrants',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'other',
          'message': 'Enc msg 2',
          'group_type': 'encadrants',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });

        // Cloud Function increments (total = 3)
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.session_messages': FieldValue.increment(3),
          'unread_counts.total': FieldValue.increment(3),
        });

        var memberDoc =
            await firestore.collection(memberPath).doc(userId).get();
        expect(
            (memberDoc.data()!['unread_counts']
                as Map<String, dynamic>)['session_messages'],
            3);

        // Phase 2: User opens accueil chat → marks 1 message as read
        final accueilSnapshot = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'accueil')
            .get();

        final batch1 = firestore.batch();
        int accueilUnread = 0;
        for (final doc in accueilSnapshot.docs) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            batch1.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
            accueilUnread++;
          }
        }
        await batch1.commit();

        expect(accueilUnread, 1);

        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.session_messages':
              FieldValue.increment(-accueilUnread),
          'unread_counts.total': FieldValue.increment(-accueilUnread),
        });

        memberDoc =
            await firestore.collection(memberPath).doc(userId).get();
        expect(
            (memberDoc.data()!['unread_counts']
                as Map<String, dynamic>)['session_messages'],
            2);

        // Phase 3: User opens encadrants chat → marks 2 messages as read
        final encSnapshot = await firestore
            .collection(messagesPath)
            .where('group_type', isEqualTo: 'encadrants')
            .get();

        final batch2 = firestore.batch();
        int encUnread = 0;
        for (final doc in encSnapshot.docs) {
          final readBy = List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains(userId)) {
            batch2.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
            encUnread++;
          }
        }
        await batch2.commit();

        expect(encUnread, 2);

        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.session_messages':
              FieldValue.increment(-encUnread),
          'unread_counts.total': FieldValue.increment(-encUnread),
        });

        memberDoc =
            await firestore.collection(memberPath).doc(userId).get();
        expect(
            (memberDoc.data()!['unread_counts']
                as Map<String, dynamic>)['session_messages'],
            0);
        expect(
            (memberDoc.data()!['unread_counts']
                as Map<String, dynamic>)['total'],
            0);
      });
    });
  });
}
