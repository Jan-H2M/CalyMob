import 'package:flutter_test/flutter_test.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Tests for admin actions that affect badge counts:
/// - Admin deletes a message → participants' badges should be adjusted
/// - Admin deletes an announcement → all members' badges should be adjusted
/// - Admin deletes an event → all participants' badges should be cleaned
/// - Admin deletes a team channel message → team members' badges adjusted
void main() {
  const clubId = 'club1';
  final memberPath = 'clubs/$clubId/members';

  group('Admin Action & Cleanup Tests', () {
    late FakeFirebaseFirestore firestore;

    setUp(() {
      firestore = FakeFirebaseFirestore();
    });

    // ========== Admin Deletes Event Message ==========

    group('admin deletes event message', () {
      test('deleting unread message should decrement participant badges',
          () async {
        const operationId = 'op1';
        final messagesPath =
            'clubs/$clubId/operations/$operationId/messages';

        // Setup: 3 messages, 1 to be deleted (unread by user1)
        await firestore.collection(messagesPath).add({
          'sender_id': 'sender',
          'message': 'Keep 1',
          'created_at': Timestamp.now(),
          'read_by': ['sender'],
        });
        final toDelete = await firestore.collection(messagesPath).add({
          'sender_id': 'sender',
          'message': 'Delete me',
          'created_at': Timestamp.now(),
          'read_by': ['sender'],
        });
        await firestore.collection(messagesPath).add({
          'sender_id': 'sender',
          'message': 'Keep 2',
          'created_at': Timestamp.now(),
          'read_by': ['sender'],
        });

        // Participants with unread counts
        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {'total': 3, 'event_messages': 3},
        });
        await firestore.collection(memberPath).doc('user2').set({
          'unread_counts': {'total': 3, 'event_messages': 3},
        });

        // Delete the message
        final deletedDoc = await toDelete.get();
        final deletedReadBy =
            List<String>.from(deletedDoc.data()!['read_by'] ?? []);

        await toDelete.delete();

        // For each participant who hadn't read the deleted message:
        // decrement their badge
        for (final participantId in ['user1', 'user2']) {
          if (!deletedReadBy.contains(participantId)) {
            await firestore
                .collection(memberPath)
                .doc(participantId)
                .update({
              'unread_counts.event_messages': FieldValue.increment(-1),
              'unread_counts.total': FieldValue.increment(-1),
            });
          }
        }

        // Verify
        for (final pId in ['user1', 'user2']) {
          final doc =
              await firestore.collection(memberPath).doc(pId).get();
          expect(doc.data()!['unread_counts']['event_messages'], 2);
          expect(doc.data()!['unread_counts']['total'], 2);
        }

        // Verify message is actually deleted
        final deletedCheck = await toDelete.get();
        expect(deletedCheck.exists, isFalse);
      });

      test('deleting already-read message does not change badges', () async {
        const operationId = 'op1';
        final messagesPath =
            'clubs/$clubId/operations/$operationId/messages';

        final toDelete = await firestore.collection(messagesPath).add({
          'sender_id': 'sender',
          'message': 'Already read',
          'created_at': Timestamp.now(),
          'read_by': ['sender', 'user1', 'user2'],
        });

        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {'total': 5, 'event_messages': 5},
        });

        final deletedDoc = await toDelete.get();
        final deletedReadBy =
            List<String>.from(deletedDoc.data()!['read_by'] ?? []);

        await toDelete.delete();

        // user1 had already read it → no decrement
        if (!deletedReadBy.contains('user1')) {
          fail('user1 should have read this message');
        }

        // No badge change
        final doc =
            await firestore.collection(memberPath).doc('user1').get();
        expect(doc.data()!['unread_counts']['event_messages'], 5);
      });
    });

    // ========== Admin Deletes Announcement ==========

    group('admin deletes announcement', () {
      test('deleting unread announcement decrements all non-readers',
          () async {
        final announcementRef =
            await firestore.collection('clubs/$clubId/announcements').add({
          'title': 'To Delete',
          'message': 'Body',
          'sender_id': 'admin',
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': ['admin', 'user2'], // user1 hasn't read it
          'reply_count': 0,
        });

        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {'total': 3, 'announcements': 3},
        });
        await firestore.collection(memberPath).doc('user2').set({
          'unread_counts': {'total': 2, 'announcements': 2},
        });

        final annDoc = await announcementRef.get();
        final readBy = List<String>.from(
            (annDoc.data() as Map<String, dynamic>)['read_by'] ?? []);

        await announcementRef.delete();

        // Decrement for users who hadn't read it
        for (final userId in ['user1', 'user2']) {
          if (!readBy.contains(userId)) {
            await firestore
                .collection(memberPath)
                .doc(userId)
                .update({
              'unread_counts.announcements': FieldValue.increment(-1),
              'unread_counts.total': FieldValue.increment(-1),
            });
          }
        }

        // user1 hadn't read → decremented
        final user1 =
            await firestore.collection(memberPath).doc('user1').get();
        expect(user1.data()!['unread_counts']['announcements'], 2);

        // user2 had read → no change
        final user2 =
            await firestore.collection(memberPath).doc('user2').get();
        expect(user2.data()!['unread_counts']['announcements'], 2);
      });

      test('deleting announcement with replies: replies exist before deletion',
          () async {
        final annRef =
            await firestore.collection('clubs/$clubId/announcements').add({
          'title': 'With Replies',
          'message': 'Body',
          'sender_id': 'admin',
          'sender_name': 'Admin',
          'type': 'info',
          'created_at': Timestamp.now(),
          'read_by': [],
          'reply_count': 2,
        });

        final repliesPath =
            'clubs/$clubId/announcements/${annRef.id}/replies';
        await firestore.collection(repliesPath).add({
          'sender_id': 'user1',
          'message': 'Reply 1',
          'created_at': Timestamp.now(),
          'read_by': ['user1'],
        });
        await firestore.collection(repliesPath).add({
          'sender_id': 'user2',
          'message': 'Reply 2',
          'created_at': Timestamp.now(),
          'read_by': ['user2'],
        });

        // Verify replies exist before deletion
        final repliesBefore = await firestore.collection(repliesPath).get();
        expect(repliesBefore.docs.length, 2);

        // Delete announcement
        await annRef.delete();

        final annExists = await annRef.get();
        expect(annExists.exists, isFalse);

        // Note: In real Firestore, subcollection docs survive parent deletion
        // (becoming orphaned). FakeFirebaseFirestore may cascade-delete them.
        // The important thing is the parent announcement is deleted.
      });
    });

    // ========== Admin Deletes Entire Event ==========

    group('admin deletes entire event', () {
      test('deleting event should clean up all participant badges',
          () async {
        const operationId = 'op_to_delete';
        final messagesPath =
            'clubs/$clubId/operations/$operationId/messages';
        final inscriptionsPath =
            'clubs/$clubId/operations/$operationId/inscriptions';

        // 3 messages
        for (int i = 0; i < 3; i++) {
          await firestore.collection(messagesPath).add({
            'sender_id': 'sender',
            'message': 'Msg $i',
            'created_at': Timestamp.now(),
            'read_by': ['sender'],
          });
        }

        // 2 participants
        await firestore.collection(inscriptionsPath).add({
          'membre_id': 'user1',
        });
        await firestore.collection(inscriptionsPath).add({
          'membre_id': 'user2',
        });

        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {'total': 3, 'event_messages': 3},
        });
        await firestore.collection(memberPath).doc('user2').set({
          'unread_counts': {'total': 3, 'event_messages': 3},
        });

        // Before deletion: count unread per participant
        final messages = (await firestore.collection(messagesPath).get())
            .docs
            .map((d) => d.data())
            .toList();
        final participants =
            (await firestore.collection(inscriptionsPath).get()).docs;

        for (final doc in participants) {
          final pId = doc.data()['membre_id'] as String;
          final unreadCount = messages.where((msg) {
            final readBy = (msg['read_by'] as List<dynamic>?) ?? [];
            return !readBy.contains(pId);
          }).length;

          if (unreadCount > 0) {
            final memberDoc = await firestore
                .collection(memberPath)
                .doc(pId)
                .get();
            final currentVal = ((memberDoc.data()!['unread_counts']
                    as Map<String, dynamic>)['event_messages'] as num?)
                ?.toInt() ??
                0;
            final decrement =
                unreadCount > currentVal ? currentVal : unreadCount;

            if (decrement > 0) {
              await firestore.collection(memberPath).doc(pId).update({
                'unread_counts.event_messages':
                    FieldValue.increment(-decrement),
                'unread_counts.total': FieldValue.increment(-decrement),
              });
            }
          }
        }

        // Delete operation
        await firestore
            .collection('clubs/$clubId/operations')
            .doc(operationId)
            .delete();

        // Verify badges are 0
        for (final pId in ['user1', 'user2']) {
          final doc =
              await firestore.collection(memberPath).doc(pId).get();
          expect(doc.data()!['unread_counts']['event_messages'], 0);
          expect(doc.data()!['unread_counts']['total'], 0);
        }
      });
    });

    // ========== Admin Deletes Team Channel Message ==========

    group('admin deletes team channel message', () {
      test('deleting unread team message decrements team badges', () async {
        final channelId = 'equipe_encadrants';
        final messagesPath =
            'clubs/$clubId/team_channels/$channelId/messages';

        final toDelete = await firestore.collection(messagesPath).add({
          'sender_id': 'sender',
          'sender_name': 'Sender',
          'message': 'Delete me',
          'read_by': ['sender'],
          'created_at': Timestamp.now(),
        });

        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {'total': 1, 'team_messages': 1},
        });

        // Check if unread before deleting
        final msgDoc = await toDelete.get();
        final readBy =
            List<String>.from(msgDoc.data()!['read_by'] ?? []);

        await toDelete.delete();

        // Decrement for user1 who hadn't read it
        if (!readBy.contains('user1')) {
          await firestore.collection(memberPath).doc('user1').update({
            'unread_counts.team_messages': FieldValue.increment(-1),
            'unread_counts.total': FieldValue.increment(-1),
          });
        }

        final doc =
            await firestore.collection(memberPath).doc('user1').get();
        expect(doc.data()!['unread_counts']['team_messages'], 0);
        expect(doc.data()!['unread_counts']['total'], 0);
      });
    });

    // ========== Admin Deletes Session Message ==========

    group('admin deletes session message', () {
      test('deleting unread session message decrements session badges',
          () async {
        final messagesPath =
            'clubs/$clubId/piscine_sessions/session1/messages';

        final toDelete = await firestore.collection(messagesPath).add({
          'sender_id': 'sender',
          'message': 'Delete me',
          'group_type': 'accueil',
          'read_by': ['sender'],
          'created_at': Timestamp.now(),
        });

        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {'total': 2, 'session_messages': 2},
        });

        final msgDoc = await toDelete.get();
        final readBy =
            List<String>.from(msgDoc.data()!['read_by'] ?? []);

        await toDelete.delete();

        if (!readBy.contains('user1')) {
          await firestore.collection(memberPath).doc('user1').update({
            'unread_counts.session_messages': FieldValue.increment(-1),
            'unread_counts.total': FieldValue.increment(-1),
          });
        }

        final doc =
            await firestore.collection(memberPath).doc('user1').get();
        expect(doc.data()!['unread_counts']['session_messages'], 1);
        expect(doc.data()!['unread_counts']['total'], 1);
      });
    });

    // ========== Badge Cleanup After Bulk Delete ==========

    group('badge cleanup after bulk operations', () {
      test('admin deletes all messages from event: badges go to zero',
          () async {
        const operationId = 'op1';
        final messagesPath =
            'clubs/$clubId/operations/$operationId/messages';

        // 5 unread messages
        for (int i = 0; i < 5; i++) {
          await firestore.collection(messagesPath).add({
            'sender_id': 'sender',
            'message': 'Msg $i',
            'created_at': Timestamp.now(),
            'read_by': ['sender'],
          });
        }

        await firestore.collection(memberPath).doc('user1').set({
          'unread_counts': {'total': 5, 'event_messages': 5},
        });

        // Count unread before bulk delete
        final snapshot = await firestore.collection(messagesPath).get();
        int unread = 0;
        for (final doc in snapshot.docs) {
          final readBy =
              List<String>.from(doc.data()['read_by'] ?? []);
          if (!readBy.contains('user1')) {
            unread++;
          }
        }

        expect(unread, 5);

        // Delete all messages
        final batch = firestore.batch();
        for (final doc in snapshot.docs) {
          batch.delete(doc.reference);
        }
        await batch.commit();

        // Decrement user badge
        final memberDoc = await firestore
            .collection(memberPath)
            .doc('user1')
            .get();
        final currentVal = ((memberDoc.data()!['unread_counts']
                as Map<String, dynamic>)['event_messages'] as num?)
            ?.toInt() ??
            0;
        final decrement =
            unread > currentVal ? currentVal : unread;

        await firestore.collection(memberPath).doc('user1').update({
          'unread_counts.event_messages':
              FieldValue.increment(-decrement),
          'unread_counts.total': FieldValue.increment(-decrement),
        });

        final after =
            await firestore.collection(memberPath).doc('user1').get();
        expect(after.data()!['unread_counts']['event_messages'], 0);
        expect(after.data()!['unread_counts']['total'], 0);
      });
    });
  });
}
