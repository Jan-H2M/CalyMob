/**
 * Cloud Function — Carnet de Formation phase A (v2.2)
 *
 * Trigger : `clubs/{clubId}/formation_tasks/{taskId}` onUpdate
 *
 * Logic (per CARNET_DE_FORMATION_TECH.md §8.6)
 *   1. Only react to `pool_checkin` tasks whose status transitions to `done`.
 *   2. Read `completion_data` from the task — written by PoolCheckinForm
 *      (web) or pool_checkin_screen (mobile) on submit.
 *   3. Resolve `validatorId` based on the chosen group:
 *        a. `piscine_sessions/{sessionId}/groups/{groupKey}.supervisorId`
 *           (set explicitly for AM groups by the chef d'école)
 *        b. `piscine_sessions/{sessionId}/groups/{groupKey}.validatorId`
 *           (precomputed by group config)
 *        c. first member id in `completion.moniteurIds`
 *        d. first encadrant from `session.niveaux[level].courses_by_hour`
 *   4. Merge `groupAssignment`, `personalNotes`, `outcome`, and
 *      `checkinCompletedAt` onto
 *      `piscine_sessions/{sessionId}/attendees/{userId}`.
 *
 * Outcome semantics
 *   - 'training'      : student joined a Formation group; a logbook entry
 *                       and a monitor_observation task will be created at
 *                       session close (see `onPoolSessionClosed`).
 *   - 'service_only'  : student did Accueil/Baptêmes/Gonflage — no logbook.
 *   - 'nage_libre'    : student did free swim — no logbook.
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` §8.6
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const FUNCTION_NAME = 'onPoolCheckinCompleted';
const FUNCTION_REGION = 'europe-west1';

const onPoolCheckinCompleted = onDocumentUpdated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/formation_tasks/{taskId}',
  },
  async (event) => {
    const { clubId, taskId } = event.params;
    const before = event.data && event.data.before && event.data.before.data();
    const after = event.data && event.data.after && event.data.after.data();
    if (!before || !after) return;

    if (after.type !== 'pool_checkin') return;
    if (before.status === 'done' || after.status !== 'done') return;

    const sessionId = after.context && after.context.pool_session_id;
    const userId = after.member_id;
    if (!sessionId || !userId) {
      console.warn(
        `[${FUNCTION_NAME}] task ${taskId} missing pool_session_id or member_id — skipping`
      );
      return;
    }

    const completion = after.completion_data || {};
    const rawOutcome = completion.outcome || null;
    const VALID_OUTCOMES = ['training', 'service_only', 'nage_libre'];
    const outcome = VALID_OUTCOMES.includes(rawOutcome) ? rawOutcome : null;
    if (!outcome) {
      console.warn(
        `[${FUNCTION_NAME}] task ${taskId} has unexpected outcome=${rawOutcome} — writing null`
      );
    }

    const db = admin.firestore();

    let groupAssignment = null;
    if (outcome === 'training') {
      const validatorId = await resolveValidator(
        db,
        clubId,
        sessionId,
        completion.groupKey,
        completion.level,
        completion.moniteurIds || []
      );
      groupAssignment = {
        level: completion.level || null,
        groupNumber:
          typeof completion.groupNumber === 'number' ? completion.groupNumber : null,
        groupKey: completion.groupKey || null,
        themeSnapshot: completion.themeSnapshot || null,
        moniteurIds: Array.isArray(completion.moniteurIds) ? completion.moniteurIds : [],
        validatorId,
      };
    }

    const attendeeRef = db
      .collection('clubs')
      .doc(clubId)
      .collection('piscine_sessions')
      .doc(sessionId)
      .collection('attendees')
      .doc(userId);

    await attendeeRef.set(
      {
        groupAssignment,
        personalNotes: completion.personalNotes || null,
        outcome,
        checkinCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(
      `[${FUNCTION_NAME}] task ${taskId} → attendee ${userId} ` +
        `(outcome=${outcome || 'n/a'}, group=${(groupAssignment && groupAssignment.groupKey) || 'n/a'})`
    );
  }
);

/**
 * Resolve the validator member_id for a given group.
 *
 * Priority (per v2.2 §3 validator-per-group rule):
 *   1. piscine_sessions/{sessionId}/groups/{groupKey}.supervisorId
 *      — used when an AM is the monitor and an MC/MF/MN supervises.
 *   2. piscine_sessions/{sessionId}/groups/{groupKey}.validatorId
 *      — explicit override at group creation.
 *   3. First moniteurId in the completion payload — applies when the
 *      monitor is MC/MF/MN and validates themselves.
 *   4. Fall back to the first encadrant of the level_course on the
 *      session document.
 *
 * Returns null if nothing resolves (caller logs a warning).
 */
async function resolveValidator(db, clubId, sessionId, groupKey, level, moniteurIds) {
  if (groupKey) {
    try {
      const groupSnap = await db
        .collection('clubs')
        .doc(clubId)
        .collection('piscine_sessions')
        .doc(sessionId)
        .collection('groups')
        .doc(groupKey)
        .get();
      if (groupSnap.exists) {
        const g = groupSnap.data();
        if (g.supervisorId) return g.supervisorId;
        if (g.validatorId) return g.validatorId;
      }
    } catch (err) {
      console.warn(`[${FUNCTION_NAME}] could not read groups/${groupKey}: ${err.message}`);
    }
  }

  if (Array.isArray(moniteurIds) && moniteurIds.length > 0) {
    return moniteurIds[0];
  }

  if (level) {
    try {
      const sessionSnap = await db
        .collection('clubs')
        .doc(clubId)
        .collection('piscine_sessions')
        .doc(sessionId)
        .get();
      if (sessionSnap.exists) {
        const session = sessionSnap.data();
        const niveaux = session.niveaux || {};
        const levelAssignment = niveaux[level];
        if (levelAssignment) {
          const coursesByHour =
            levelAssignment.courses_by_hour || levelAssignment.coursesByHour;
          if (coursesByHour && typeof coursesByHour === 'object') {
            for (const hourKey of Object.keys(coursesByHour)) {
              const courses = coursesByHour[hourKey];
              if (Array.isArray(courses) && courses.length > 0) {
                const course = courses[0];
                if (Array.isArray(course.encadrants) && course.encadrants.length > 0) {
                  return (
                    course.encadrants[0].membre_id ||
                    course.encadrants[0].membreId ||
                    null
                  );
                }
              }
            }
          }
          if (Array.isArray(levelAssignment.encadrants) && levelAssignment.encadrants.length > 0) {
            return (
              levelAssignment.encadrants[0].membre_id ||
              levelAssignment.encadrants[0].membreId ||
              null
            );
          }
        }
      }
    } catch (err) {
      console.warn(`[${FUNCTION_NAME}] could not read session for level resolve: ${err.message}`);
    }
  }

  return null;
}

module.exports = {
  onPoolCheckinCompleted,
  // Exported for tests
  resolveValidator,
};
