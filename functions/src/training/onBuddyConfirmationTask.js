/**
 * Cloud Function — Carnet de Formation (WP-05 complément)
 *
 * Trigger : `clubs/{clubId}/logbook_dive_confirmations/{confirmationId}` onWrite.
 *
 * Maintient UNE tâche `buddy_confirmation` agrégée par membre destinataire :
 *   - s'il reste des confirmations `pending` pour ce membre → une tâche ouverte
 *     existe (créée si absente) et son intitulé reflète le nombre en attente ;
 *   - dès qu'il n'en reste plus (0) → la ou les tâches ouvertes sont résolues.
 *
 * Ainsi la confirmation binôme apparaît dans l'inbox d'actions (et non plus
 * seulement en ligne par ligne). Le routage mobile (WP-05) ouvre l'écran natif
 * « Plongées à confirmer » et le badge affiche le compte en attente.
 *
 * Pas de boucle : ce trigger écoute logbook_dive_confirmations, pas
 * formation_tasks — écrire une tâche ne le re-déclenche donc jamais.
 *
 * Spec : CARNET_PLONGEE_SPEC.md §WP-05 (décision Jan 2026-07-07, §6).
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { usesCarnet } = require('./carnetPreference');

const FUNCTION_NAME = 'onBuddyConfirmationTask';
const FUNCTION_REGION = 'europe-west1';

// Inner handler exported for unit tests (bypasses the CF wrapper).
async function handleBuddyConfirmationTask(event) {
  const { clubId } = event.params;
  const db = admin.firestore();

  const after = event.data?.after?.exists ? event.data.after.data() : null;
  const before = event.data?.before?.exists ? event.data.before.data() : null;

  const memberId =
    (after && after.target_member_id) || (before && before.target_member_id);
  if (!memberId) return;

  const memberName =
    (after && after.target_member_name) ||
    (before && before.target_member_name) ||
    'Membre';

  const clubRef = db.collection('clubs').doc(clubId);

  const confirmationsRef = clubRef.collection('logbook_dive_confirmations');
  const tasksRef = clubRef.collection('formation_tasks');
  const aggregateTaskId = `buddy_confirmation_${memberId}`;
  const aggregateTaskRef = tasksRef.doc(aggregateTaskId);
  const pendingQuery = confirmationsRef
    .where('target_member_id', '==', memberId)
    .where('status', '==', 'pending');
  const tasksQuery = tasksRef.where('current_assignee_id', '==', memberId);

  // The pending-count read and aggregate write are one serializable unit.
  // Every invocation also reads the deterministic aggregate document, so two
  // overlapping 1→0 / 2→1 transitions conflict and retry against fresh data.
  await db.runTransaction(async transaction => {
    const [pendingSnap, memberSnap, tasksSnap, aggregateSnap] = await Promise.all([
      transaction.get(pendingQuery),
      transaction.get(clubRef.collection('members').doc(memberId)),
      transaction.get(tasksQuery),
      transaction.get(aggregateTaskRef),
    ]);
    const taskDocsById = new Map(tasksSnap.docs.map(doc => [doc.id, doc]));
    if (aggregateSnap.exists) taskDocsById.set(aggregateSnap.id, aggregateSnap);
    const openBuddyTasks = [...taskDocsById.values()].filter((doc) => {
      const task = doc.data();
      return task.type === 'buddy_confirmation' && task.status === 'open';
    });

    if (memberSnap.exists && !usesCarnet(memberSnap.data())) {
      for (const doc of pendingSnap.docs) {
        transaction.update(doc.ref, {
          status: 'confirmed_no_import',
          auto_accepted: true,
          auto_accepted_reason: 'carnet_opt_out',
          responded_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      for (const doc of openBuddyTasks) {
        transaction.update(doc.ref, {
          status: 'done',
          completed_at: FieldValue.serverTimestamp(),
          completed_by: 'system',
          completed_reason: 'carnet_opt_out',
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      return;
    }

    const pendingCount = pendingSnap.size;
    if (pendingCount > 0) {
      const newTitle = pendingCount === 1
        ? 'Une plongée à confirmer'
        : `${pendingCount} plongées à confirmer`;
      const currentAggregate = aggregateSnap.exists ? aggregateSnap.data() : null;
      transaction.set(aggregateTaskRef, {
        type: 'buddy_confirmation',
        status: 'open',
        priority: 'normal',
        title: newTitle,
        member_id: memberId,
        member_name: memberName,
        current_assignee_id: memberId,
        current_assignee_type: 'buddy',
        context: { pending_count: pendingCount },
        available_actions: [
          { key: 'open', label: 'Voir', target_screen: 'buddy_confirm' },
        ],
        notification_state: currentAggregate?.status === 'open'
          ? (currentAggregate.notification_state || { reminder_count: 0 })
          : { reminder_count: 0 },
        created_by: 'system',
        created_by_name: FUNCTION_NAME,
        created_at: currentAggregate?.created_at || FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: false });
      for (const task of openBuddyTasks) {
        if (task.id === aggregateTaskId) continue;
        transaction.update(task.ref, {
          status: 'done',
          completed_at: FieldValue.serverTimestamp(),
          completed_by: 'system',
          completed_reason: 'superseded_by_deterministic_aggregate',
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      console.log(
        `[${FUNCTION_NAME}] reconciled buddy_confirmation ${aggregateTaskId} for ${memberId} (pending=${pendingCount})`,
      );
      return;
    }

    for (const doc of openBuddyTasks) {
      transaction.update(doc.ref, {
        status: 'done',
        completed_at: FieldValue.serverTimestamp(),
        completed_by: memberId,
        updated_at: FieldValue.serverTimestamp(),
      });
    }
    if (openBuddyTasks.length > 0) {
      console.log(
        `[${FUNCTION_NAME}] resolved ${openBuddyTasks.length} buddy_confirmation task(s) for ${memberId} (no pending left)`,
      );
    }
  });
}

const onBuddyConfirmationTask = onDocumentWritten(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/logbook_dive_confirmations/{confirmationId}',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  handleBuddyConfirmationTask,
);

module.exports = {
  onBuddyConfirmationTask,
  handleBuddyConfirmationTask,
};
