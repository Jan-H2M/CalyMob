/**
 * Cloud Function: Send push notification when a new reply is posted on an announcement
 *
 * Triggers on: clubs/{clubId}/announcements/{announcementId}/replies/{replyId}
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

/**
 * Firestore trigger for new announcement replies (Gen2)
 */
exports.onNewAnnouncementReply = onDocumentCreated(
  {
    document: 'clubs/{clubId}/announcements/{announcementId}/replies/{replyId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, announcementId, replyId } = event.params;
    const reply = event.data.data();

    console.log(`New reply in club/${clubId}/announcements/${announcementId}/replies/${replyId}`);
    console.log('Reply data:', JSON.stringify(reply));

    try {
      // 1. Get the announcement details
      const announcementDoc = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('announcements')
        .doc(announcementId)
        .get();

      if (!announcementDoc.exists) {
        console.log('Announcement not found, skipping notification');
        return null;
      }

      const announcement = announcementDoc.data();
      const announcementTitle = announcement.title || 'Annonce';
      const announcementSenderId = announcement.sender_id;

      // 2. Get all club members to notify
      // For announcements, we notify:
      // - The announcement author (if not the replier)
      // - Members who have read the announcement or replied to it
      const membersToNotify = new Set();

      // Always notify the announcement author
      if (announcementSenderId && announcementSenderId !== reply.sender_id) {
        membersToNotify.add(announcementSenderId);
      }

      // Add members who have read the announcement
      if (announcement.read_by && Array.isArray(announcement.read_by)) {
        announcement.read_by.forEach(userId => {
          if (userId !== reply.sender_id) {
            membersToNotify.add(userId);
          }
        });
      }

      // If replying to a specific reply, also notify that person
      if (reply.reply_to_id && reply.reply_to_preview) {
        // The person being replied to should definitely be notified
        // We don't have their ID directly, but they're likely in read_by
      }

      if (membersToNotify.size === 0) {
        console.log('No members to notify, skipping notification');
        return null;
      }

      // 3. Get FCM tokens for members to notify
      const memberIds = Array.from(membersToNotify);
      const tokenPromises = memberIds.map(memberId =>
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

      // 4. Prepare the notification payload
      const senderName = reply.sender_name || 'Quelqu\'un';
      const messageText = reply.message || '';
      const isReply = !!reply.reply_to_id;
      const replyPreview = reply.reply_to_preview;
      const hasAttachments = reply.attachments && reply.attachments.length > 0;

      let notificationTitle;
      let notificationBody;

      if (isReply && replyPreview) {
        notificationTitle = `${senderName} a répondu à ${replyPreview.sender_name}`;
        notificationBody = messageText.length > 80
          ? messageText.substring(0, 77) + '...'
          : messageText;
      } else {
        notificationTitle = `${senderName} a répondu à "${announcementTitle}"`;
        if (hasAttachments && !messageText) {
          notificationBody = `📎 ${reply.attachments.length} pièce(s) jointe(s)`;
        } else {
          notificationBody = messageText.length > 100
            ? messageText.substring(0, 97) + '...'
            : messageText;
        }
      }

      const payload = {
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        data: {
          type: 'announcement_reply',
          club_id: clubId,
          announcement_id: announcementId,
          reply_id: replyId,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'announcements',
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

        result.responses.forEach((response, index) => {
          if (!response.success) {
            const error = response.error;
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
              const failedToken = tokens[batchIndex * batchSize + index];
              const memberInfo = tokenToMember.get(failedToken);
              if (memberInfo) {
                console.log(`Removing invalid token from member ${memberInfo.memberId}: ${failedToken.substring(0, 20)}...`);
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
