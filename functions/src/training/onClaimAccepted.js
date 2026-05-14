/**
 * Cloud Function — Carnet de Formation phase 2
 *
 * Trigger : `clubs/{clubId}/exercise_claims/{claimId}` onUpdate
 *           when `status` transitions to 'accepted'.
 *
 * Promotes an accepted claim into the official `member_observations`
 * collection. This is the ONLY path that writes to member_observations —
 * the existing CalyCompta UI for direct observations will be deprecated
 * in a future cleanup pass.
 *
 * Idempotency : skip if `decision.resulting_observation_id` is already set.
 *
 * Side effects :
 *   - Creates member_observations/{auto}
 *   - Updates the claim with the back-reference (decision.resulting_observation_id)
 *   - Resolves the parent monitor_validation formation_task (status = done)
 *   - Creates a "P2.DP confirmé" result task for the student (informational,
 *     auto-closing, surfaces as a green card in the inbox)
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` v2.1 §8.3
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const FUNCTION_NAME = 'onClaimAccepted';
const FUNCTION_REGION = 'europe-west1';

const onClaimAccepted = onDocumentUpdated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/exercise_claims/{claimId}',
  },
  async (event) => {
    const { clubId, claimId } = event.params;
    const db = admin.firestore();

    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // Fire only on transition to 'accepted'.
    if (before.status === after.status) return;
    if (after.status !== 'accepted') return;

    // Idempotency : skip if already promoted.
    if (after.decision?.resulting_observation_id) {
      console.log(`[${FUNCTION_NAME}] claim ${claimId} already promoted, skipping`);
      return;
    }

    if (!after.decision || !after.decision.decided_by) {
      console.warn(`[${FUNCTION_NAME}] claim ${claimId} accepted but decision is incomplete, skipping`);
      return;
    }

    // ---- 1. Create the official observation ----
    const contextType =
      after.context_type === 'pool' ? 'piscine'
      : after.context_type === 'dive' ? 'plongee'
      : 'autre';

    const memberName = after.member_name || '';
    // Extract niveau from exercise_code (e.g. 'P2.DP' → '2*'). Fallback : empty.
    const memberNiveau = inferNiveauFromExerciseCode(after.exercise_code || after.exercise_id);

    const observationRef = db
      .collection('clubs')
      .doc(clubId)
      .collection('member_observations')
      .doc();

    await observationRef.set({
      // Sujet
      memberId: after.member_id,
      memberName,
      memberNiveau,

      // Contexte
      contextType,
      contextId: after.operation_id || after.pool_session_id || claimId,
      contextDate: after.decision.decided_at || FieldValue.serverTimestamp(),
      contextTitle: deriveContextTitle(after),

      // Catégorie
      category: 'exercice_lifras',
      exerciceCode: after.exercise_code || after.exercise_id,
      exerciceDescription: after.exercise_label || null,

      // Result
      result: 'acquis',
      notes: after.decision.comment || null,

      // Observer
      observerId: after.decision.decided_by,
      observerName: after.decision.decided_by_name || '',

      // Source : back-reference for traceability
      sourceClaimId: claimId,
      sourceType: 'exercise_claim',

      // Audit
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // ---- 2. Back-link from the claim ----
    await db
      .collection('clubs')
      .doc(clubId)
      .collection('exercise_claims')
      .doc(claimId)
      .update({
        'decision.resulting_observation_id': observationRef.id,
        updated_at: FieldValue.serverTimestamp(),
      });

    // ---- 3. Resolve parent monitor_validation task (if any) ----
    const parentTaskSnap = await db
      .collection('clubs')
      .doc(clubId)
      .collection('formation_tasks')
      .where('type', '==', 'monitor_validation')
      .where('context.exercise_claim_id', '==', claimId)
      .limit(1)
      .get();

    if (!parentTaskSnap.empty) {
      await parentTaskSnap.docs[0].ref.update({
        status: 'done',
        completed_at: FieldValue.serverTimestamp(),
        completed_by: after.decision.decided_by,
        updated_at: FieldValue.serverTimestamp(),
      });
    }

    // ---- 4. Result-card task for the student (auto-done, informational) ----
    const studentTaskRef = db
      .collection('clubs')
      .doc(clubId)
      .collection('formation_tasks')
      .doc();

    await studentTaskRef.set({
      type: 'manual_reminder',
      title: `${after.exercise_code || after.exercise_id} confirmé par ${after.decision.decided_by_name || 'le moniteur'}`,
      status: 'done',
      priority: 'low',
      member_id: after.member_id,
      member_name: memberName,
      current_assignee_id: after.member_id,
      current_assignee_type: 'student',
      context: {
        exercise_claim_id: claimId,
        operation_id: after.operation_id || null,
        pool_session_id: after.pool_session_id || null,
      },
      available_actions: [{ key: 'open', label: 'Voir' }],
      completed_at: FieldValue.serverTimestamp(),
      completed_by: 'system',
      notification_state: { reminder_count: 0 },
      created_by: 'system',
      created_by_name: FUNCTION_NAME,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    console.log(
      `[${FUNCTION_NAME}] claim ${claimId} → observation ${observationRef.id} (member ${after.member_id})`
    );
  }
);

/**
 * Infer the LIFRAS niveau from an exercise code.
 *   'P1.PB' → '1*'
 *   'P2.DP' → '2*'
 *   'P3.OR' → '3*'
 *   'P4.NX' → '4*'
 *   Anything else → ''.
 */
function inferNiveauFromExerciseCode(code) {
  if (!code || typeof code !== 'string') return '';
  const match = code.match(/^P([1-4])/i);
  if (!match) return '';
  return `${match[1]}*`;
}

function deriveContextTitle(claim) {
  if (claim.operation_id) return claim.operation_id;
  if (claim.pool_session_id) return `Piscine ${claim.pool_session_id}`;
  return 'Validation';
}

module.exports = {
  onClaimAccepted,
  inferNiveauFromExerciseCode,
};
