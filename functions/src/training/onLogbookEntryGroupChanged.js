/**
 * Cloud Function — Carnet de Formation phase A follow-up (2026-05-14).
 *
 * Trigger : `clubs/{clubId}/student_logbook_entries/{entryId}` onUpdate
 *
 * Detects when a student changes the `group_level` or `group_number` on a
 * pool logbook entry (source=piscine) — typically to correct a check-in
 * mistake — and re-routes the open `monitor_observation` task that was
 * fanned out by `onPoolSessionClosed` to the new group's validator.
 *
 * Also syncs the entry's own `validator_id` / `validator_name` /
 * `moniteur_ids` / `moniteur_names` so the carnet detail view stays
 * consistent with the chosen group.
 *
 * No-op when source is not piscine, when neither group field changed, when
 * no open monitor_observation task exists, or when the new validator can't
 * be resolved (we then leave the task with the original validator and just
 * log a warning).
 *
 * Spec : Jan request 2026-05-14 — group editing must keep the downstream
 * observation task in sync.
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const FUNCTION_NAME = 'onLogbookEntryGroupChanged';
const FUNCTION_REGION = 'europe-west1';

const onLogbookEntryGroupChanged = onDocumentUpdated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/student_logbook_entries/{entryId}',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (event) => {
    const { clubId, entryId } = event.params;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    if (after.source !== 'piscine') return;

    const levelChanged = (before.group_level || null) !== (after.group_level || null);
    const numberChanged = (before.group_number ?? null) !== (after.group_number ?? null);
    if (!levelChanged && !numberChanged) return;

    const sessionId = after.session_id;
    const memberId = after.member_id;
    if (!sessionId || !memberId) {
      console.log(
        `[${FUNCTION_NAME}] entry ${entryId} missing session_id or member_id — skipping`
      );
      return;
    }

    const db = admin.firestore();
    const newLevel = after.group_level || null;

    // Resolve a new validator from the session's level plan. Mirrors the
    // fallback chain in onPoolCheckinCompleted: groups/{groupKey}.supervisorId
    // → groups/{groupKey}.validatorId → first encadrant of the level course.
    let newValidatorId = null;
    let newValidatorName = null;
    try {
      const sessionSnap = await db
        .collection('clubs').doc(clubId)
        .collection('piscine_sessions').doc(sessionId).get();
      if (sessionSnap.exists) {
        const session = sessionSnap.data();
        const niveaux = session.niveaux || {};
        const levelPlan = newLevel ? niveaux[newLevel] : null;
        if (levelPlan) {
          const cbh = levelPlan.courses_by_hour || levelPlan.coursesByHour || {};
          // First encadrant we can find across the hours of this level.
          outer: for (const hourKey of Object.keys(cbh)) {
            const courses = cbh[hourKey];
            if (!Array.isArray(courses)) continue;
            for (const c of courses) {
              if (Array.isArray(c.encadrants) && c.encadrants.length > 0) {
                const enc = c.encadrants[0];
                newValidatorId = enc.membre_id || enc.membreId || null;
                newValidatorName = enc.membre_nom || enc.membreNom || null;
                if (newValidatorId) break outer;
              }
            }
          }
          // Fallback: flat encadrants[] on the level.
          if (!newValidatorId && Array.isArray(levelPlan.encadrants) && levelPlan.encadrants.length > 0) {
            const enc = levelPlan.encadrants[0];
            newValidatorId = enc.membre_id || enc.membreId || null;
            newValidatorName = enc.membre_nom || enc.membreNom || null;
          }
        }
      }
    } catch (err) {
      console.warn(
        `[${FUNCTION_NAME}] could not read session ${sessionId}: ${err.message}`
      );
    }

    if (!newValidatorId) {
      console.warn(
        `[${FUNCTION_NAME}] entry ${entryId} group changed to level=${newLevel} but no validator could be resolved on session ${sessionId} — leaving task assignment unchanged`
      );
      return;
    }

    // Resolve display name if not already on the encadrant block.
    if (!newValidatorName) {
      try {
        const m = await db.collection('clubs').doc(clubId)
          .collection('members').doc(newValidatorId).get();
        if (m.exists) {
          const v = m.data() || {};
          const display = `${v.prenom || ''} ${v.nom || ''}`.trim();
          if (display) newValidatorName = display;
        }
      } catch {
        // best-effort
      }
    }

    // If the new validator is the same as the old one, no need to re-route.
    if (newValidatorId === before.validator_id) {
      console.log(
        `[${FUNCTION_NAME}] entry ${entryId} new validator matches the existing one — only entry snapshot needs refresh`
      );
    }

    // 1. Patch the entry's own validator snapshot (no echo loop: only fields
    // that already changed-by-user can trigger us, validator fields aren't).
    try {
      await event.data.after.ref.update({
        validator_id: newValidatorId,
        validator_name: newValidatorName,
        updated_at: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.warn(
        `[${FUNCTION_NAME}] could not refresh entry validator snapshot: ${err.message}`
      );
    }

    // 2. Find the matching open monitor_observation task and re-route it.
    let taskSnap;
    try {
      taskSnap = await db
        .collection('clubs').doc(clubId)
        .collection('formation_tasks')
        .where('type', '==', 'monitor_observation')
        .where('member_id', '==', memberId)
        .where('context.pool_session_id', '==', sessionId)
        .where('status', '==', 'open')
        .limit(1).get();
    } catch (err) {
      console.warn(
        `[${FUNCTION_NAME}] could not query monitor_observation task: ${err.message}`
      );
      return;
    }
    if (taskSnap.empty) {
      console.log(
        `[${FUNCTION_NAME}] no open monitor_observation task for member=${memberId} session=${sessionId} — nothing to re-route`
      );
      return;
    }
    const taskDoc = taskSnap.docs[0];
    const taskData = taskDoc.data();
    if (taskData.current_assignee_id === newValidatorId) {
      console.log(
        `[${FUNCTION_NAME}] task ${taskDoc.id} already assigned to ${newValidatorId}`
      );
      return;
    }

    const memberName = after.member_name || taskData.member_name || 'Membre';
    const theme = after.theme_snapshot || taskData.context?.theme_snapshot || '';
    const tail = [newLevel, theme].filter(Boolean).join(' ');
    const newTitle = tail ? `Évaluer ${memberName} (${tail})` : `Évaluer ${memberName}`;

    try {
      await taskDoc.ref.update({
        current_assignee_id: newValidatorId,
        current_assignee_type: 'monitor',
        title: newTitle,
        'context.level': newLevel,
        'context.group_number':
          typeof after.group_number === 'number' ? after.group_number : null,
        // Reset reminder state so the new assignee gets a clean run.
        notification_state: { reminder_count: 0 },
        updated_at: FieldValue.serverTimestamp(),
      });
      console.log(
        `[${FUNCTION_NAME}] re-routed task ${taskDoc.id}: ${taskData.current_assignee_id} → ${newValidatorId} (level=${newLevel})`
      );
    } catch (err) {
      console.error(
        `[${FUNCTION_NAME}] failed to update task ${taskDoc.id}: ${err.message}`
      );
    }
  }
);

module.exports = {
  onLogbookEntryGroupChanged,
};
