/**
 * Cloud Function: Send push notification when a new message is posted in a team channel
 *
 * Triggers on: clubs/{clubId}/team_channels/{channelId}/messages/{messageId}
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { incrementUnreadCounts, collectTokensAndMembers, sendNotificationsWithBadge, filterByPreference } = require('../utils/badge-helper');

function normalizeRoles(roles = []) {
  return roles
    .map((role) => String(role || '').trim().toLowerCase())
    .map((role) => {
      switch (role) {
        case 'm':
        case 'membre':
        case 'member':
          return 'member';
        case 'ca':
        case 'conseil administration':
          return 'ca';
        case 'e':
        case 'encadrant':
        case 'encadrants':
          return 'encadrant';
        case 'a':
        case 'accueil':
          return 'accueil';
        case 'g':
        case 'gonflage':
          return 'gonflage';
        case 'bs':
        case 'banque signature':
        case 'bureau':
          return 'bs';
        default:
          return role;
      }
    });
}

function inferChannelInfo(channelId, channelData = {}) {
  if (channelData.type) {
    return {
      channelName: channelData.name || 'Équipe',
      channelType: channelData.type,
    };
  }

  switch (channelId) {
    case 'general':
      return { channelName: 'General', channelType: 'general' };
    case 'equipe_ca':
      return { channelName: 'CA', channelType: 'ca' };
    case 'equipe_accueil':
      return { channelName: 'Équipe Accueil', channelType: 'accueil' };
    case 'equipe_gonflage':
      return { channelName: 'Équipe Gonflage', channelType: 'gonflage' };
    case 'bureau':
      return { channelName: 'Bureau', channelType: 'bureau' };
    default:
      return { channelName: 'Équipe Encadrants', channelType: 'encadrants' };
  }
}

function hasAdminAccess(memberData = {}) {
  const appRole = String(memberData.app_role || '').toLowerCase();
  return appRole === 'admin' || appRole === 'superadmin';
}

function memberHasChannelAccess(memberData = {}, channelType) {
  const normalizedRoles = new Set(normalizeRoles(memberData.clubStatuten || []));

  // Bureau is strikt confidentieel: enkel leden met 'Banque Signature' (BS)
  // krijgen dit kanaal. Admin-override telt hier NIET (zelfs app_role=admin
  // of superadmin krijgt geen Bureau-notificatie zonder BS).
  if (channelType === 'bureau') {
    return normalizedRoles.has('bs');
  }

  if (hasAdminAccess(memberData)) return true;

  switch (channelType) {
    case 'general':
      return true;
    case 'ca':
      return normalizedRoles.has('ca');
    case 'accueil':
      return normalizedRoles.has('accueil');
    case 'gonflage':
      return normalizedRoles.has('gonflage');
    case 'encadrants':
    default:
      return normalizedRoles.has('encadrant');
  }
}

function buildNotificationBody(message = {}) {
  const text = String(message.message || '').trim();
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

      const { channelName, channelType } = inferChannelInfo(
        channelId,
        channelDoc.exists ? channelDoc.data() : {},
      );

      // 2. Get all club members and filter on the server side for channel access
      const membersSnapshot = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .get();

      const senderId = message.sender_id;

      // 3. Collect FCM tokens using helper function
      const accessibleDocs = membersSnapshot.docs.filter((doc) => {
        if (!doc.exists) return false;
        return memberHasChannelAccess(doc.data(), channelType);
      });
      const memberDocs = filterByPreference(accessibleDocs, 'team_messages');
      const { tokens, memberTokenGroups, recipientIds } = collectTokensAndMembers(memberDocs, senderId);

      if (tokens.length === 0) {
        console.log('No FCM tokens found, skipping notification');
        return null;
      }

      console.log(`Sending notification to ${tokens.length} devices`);

      // 4. Prepare notification payload
      const senderName = message.sender_name || 'Quelqu\'un';
      const notificationTitle = `${senderName} - ${channelName}`;
      const notificationBody = buildNotificationBody(message);

      const basePayload = {
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
              'content-available': 1,
            },
          },
        },
      };

      // 5. Increment unread counts FIRST (zodat badge-getal correct is bij verzending)
      await incrementUnreadCounts(clubId, recipientIds, 'team_messages');

      // 6. Send notifications with dynamic badge counts
      const { successCount, failureCount } = await sendNotificationsWithBadge(clubId, memberTokenGroups, basePayload, 'team_messages');

      console.log(`Notifications sent: ${successCount} success, ${failureCount} failures`);
      return { success: successCount, failure: failureCount };

    } catch (error) {
      console.error('Error sending notifications:', error);
      throw error;
    }
  }
);
