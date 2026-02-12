/**
 * Cloud Function: Send push notification when a new club announcement is created
 *
 * Triggers on: clubs/{clubId}/announcements/{announcementId}
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { incrementUnreadCounts, collectTokensAndMembers, sendNotificationsWithBadge } = require('../utils/badge-helper');

/**
 * Firestore trigger for new announcements (Gen2)
 */
exports.onNewAnnouncement = onDocumentCreated(
  {
    document: 'clubs/{clubId}/announcements/{announcementId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, announcementId } = event.params;
    const announcement = event.data.data();

    console.log(`New announcement in club/${clubId}/announcements/${announcementId}`);
    console.log('Announcement data:', JSON.stringify(announcement));

    try {
      const title = announcement.title || 'Nouvelle annonce';
      const message = announcement.message || '';
      const senderName = announcement.sender_name || 'Le club';
      const senderId = announcement.sender_id;
      const type = announcement.type || 'info'; // info, warning, urgent

      // 1. Get all members of the club with valid FCM tokens
      const membersSnapshot = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .where('notifications_enabled', '!=', false)
        .get();

      if (membersSnapshot.empty) {
        console.log('No members found, skipping notification');
        return null;
      }

      // 2. Collect tokens and members using helper function
      const memberDocs = membersSnapshot.docs;
      const { tokens, memberTokenGroups, recipientIds } = collectTokensAndMembers(memberDocs, senderId);

      if (tokens.length === 0) {
        console.log('No FCM tokens found, skipping notification');
        return null;
      }

      console.log(`Sending announcement to ${tokens.length} devices`);

      // 3. Determine notification priority based on announcement type
      const isUrgent = type === 'urgent';

      // 4. Prepare the notification payload
      const basePayload = {
        notification: {
          title: `📢 ${title}`,
          body: message.length > 100
            ? message.substring(0, 97) + '...'
            : message,
        },
        data: {
          type: 'announcement',
          club_id: clubId,
          announcement_id: announcementId,
          announcement_type: type,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          notification: {
            channelId: 'announcements',
            priority: isUrgent ? 'max' : 'high',
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
                title: `📢 ${title}`,
                body: message.length > 100
                  ? message.substring(0, 97) + '...'
                  : message,
              },
              sound: 'default',
              'content-available': 1,
              ...(isUrgent && { 'interruption-level': 'time-sensitive' }),
            },
          },
        },
      };

      // 5. Increment unread counts FIRST (zodat badge-getal correct is bij verzending)
      await incrementUnreadCounts(clubId, recipientIds, 'announcements');

      // 6. Send notifications with dynamic badge counts
      const { successCount, failureCount } = await sendNotificationsWithBadge(clubId, memberTokenGroups, basePayload, 'announcements');

      console.log(`Announcement notifications sent: ${successCount} success, ${failureCount} failures`);
      return { success: successCount, failure: failureCount };

    } catch (error) {
      console.error('Error sending announcement notifications:', error);
      throw error;
    }
  }
);
