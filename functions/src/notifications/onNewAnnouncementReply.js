/**
 * Cloud Function: Send push notification when a new reply is posted on an announcement
 *
 * Triggers on: clubs/{clubId}/announcements/{announcementId}/replies/{replyId}
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { incrementUnreadCounts, collectTokensAndMembers, sendNotificationsWithBadge } = require('../utils/badge-helper');

/**
 * Firestore trigger for new announcement replies (Gen2)
 */
exports.onNewAnnouncementReply = onDocumentCreated(
  {
    document: 'clubs/{clubId}/announcements/{announcementId}/replies/{replyId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, announcementId, replyId } = event.params;
    const reply = event.data.data();

    console.log(`New reply in club/${clubId}/announcements/${announcementId}/replies/${replyId}`);
    console.log('Reply data:', JSON.stringify(reply));

    try {
      // 1. Get the announcement details
      const announcementDoc = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('announcements')
        .doc(announcementId)
        .get();

      if (!announcementDoc.exists) {
        console.log('Announcement not found, skipping notification');
        return null;
      }

      const announcement = announcementDoc.data();
      const announcementTitle = announcement.title || 'Annonce';
      const announcementSenderId = announcement.sender_id;

      // 2. Get all club members to notify
      // For announcements, we notify:
      // - The announcement author (if not the replier)
      // - Members who have read the announcement or replied to it
      const membersToNotify = new Set();

      // Always notify the announcement author
      if (announcementSenderId && announcementSenderId !== reply.sender_id) {
        membersToNotify.add(announcementSenderId);
      }

      // Add members who have read the announcement
      if (announcement.read_by && Array.isArray(announcement.read_by)) {
        announcement.read_by.forEach(userId => {
          if (userId !== reply.sender_id) {
            membersToNotify.add(userId);
          }
        });
      }

      // If replying to a specific reply, also notify that person
      if (reply.reply_to_id && reply.reply_to_preview) {
        // The person being replied to should definitely be notified
        // We don't have their ID directly, but they're likely in read_by
      }

      if (membersToNotify.size === 0) {
        console.log('No members to notify, skipping notification');
        return null;
      }

      // 3. Get FCM tokens for members to notify
      const memberIds = Array.from(membersToNotify);
      const tokenPromises = memberIds.map(memberId =>
        admin.firestore()
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(memberId)
          .get()
      );

      const memberDocs = await Promise.all(tokenPromises);

      // Collect tokens and members using helper function
      const { tokens, memberTokenGroups, recipientIds } = collectTokensAndMembers(memberDocs, reply.sender_id);

      if (tokens.length === 0) {
        console.log('No FCM tokens found, skipping notification');
        return null;
      }

      console.log(`Sending notification to ${tokens.length} devices`);

      // 4. Prepare the notification payload
      const senderName = reply.sender_name || 'Quelqu\'un';
      const messageText = reply.message || '';
      const isReply = !!reply.reply_to_id;
      const replyPreview = reply.reply_to_preview;
      const hasAttachments = reply.attachments && reply.attachments.length > 0;

      let notificationTitle;
      let notificationBody;

      if (isReply && replyPreview) {
        notificationTitle = `${senderName} a répondu à ${replyPreview.sender_name}`;
        notificationBody = messageText.length > 80
          ? messageText.substring(0, 77) + '...'
          : messageText;
      } else {
        notificationTitle = `${senderName} a répondu à "${announcementTitle}"`;
        if (hasAttachments && !messageText) {
          notificationBody = `📎 ${reply.attachments.length} pièce(s) jointe(s)`;
        } else {
          notificationBody = messageText.length > 100
            ? messageText.substring(0, 97) + '...'
            : messageText;
        }
      }

      const basePayload = {
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        data: {
          type: 'announcement_reply',
          club_id: clubId,
          announcement_id: announcementId,
          reply_id: replyId,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'announcements',
            priority: 'high',
            sound: 'default',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-expiration': '0',
          },
          payload: {
            aps: {
              alert: {
                title: notificationTitle,
                body: notificationBody,
              },
              sound: 'default',
              'content-available': 1,
            },
          },
        },
      };

      // 5. Send notifications with dynamic badge counts
      const { successCount, failureCount } = await sendNotificationsWithBadge(clubId, memberTokenGroups, basePayload, 'announcements');

      // 6. Increment unread counts for recipients
      await incrementUnreadCounts(clubId, recipientIds, 'announcements');

      console.log(`Notifications sent: ${successCount} success, ${failureCount} failures`);
      return { success: successCount, failure: failureCount };

    } catch (error) {
      console.error('Error sending notifications:', error);
      throw error;
    }
  }
);
