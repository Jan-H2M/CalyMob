const admin = require('firebase-admin');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { collectTokensAndMembers, sendNotificationsWithBadge } = require('../utils/badge-helper');
const { eventTariffProblems, missingPaidMemberTariffProblem } = require('./eventTariffSafety');

const PROBLEMS_FIELD = 'tariff_configuration_problems';
const CHECKED_AT_FIELD = 'tariff_configuration_checked_at';

function sameProblems(stored, detected) {
  if (!Array.isArray(stored)) return false;
  const storedProblems = new Set(stored);
  return storedProblems.size === detected.length
    && detected.every(problem => storedProblems.has(problem));
}

function previousTariffsForWrite(before, after, current) {
  // A delayed delivery can still detect a removal after an unrelated edit.
  // Use the previous prices only while the removal's pricing state still matches.
  if (before?.type !== 'evenement'
    || after.event_tariffs?.length || current.event_tariffs?.length
    || after.price_tbd !== current.price_tbd
    || after.payment_required !== current.payment_required
    || after.prix_membre !== current.prix_membre) return undefined;
  return before.event_tariffs;
}

const onEventTariffConfigurationWritten = onDocumentWritten(
  { document: 'clubs/{clubId}/operations/{operationId}', region: 'europe-west1' },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists || after.data().type !== 'evenement') return;
    const afterData = after.data();
    const beforeData = event.data.before?.data();
    const db = admin.firestore();
    const { clubId, operationId } = event.params;

    // Read and compare the current document atomically. Concurrent deliveries
    // can only claim a new set of problems once, and stale writes cannot
    // overwrite diagnostics for newer tariffs.
    const notification = await db.runTransaction(async (transaction) => {
      const current = (await transaction.get(after.ref)).data();
      if (current?.type !== 'evenement') return null;
      const fieldValue = admin.firestore.FieldValue;
      const stored = current[PROBLEMS_FIELD];
      const problems = eventTariffProblems(current, {
        previousTariffs: previousTariffsForWrite(beforeData, afterData, current),
        paidTariffsRemoved: Array.isArray(stored) && stored.includes(missingPaidMemberTariffProblem),
      });

      if (!problems.length) {
        if (Object.hasOwn(current, PROBLEMS_FIELD) || Object.hasOwn(current, CHECKED_AT_FIELD)) {
          transaction.update(after.ref, {
            [PROBLEMS_FIELD]: fieldValue.delete(),
            [CHECKED_AT_FIELD]: fieldValue.delete(),
          });
        }
        return null;
      }

      const unchanged = sameProblems(stored, problems);
      if (!unchanged || current[CHECKED_AT_FIELD] == null) {
        transaction.update(after.ref, {
          ...(!unchanged && { [PROBLEMS_FIELD]: problems }),
          [CHECKED_AT_FIELD]: fieldValue.serverTimestamp(),
        });
      }
      if (unchanged) return null;

      return {
        title: current.titre,
        recipientIds: [...new Set([current.organisateur_id, current.creator_user_id])]
          .filter(id => typeof id === 'string' && id.trim() && !id.includes('/')),
      };
    });

    if (!notification?.recipientIds.length) return;
    try {
      const memberDocs = await db.getAll(...notification.recipientIds.map(
        id => db.doc(`clubs/${clubId}/members/${id}`),
      ));
      const { memberTokenGroups } = collectTokensAndMembers(memberDocs);
      if (!memberTokenGroups.size) return;

      const eventTitle = typeof notification.title === 'string' ? notification.title.trim().slice(0, 100) : '';
      const body = eventTitle
        ? `« ${eventTitle} » : vérifiez les tarifs dans les paramètres de l’événement.`
        : 'Vérifiez les tarifs dans les paramètres de l’événement.';
      await sendNotificationsWithBadge(clubId, memberTokenGroups, {
        notification: { title: 'Tarifs de l’événement à corriger', body },
        data: {
          type: 'event_tariff_configuration',
          club_id: clubId,
          operation_id: operationId,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: { notification: { channelId: 'event_messages' } },
        apns: { payload: { aps: { sound: 'default' } } },
      }, 'event_tariff_configuration');
    } catch (error) {
      console.error('Event tariff alert failed after recording diagnostics', { clubId, operationId, error });
    }
  },
);

module.exports = { onEventTariffConfigurationWritten };
