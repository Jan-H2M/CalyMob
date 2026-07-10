/**
 * Cloud Function — Carnet de Formation (WP-02, chaîne de refus S1)
 *
 * Trigger : `clubs/{clubId}/exercise_claims/{claimId}` onUpdate
 *           when `status` transitions from 'rejected' → 'submitted'.
 *
 * Pourquoi une CF dédiée : onClaimSubmitted est un trigger onDocumentCreated —
 * il NE se déclenche PAS sur une re-soumission (qui est une mise à jour) et son
 * garde d'idempotence saute dès qu'une formation_task existe déjà pour le claim
 * (or après un refus il en existe deux : la monitor_validation résolue + la
 * claim_rejected). On crée donc ici une NOUVELLE tâche monitor_validation, en
 * réutilisant resolveAssignee/composeTaskTitle exportés par onClaimSubmitted.
 * (Décision technique validée par Jan 2026-07-07 — voir §6 du spec.)
 *
 * Idempotence : on ne crée pas de tâche s'il existe déjà une tâche de revue
 *   (monitor_validation / external_proof_review) OUVERTE pour ce claim.
 *
 * Effets de bord :
 *   - Crée une formation_task de revue chez le validateur résolu.
 *   - Résout toute tâche `claim_rejected` encore ouverte (le client le fait
 *     aussi ; ceinture + bretelles).
 *   - Écrit `review_task_id` sur le claim.
 *
 * Spec : CARNET_PLONGEE_SPEC.md v3.0 §WP-02.
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { resolveAssignee, composeTaskTitle } = require('./onClaimSubmitted');

const FUNCTION_NAME = 'onClaimResubmitted';
const FUNCTION_REGION = 'europe-west1';

const REVIEW_TASK_TYPES = ['monitor_validation', 'external_proof_review'];

// Inner handler exported for unit tests (bypasses the CF wrapper).
async function handleClaimResubmitted(event) {
    const { clubId, claimId } = event.params;

    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // Fire only on the re-submission transition rejected → submitted.
    if (!(before.status === 'rejected' && after.status === 'submitted')) return;

    const db = admin.firestore();
    const clubRef = db.collection('clubs').doc(clubId);

    // ---- Idempotency guard ----------------------------------------------
    // Fetch all tasks for this claim on a single (auto-indexed) field, then
    // filter in memory — avoids requiring a composite index on status.
    const tasksSnap = await clubRef
      .collection('formation_tasks')
      .where('context.exercise_claim_id', '==', claimId)
      .get();

    const hasOpenReview = tasksSnap.docs.some((d) => {
      const t = d.data();
      return t.status === 'open' && REVIEW_TASK_TYPES.includes(t.type);
    });
    if (hasOpenReview) {
      console.log(
        `[${FUNCTION_NAME}] claim ${claimId} already has an open review task, skipping`,
      );
      return;
    }

    // ---- Resolve task type + assignee (mirror onClaimSubmitted) ----------
    const validationMode = String(after.validation_mode || '').toLowerCase();
    const isExternal = validationMode === 'external_monitor';
    const taskType = isExternal ? 'external_proof_review' : 'monitor_validation';

    const assignee = await resolveAssignee(db, clubRef, after, { isExternal });

    const memberId = after.member_id || '';
    const memberName = after.member_name || 'Membre';
    const exerciseCode = after.exercise_code || after.exercise_id || '?';
    const exerciseLabel = after.exercise_label || null;

    const title = composeTaskTitle({
      isExternal,
      memberName,
      exerciseCode,
      exerciseLabel,
    });
    const actions = isExternal
      ? [{ key: 'open', label: 'Examiner', target_screen: 'external_proof_review' }]
      : [{ key: 'open', label: 'Valider', target_screen: 'monitor_validation' }];

    const taskRef = clubRef.collection('formation_tasks').doc();
    const taskPayload = {
      type: taskType,
      status: 'open',
      priority: 'normal',
      title,
      member_id: memberId,
      member_name: memberName,
      current_assignee_id: assignee && assignee.id ? assignee.id : '',
      current_assignee_type: assignee && assignee.type ? assignee.type : 'monitor',
      context: {
        exercise_claim_id: claimId,
        exercise_code: exerciseCode,
        exercise_label: exerciseLabel,
        validation_mode: validationMode,
        pool_session_id: after.pool_session_id || null,
        logbook_entry_id: after.logbook_entry_id || null,
        operation_id: after.operation_id || null,
        palanquee_id: after.palanquee_id || null,
        resubmission: true,
        retry_count: after.retry_count || 0,
      },
      available_actions: actions,
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

    // ---- Resolve any still-open claim_rejected task ----------------------
    for (const d of tasksSnap.docs) {
      const t = d.data();
      if (t.type === 'claim_rejected' && t.status === 'open') {
        await d.ref.update({
          status: 'done',
          completed_at: FieldValue.serverTimestamp(),
          completed_by: memberId,
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    }

    // ---- Forward-navigation pointer on the claim -------------------------
    try {
      await event.data.after.ref.update({
        review_task_id: taskRef.id,
        ...(isExternal && assignee && assignee.id
          ? { external_reviewer_id: assignee.id }
          : {}),
        updated_at: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.warn(
        `[${FUNCTION_NAME}] could not patch claim ${claimId} with review_task_id: ${err.message}`,
      );
    }

    console.log(
      `[${FUNCTION_NAME}] claim ${claimId} re-soumis → task ${taskType} ${taskRef.id} ` +
        `(member=${memberId} assignee=${assignee && assignee.id ? assignee.id : '(unassigned)'})`,
    );
}

const onClaimResubmitted = onDocumentUpdated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/exercise_claims/{claimId}',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  handleClaimResubmitted,
);

module.exports = {
  onClaimResubmitted,
  // exported for unit tests
  handleClaimResubmitted,
};
