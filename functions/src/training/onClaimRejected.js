/**
 * Cloud Function — Carnet de Formation (WP-02, chaîne de refus S1)
 *
 * Trigger : `clubs/{clubId}/exercise_claims/{claimId}` onUpdate
 *           when `status` transitions to 'rejected'.
 *
 * Miroir "négatif" de onClaimAccepted : quand un moniteur refuse un exercice,
 * l'élève doit recevoir la raison en moins d'une minute et pouvoir corriger
 * (re-soumission illimitée, décision D2). Plus aucun refus silencieux.
 *
 * Idempotence : on sort si `decision.feedback_task_id` est déjà écrit. La
 *   mise à jour de ce champ ne re-déclenche pas de traitement (le statut ne
 *   change pas → garde `before.status === after.status`).
 *
 * Effets de bord :
 *   - Crée une formation_task `claim_rejected` chez l'élève (carte rouge),
 *     avec la raison et les actions « Corriger et re-soumettre » / « Abandonner ».
 *   - Écrit `decision.feedback_task_id` (marqueur d'idempotence).
 *   - Résout la tâche `monitor_validation` parente si elle est encore ouverte.
 *   - Envoie un push immédiat à l'élève.
 *
 * Rétro-compatibilité : d'anciennes versions d'app écrivent seulement
 *   `status='rejected'` + `decision.comment`. On lit `rejected_reason` puis on
 *   retombe sur `comment`, de sorte que la chaîne fonctionne aussi pour elles.
 *
 * Spec : CARNET_PLONGEE_SPEC.md v3.0 §WP-02.
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const {
  collectTokensAndMembers,
  sendNotificationsWithBadge,
} = require('../utils/badge-helper');

const FUNCTION_NAME = 'onClaimRejected';
const FUNCTION_REGION = 'europe-west1';

/**
 * Envoie un push à un seul membre (l'élève). Pas de filtre de préférence : un
 * refus est actionnable et doit toujours arriver. Réutilise le même socle FCM
 * que sendMemberNotification (badge-helper).
 */
async function pushToMember(clubId, memberId, title, body, data) {
  const db = admin.firestore();
  const memberDoc = await db
    .collection('clubs')
    .doc(clubId)
    .collection('members')
    .doc(memberId)
    .get();
  if (!memberDoc.exists) return { successCount: 0, failureCount: 0 };

  const { memberTokenGroups } = collectTokensAndMembers([memberDoc], null);
  if (memberTokenGroups.size === 0) return { successCount: 0, failureCount: 0 };

  const basePayload = {
    notification: { title, body },
    data: {
      ...Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v ?? '')]),
      ),
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'event_messages',
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
          alert: { title, body },
          sound: 'default',
          'content-available': 1,
        },
      },
    },
  };

  return sendNotificationsWithBadge(
    clubId,
    memberTokenGroups,
    basePayload,
    'event_messages',
  );
}

// Inner handler exported for unit tests (bypasses the CF wrapper).
async function handleClaimRejected(event) {
    const { clubId, claimId } = event.params;
    const db = admin.firestore();

    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // Fire only on transition to 'rejected'.
    if (before.status === after.status) return;
    if (after.status !== 'rejected') return;

    // Idempotency : skip if the feedback task was already created.
    if (after.decision?.feedback_task_id) {
      console.log(
        `[${FUNCTION_NAME}] claim ${claimId} already has feedback task, skipping`,
      );
      return;
    }

    const memberId = after.member_id || '';
    if (!memberId) {
      console.warn(`[${FUNCTION_NAME}] claim ${claimId} rejected but no member_id`);
      return;
    }

    const exerciseCode = after.exercise_code || after.exercise_id || '?';
    const exerciseLabel = after.exercise_label || null;
    const rejectedReason =
      (after.decision &&
        (after.decision.rejected_reason || after.decision.comment)) ||
      '';

    const clubRef = db.collection('clubs').doc(clubId);

    // ---- 0. DB-level idempotency (robust to duplicate event delivery) ----
    // The feedback_task_id guard above only catches re-triggers caused by our
    // own write. A duplicate delivery of the SAME rejection write carries an
    // identical snapshot (no feedback_task_id yet), so we also check the DB for
    // an existing claim_rejected task. One query on a single (auto-indexed)
    // field, reused below to resolve the parent monitor_validation task.
    const tasksSnap = await clubRef
      .collection('formation_tasks')
      .where('context.exercise_claim_id', '==', claimId)
      .get();
    const alreadyHandled = tasksSnap.docs.some(
      (d) => d.data().type === 'claim_rejected',
    );
    if (alreadyHandled) {
      console.log(
        `[${FUNCTION_NAME}] claim ${claimId} already has a claim_rejected task, skipping`,
      );
      return;
    }

    // ---- 1. Create the 'claim_rejected' task for the student -------------
    const taskRef = clubRef.collection('formation_tasks').doc();
    const taskPayload = {
      type: 'claim_rejected',
      status: 'open',
      priority: 'normal',
      title: `Exercice ${exerciseCode} refusé`,
      member_id: memberId,
      member_name: after.member_name || 'Membre',
      current_assignee_id: memberId,
      current_assignee_type: 'student',
      context: {
        exercise_claim_id: claimId,
        exercise_code: exerciseCode,
        exercise_label: exerciseLabel,
        rejected_reason: rejectedReason,
        operation_id: after.operation_id || null,
        pool_session_id: after.pool_session_id || null,
      },
      available_actions: [
        {
          key: 'retry',
          label: 'Corriger et re-soumettre',
          target_screen: 'claim_retry',
        },
        { key: 'abandon', label: 'Abandonner' },
      ],
      notification_state: { reminder_count: 0 },
      created_by: 'system',
      created_by_name: FUNCTION_NAME,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    for (const k of Object.keys(taskPayload.context)) {
      if (taskPayload.context[k] === null) delete taskPayload.context[k];
    }
    await taskRef.set(taskPayload);

    // ---- 2. Write the idempotency marker on the claim --------------------
    await event.data.after.ref.update({
      'decision.feedback_task_id': taskRef.id,
      updated_at: FieldValue.serverTimestamp(),
    });

    // ---- 3. Resolve the parent monitor_validation task (if still open) ---
    // Reuse tasksSnap fetched above — no second query needed.
    for (const d of tasksSnap.docs) {
      const t = d.data();
      if (t.type === 'monitor_validation' && t.status === 'open') {
        await d.ref.update({
          status: 'done',
          completed_at: FieldValue.serverTimestamp(),
          completed_by:
            (after.decision && after.decision.rejected_by) || 'system',
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    }

    // ---- 4. Immediate push to the student --------------------------------
    try {
      const pushTitle = `Exercice ${exerciseCode} à revoir`;
      const pushBody = rejectedReason
        ? `Ton moniteur : « ${rejectedReason} »`
        : 'Ton moniteur a refusé cet exercice. Ouvre pour corriger.';
      await pushToMember(clubId, memberId, pushTitle, pushBody, {
        type: 'claim_rejected',
        club_id: clubId,
        exercise_claim_id: claimId,
        formation_task_id: taskRef.id,
      });
    } catch (err) {
      console.warn(
        `[${FUNCTION_NAME}] push failed for claim ${claimId}: ${err.message}`,
      );
    }

    console.log(
      `[${FUNCTION_NAME}] claim ${claimId} refusé → task ${taskRef.id} (member ${memberId})`,
    );
}

const onClaimRejected = onDocumentUpdated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/exercise_claims/{claimId}',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  handleClaimRejected,
);

module.exports = {
  onClaimRejected,
  // exported for unit tests
  handleClaimRejected,
  pushToMember,
};
