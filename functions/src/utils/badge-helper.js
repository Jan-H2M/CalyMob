/**
 * Badge Helper - Gedeelde logica voor unread counts en badge management
 *
 * Wordt gebruikt door alle notification Cloud Functions om:
 * 1. Unread counters te incrementeren in Firestore
 * 2. Het juiste badge-getal op te halen voor APNs payloads
 * 3. FCM tokens per member te groeperen voor per-user badge counts
 */

const admin = require('firebase-admin');

/**
 * Increment de unread counter voor een lijst van ontvangers
 *
 * @param {string} clubId - Club ID
 * @param {string[]} recipientIds - Array van member IDs die de notificatie ontvangen
 * @param {string} category - De categorie ('announcements', 'event_messages', 'team_messages', 'session_messages', 'medical_certificates')
 */
async function incrementUnreadCounts(clubId, recipientIds, category) {
  if (!recipientIds || recipientIds.length === 0) return;

  const db = admin.firestore();

  // Firestore batch limiet is 500 writes
  const batchSize = 500;
  for (let i = 0; i < recipientIds.length; i += batchSize) {
    const batch = db.batch();
    const batchIds = recipientIds.slice(i, i + batchSize);

    for (const memberId of batchIds) {
      const memberRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(memberId);

      batch.update(memberRef, {
        [`unread_counts.${category}`]: admin.firestore.FieldValue.increment(1),
        'unread_counts.total': admin.firestore.FieldValue.increment(1),
        'unread_counts.last_updated': admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    try {
      await batch.commit();
      console.log(`✅ Unread counts incremented for ${batchIds.length} members (${category})`);
    } catch (error) {
      console.error(`❌ Error incrementing unread counts: ${error.message}`);
      // Niet fataal - notificaties worden alsnog verstuurd
    }
  }
}

/**
 * Haal het huidige badge-getal op voor een member
 *
 * @param {string} clubId - Club ID
 * @param {string} memberId - Member ID
 * @returns {Promise<number>} Het totaal aantal ongelezen items
 */
async function getBadgeCount(clubId, memberId) {
  try {
    const memberDoc = await admin.firestore()
      .collection('clubs')
      .doc(clubId)
      .collection('members')
      .doc(memberId)
      .get();

    if (!memberDoc.exists) return 1; // Fallback

    const data = memberDoc.data();
    const unreadCounts = data?.unread_counts || {};
    return (unreadCounts.total || 0);
  } catch (error) {
    console.error(`❌ Error getting badge count for ${memberId}: ${error.message}`);
    return 1; // Fallback bij fout
  }
}

/**
 * Verzamel FCM tokens en groepeer per member ID
 * Retourneert een Map van memberId -> { tokens: string[], badgeCount: number }
 *
 * @param {string} clubId - Club ID
 * @param {Array} memberDocs - Array van Firestore document snapshots
 * @param {string} senderId - ID van de afzender (wordt uitgesloten)
 * @returns {{ tokens: string[], tokenToMember: Map, memberTokenGroups: Map, recipientIds: string[] }}
 */
function collectTokensAndMembers(memberDocs, senderId) {
  const tokens = [];
  const tokenToMember = new Map(); // token -> { memberId, index }
  const memberTokenGroups = new Map(); // memberId -> [tokens]
  const recipientIds = [];

  memberDocs.forEach(doc => {
    if (!doc.exists) return;

    const memberData = doc.data();
    if (doc.id === senderId) return;
    if (memberData.notifications_enabled === false) return;

    const memberTokens = [];

    // Verzamel tokens uit fcm_tokens array (multi-device)
    if (memberData.fcm_tokens && Array.isArray(memberData.fcm_tokens)) {
      memberData.fcm_tokens.forEach(token => {
        if (token && !tokens.includes(token)) {
          tokens.push(token);
          tokenToMember.set(token, { memberId: doc.id });
          memberTokens.push(token);
        }
      });
    }
    // Fallback naar enkel fcm_token
    else if (memberData.fcm_token && !tokens.includes(memberData.fcm_token)) {
      tokens.push(memberData.fcm_token);
      tokenToMember.set(memberData.fcm_token, { memberId: doc.id });
      memberTokens.push(memberData.fcm_token);
    }

    if (memberTokens.length > 0) {
      memberTokenGroups.set(doc.id, memberTokens);
      recipientIds.push(doc.id);
    }
  });

  return { tokens, tokenToMember, memberTokenGroups, recipientIds };
}

/**
 * Stuur notificaties met per-member badge counts
 * Dit vervangt de eenvoudige sendEachForMulticast met een versie die
 * per member het juiste badge-getal meestuurt.
 *
 * @param {string} clubId - Club ID
 * @param {Map} memberTokenGroups - Map van memberId -> [tokens]
 * @param {object} basePayload - De basis notification payload (zonder apns badge)
 * @param {string} category - De unread categorie
 * @returns {{ successCount: number, failureCount: number }}
 */
async function sendNotificationsWithBadge(clubId, memberTokenGroups, basePayload, category) {
  let totalSuccess = 0;
  let totalFailure = 0;

  // Voor elke member: badge ophalen en notificatie sturen
  const sendPromises = [];

  for (const [memberId, memberTokens] of memberTokenGroups.entries()) {
    sendPromises.push(
      (async () => {
        try {
          // Haal huidig badge count op (increment is al gebeurd vóór deze call)
          const currentBadge = await getBadgeCount(clubId, memberId);
          const newBadge = currentBadge;

          // Maak payload met juiste badge voor deze member
          const payload = {
            ...basePayload,
            apns: {
              ...(basePayload.apns || {}),
              headers: {
                'apns-priority': '10',
                ...(basePayload.apns?.headers || {}),
              },
              payload: {
                aps: {
                  ...(basePayload.apns?.payload?.aps || {}),
                  badge: newBadge,
                },
              },
            },
          };

          const result = await admin.messaging().sendEachForMulticast({
            tokens: memberTokens,
            ...payload,
          });

          totalSuccess += result.successCount;
          totalFailure += result.failureCount;

          // Verwijder ongeldige tokens
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
                    fcm_tokens: admin.firestore.FieldValue.arrayRemove([failedToken])
                  })
                  .catch(err => console.error(`Failed to remove token: ${err.message}`));
              }
            }
          });
        } catch (error) {
          console.error(`Error sending to member ${memberId}: ${error.message}`);
          totalFailure += memberTokens.length;
        }
      })()
    );
  }

  await Promise.all(sendPromises);

  return { successCount: totalSuccess, failureCount: totalFailure };
}

