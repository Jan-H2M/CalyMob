/**
 * Cloud Function: Send push notification when a new message is posted in an event
 *
 * Triggers on: clubs/{clubId}/operations/{operationId}/messages/{messageId}
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { incrementUnreadCounts, collectTokensAndMembers, sendNotificationsWithBadge, filterByPreference } = require('../utils/badge-helper');
const { EVENT_EXPIRY_GRACE_DAYS } = require('../utils/constants');

function stripMarkdown(text) {
  // Strip light markdown markers (**bold**, *italic*) for push notification bodies
  // where markdown isn't rendered.
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1$2');
}

function buildNotificationBody(message = {}) {
  const text = stripMarkdown(message.message).trim();
  if (text) {
    return text.length > 100 ? `${text.substring(0, 97)}...` : text;
  }

  if (message.poll && message.poll.question) {
    return `📊 ${message.poll.question}`;
  }

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  if (attachments.some((attachment) => attachment.type === 'video')) {
    return '🎬 A partagé une vidéo';
  }
  if (attachments.length > 0) {
    return `📎 ${attachments.length} pièce(s) jointe(s)`;
  }

  return 'Nouveau message';
}

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
      const eventTitle = operation.titre || operation.title || 'Événement';

      // Check of event verlopen is (date_fin + grace period)
      const dateFin = operation.date_fin?.toDate ? operation.date_fin.toDate() : operation.date_fin;
      let eventExpired = false;
      if (dateFin) {
        const expiryDate = new Date(dateFin);
        expiryDate.setDate(expiryDate.getDate() + EVENT_EXPIRY_GRACE_DAYS);
        eventExpired = new Date() > expiryDate;
        if (eventExpired) {
          console.log(`Event ${operationId} verlopen sinds ${expiryDate.toISOString()}, skip unread increment`);
        }
      }

      // 2. Get only PARTICIPANTS of this event (not all club members)
      const senderId = message.sender_id;
      const senderName = message.sender_name || 'Quelqu\'un';
      // 2a. Get inscriptions to find participant IDs
      const inscriptionsSnapshot = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(operationId)
        .collection('inscriptions')
        .get();

      if (inscriptionsSnapshot.empty) {
        console.log('No inscriptions found for this event, skipping notification');
        return null;
      }

      const participantIds = new Set();
      inscriptionsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const membreId = data.membre_id;
        if (membreId) participantIds.add(membreId);
      });

      console.log(`Found ${participantIds.size} participants for event ${operationId}`);

      // 2b. Get members with app installed, then filter to only participants
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

      const participantDocs = membersSnapshot.docs.filter(doc => participantIds.has(doc.id));

      // Filter by notification preferences
      const memberDocs = filterByPreference(participantDocs, 'event_messages');

      // Collect tokens and members using helper function
      const { tokens, memberTokenGroups, recipientIds } = collectTokensAndMembers(memberDocs, senderId);

      if (tokens.length === 0) {
        console.log('No FCM tokens found, skipping notification');
        return null;
      }

      console.log(`Sending notification to ${tokens.length} devices`);

      // 4. Prepare the notification payload
      // Check if this is a reply
      const isReply = !!message.reply_to_id;
      const replyPreview = message.reply_to_preview;
      const fallbackBody = buildNotificationBody(message);

      let notificationTitle = `${senderName} - ${eventTitle}`;
      let notificationBody;

      if (isReply && replyPreview) {
        notificationTitle = `${senderName} a répondu à ${replyPreview.sender_name}`;
        notificationBody = fallbackBody;
      } else {
        notificationBody = fallbackBody;
      }

      const basePayload = {
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        data: {
          type: 'event_message',
          club_id: clubId,
          operation_id: operationId,
          message_id: messageId,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'event_messages',
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
      // Skip increment voor verlopen events (date_fin + 5 dagen)
      if (!eventExpired) {
        await incrementUnreadCounts(clubId, recipientIds, 'event_messages');
      }

      // 6. Send notifications with dynamic badge counts
      const { successCount, failureCount } = await sendNotificationsWithBadge(clubId, memberTokenGroups, basePayload, 'event_messages');

      console.log(`Notifications sent: ${successCount} success, ${failureCount} failures`);
      return { success: successCount, failure: failureCount };

    } catch (error) {
      console.error('Error sending notifications:', error);
      throw error;
    }
  }
);
