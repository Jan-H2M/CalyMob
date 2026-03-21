/**
 * Cloud Function: Send push notification when a new outdoor event/dive is created
 *
 * Triggers on: clubs/{clubId}/operations/{operationId}
 * Only sends notifications for events (type === 'evenement') with category 'plongee' or 'sortie'
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { incrementUnreadCounts, collectTokensAndMembers, sendNotificationsWithBadge, filterByPreference } = require('../utils/badge-helper');

/**
 * Firestore trigger for new operations/events (Gen2)
 */
exports.onNewOperation = onDocumentCreated(
  {
    document: 'clubs/{clubId}/operations/{operationId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, operationId } = event.params;
    const operation = event.data.data();

    console.log(`New operation in club/${clubId}/operations/${operationId}`);
    console.log('Operation data:', JSON.stringify(operation));

    try {
      // 1. Only notify for actual events (not cotisations, dons, etc.)
      const type = operation.type;
      if (type !== 'evenement') {
        console.log(`Operation type is '${type}', not 'evenement' — skipping notification`);
        return null;
      }

      // 2. Only notify for outdoor events (plongee or sortie)
      const category = operation.event_category || operation.categorie;
      if (!category || (category !== 'plongee' && category !== 'sortie')) {
        console.log(`Event category is '${category}' — not an outdoor event, skipping notification`);
        return null;
      }

      const eventTitle = operation.titre || operation.title || 'Nouvel événement';
      const lieu = operation.lieu || 'Lieu à confirmer';

      // 3. Format date for notification body
      let formattedDate = '';
      const dateDebut = operation.date_debut?.toDate ? operation.date_debut.toDate() : operation.date_debut;
      if (dateDebut) {
        formattedDate = new Date(dateDebut).toLocaleDateString('fr-BE', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      }

      // 4. Get all club members with the app installed
      const senderId = operation.created_by || operation.sender_id;

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

      // Filter by notification preferences
      const memberDocs = filterByPreference(membersSnapshot.docs, 'new_events');

      // Collect tokens and members (exclude creator)
      const { tokens, memberTokenGroups, recipientIds } = collectTokensAndMembers(memberDocs, senderId);

      if (tokens.length === 0) {
        console.log('No FCM tokens found, skipping notification');
        return null;
      }

      console.log(`Sending new event notification to ${tokens.length} devices`);

      // 5. Prepare the notification payload
      const isPlongee = category === 'plongee';
      const emoji = isPlongee ? '🤿' : '📅';
      const notificationTitle = `${emoji} Nouvelle sortie : ${eventTitle}`;
      const notificationBody = formattedDate
        ? `${formattedDate} — ${lieu}`
        : lieu;

      const basePayload = {
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        data: {
          type: 'new_operation',
          club_id: clubId,
          operation_id: operationId,
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

      // 6. Increment unread counts
      await incrementUnreadCounts(clubId, recipientIds, 'event_messages');

      // 7. Send notifications with dynamic badge counts
      const { successCount, failureCount } = await sendNotificationsWithBadge(clubId, memberTokenGroups, basePayload, 'event_messages');

      console.log(`New event notifications sent: ${successCount} success, ${failureCount} failures`);
      return { success: successCount, failure: failureCount };

    } catch (error) {
      console.error('Error sending new event notification:', error);
      throw error;
    }
  }
);
