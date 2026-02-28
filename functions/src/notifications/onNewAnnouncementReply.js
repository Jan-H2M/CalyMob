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

      // 2. Get ALL club members with the app installed (same approach as onNewEventMessage)
      // Previously used read_by array, but read tracking moved to local storage
      const membersSnapshot = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .where('app_installed', '==', true)
        .get();

      if (membersSnapshot.empty) {
        console.log('No members with app installed found, skipping notification');
        return null;
      }

      const memberDocs = membersSnapshot.docs;

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

      // 5. Increment unread counts FIRST (zodat badge-getal correct is bij verzending)
      await incrementUnreadCounts(clubId, recipientIds, 'announcements');

      // 6. Send notifications with dynamic badge counts
      const { successCount, failureCount } = await sendNotificationsWithBadge(clubId, memberTokenGroups, basePayload, 'announcements');

      console.log(`Notifications sent: ${successCount} success, ${failureCount} failures`);
      return { success: successCount, failure: failureCount };

    } catch (error) {
      console.error('Error sending notifications:', error);
      throw error;
    }
  }
);
