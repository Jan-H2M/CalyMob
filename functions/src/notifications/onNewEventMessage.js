/**
 * Cloud Function: Send push notification when a new message is posted in an event
 *
 * Triggers on: clubs/{clubId}/operations/{operationId}/messages/{messageId}
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

/**
 * Firestore trigger for new event messages (Gen2)
 */
exports.onNewEventMessage = onDocumentCreated(
  {
    document: 'clubs/{clubId}/operations/{operationId}/messages/{messageId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, operationId, messageId } = event.params;
    const message = event.data.data();

    console.log(`New message in club/${clubId}/operations/${operationId}/messages/${messageId}`);
    console.log('Message data:', JSON.stringify(message));

    try {
      // 1. Get the event/operation details
      const operationDoc = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(operationId)
        .get();

      if (!operationDoc.exists) {
        console.log('Operation not found, skipping notification');
        return null;
      }

      const operation = operationDoc.data();
      const eventTitle = operation.title || 'Événement';

      // 2. Get participants of the event
      const participantsSnapshot = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(operationId)
        .collection('participants')
        .get();

      if (participantsSnapshot.empty) {
        console.log('No participants found, skipping notification');
        return null;
      }

      // 3. Get FCM tokens for all participants except the sender
      const senderId = message.sender_id;
      const senderName = message.sender_name || 'Quelqu\'un';
      const messageText = message.message || '';

      const tokenPromises = [];
      participantsSnapshot.forEach(doc => {
        const participantId = doc.id;
        // Don't notify the sender
        if (participantId !== senderId) {
          tokenPromises.push(
            admin.firestore()
              .collection('clubs')
              .doc(clubId)
              .collection('members')
              .doc(participantId)
              .get()
          );
        }
      });

      const memberDocs = await Promise.all(tokenPromises);

      // Collect all valid FCM tokens
      const tokens = [];
      memberDocs.forEach(doc => {
        if (doc.exists) {
          const memberData = doc.data();
          if (memberData.fcm_token && memberData.notifications_enabled !== false) {
            tokens.push(memberData.fcm_token);
          }
        }
      });

      if (tokens.length === 0) {
        console.log('No FCM tokens found, skipping notification');
        return null;
      }

      console.log(`Sending notification to ${tokens.length} devices`);

      // 4. Prepare the notification payload
      const payload = {
        notification: {
          title: `${senderName} - ${eventTitle}`,
          body: messageText.length > 100
            ? messageText.substring(0, 97) + '...'
            : messageText,
        },
        data: {
          type: 'event_message',
          club_id: clubId,
          operation_id: operationId,
          message_id: messageId,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          notification: {
            channelId: 'event_messages',
            priority: 'high',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
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

      // 6. Handle failed tokens (remove invalid ones)
      let successCount = 0;
      let failureCount = 0;

      results.forEach((result, batchIndex) => {
        successCount += result.successCount;
        failureCount += result.failureCount;

        // Remove invalid tokens
        result.responses.forEach((response, index) => {
          if (!response.success) {
            const error = response.error;
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
              const failedToken = tokens[batchIndex * batchSize + index];
              console.log(`Removing invalid token: ${failedToken.substring(0, 20)}...`);
              // Could add logic here to remove token from Firestore
            }
          }
        });
      });

      console.log(`Notifications sent: ${successCount} success, ${failureCount} failures`);
      return { success: successCount, failure: failureCount };

    } catch (error) {
      console.error('Error sending notifications:', error);
      throw error;
    }
  }
);
