/**
 * Cloud Function: Send push notification when a new club announcement is created
 *
 * Triggers on: clubs/{clubId}/announcements/{announcementId}
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

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

      // 2. Collect all valid FCM tokens (except sender)
      const tokens = [];
      membersSnapshot.forEach(doc => {
        const memberData = doc.data();
        // Don't notify the sender
        if (doc.id !== senderId && memberData.fcm_token) {
          tokens.push(memberData.fcm_token);
        }
      });

      if (tokens.length === 0) {
        console.log('No FCM tokens found, skipping notification');
        return null;
      }

      console.log(`Sending announcement to ${tokens.length} devices`);

      // 3. Determine notification priority based on announcement type
      const isUrgent = type === 'urgent';

      // 4. Prepare the notification payload
      const payload = {
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
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              ...(isUrgent && { 'interruption-level': 'time-sensitive' }),
            },
          },
        },
      };

      // 5. Send notifications (in batches of 500 if needed)
      const batchSize = 500;
      const batches = [];

      for (let i = 0; i < tokens.length; i += batchSize) {
        const batchTokens = tokens.slice(i, i + batchSize);
        batches.push(
          admin.messaging().sendEachForMulticast({
            tokens: batchTokens,
            ...payload,
          })
        );
      }

      const results = await Promise.all(batches);

      // 6. Handle failed tokens
      let successCount = 0;
      let failureCount = 0;

      results.forEach((result, batchIndex) => {
        successCount += result.successCount;
        failureCount += result.failureCount;

        // Log invalid tokens
        result.responses.forEach((response, index) => {
          if (!response.success) {
            const error = response.error;
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
              const failedToken = tokens[batchIndex * batchSize + index];
              console.log(`Invalid token: ${failedToken.substring(0, 20)}...`);
            }
          }
        });
      });

      console.log(`Announcement notifications sent: ${successCount} success, ${failureCount} failures`);
      return { success: successCount, failure: failureCount };

    } catch (error) {
      console.error('Error sending announcement notifications:', error);
      throw error;
    }
  }
);
