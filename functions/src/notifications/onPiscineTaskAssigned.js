/**
 * Cloud Function: Send push notification when a member is assigned to a pool session task
 *
 * Triggers on: clubs/{clubId}/piscine_sessions/{sessionId} (onUpdate)
 * Detects newly assigned members by diffing before/after task assignments
 * Tasks: accueil, baptemes, gonflage (per time slot), niveaux (encadrants per level), theorie
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { collectTokensAndMembers, sendNotificationsWithBadge } = require('../utils/badge-helper');

/**
 * Extract all assigned members and their tasks from a piscine session document
 *
 * @param {object} sessionData - Firestore document data
 * @returns {Map<string, Set<string>>} Map of membre_id -> Set of task descriptions
 */
function extractAssignedMembers(sessionData) {
  const members = new Map();

  const addMember = (membreId, task) => {
    if (!membreId) return;
    if (!members.has(membreId)) members.set(membreId, new Set());
    members.get(membreId).add(task);
  };

  // Accueil
  (sessionData.accueil || []).forEach(a => {
    addMember(a.membre_id, 'Accueil');
  });

  // Baptêmes
  (sessionData.baptemes || []).forEach(b => {
    addMember(b.membre_id, 'Baptêmes');
  });

  // Gonflage (per time slot)
  if (sessionData.gonflage && typeof sessionData.gonflage === 'object') {
    for (const [slot, assignees] of Object.entries(sessionData.gonflage)) {
      (assignees || []).forEach(g => {
        addMember(g.membre_id, `Gonflage ${slot}`);
      });
    }
  }

  // Niveaux (encadrants per level)
  if (sessionData.niveaux && typeof sessionData.niveaux === 'object') {
    for (const [level, data] of Object.entries(sessionData.niveaux)) {
      if (data && Array.isArray(data.encadrants)) {
        data.encadrants.forEach(e => {
          addMember(e.membre_id, `Encadrant ${level}`);
        });
      }
    }
  }

  // Théorie (encadrants per slot)
  if (sessionData.theorie && typeof sessionData.theorie === 'object') {
    for (const [slot, data] of Object.entries(sessionData.theorie)) {
      if (data && Array.isArray(data.encadrants)) {
        data.encadrants.forEach(e => {
          addMember(e.membre_id, `Théorie ${slot}`);
        });
      }
    }
  }

  return members;
}

/**
 * Firestore trigger for piscine session updates (Gen2)
 */
exports.onPiscineTaskAssigned = onDocumentUpdated(
  {
    document: 'clubs/{clubId}/piscine_sessions/{sessionId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, sessionId } = event.params;
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    try {
      // 1. Extract assigned members before and after the update
      const beforeMembers = extractAssignedMembers(beforeData);
      const afterMembers = extractAssignedMembers(afterData);

      // 2. Find newly assigned members (new member or new task for existing member)
      const newlyAssigned = new Map();
      for (const [memberId, tasks] of afterMembers) {
        const oldTasks = beforeMembers.get(memberId) || new Set();
        const newTasks = new Set([...tasks].filter(t => !oldTasks.has(t)));
        if (newTasks.size > 0) {
          newlyAssigned.set(memberId, newTasks);
        }
      }

      if (newlyAssigned.size === 0) {
        // No new assignments — could be theme change, removal, or other update
        return null;
      }

      console.log(`${newlyAssigned.size} newly assigned members for session ${sessionId}`);

      // 3. Format session date for notification
      let formattedDate = '';
      const sessionDate = afterData.date?.toDate ? afterData.date.toDate() : afterData.date;
      if (sessionDate) {
        formattedDate = new Date(sessionDate).toLocaleDateString('fr-BE', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });
      }

      // 4. Get member documents for FCM tokens
      const newMemberIds = [...newlyAssigned.keys()];

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

      // Filter to only newly assigned members
      const memberDocs = membersSnapshot.docs.filter(doc => newMemberIds.includes(doc.id));

      if (memberDocs.length === 0) {
        console.log('No newly assigned members have the app installed, skipping');
        return null;
      }

      // 5. Send personalized notification to each newly assigned member
      let totalSuccess = 0;
      let totalFailure = 0;

      for (const memberDoc of memberDocs) {
        const memberId = memberDoc.id;
        const memberData = memberDoc.data();

        // Skip if notifications disabled
        if (memberData.notifications_enabled === false) continue;

        // Check piscine_tasks preference
        const prefs = memberData.notification_preferences;
        if (prefs && typeof prefs === 'object' && prefs.piscine_tasks === false) continue;

        // Collect tokens for this member
        const memberTokens = [];
        if (memberData.fcm_tokens && Array.isArray(memberData.fcm_tokens)) {
          memberTokens.push(...memberData.fcm_tokens.filter(t => t));
        } else if (memberData.fcm_token) {
          memberTokens.push(memberData.fcm_token);
        }

        if (memberTokens.length === 0) continue;

        // Build personalized message with their specific tasks
        const tasks = newlyAssigned.get(memberId);
        const taskList = [...tasks].join(', ');

        const notificationTitle = '🏊 Piscine — Nouvelle tâche';
        const notificationBody = formattedDate
          ? `Tu es assigné(e) : ${taskList} — ${formattedDate}`
          : `Tu es assigné(e) : ${taskList}`;

        const payload = {
          notification: {
            title: notificationTitle,
            body: notificationBody,
          },
          data: {
            type: 'piscine_task_assigned',
            club_id: clubId,
            session_id: sessionId,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'piscine_tasks',
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

        try {
          const result = await admin.messaging().sendEachForMulticast({
            tokens: memberTokens,
            ...payload,
          });

          totalSuccess += result.successCount;
          totalFailure += result.failureCount;

          // Clean up invalid tokens
          result.responses.forEach((response, index) => {
            if (!response.success) {
              const error = response.error;
              if (error.code === 'messaging/invalid-registration-token' ||
                  error.code === 'messaging/registration-token-not-registered') {
                const failedToken = memberTokens[index];
                console.log(`Removing invalid token from member ${memberId}: ${failedToken?.substring(0, 20)}...`);
                admin.firestore()
                  .collection('clubs')
                  .doc(clubId)
                  .collection('members')
                  .doc(memberId)
                  .update({
                    fcm_tokens: admin.firestore.FieldValue.arrayRemove(failedToken)
                  })
                  .catch(err => console.error(`Failed to remove token: ${err.message}`));
              }
            }
          });

          console.log(`✅ Task notification sent to ${memberId}: ${taskList}`);
        } catch (error) {
          console.error(`Error sending task notification to ${memberId}: ${error.message}`);
          totalFailure += memberTokens.length;
        }
      }

      console.log(`Task assignment notifications: ${totalSuccess} success, ${totalFailure} failures`);
      return { success: totalSuccess, failure: totalFailure };

    } catch (error) {
      console.error('Error in onPiscineTaskAssigned:', error);
      throw error;
    }
  }
);
