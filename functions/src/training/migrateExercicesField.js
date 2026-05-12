/**
 * One-shot migration helper — copies `participant_operation.exercices`
 * to `requested_exercises` for backward compatibility during the
 * two-release transition window (see tech doc §13.2).
 *
 * INVOCATION : manual via Cloud Functions shell or callable wrapper.
 *              NOT a triggered Cloud Function — runs on demand.
 *
 * Idempotent : skips documents that already have `requested_exercises` set.
 * Non-destructive : leaves the old `exercices` field intact so legacy clients
 * keep reading it during the transition.
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` v2.1 §13.2.
 */

const admin = require('firebase-admin');

async function migrateExercicesField({ clubId, dryRun = true } = {}) {
  const db = admin.firestore();
  const result = {
    scanned: 0,
    updated: 0,
    skipped_already_migrated: 0,
    skipped_no_exercices: 0,
    sample_updates: [],
  };

  const snap = await db
    .collection('clubs')
    .doc(clubId)
    .collection('participant_operation')
    .get();

  for (const doc of snap.docs) {
    result.scanned += 1;
    const data = doc.data();
    const legacy = Array.isArray(data.exercices) ? data.exercices : null;
    const canonical = Array.isArray(data.requested_exercises) ? data.requested_exercises : null;

    if (canonical) {
      result.skipped_already_migrated += 1;
      continue;
    }
    if (!legacy || legacy.length === 0) {
      result.skipped_no_exercices += 1;
      continue;
    }

    if (!dryRun) {
      await doc.ref.update({
        requested_exercises: legacy,
        // Best-effort defaults — Jan can adjust before deploy if needed.
        formation_intent: legacy.length > 0,
      });
    }
    result.updated += 1;
    if (result.sample_updates.length < 5) {
      result.sample_updates.push({
        id: doc.id,
        copied: legacy,
        member: data.membre_id || data.member_id,
      });
    }
  }

  return result;
}

module.exports = { migrateExercicesField };
