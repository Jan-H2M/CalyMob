import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:calymob/models/announcement.dart';
import 'package:calymob/models/announcement_reply.dart';
import 'package:calymob/models/event_message.dart' show ReplyPreview;

void main() {
  const clubId = 'club1';
  const userId = 'user1';
  const adminId = 'admin1';
  final announcementsPath = 'clubs/$clubId/announcements';

  group('AnnouncementService - Firestore Operations', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    // ========== CRUD Operations ==========

    group('create announcement', () {
      test('creates announcement with correct fields', () async {
        final docRef = await firestore.collection(announcementsPath).add({
          'title': 'Pool Closed',
          'message': 'Maintenance scheduled',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [adminId],
          'reply_count': 0,
        });

        final doc = await docRef.get();
        expect(doc.exists, isTrue);
        expect(doc.data()!['title'], 'Pool Closed');
        expect(doc.data()!['sender_id'], adminId);
        expect(doc.data()!['reply_count'], 0);
        expect(doc.data()!['read_by'], contains(adminId));
      });

      test('creates announcement of each type', () async {
        for (final type in ['info', 'warning', 'urgent']) {
          await firestore.collection(announcementsPath).add({
            'title': 'Test $type',
            'message': 'Body',
            'sender_id': adminId,
            'sender_name': 'Admin',
            'type': type,
            'created_at': Timestamp.now(),
            'read_by': [],
            'reply_count': 0,
          });
        }

        final snapshot = await firestore.collection(announcementsPath).get();
        expect(snapshot.docs.length, 3);
      });
    });

    group('delete announcement', () {
      test('removes announcement document', () async {
        final docRef = await firestore.collection(announcementsPath).add({
          'title': 'To Delete',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [],
          'reply_count': 0,
        });

        await firestore
            .collection(announcementsPath)
            .doc(docRef.id)
            .delete();

        final doc = await docRef.get();
        expect(doc.exists, isFalse);
      });
    });

    group('update announcement', () {
      test('updates title and message', () async {
        final docRef = await firestore.collection(announcementsPath).add({
          'title': 'Original Title',
          'message': 'Original message',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [],
          'reply_count': 0,
        });

        await docRef.update({
          'title': 'Updated Title',
          'message': 'Updated message',
        });

        final doc = await docRef.get();
        expect(doc.data()!['title'], 'Updated Title');
        expect(doc.data()!['message'], 'Updated message');
      });
    });

    // ========== Read Tracking ==========

    group('markAnnouncementAsRead', () {
      test('adds userId to read_by array', () async {
        final docRef = await firestore.collection(announcementsPath).add({
          'title': 'Test',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [adminId],
          'reply_count': 0,
        });

        await docRef.update({
          'read_by': FieldValue.arrayUnion([userId]),
        });

        final doc = await docRef.get();
        final readBy = List<String>.from(doc.data()!['read_by']);
        expect(readBy, contains(userId));
        expect(readBy, contains(adminId));
      });

      test('marking as read is idempotent (arrayUnion)', () async {
        final docRef = await firestore.collection(announcementsPath).add({
          'title': 'Test',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [adminId, userId],
          'reply_count': 0,
        });

        await docRef.update({
          'read_by': FieldValue.arrayUnion([userId]),
        });

        final doc = await docRef.get();
        final readBy = List<String>.from(doc.data()!['read_by']);
        // userId should appear only once
        expect(readBy.where((id) => id == userId).length, 1);
      });
    });

    group('getUnreadCount', () {
      test('counts announcements where userId not in read_by', () async {
        // 3 announcements: 1 read, 2 unread
        await firestore.collection(announcementsPath).add({
          'title': 'Read',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [userId, adminId],
          'reply_count': 0,
        });
        await firestore.collection(announcementsPath).add({
          'title': 'Unread 1',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'warning',
          'created_at': Timestamp.now(),
          'read_by': [adminId],
          'reply_count': 0,
        });
        await firestore.collection(announcementsPath).add({
          'title': 'Unread 2',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'urgent',
          'created_at': Timestamp.now(),
          'read_by': [],
          'reply_count': 0,
        });

        final snapshot = await firestore.collection(announcementsPath).get();
        final unreadCount = snapshot.docs.where((doc) {
          final readBy =
              (doc.data()['read_by'] as List<dynamic>?)?.cast<String>() ?? [];
          return !readBy.contains(userId);
        }).length;

        expect(unreadCount, 2);
      });

      test('returns 0 when all announcements are read', () async {
        await firestore.collection(announcementsPath).add({
          'title': 'Read',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [userId],
          'reply_count': 0,
        });

        final snapshot = await firestore.collection(announcementsPath).get();
        final unreadCount = snapshot.docs.where((doc) {
          final readBy =
              (doc.data()['read_by'] as List<dynamic>?)?.cast<String>() ?? [];
          return !readBy.contains(userId);
        }).length;

        expect(unreadCount, 0);
      });

      test('returns 0 when no announcements exist', () async {
        final snapshot = await firestore.collection(announcementsPath).get();
        expect(snapshot.docs.length, 0);
      });
    });

    // ========== Replies ==========

    group('sendReply', () {
      late DocumentReference announcementRef;

      setUp(() async {
        announcementRef = await firestore.collection(announcementsPath).add({
          'title': 'Discussion Topic',
          'message': 'What do you think?',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [adminId],
          'reply_count': 0,
        });
      });

      test('adds reply with sender in read_by', () async {
        final repliesPath =
            '$announcementsPath/${announcementRef.id}/replies';

        final replyRef = await firestore.collection(repliesPath).add({
          'sender_id': userId,
          'sender_name': 'User',
          'message': 'Good idea!',
          'created_at': Timestamp.now(),
          'read_by': [userId],
        });

        final doc = await replyRef.get();
        expect(doc.exists, isTrue);
        expect(doc.data()!['message'], 'Good idea!');
        expect(doc.data()!['read_by'], contains(userId));
      });

      test('increments reply_count on announcement', () async {
        await announcementRef.update({
          'reply_count': FieldValue.increment(1),
        });

        final doc = await announcementRef.get();
        expect(
            (doc.data() as Map<String, dynamic>)['reply_count'], 1);
      });

      test('multiple replies increment count correctly', () async {
        final repliesPath =
            '$announcementsPath/${announcementRef.id}/replies';

        for (int i = 0; i < 5; i++) {
          await firestore.collection(repliesPath).add({
            'sender_id': 'user$i',
            'sender_name': 'User $i',
            'message': 'Reply $i',
            'created_at': Timestamp.now(),
            'read_by': ['user$i'],
          });
          await announcementRef.update({
            'reply_count': FieldValue.increment(1),
          });
        }

        final doc = await announcementRef.get();
        expect(
            (doc.data() as Map<String, dynamic>)['reply_count'], 5);

        final repliesSnapshot =
            await firestore.collection(repliesPath).get();
        expect(repliesSnapshot.docs.length, 5);
      });

      test('reply with replyToPreview (nested reply)', () async {
        final repliesPath =
            '$announcementsPath/${announcementRef.id}/replies';

        await firestore.collection(repliesPath).add({
          'sender_id': userId,
          'sender_name': 'User',
          'message': 'Reply to someone',
          'created_at': Timestamp.now(),
          'read_by': [userId],
          'reply_to_id': 'prev_reply_id',
          'reply_to_preview': {
            'sender_name': 'PrevUser',
            'message_preview': 'Previous message...',
          },
        });

        final snapshot = await firestore.collection(repliesPath).get();
        final doc = snapshot.docs.first;
        expect(doc.data()['reply_to_id'], 'prev_reply_id');
        expect(doc.data()['reply_to_preview'], isNotNull);
      });
    });

    group('deleteReply', () {
      test('removes reply and decrements reply_count', () async {
        final announcementRef =
            await firestore.collection(announcementsPath).add({
          'title': 'Test',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [],
          'reply_count': 2,
        });

        final repliesPath =
            '$announcementsPath/${announcementRef.id}/replies';
        final replyRef = await firestore.collection(repliesPath).add({
          'sender_id': userId,
          'sender_name': 'User',
          'message': 'To delete',
          'created_at': Timestamp.now(),
          'read_by': [userId],
        });

        // Delete reply
        await replyRef.delete();
        await announcementRef.update({
          'reply_count': FieldValue.increment(-1),
        });

        final replyDoc = await replyRef.get();
        expect(replyDoc.exists, isFalse);

        final annDoc = await announcementRef.get();
        expect((annDoc.data() as Map<String, dynamic>)['reply_count'],
            1);
      });
    });

    group('markAllRepliesAsRead', () {
      test('batch marks all unread replies for user', () async {
        final announcementRef =
            await firestore.collection(announcementsPath).add({
          'title': 'Test',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [],
          'reply_count': 3,
        });

        final repliesPath =
            '$announcementsPath/${announcementRef.id}/replies';

        // 3 replies: 1 already read, 2 unread
        await firestore.collection(repliesPath).add({
          'sender_id': 'other1',
          'sender_name': 'Other1',
          'message': 'Already read',
          'created_at': Timestamp.now(),
          'read_by': ['other1', userId],
        });
        await firestore.collection(repliesPath).add({
          'sender_id': 'other2',
          'sender_name': 'Other2',
          'message': 'Unread 1',
          'created_at': Timestamp.now(),
          'read_by': ['other2'],
        });
        await firestore.collection(repliesPath).add({
          'sender_id': 'other3',
          'sender_name': 'Other3',
          'message': 'Unread 2',
          'created_at': Timestamp.now(),
          'read_by': ['other3'],
        });

        // Batch mark as read (mimicking markAllRepliesAsRead)
        final snapshot = await firestore.collection(repliesPath).get();
        final batch = firestore.batch();
        int updated = 0;

        for (final doc in snapshot.docs) {
          final readBy =
              (doc.data()['read_by'] as List<dynamic>?)?.cast<String>() ?? [];
          if (!readBy.contains(userId)) {
            batch.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
            updated++;
          }
        }
        await batch.commit();

        expect(updated, 2);

        // Verify all are now read
        final updatedSnapshot =
            await firestore.collection(repliesPath).get();
        for (final doc in updatedSnapshot.docs) {
          final readBy = List<String>.from(doc.data()['read_by']);
          expect(readBy, contains(userId));
        }
      });

      test('returns 0 when all replies already read', () async {
        final announcementRef =
            await firestore.collection(announcementsPath).add({
          'title': 'Test',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [],
          'reply_count': 1,
        });

        final repliesPath =
            '$announcementsPath/${announcementRef.id}/replies';
        await firestore.collection(repliesPath).add({
          'sender_id': 'other',
          'sender_name': 'Other',
          'message': 'Already read',
          'created_at': Timestamp.now(),
          'read_by': ['other', userId],
        });

        final snapshot = await firestore.collection(repliesPath).get();
        int updated = 0;
        for (final doc in snapshot.docs) {
          final readBy =
              (doc.data()['read_by'] as List<dynamic>?)?.cast<String>() ?? [];
          if (!readBy.contains(userId)) {
            updated++;
          }
        }

        expect(updated, 0);
      });
    });

    group('unread reply count stream', () {
      test('counts unread replies in real-time', () async {
        final announcementRef =
            await firestore.collection(announcementsPath).add({
          'title': 'Test',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [],
          'reply_count': 0,
        });

        final repliesPath =
            '$announcementsPath/${announcementRef.id}/replies';

        // Create stream listener
        final stream = firestore
            .collection(repliesPath)
            .snapshots()
            .map((snapshot) {
          return snapshot.docs.where((doc) {
            final readBy = List<String>.from(doc.data()['read_by'] ?? []);
            return !readBy.contains(userId);
          }).length;
        });

        // Initially 0
        expect(await stream.first, 0);

        // Add an unread reply
        await firestore.collection(repliesPath).add({
          'sender_id': 'other',
          'sender_name': 'Other',
          'message': 'New reply',
          'created_at': Timestamp.now(),
          'read_by': ['other'],
        });

        expect(await stream.first, 1);
      });
    });

    // ========== Full Announcement Badge Flow ==========

    group('full announcement badge cascade', () {
      test('create announcement → increment → read → decrement → zero',
          () async {
        final memberPath = 'clubs/$clubId/members';

        // Setup member
        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 0,
            'announcements': 0,
          },
        });

        // Phase 1: Create announcement
        final announcementRef =
            await firestore.collection(announcementsPath).add({
          'title': 'New info',
          'message': 'Details here',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [adminId],
          'reply_count': 0,
        });

        // Phase 2: Cloud Function increments badge (+1 for announcement)
        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.announcements': FieldValue.increment(1),
          'unread_counts.total': FieldValue.increment(1),
        });

        final beforeRead =
            await firestore.collection(memberPath).doc(userId).get();
        expect(
            (beforeRead.data()!['unread_counts']
                as Map<String, dynamic>)['announcements'],
            1);

        // Phase 3: User opens announcement → check if already read
        final annDoc = await firestore
            .collection(announcementsPath)
            .doc(announcementRef.id)
            .get();
        final readBy = List<String>.from(annDoc.data()!['read_by'] ?? []);
        final wasUnread = !readBy.contains(userId);
        expect(wasUnread, isTrue, reason: 'Announcement should be unread');

        // Mark announcement as read
        await firestore
            .collection(announcementsPath)
            .doc(announcementRef.id)
            .update({
          'read_by': FieldValue.arrayUnion([userId]),
        });

        // Phase 4: Decrement badge (announcement itself = 1, replies = 0)
        final totalToDecrement = (wasUnread ? 1 : 0) + 0; // 0 replies
        expect(totalToDecrement, 1);

        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.announcements':
              FieldValue.increment(-totalToDecrement),
          'unread_counts.total': FieldValue.increment(-totalToDecrement),
        });

        final afterRead =
            await firestore.collection(memberPath).doc(userId).get();
        expect(
            (afterRead.data()!['unread_counts']
                as Map<String, dynamic>)['announcements'],
            0);
        expect(
            (afterRead.data()!['unread_counts']
                as Map<String, dynamic>)['total'],
            0);
      });

      test('announcement already read → no double decrement', () async {
        final memberPath = 'clubs/$clubId/members';

        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 0,
            'announcements': 0,
          },
        });

        // Create announcement that user has ALREADY read
        await firestore.collection(announcementsPath).add({
          'title': 'Already read',
          'message': 'Details',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [adminId, userId], // userId already in read_by
          'reply_count': 0,
        });

        // User opens it again → check if already read
        final annDoc = (await firestore.collection(announcementsPath).get())
            .docs
            .first;
        final readBy =
            List<String>.from(annDoc.data()['read_by'] ?? []);
        final wasUnread = !readBy.contains(userId);
        expect(wasUnread, isFalse, reason: 'Should already be read');

        // totalToDecrement = 0 (already read) + 0 (no unread replies)
        final totalToDecrement = (wasUnread ? 1 : 0) + 0;
        expect(totalToDecrement, 0, reason: 'Nothing to decrement');

        // Badge should stay at 0
        final memberDoc =
            await firestore.collection(memberPath).doc(userId).get();
        expect(
            (memberDoc.data()!['unread_counts']
                as Map<String, dynamic>)['announcements'],
            0);
      });

      test('announcement + replies → total decrement is correct', () async {
        final memberPath = 'clubs/$clubId/members';

        await firestore.collection(memberPath).doc(userId).set({
          'unread_counts': {
            'total': 4,
            'announcements': 4, // 1 announcement + 3 replies
          },
        });

        // Create unread announcement with 3 unread replies
        final announcementRef =
            await firestore.collection(announcementsPath).add({
          'title': 'With replies',
          'message': 'Discussion topic',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [adminId], // userId NOT in read_by
          'reply_count': 3,
        });

        final repliesPath =
            '$announcementsPath/${announcementRef.id}/replies';
        for (int i = 0; i < 3; i++) {
          await firestore.collection(repliesPath).add({
            'sender_id': 'other$i',
            'sender_name': 'Other $i',
            'message': 'Reply $i',
            'created_at': Timestamp.now(),
            'read_by': ['other$i'], // userId NOT in read_by
          });
        }

        // Step 1: Check if announcement was unread
        final annDoc = await firestore
            .collection(announcementsPath)
            .doc(announcementRef.id)
            .get();
        final readBy = List<String>.from(annDoc.data()!['read_by'] ?? []);
        final announcementWasUnread = !readBy.contains(userId);
        expect(announcementWasUnread, isTrue);

        // Step 2: Mark announcement as read
        await firestore
            .collection(announcementsPath)
            .doc(announcementRef.id)
            .update({
          'read_by': FieldValue.arrayUnion([userId]),
        });

        // Step 3: Mark all replies as read, count how many
        final repliesSnapshot =
            await firestore.collection(repliesPath).get();
        final batch = firestore.batch();
        int repliesMarked = 0;
        for (final doc in repliesSnapshot.docs) {
          final replyReadBy =
              List<String>.from(doc.data()['read_by'] ?? []);
          if (!replyReadBy.contains(userId)) {
            batch.update(doc.reference, {
              'read_by': FieldValue.arrayUnion([userId]),
            });
            repliesMarked++;
          }
        }
        await batch.commit();
        expect(repliesMarked, 3);

        // Step 4: Total decrement = announcement (1) + replies (3) = 4
        final totalToDecrement =
            (announcementWasUnread ? 1 : 0) + repliesMarked;
        expect(totalToDecrement, 4);

        await firestore.collection(memberPath).doc(userId).update({
          'unread_counts.announcements':
              FieldValue.increment(-totalToDecrement),
          'unread_counts.total': FieldValue.increment(-totalToDecrement),
        });

        final afterRead =
            await firestore.collection(memberPath).doc(userId).get();
        expect(
            (afterRead.data()!['unread_counts']
                as Map<String, dynamic>)['announcements'],
            0);
        expect(
            (afterRead.data()!['unread_counts']
                as Map<String, dynamic>)['total'],
            0);
      });
    });

    // ========== Model tests ==========

    group('Announcement model', () {
      test('fromFirestore parses all fields', () async {
        final docRef = await firestore.collection(announcementsPath).add({
          'title': 'Test',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'warning',
          'created_at': Timestamp.fromDate(DateTime(2024, 6, 15)),
          'read_by': [adminId, userId],
          'reply_count': 5,
          'attachments': [
            {
              'type': 'image',
              'url': 'https://example.com/img.png',
              'filename': 'img.png',
              'size': 1024,
            }
          ],
        });

        final doc = await docRef.get();
        final announcement = Announcement.fromFirestore(doc);

        expect(announcement.id, docRef.id);
        expect(announcement.title, 'Test');
        expect(announcement.type, AnnouncementType.warning);
        expect(announcement.isReadBy(userId), isTrue);
        expect(announcement.isReadBy('unknown'), isFalse);
        expect(announcement.readCount, 2);
        expect(announcement.replyCount, 5);
        expect(announcement.hasReplies, isTrue);
        expect(announcement.hasAttachments, isTrue);
      });

      test('copyWith creates modified copy', () {
        final original = Announcement(
          id: 'ann1',
          title: 'Original',
          message: 'Body',
          senderId: adminId,
          senderName: 'Admin',
          type: AnnouncementType.info,
          createdAt: DateTime.now(),
          replyCount: 0,
        );

        final modified = original.copyWith(
          title: 'Modified',
          type: AnnouncementType.urgent,
          replyCount: 3,
        );

        expect(modified.title, 'Modified');
        expect(modified.type, AnnouncementType.urgent);
        expect(modified.replyCount, 3);
        expect(modified.message, 'Body'); // unchanged
        expect(modified.id, 'ann1'); // unchanged
      });
    });

    group('AnnouncementReply model', () {
      test('fromFirestore parses all fields', () async {
        final announcementRef =
            await firestore.collection(announcementsPath).add({
          'title': 'Test',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [],
          'reply_count': 0,
        });

        final repliesPath =
            '$announcementsPath/${announcementRef.id}/replies';
        final replyRef = await firestore.collection(repliesPath).add({
          'sender_id': userId,
          'sender_name': 'User',
          'message': 'A reply',
          'created_at': Timestamp.fromDate(DateTime(2024, 6, 15)),
          'read_by': [userId],
          'reply_to_id': 'prev_id',
          'reply_to_preview': {
            'sender_name': 'PrevUser',
            'message_preview': 'Preview text',
          },
        });

        final doc = await replyRef.get();
        final reply = AnnouncementReply.fromFirestore(doc);

        expect(reply.id, replyRef.id);
        expect(reply.senderId, userId);
        expect(reply.message, 'A reply');
        expect(reply.isReadBy(userId), isTrue);
        expect(reply.isReply, isTrue);
        expect(reply.replyToPreview!.senderName, 'PrevUser');
      });

      test('toFirestore roundtrip preserves data', () async {
        final reply = AnnouncementReply(
          id: 'reply1',
          senderId: userId,
          senderName: 'User',
          message: 'Test message',
          createdAt: DateTime(2024, 6, 15),
          readBy: [userId],
          replyToId: 'parent_id',
          replyToPreview: ReplyPreview(
            senderName: 'Parent',
            messagePreview: 'Preview',
          ),
        );

        final announcementRef =
            await firestore.collection(announcementsPath).add({
          'title': 'Test',
          'message': 'Body',
          'sender_id': adminId,
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [],
          'reply_count': 0,
        });

        final repliesPath =
            '$announcementsPath/${announcementRef.id}/replies';
        final docRef =
            await firestore.collection(repliesPath).add(reply.toFirestore());
        final roundtrip =
            AnnouncementReply.fromFirestore(await docRef.get());

        expect(roundtrip.senderId, userId);
        expect(roundtrip.message, 'Test message');
        expect(roundtrip.replyToId, 'parent_id');
        expect(roundtrip.replyToPreview!.senderName, 'Parent');
      });
    });
  });
}
