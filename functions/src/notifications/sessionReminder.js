/**
 * Cloud Function: Send reminder notification the day before a piscine session
 *
 * Scheduled function that runs daily at 09:00 CET/CEST
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

/**
 * Scheduled function to send session reminders (Gen2)
 * Runs daily at 09:00 CET
 */
exports.sessionReminder = onSchedule(
  {
    schedule: '0 9 * * *', // Every day at 09:00
    timeZone: 'Europe/Brussels',
    region: 'europe-west1',
  },
  async (event) => {
    console.log('Running session reminder check at', new Date().toISOString());

    try {
      // 1. Get tomorrow's date (we want to remind about tomorrow's sessions)
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Set to start of day
      const startOfTomorrow = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
      const endOfTomorrow = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1);

      // 2. Get all clubs
      const clubsSnapshot = await admin.firestore().collection('clubs').get();

      let totalNotifications = 0;

      for (const clubDoc of clubsSnapshot.docs) {
        const clubId = clubDoc.id;
        console.log(`Checking sessions for club: ${clubId}`);

        // 3. Get published sessions for tomorrow
        const sessionsSnapshot = await admin.firestore()
          .collection('clubs')
          .doc(clubId)
          .collection('piscine_sessions')
          .where('date', '>=', admin.firestore.Timestamp.fromDate(startOfTomorrow))
          .where('date', '<', admin.firestore.Timestamp.fromDate(endOfTomorrow))
          .where('statut', '==', 'publie')
          .get();

        if (sessionsSnapshot.empty) {
          console.log(`No sessions for tomorrow in club ${clubId}`);
          continue;
        }

        for (const sessionDoc of sessionsSnapshot.docs) {
          const session = sessionDoc.data();
          const sessionId = sessionDoc.id;

          console.log(`Found session ${sessionId} for tomorrow`);

          // 4. Collect all participants
          const recipientIds = new Set();

          // Add accueil members
          (session.accueil || []).forEach(member => {
            if (member.membre_id) recipientIds.add(member.membre_id);
          });

          // Add bapteme encadrants
          (session.baptemes || []).forEach(member => {
            if (member.membre_id) recipientIds.add(member.membre_id);
          });

          // Add encadrants from all levels
          const niveaux = session.niveaux || {};
          Object.values(niveaux).forEach(level => {
            (level.encadrants || []).forEach(member => {
              if (member.membre_id) recipientIds.add(member.membre_id);
            });
          });

          if (recipientIds.size === 0) {
            console.log(`No participants for session ${sessionId}`);
            continue;
          }

          // 5. Get FCM tokens
          const tokens = [];
          const tokenToMember = new Map();

          const memberPromises = Array.from(recipientIds).map(memberId =>
            admin.firestore()
              .collection('clubs')
              .doc(clubId)
              .collection('members')
              .doc(memberId)
              .get()
          );

          const memberDocs = await Promise.all(memberPromises);

          memberDocs.forEach(doc => {
            if (!doc.exists) return;

            const memberData = doc.data();
            if (memberData.notifications_enabled === false) return;

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
          });

          if (tokens.length === 0) {
            console.log(`No FCM tokens for session ${sessionId}`);
            continue;
          }

          // 6. Prepare notification
          const sessionDate = session.date?.toDate();
          const weekdays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
          const dayName = sessionDate ? weekdays[sessionDate.getDay()] : 'Demain';

          const notificationTitle = `Rappel: Piscine ${dayName}`;
          const notificationBody = `Séance piscine demain à ${session.horaire_debut || '20:30'} - ${session.lieu || 'Piscine'}`;

          const payload = {
            notification: {
              title: notificationTitle,
              body: notificationBody,
            },
            data: {
              type: 'session_reminder',
              club_id: clubId,
              session_id: sessionId,
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
            android: {
              priority: 'high',
              notification: {
                channelId: 'piscine_reminders',
                priority: 'high',
                sound: 'default',
              },
            },
            apns: {
              headers: {
                'apns-priority': '10',
              },
              payload: {
                aps: {
                  alert: {
                    title: notificationTitle,
                    body: notificationBody,
                  },
                  sound: 'default',
                  badge: 1,
                },
              },
            },
          };

          // 7. Send notifications
          console.log(`Sending reminder to ${tokens.length} devices for session ${sessionId}`);

          const batchSize = 500;
          for (let i = 0; i < tokens.length; i += batchSize) {
            const batchTokens = tokens.slice(i, i + batchSize);
            const result = await admin.messaging().sendEachForMulticast({
              tokens: batchTokens,
              ...payload,
            });

            totalNotifications += result.successCount;

            // Clean up invalid tokens
            result.responses.forEach((response, index) => {
              if (!response.success) {
                const error = response.error;
                if (error.code === 'messaging/invalid-registration-token' ||
                    error.code === 'messaging/registration-token-not-registered') {
                  const failedToken = batchTokens[index];
                  const memberInfo = tokenToMember.get(failedToken);
                  if (memberInfo) {
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
          }
        }
      }

      console.log(`Session reminder completed. Total notifications sent: ${totalNotifications}`);
      return { notificationsSent: totalNotifications };

    } catch (error) {
      console.error('Error in session reminder:', error);
      throw error;
    }
  }
);
