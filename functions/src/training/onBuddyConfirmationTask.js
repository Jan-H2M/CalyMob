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

  // ---- Count pending confirmations for this member (2-field indexed query) --
  const pendingSnap = await clubRef
    .collection('logbook_dive_confirmations')
    .where('target_member_id', '==', memberId)
    .where('status', '==', 'pending')
    .get();
  const pendingCount = pendingSnap.size;

  // ---- Find existing OPEN buddy_confirmation task(s) for the member ---------
  // Query on current_assignee_id (auto-indexed) + filter type/status in memory
  // to avoid requiring a new composite index.
  const tasksSnap = await clubRef
    .collection('formation_tasks')
    .where('current_assignee_id', '==', memberId)
    .get();
  const openBuddyTasks = tasksSnap.docs.filter((d) => {
    const t = d.data();
    return t.type === 'buddy_confirmation' && t.status === 'open';
  });

  if (pendingCount > 0) {
    if (openBuddyTasks.length === 0) {
      // Create a single aggregated task.
      const taskRef = clubRef.collection('formation_tasks').doc();
      await taskRef.set({
        type: 'buddy_confirmation',
        status: 'open',
        priority: 'normal',
        title:
          pendingCount === 1
            ? 'Une plongée à confirmer'
            : `${pendingCount} plongées à confirmer`,
        member_id: memberId,
        member_name: memberName,
        current_assignee_id: memberId,
        current_assignee_type: 'buddy',
        context: { pending_count: pendingCount },
        available_actions: [
          { key: 'open', label: 'Voir', target_screen: 'buddy_confirm' },
        ],
        notification_state: { reminder_count: 0 },
        created_by: 'system',
        created_by_name: FUNCTION_NAME,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      console.log(
        `[${FUNCTION_NAME}] created buddy_confirmation task ${taskRef.id} for ${memberId} (pending=${pendingCount})`,
      );
    } else {
      // Keep a single task; refresh its count/title if it changed.
      const primary = openBuddyTasks[0];
      const cur = primary.data();
      const newTitle =
        pendingCount === 1
          ? 'Une plongée à confirmer'
          : `${pendingCount} plongées à confirmer`;
      if ((cur.context && cur.context.pending_count) !== pendingCount) {
        await primary.ref.update({
          title: newTitle,
          'context.pending_count': pendingCount,
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      // Resolve any accidental duplicates.
      for (let i = 1; i < openBuddyTasks.length; i++) {
        await openBuddyTasks[i].ref.update({
          status: 'done',
          completed_at: FieldValue.serverTimestamp(),
          completed_by: 'system',
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    }
  } else {
    // No more pending → resolve open buddy_confirmation task(s).
    for (const d of openBuddyTasks) {
      await d.ref.update({
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
  }
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
