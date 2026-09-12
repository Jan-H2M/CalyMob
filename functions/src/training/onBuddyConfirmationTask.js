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

  // ---- Count pending confirmations for this member (2-field indexed query) --
  const pendingSnap = await clubRef
    .collection('logbook_dive_confirmations')
    .where('target_member_id', '==', memberId)
    .where('status', '==', 'pending')
    .get();
  const pendingCount = pendingSnap.size;

  const memberSnap = await clubRef.collection('members').doc(memberId).get();
  if (memberSnap.exists && !usesCarnet(memberSnap.data())) {
    for (const doc of pendingSnap.docs) {
      await doc.ref.update({
        status: 'confirmed_no_import',
        auto_accepted: true,
        auto_accepted_reason: 'carnet_opt_out',
        responded_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
    }
    const leftoverTasks = await clubRef
      .collection('formation_tasks')
      .where('current_assignee_id', '==', memberId)
      .get();
    for (const d of leftoverTasks.docs) {
      const t = d.data();
      if (t.type === 'buddy_confirmation' && t.status === 'open') {
        await d.ref.update({
          status: 'done',
          completed_at: FieldValue.serverTimestamp(),
          completed_by: 'system',
          completed_reason: 'carnet_opt_out',
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    }
    return;
  }

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
  // A stable id makes concurrent confirmation triggers converge on the same
  // aggregate task. The previous auto-id flow could create two open tasks when
  // two buddies answered at nearly the same time.
  const aggregateTaskId = `buddy_confirmation_${memberId}`;
  const aggregateTaskRef = clubRef
    .collection('formation_tasks')
    .doc(aggregateTaskId);

  if (pendingCount > 0) {
    const newTitle =
      pendingCount === 1
        ? 'Une plongée à confirmer'
        : `${pendingCount} plongées à confirmer`;
    const deterministicTask = openBuddyTasks.find(
      task => task.id === aggregateTaskId,
    );
    if (!deterministicTask) {
      // Create/reopen the deterministic aggregate. Concurrent invocations use
      // the same document and therefore cannot create duplicate open tasks.
      await aggregateTaskRef.set({
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
        notification_state: { reminder_count: 0 },
        created_by: 'system',
        created_by_name: FUNCTION_NAME,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      console.log(
        `[${FUNCTION_NAME}] created buddy_confirmation task ${aggregateTaskId} for ${memberId} (pending=${pendingCount})`,
      );
    } else {
      const current = deterministicTask.data();
      if ((current.context && current.context.pending_count) !== pendingCount) {
        await aggregateTaskRef.update({
          title: newTitle,
          'context.pending_count': pendingCount,
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    }
    // Resolve every legacy/random open task. This also cleans up duplicates
    // left by older deployed versions while preserving their history.
    for (const task of openBuddyTasks) {
      if (task.id === aggregateTaskId) continue;
      await task.ref.update({
        status: 'done',
        completed_at: FieldValue.serverTimestamp(),
        completed_by: 'system',
        completed_reason: 'superseded_by_deterministic_aggregate',
        updated_at: FieldValue.serverTimestamp(),
      });
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
