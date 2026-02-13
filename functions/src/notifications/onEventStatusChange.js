/**
 * Cloud Function: Clean up unread counts when an event is closed or cancelled
 *
 * Triggers on: clubs/{clubId}/operations/{operationId} (onUpdate)
 *
 * When an event's statut changes to 'ferme' or 'annule', this function
 * decrements unread_counts.event_messages for each participant based on
 * how many unread messages they had in this event.
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { decrementUnreadCounts } = require('../utils/badge-helper');

exports.onEventStatusChange = onDocumentUpdated(
  {
    document: 'clubs/{clubId}/operations/{operationId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, operationId } = event.params;
    const before = event.data.before.data();
    const after = event.data.after.data();

    // Alleen triggeren als statut verandert naar 'ferme' of 'annule'
    const closedStatuses = ['ferme', 'annule'];
    if (closedStatuses.includes(before.statut) || !closedStatuses.includes(after.statut)) {
      return null; // Was al gesloten, of is niet naar gesloten gegaan
    }

    console.log(`Event ${operationId} status changed: ${before.statut} → ${after.statut}`);

    try {
      // 1. Haal alle berichten van dit event op
      const messagesSnapshot = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(operationId)
        .collection('messages')
        .get();

      if (messagesSnapshot.empty) {
        console.log('No messages in event, nothing to clean up');
        return null;
      }

      const messages = messagesSnapshot.docs.map(doc => doc.data());

      // 2. Haal alle deelnemers op
      const participantsSnapshot = await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .doc(operationId)
        .collection('inscriptions')
        .get();

      if (participantsSnapshot.empty) {
        console.log('No participants found');
        return null;
      }

      // 3. Per deelnemer: tel ongelezen berichten en decrementeer
      const decrementPromises = [];

      participantsSnapshot.forEach(doc => {
        const participantId = doc.data().membre_id;
        if (!participantId) return;

        const unreadCount = messages.filter(msg => {
          const readBy = msg.read_by || [];
          return !readBy.includes(participantId);
        }).length;

        if (unreadCount > 0) {
          console.log(`Member ${participantId} has ${unreadCount} unread messages in closed event`);
          decrementPromises.push(
            decrementUnreadCounts(clubId, participantId, 'event_messages', unreadCount)
          );
        }
      });

      await Promise.all(decrementPromises);
      console.log(`✅ Cleaned up unread counts for event ${operationId} (${decrementPromises.length} members updated)`);

      return { updated: decrementPromises.length };
    } catch (error) {
      console.error('Error cleaning up unread counts:', error);
      throw error;
    }
  }
);
