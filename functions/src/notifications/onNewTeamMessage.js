/**
 * Cloud Function: Send push notification when a new message is posted in a team channel
 *
 * Triggers on: clubs/{clubId}/team_channels/{channelId}/messages/{messageId}
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { incrementUnreadCounts, collectTokensAndMembers, sendNotificationsWithUnreadCursorMode, filterByPreference } = require('../utils/badge-helper');
const { stampUnreadCreatedAt } = require('./unreadTimestampAuthority');
const { prepareNotificationUnreadTimestamp } = require('./notificationUnreadTimestamp');
const { advanceSenderUnreadCursorIsolated } = require('./advanceSenderUnreadCursor');
const { teamChannelTypeForId } = require('./canonicalUnreadBadge');

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
        case 'comite':
        case 'comité':
          return 'ca';
        case 'e':
        case 'encadrant':
        case 'encadrants':
        case 'encadrant carrière':
          return 'encadrant';
        case 'a':
        case 'accueil':
          return 'accueil';
        case 'g':
        case 'gonflage':
          return 'gonflage';
        case 'bs':
        case 'banque signature':
          return 'bs';
        default:
          return role;
      }
    });
}

function inferChannelInfo(channelId, channelData = {}) {
  const channelName = channelData.name;
  switch (channelId) {
    case 'general':
      return { channelName: channelName || 'General', channelType: 'general' };
    case 'equipe_ca':
      return { channelName: channelName || 'CA', channelType: 'ca' };
    case 'equipe_accueil':
      return { channelName: channelName || 'Équipe Accueil', channelType: 'accueil' };
    case 'equipe_gonflage':
      return { channelName: channelName || 'Équipe Gonflage', channelType: 'gonflage' };
    case 'bureau':
      return { channelName: channelName || 'Bureau', channelType: 'bureau' };
    case 'formation_1_etoile':
      return { channelName: channelName || 'Formation 1*', channelType: 'formation_1_etoile' };
    case 'formation_2_etoiles':
      return { channelName: channelName || 'Formation 2*', channelType: 'formation_2_etoiles' };
    case 'formation_3_etoiles':
      return { channelName: channelName || 'Formation 3*', channelType: 'formation_3_etoiles' };
    case 'formation_4_etoiles':
      return { channelName: channelName || 'Formation 4*', channelType: 'formation_4_etoiles' };
    case 'formation_AM':
      return { channelName: channelName || 'Formation AM', channelType: 'formation_AM' };
    case 'equipe_encadrants':
      return { channelName: channelName || 'Équipe Encadrants', channelType: 'encadrants' };
    default:
      return {
        channelName: channelName || 'Équipe',
        channelType: teamChannelTypeForId(channelId),
      };
  }
}

function hasAdminAccess(memberData = {}) {
  const appRole = String(memberData.app_role || '').toLowerCase();
  return appRole === 'admin' || appRole === 'superadmin';
}

function normalizeTargetFormationLevel(value) {
  if (['1*', '1', 'P1'].includes(value)) return '1*';
  if (['2*', '2', 'P2'].includes(value)) return '2*';
  if (['3*', '3', 'P3'].includes(value)) return '3*';
  if (['4*', '4', 'P4'].includes(value)) return '4*';
  return value === 'AM' ? 'AM' : null;
}

function getMemberFormationTargetLevel(memberData = {}) {
  if (memberData.formation_active !== true) return null;

  const explicitTarget = normalizeTargetFormationLevel(memberData.target_formation_level);
  if (explicitTarget) return explicitTarget;

  const code = memberData.plongeur_code;
  if (code === 'NB') return '1*';
  if (['P1', '1', '1*'].includes(code)) return '2*';
  if (['P2', '2', '2*'].includes(code)) return '3*';
  if (['P3', '3', '3*'].includes(code)) return '4*';
  if (['P4', '4', '4*'].includes(code)) return 'AM';

  return null;
}

function memberHasChannelAccess(memberData = {}, channelType) {
  const normalizedRoles = new Set(normalizeRoles(memberData.clubStatuten || []));
  const rawRoles = new Set(Array.isArray(memberData.clubStatuten) ? memberData.clubStatuten : []);

  // Bureau is strikt confidentieel: enkel leden met 'Banque Signature' (BS)
  // krijgen dit kanaal. Admin-override telt hier NIET (zelfs app_role=admin
  // of superadmin krijgt geen Bureau-notificatie zonder BS).
  if (channelType === 'bureau') {
    return ['BS', 'bs', 'Banque Signature', 'banque signature']
      .some(role => rawRoles.has(role));
  }

  if (hasAdminAccess(memberData)) return true;

  switch (channelType) {
    case 'general':
      return true;
    case 'ca':
      return ['ca', 'CA', 'comite', 'Comite', 'comité', 'Comité']
        .some(role => rawRoles.has(role));
    case 'accueil':
      return ['accueil', 'Accueil', 'A'].some(role => rawRoles.has(role));
    case 'gonflage':
      return normalizedRoles.has('gonflage');
    case 'formation_1_etoile':
      return getMemberFormationTargetLevel(memberData) === '1*';
    case 'formation_2_etoiles':
      return getMemberFormationTargetLevel(memberData) === '2*';
    case 'formation_3_etoiles':
      return getMemberFormationTargetLevel(memberData) === '3*';
    case 'formation_4_etoiles':
      return getMemberFormationTargetLevel(memberData) === '4*';
    case 'formation_AM':
      return getMemberFormationTargetLevel(memberData) === 'AM';
    case 'encadrants':
      return [
        'encadrant', 'Encadrant', 'encadrants', 'Encadrants', 'E',
        'encadrant carrière', 'Encadrant Carrière',
      ].some(role => rawRoles.has(role));
    default:
      return false;
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
    const authoritativeCreatedAt = await prepareNotificationUnreadTimestamp({
      snapshot: event.data, eventTime: event.time, label: 'team_message',
      stamp: () => stampUnreadCreatedAt({
        snapshot: event.data,
        eventTime: event.time,
      }),
    });
    const message = {
      ...event.data.data(),
      created_at: authoritativeCreatedAt,
      unread_created_at: authoritativeCreatedAt,
    };
    if (message.sender_id) {
      await advanceSenderUnreadCursorIsolated({
        db: admin.firestore(), clubId, senderId: message.sender_id,
        section: 'teams', scopeId: channelId,
        visibleAt: authoritativeCreatedAt,
      });
    }

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
      const { successCount, failureCount } = await sendNotificationsWithUnreadCursorMode(clubId, memberTokenGroups, basePayload, 'team_messages');

      console.log(`Notifications sent: ${successCount} success, ${failureCount} failures`);
      return { success: successCount, failure: failureCount };

    } catch (error) {
      console.error('Error sending notifications:', error);
      throw error;
    }
  }
);

// Pure audience helpers are exported for the cross-surface access contract.
exports.normalizeRoles = normalizeRoles;
exports.memberHasChannelAccess = memberHasChannelAccess;
exports.getMemberFormationTargetLevel = getMemberFormationTargetLevel;
