/**
 * Cloud Function: Send push notification when a new message is posted in a piscine session
 *
 * Triggers on: clubs/{clubId}/piscine_sessions/{sessionId}/messages/{messageId}
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

/**
 * Firestore trigger for new piscine session messages (Gen2)
 */
exports.onNewSessionMessage = onDocumentCreated(
  {
    document: 'clubs/{clubId}/piscine_sessions/{sessionId}/messages/{messageId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, sessionId, messageId } = event.params;
    const message = event.data.data();

    console.log(`New message in club/${clubId}/piscine_sessions/${sessionId}/messages/${messageId}`);
    console.log('Message data:', JSON.stringify(message));

    try {
      // 1. Get the session details
      const sessionDoc = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('piscine_sessions')
        .doc(sessionId)
        .get();

      if (!sessionDoc.exists) {
        console.log('Session not found, skipping notification');
        return null;
      }

      const session = sessionDoc.data();

      // Format date for notification
      const sessionDate = session.date?.toDate();
      const dateStr = sessionDate
        ? `${sessionDate.getDate()}/${sessionDate.getMonth() + 1}`
        : 'Piscine';

      // 2. Determine which group this message is for
      const groupType = message.group_type; // 'accueil', 'encadrants', or 'niveau'
      const groupLevel = message.group_level; // Only for 'niveau' type

      // 3. Get the members who should receive this notification
      const recipientIds = new Set();
      const senderId = message.sender_id;

      if (groupType === 'accueil') {
        // Notify all accueil members
        (session.accueil || []).forEach(member => {
          if (member.membre_id !== senderId) {
            recipientIds.add(member.membre_id);
          }
        });
      } else if (groupType === 'encadrants') {
        // Notify all encadrants (from all levels + baptemes)
        (session.baptemes || []).forEach(member => {
          if (member.membre_id !== senderId) {
            recipientIds.add(member.membre_id);
          }
        });

        const niveaux = session.niveaux || {};
        Object.values(niveaux).forEach(level => {
          (level.encadrants || []).forEach(member => {
            if (member.membre_id !== senderId) {
              recipientIds.add(member.membre_id);
            }
          });
        });
      } else if (groupType === 'niveau' && groupLevel) {
        // Notify encadrants of this specific level
        const levelData = session.niveaux?.[groupLevel];
        if (levelData) {
          (levelData.encadrants || []).forEach(member => {
            if (member.membre_id !== senderId) {
              recipientIds.add(member.membre_id);
            }
          });
        }
        // TODO: Also notify students enrolled in this level if needed
      }

      if (recipientIds.size === 0) {
        console.log('No recipients found, skipping notification');
        return null;
      }

      // 4. Get FCM tokens for all recipients
      const tokenPromises = Array.from(recipientIds).map(memberId =>
        admin.firestore()
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(memberId)
          .get()
      );

      const memberDocs = await Promise.all(tokenPromises);

      // Collect all valid FCM tokens
      const tokens = [];
      const tokenToMember = new Map();

      memberDocs.forEach(doc => {
        if (doc.exists) {
          const memberData = doc.data();
          if (memberData.notifications_enabled !== false) {
            if (memberData.fcm_tokens && Array.isArray(memberData.fcm_tokens)) {
              memberData.fcm_tokens.forEach(token => {
                if (token && !tokens.includes(token)) {
                  tokens.push(token);
                  tokenToMember.set(token, { memberId: doc.id, clubId });
                }
              });
            } else if (memberData.fcm_token) {
              tokens.push(memberData.fcm_token);
              tokenToMember.set(memberData.fcm_token, { memberId: doc.id, clubId });
            }
          }
        }
      });

      if (tokens.length === 0) {
        console.log('No FCM tokens found, skipping notification');
        return null;
      }

      console.log(`Sending notification to ${tokens.length} devices`);

      // 5. Prepare notification payload
      const senderName = message.sender_name || 'Quelqu\'un';
      const messageText = message.message || '';

      let groupName = 'Piscine';
      if (groupType === 'accueil') {
        groupName = 'Accueil';
      } else if (groupType === 'encadrants') {
        groupName = 'Encadrants';
      } else if (groupType === 'niveau' && groupLevel) {
        groupName = `Niveau ${groupLevel}`;
      }

      const notificationTitle = `${senderName} - ${groupName} (${dateStr})`;
      const notificationBody = messageText.length > 100
        ? messageText.substring(0, 97) + '...'
        : messageText;

      const payload = {
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        data: {
          type: 'session_message',
          club_id: clubId,
          session_id: sessionId,
          message_id: messageId,
          group_type: groupType,
          group_level: groupLevel || '',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'piscine_messages',
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

      // 6. Send notifications
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

      // 7. Handle failed tokens
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