/**
 * Decrement de unread counter voor één member
 *
 * @param {string} clubId - Club ID
 * @param {string} memberId - Member ID
 * @param {string} category - De categorie ('event_messages', etc.)
 * @param {number} amount - Hoeveel te verlagen
 */
async function decrementUnreadCounts(clubId, memberId, category, amount) {
  if (!memberId || amount <= 0) return;

  const db = admin.firestore();
  const memberRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('members')
    .doc(memberId);

  try {
    // Haal huidige waarde op om niet onder 0 te gaan
    const doc = await memberRef.get();
    if (!doc.exists) return;

    const counts = doc.data()?.unread_counts || {};
    const currentValue = (counts[category] || 0);
    const currentTotal = (counts.total || 0);
    const actualDecrement = Math.min(amount, currentValue);

    if (actualDecrement <= 0) return;

    await memberRef.update({
      [`unread_counts.${category}`]: admin.firestore.FieldValue.increment(-actualDecrement),
      'unread_counts.total': admin.firestore.FieldValue.increment(-Math.min(actualDecrement, currentTotal)),
      'unread_counts.last_updated': admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`📉 Unread counts decremented for ${memberId}: ${category} -${actualDecrement}`);
  } catch (error) {
    console.error(`❌ Error decrementing unread counts for ${memberId}: ${error.message}`);
  }
}

module.exports = {
  incrementUnreadCounts,
  decrementUnreadCounts,
  getBadgeCount,
  collectTokensAndMembers,
  sendNotificationsWithBadge,
};
