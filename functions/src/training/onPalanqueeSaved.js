/**
 * Cloud Function — Carnet de Formation phase 4
 *
 * Trigger : `clubs/{clubId}/palanquees/{palanqueeId}` onWrite
 *           when `planned_exercises` transitions from empty/null to non-empty.
 *
 * Pre-creates DRAFT exercise_claims for each (member, exercise) pair the
 * instructor planned. Students will edit/confirm these post-dive in the
 * exercise_claim flow.
 *
 * Why : speeds up the post-dive logbook flow — the student opens their
 * inbox, the claim is already pre-filled with context, they just confirm.
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` v2.1 §8.5
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const FUNCTION_NAME = 'onPalanqueeSaved';
const FUNCTION_REGION = 'europe-west1';

const onPalanqueeSaved = onDocumentWritten(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/palanquees/{palanqueeId}',
  },
  async (event) => {
    const { clubId, palanqueeId } = event.params;
    const db = admin.firestore();

    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;

    const beforeMap = (before?.planned_exercises ?? {}) || {};
    const afterMap = (after.planned_exercises ?? {}) || {};

    if (Object.keys(afterMap).length === 0) return;
    if (JSON.stringify(beforeMap) === JSON.stringify(afterMap)) return;

    const monitorId = after.monitor_validator_id || null;
    const operationId = after.operation_id || null;

    let created = 0;
    let skipped = 0;

    for (const [memberId, codes] of Object.entries(afterMap)) {
      if (!Array.isArray(codes)) continue;
      for (const code of codes) {
        if (!code) continue;

        // Idempotency : skip if a draft claim for this (member, exercise,
        // palanquée) tuple already exists.
        const existing = await db
          .collection('clubs')
          .doc(clubId)
          .collection('exercise_claims')
          .where('member_id', '==', memberId)
          .where('exercise_code', '==', code)
          .where('palanquee_id', '==', palanqueeId)
          .where('status', '==', 'draft')
          .limit(1)
          .get();

        if (!existing.empty) {
          skipped += 1;
          continue;
        }

        const claimRef = db
          .collection('clubs')
          .doc(clubId)
          .collection('exercise_claims')
          .doc();

        await claimRef.set({
          member_id: memberId,
          exercise_id: code,
          exercise_code: code,
          context_type: 'dive',
          operation_id: operationId,
          palanquee_id: palanqueeId,
          declared_by: 'system',
          declared_at: FieldValue.serverTimestamp(),
          validation_mode: 'calypso_monitor',
          monitor_id: monitorId,
          evidence: [],
          status: 'draft',
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        created += 1;
      }
    }

    console.log(
      `[${FUNCTION_NAME}] palanquee ${palanqueeId}: ${created} draft claims created, ${skipped} skipped`
    );
  }
);

module.exports = { onPalanqueeSaved };
