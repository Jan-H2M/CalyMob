/**
 * Cloud Function: Send push notification when a new message is posted in a piscine session
 *
 * Triggers on: clubs/{clubId}/piscine_sessions/{sessionId}/messages/{messageId}
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { incrementUnreadCounts, collectTokensAndMembers, sendNotificationsWithBadge } = require('../utils/badge-helper');

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

      // Collect tokens and members using helper function
      const { tokens, memberTokenGroups, recipientIds: helperRecipientIds } = collectTokensAndMembers(memberDocs, senderId);

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

      const basePayload = {
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
              'content-available': 1,
            },
          },
        },
      };

      // 6. Increment unread counts FIRST (zodat badge-getal correct is bij verzending)
      await incrementUnreadCounts(clubId, helperRecipientIds, 'session_messages');

      // 7. Send notifications with dynamic badge counts
      const { successCount, failureCount } = await sendNotificationsWithBadge(clubId, memberTokenGroups, basePayload, 'session_messages');

      console.log(`Notifications sent: ${successCount} success, ${failureCount} failures`);
      return { success: successCount, failure: failureCount };

    } catch (error) {
      console.error('Error sending notifications:', error);
      throw error;
    }
  }
);
