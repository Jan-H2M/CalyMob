/**
 * Cloud Function — Carnet de Formation (v2.2)
 *
 * Trigger : onDocumentCreated `clubs/{clubId}/exercise_claims/{claimId}`
 *
 * When a member declares an exercise (either via the carnet logbook flow,
 * an ad-hoc claim, or an external-proof upload), we need to surface that
 * declaration in *someone's* inbox so it can be reviewed. Without this CF
 * claims pile up in Firestore but nobody sees them — the spec calls for an
 * explicit `formation_tasks` entry to drive the review queue.
 *
 *   - validation_mode === 'external_monitor'  → `external_proof_review`
 *       task, assigned to the club's external-proof reviewer (or the first
 *       admin we can find as a fallback).
 *   - validation_mode === 'monitor' (or default) → `monitor_validation`
 *       task, assigned (best effort) to claim.monitor_id, otherwise the
 *       chef de palanquée from the linked palanquée, otherwise the same
 *       admin fallback.
 *
 * Idempotency : we query existing `formation_tasks` filtered by
 *   context.exercise_claim_id == claimId before creating. This makes
 *   re-creates a no-op, and also protects against the trigger firing twice
 *   for the same claim (which the Functions runtime is allowed to do).
 *
 * Stop-condition note : this trigger creates **at most one** task per
 * claim. It does NOT send push notifications directly — those are handled
 * by `processFormationTaskReminders` (scheduled, with dedupe). Safe to
 * run during backfills as long as the claims themselves are flagged
 * `migration_source` / `_backfill` (we honour those markers below).
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` v2.2 §8 (implicit), audit
 * 2026-05-14 blockers #1 + #4.
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { resolveChefEcole } = require('../utils/resolveChefEcole');

const FUNCTION_NAME = 'onClaimSubmitted';
const FUNCTION_REGION = 'europe-west1';

const onClaimSubmitted = onDocumentCreated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/exercise_claims/{claimId}',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (event) => {
    const { clubId, claimId } = event.params;
    const claim = event.data && event.data.data();
    if (!claim) return;

    // Skip backfills / migrations — they shouldn't enter the live review
    // queue, by design. Same convention as onExerciceDeclared.
    if (claim.migration_source) {
      console.log(
        `[${FUNCTION_NAME}] skip ${claimId} — migration_source=${claim.migration_source}`,
      );
      return;
    }
    if (claim._backfill === true) return;

    // Only spawn tasks for claims that actually need review. A claim could
    // also be `draft` (user not done) or already `accepted/rejected` if it
    // was imported from elsewhere — neither needs a fresh review task.
    const status = String(claim.status || '').toLowerCase();
    if (status !== 'submitted' && status !== 'waiting_external_review') {
      console.log(
        `[${FUNCTION_NAME}] skip ${claimId} — status=${status} not reviewable`,
      );
      return;
    }

    // Only `calypso_monitor` and `external_monitor` are reviewable. The
    // `buddy_only` and `personal_only` modes are user-only records that
    // never enter the validation queue — even if a buggy client somehow
    // sets status='submitted' on one, we skip rather than make work for
    // the school responsible.
    const validationModeRaw = String(claim.validation_mode || '').toLowerCase();
    if (
      validationModeRaw !== 'calypso_monitor' &&
      validationModeRaw !== 'external_monitor' &&
      validationModeRaw !== 'monitor' /* legacy alias */
    ) {
      console.log(
        `[${FUNCTION_NAME}] skip ${claimId} — validation_mode=${validationModeRaw} not reviewable`,
      );
      return;
    }

    const db = admin.firestore();
    const clubRef = db.collection('clubs').doc(clubId);

    // ---- Idempotency guard ------------------------------------------------
    const existing = await clubRef
      .collection('formation_tasks')
      .where('context.exercise_claim_id', '==', claimId)
      .limit(1)
      .get();
    if (!existing.empty) {
      console.log(
        `[${FUNCTION_NAME}] skip ${claimId} — task already exists (${existing.docs[0].id})`,
      );
      return;
    }

    // ---- Resolve task type + assignee ------------------------------------
    const validationMode = validationModeRaw;
    const isExternal = validationMode === 'external_monitor';
    const taskType = isExternal ? 'external_proof_review' : 'monitor_validation';

    const assignee = await resolveAssignee(db, clubRef, claim, { isExternal });
    if (!assignee || !assignee.id) {
      // No-one to assign to — write the task anyway, leaving the assignee
      // empty, so admins can find it via an unassigned query. Better than
      // silently dropping it.
      console.warn(
        `[${FUNCTION_NAME}] claim ${claimId} (${taskType}): no assignee resolved — task created unassigned`,
      );
    }

    // ---- Build + write the task ------------------------------------------
    const memberId = claim.member_id || '';
    const memberName = claim.member_name || 'Membre';
    const exerciseCode = claim.exercise_code || claim.exercise_id || '?';
    const exerciseLabel = claim.exercise_label || null;

    const title = composeTaskTitle({
      isExternal,
      memberName,
      exerciseCode,
      exerciseLabel,
    });

    const actions = isExternal
      ? [
          { key: 'open', label: 'Examiner', target_screen: 'external_proof_review' },
        ]
      : [
          { key: 'open', label: 'Valider', target_screen: 'monitor_validation' },
        ];

    const taskRef = clubRef.collection('formation_tasks').doc();
    const taskPayload = {
      type: taskType,
      status: 'open',
      priority: isExternal ? 'normal' : 'normal',
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
        // Pass through the context that the claim already references so the
        // review forms don't need to re-look-up the parent doc to know
        // "where" this claim was filed.
        pool_session_id: claim.pool_session_id || null,
        logbook_entry_id: claim.logbook_entry_id || null,
        operation_id: claim.operation_id || null,
        palanquee_id: claim.palanquee_id || null,
      },
      available_actions: actions,
      notification_state: { reminder_count: 0 },
      created_by: 'system',
      created_by_name: FUNCTION_NAME,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    // Strip nulls out of context so the doc stays compact.
    for (const k of Object.keys(taskPayload.context)) {
      if (taskPayload.context[k] === null) delete taskPayload.context[k];
    }

    await taskRef.set(taskPayload);

    // Also patch the claim with the task id for forward navigation
    // (helpful for the carnet detail screen later).
    try {
      await event.data.ref.update({
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
      `[${FUNCTION_NAME}] created ${taskType} task ${taskRef.id} for claim ${claimId} ` +
        `member=${memberId} assignee=${assignee && assignee.id ? assignee.id : '(unassigned)'}`,
    );
  },
);

