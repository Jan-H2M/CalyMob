/**
 * Cloud Function: Send push notification when a new message is posted in a team channel
 *
 * Triggers on: clubs/{clubId}/team_channels/{channelId}/messages/{messageId}
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

/**
 * Firestore trigger for new team channel messages (Gen2)
 */
exports.onNewTeamMessage = onDocumentCreated(
  {
    document: 'clubs/{clubId}/team_channels/{channelId}/messages/{messageId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, channelId, messageId } = event.params;
    const message = event.data.data();

    console.log(`New message in club/${clubId}/team_channels/${channelId}/messages/${messageId}`);
    console.log('Message data:', JSON.stringify(message));

    try {
      // 1. Get the channel details
      const channelDoc = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('team_channels')
        .doc(channelId)
        .get();

      let channelName = 'Équipe';
      let channelType = 'encadrants';

      if (channelDoc.exists) {
        const channelData = channelDoc.data();
        channelName = channelData.name || channelName;
        channelType = channelData.type || channelType;
      } else {
        // Infer from channel ID
        if (channelId === 'equipe_accueil') {
          channelName = 'Équipe Accueil';
          channelType = 'accueil';
        } else if (channelId === 'equipe_encadrants') {
          channelName = 'Équipe Encadrants';
          channelType = 'encadrants';
        }
      }

      // 2. Get all members with the relevant role
      const roleToQuery = channelType === 'accueil' ? 'accueil' : 'encadrant';
      const roleCapitalized = roleToQuery.charAt(0).toUpperCase() + roleToQuery.slice(1);

      // Query for members with this role in their clubStatuten
      const [membersLowercase, membersCapitalized] = await Promise.all([
        admin.firestore()
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .where('clubStatuten', 'array-contains', roleToQuery)
          .get(),
        admin.firestore()
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .where('clubStatuten', 'array-contains', roleCapitalized)
          .get()
      ]);

      // Combine and dedupe members
      const memberMap = new Map();
      membersLowercase.forEach(doc => memberMap.set(doc.id, doc));
      membersCapitalized.forEach(doc => memberMap.set(doc.id, doc));

      const senderId = message.sender_id;

      // 3. Collect FCM tokens
      const tokens = [];
      const tokenToMember = new Map();

      memberMap.forEach((doc, memberId) => {
        if (memberId === senderId) return; // Don't notify sender

        const memberData = doc.data();
        if (memberData.notifications_enabled === false) return;

        if (memberData.fcm_tokens && Array.isArray(memberData.fcm_tokens)) {
          memberData.fcm_tokens.forEach(token => {
            if (token && !tokens.includes(token)) {
              tokens.push(token);
              tokenToMember.set(token, { memberId, clubId });
            }
          });
        } else if (memberData.fcm_token) {
          tokens.push(memberData.fcm_token);
          tokenToMember.set(memberData.fcm_token, { memberId, clubId });
        }
      });

      if (tokens.length === 0) {
        console.log('No FCM tokens found, skipping notification');
        return null;
      }

      console.log(`Sending notification to ${tokens.length} devices`);

      // 4. Prepare notification payload
      const senderName = message.sender_name || 'Quelqu\'un';
      const messageText = message.message || '';

      const notificationTitle = `${senderName} - ${channelName}`;
      const notificationBody = messageText.length > 100
        ? messageText.substring(0, 97) + '...'
        : messageText;

      const payload = {
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        data: {
          type: 'team_message',
          club_id: clubId,
          channel_id: channelId,
          message_id: messageId,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'team_messages',
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
              badge: 1,
              'content-available': 1,
            },
          },
        },
      };

      // 5. Send notifications
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

        result.responses.forEach((response, index) => {
          if (!response.success) {
            const error = response.error;
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
              const failedToken = tokens[batchIndex * batchSize + index];
              const memberInfo = tokenToMember.get(failedToken);
              if (memberInfo) {
                console.log(`Removing invalid token from member ${memberInfo.memberId}`);
                admin.firestore()
                  .collection('clubs')
                  .doc(memberInfo.clubId)
                  .collection('members')
                  .doc(memberInfo.memberId)
                  .update({
                    fcm_tokens: admin.firestore.FieldValue.arrayRemove(failedToken)
                  })
                  .catch(err => console.error(`Failed to remove token: ${err.message}`));
              }
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