/**
 * Resolve the user-id that the new task should be assigned to.
 *
 * Preference order :
 *   external_monitor  →  settings.formation.external_proof_reviewer_id
 *                     →  first member with app_role=admin/superadmin
 *
 *   monitor (default) →  claim.monitor_id
 *                     →  palanquee.chef_id (or palanquee.responsible_id)
 *                     →  same admin fallback as external
 *
 * Returns `{ id, type, source }` or `null` if nothing was found.
 */
async function resolveAssignee(db, clubRef, claim, { isExternal }) {
  // Branch 1 : explicit monitor_id on the claim
  if (!isExternal && claim.monitor_id && typeof claim.monitor_id === 'string') {
    return { id: claim.monitor_id, type: 'monitor', source: 'claim.monitor_id' };
  }

  // Branch 2 : settings document (Jan can configure a dedicated reviewer)
  try {
    const settingsSnap = await clubRef
      .collection('settings')
      .doc('formation')
      .get();
    if (settingsSnap.exists) {
      const s = settingsSnap.data();
      if (isExternal && typeof s.external_proof_reviewer_id === 'string') {
        return {
          id: s.external_proof_reviewer_id,
          type: 'admin',
          source: 'settings.external_proof_reviewer_id',
        };
      }
      if (!isExternal && typeof s.default_validator_id === 'string') {
        return {
          id: s.default_validator_id,
          type: 'monitor',
          source: 'settings.default_validator_id',
        };
      }
    }
  } catch (err) {
    // Non-fatal — fall through to other strategies.
    console.warn(`[${FUNCTION_NAME}] settings read failed: ${err.message}`);
  }

  // Branch 3 : palanquée chef (only for monitor-validation flow)
  if (!isExternal && claim.palanquee_id) {
    try {
      const palanqueeRef = clubRef
        .collection('palanquees')
        .doc(claim.palanquee_id);
      const palanqueeSnap = await palanqueeRef.get();
      if (palanqueeSnap.exists) {
        const p = palanqueeSnap.data();
        const candidates = [
          p.chef_id,
          p.chef_de_palanquee_id,
          p.responsible_id,
          p.responsable_id,
          p.dp_id,
        ].filter((x) => typeof x === 'string' && x.length > 0);
        if (candidates.length > 0) {
          return {
            id: candidates[0],
            type: 'monitor',
            source: 'palanquee.chef',
          };
        }
      }
    } catch (err) {
      console.warn(
        `[${FUNCTION_NAME}] palanquee read failed for ${claim.palanquee_id}: ${err.message}`,
      );
    }
  }

  // WP-18 (D18) — preuves externes revues par le chef d'école : après le
  // reviewer explicite (Branch 2), on résout le chef d'école
  // (settings/general.chef_ecole_member_id, sinon premier admin).
  if (isExternal) {
    const chefId = await resolveChefEcole(db, clubRef.id);
    if (chefId) {
      return { id: chefId, type: 'admin', source: 'chef_ecole' };
    }
  }

  // Branch 4 : first admin / encadrant of the club. Deterministic by sorting
  // on document id so two parallel runs land on the same person and we
  // don't get duplicate tasks.
  try {
    const membersSnap = await clubRef
      .collection('members')
      .where('app_role', 'in', ['admin', 'superadmin'])
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(1)
      .get();
    if (!membersSnap.empty) {
      return {
        id: membersSnap.docs[0].id,
        type: 'admin',
        source: 'fallback.first_admin',
      };
    }
  } catch (err) {
    // app_role 'in' filter requires an indexed field — if it isn't indexed
    // yet, fall through. We do a slightly more expensive `==` scan next.
    console.warn(`[${FUNCTION_NAME}] admin 'in' query failed: ${err.message}`);
  }

  try {
    const adminSnap = await clubRef
      .collection('members')
      .where('app_role', '==', 'admin')
      .limit(1)
      .get();
    if (!adminSnap.empty) {
      return {
        id: adminSnap.docs[0].id,
        type: 'admin',
        source: 'fallback.app_role==admin',
      };
    }
  } catch (err) {
    console.warn(`[${FUNCTION_NAME}] admin '==' query failed: ${err.message}`);
  }

  // Couldn't resolve. The task will be written unassigned and an admin can
  // route it manually from the admin inbox view.
  return null;
}

function composeTaskTitle({ isExternal, memberName, exerciseCode, exerciseLabel }) {
  const verb = isExternal ? 'Examiner preuve externe' : 'Valider exercice';
  const labelBit = exerciseLabel ? ` — ${exerciseLabel}` : '';
  return `${verb} ${exerciseCode}${labelBit} (${memberName})`;
}

module.exports = {
  onClaimSubmitted,
  // exported for unit tests
  resolveAssignee,
  composeTaskTitle,
};
