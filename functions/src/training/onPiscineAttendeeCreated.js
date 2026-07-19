/**
 * Cloud Function — Carnet de Formation phase A (v2.2 amended)
 *
 * Trigger : `clubs/{clubId}/piscine_sessions/{sessionId}/attendees/{attendeeId}` onCreate
 *
 * Logic
 *   1. Auto-assign the suggested target Formation group from the member's
 *      LIFRAS code (`plongeur_code`). A 1-star diver works toward 2-star,
 *      so they join "Formation 2★" — see computeTargetLevel(). The student
 *      can still pick a different group in the pool_checkin UI; this is
 *      only a default.
 *
 *   2. Look up the level_course planning for this session and the target
 *      level (informational — used only for the blocked-task fallback).
 *
 *   3. Create a `formation_tasks/{taskId}` document of type `pool_checkin`.
 *      Cloud Functions run via Admin SDK and bypass security rules.
 *
 *   4. Idempotency : skip if a pool_checkin task with the same
 *      attendee_id already exists.
 *
 * v2.2 changes (2026-05-13)
 *   - The `member.formation_active` filter has been REMOVED. Every attendee
 *     scan creates a pool_checkin task. The student picks one of three
 *     outcomes in the check-in UI: training / service_only / nage_libre.
 *     Only `training` triggers downstream logbook/observation creation
 *     (see `onPoolSessionClosed`). This eliminates the silent drop for
 *     "free swimmers" — they now see one inbox card per pool evening.
 *   - `candidate_validator_ids` has been REMOVED from the task context.
 *     Validators are derived from the chosen group at session-close time
 *     (see `onPoolCheckinCompleted` and `onPoolSessionClosed`).
 *
 * Volumetric estimate (post v2.2)
 *   Per Tuesday pool session at Watermael-Boitsfort :
 *     ~26 attendee writes → ~26 formation_tasks created
 *   The push dispatcher (processFormationTaskReminders) caps at
 *   1 push per member per day AND
 *   POOL_CHECKIN_REMINDER_CAP_PER_SESSION = 1, so peak load is bounded.
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` §8.1 (v2.2 amended)
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { memberDisplayName } = require('../utils/memberName');

const FUNCTION_NAME = 'onPiscineAttendeeCreated';
const FUNCTION_REGION = 'europe-west1';

// Compute the target Formation group for a member.
//
// Priority order :
//   1. Explicit override `member.target_formation_level` (e.g. '2*').
//      Useful for : moniteurs in a personal-refresh program, members on a
//      non-standard pathway, or pilot-mode testing where a moniteur wants
//      to validate the flow end-to-end against their own account.
//   2. LIFRAS plongeur_code-derived default :
//        NB (no brevet) → Formation 1★ (working toward 1-star)
//        P1 → Formation 2★, P2 → Formation 3★, P3 → Formation 4★
//        P4 → Formation 4★ (perfectionnement)
//        AM / MC / MF / MN → null (instructors don't get tasks for themselves)
//
// Two call signatures (back-compat) :
//   computeTargetLevel(plongeurCode: string)    — legacy, still works
//   computeTargetLevel(memberObject: object)    — preferred, respects override
function computeTargetLevel(memberOrCode) {
  // Member-object signature with override support
  if (memberOrCode && typeof memberOrCode === 'object') {
    const override = memberOrCode.target_formation_level;
    if (typeof override === 'string' && override.length > 0) return override;
    return _levelFromPlongeurCode(memberOrCode.plongeur_code);
  }
  // Legacy string signature
  return _levelFromPlongeurCode(memberOrCode);
}

function _levelFromPlongeurCode(plongeurCode) {
  if (!plongeurCode) return '1*';
  // Calypso stores plongeur_code in three notations interchangeably :
  //   'NB' / 'P1' / 'P2' / ...  (LIFRAS canonical)
  //   '1' / '2' / '3' / '4'     (legacy short form, see ProgressionDashboard)
  //   '1*' / '2*' / '3*' / '4*' (display form with star suffix)
  // Normalise first.
  const code = String(plongeurCode).trim().toUpperCase();
  switch (code) {
    case 'NB': return '1*';
    case 'P1':
    case '1':
    case '1*':
      return '2*';
    case 'P2':
    case '2':
    case '2*':
      return '3*';
    case 'P3':
    case '3':
    case '3*':
      return '4*';
    case 'P4':
    case '4':
    case '4*':
      return '4*'; // perfectionnement track
    case 'AM':
    case 'MC':
    case 'MF':
    case 'MN':
      return null; // instructors — no formation task for themselves
    default:
      return null;
  }
}

/**
 * Find the LevelCourse and its encadrants[] for a given level inside
 * a piscine_session document. Handles both new (coursesByHour) and
 * legacy (flat encadrants) shapes — see CalyMob/lib/models/piscine_session.dart.
 *
 * Returns { courseId, encadrants } or null if no course is planned
 * for that level tonight.
 */
function findLevelCourse(sessionData, targetLevel) {
  const niveaux = sessionData.niveaux || {};
  const levelAssignment = niveaux[targetLevel];
  if (!levelAssignment) return null;

  // Prefer the new coursesByHour structure when present.
  const coursesByHour = levelAssignment.courses_by_hour || levelAssignment.coursesByHour;
  if (coursesByHour && typeof coursesByHour === 'object') {
    // Flatten across all hours (1ere_heure, 2eme_heure). First course wins —
    // most pool sessions have one course per level, occasionally two parallel.
    for (const hourKey of Object.keys(coursesByHour)) {
      const courses = coursesByHour[hourKey];
      if (Array.isArray(courses) && courses.length > 0) {
        const course = courses[0];
        const encadrants = Array.isArray(course.encadrants) ? course.encadrants : [];
        if (encadrants.length > 0) {
          return {
            courseId: course.id || `${targetLevel}_${hourKey}_0`,
            encadrants,
          };
        }
      }
    }
  }

  // Legacy fallback : encadrants directly on the level assignment.
  const legacyEncadrants = Array.isArray(levelAssignment.encadrants)
    ? levelAssignment.encadrants
    : [];
  if (legacyEncadrants.length > 0) {
    return {
      courseId: `${targetLevel}_legacy`,
      encadrants: legacyEncadrants,
    };
  }

  return null;
}

/**
 * Find every Formation course tonight where `memberId` is listed as an
 * encadrant. Scans niveaux[*].courses_by_hour[*][i].encadrants[] (new shape)
 * and niveaux[*].encadrants[] (legacy). The 1-based position of the course
 * within its hour becomes the group number shown in the UI (mirrors the
 * "GROUPE 1 / GROUPE 2" labelling of the CalyCompta planning board).
 *
 * Returns an array of { level, group_number, theme, course_id, heure }.
 * Empty array ⇒ the member did not supervise any course (normal attendee).
 */
function findEncadrantGroups(sessionData, memberId) {
  const groups = [];
  const niveaux = sessionData.niveaux || {};

  const isMatch = (enc) =>
    enc && (enc.membre_id === memberId || enc.membreId === memberId);

  for (const level of Object.keys(niveaux)) {
    const levelAssignment = niveaux[level] || {};

    const coursesByHour =
      levelAssignment.courses_by_hour || levelAssignment.coursesByHour;
    if (coursesByHour && typeof coursesByHour === 'object') {
      for (const hourKey of Object.keys(coursesByHour)) {
        const courses = coursesByHour[hourKey];
        if (!Array.isArray(courses)) continue;
        courses.forEach((course, index) => {
          const encadrants = Array.isArray(course.encadrants)
            ? course.encadrants
            : [];
          if (encadrants.some(isMatch)) {
            groups.push({
              level,
              group_number: typeof course.order === 'number' ? course.order + 1 : index + 1,
              theme: course.theme || null,
              course_id: course.id || `${level}_${hourKey}_${index}`,
              heure: hourKey,
            });
          }
        });
      }
    }

    // Legacy fallback: encadrants directly on the level assignment.
    const legacyEncadrants = Array.isArray(levelAssignment.encadrants)
      ? levelAssignment.encadrants
      : [];
    if (
      !(coursesByHour && typeof coursesByHour === 'object') &&
      legacyEncadrants.some(isMatch)
    ) {
      groups.push({
        level,
        group_number: 1,
        theme: levelAssignment.theme || null,
        course_id: `${level}_legacy`,
        heure: null,
      });
    }
  }

  return groups;
}

const onPiscineAttendeeCreated = onDocumentCreated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/piscine_sessions/{sessionId}/attendees/{attendeeId}',
  },
  async (event) => {
    const { clubId, sessionId, attendeeId } = event.params;
    const db = admin.firestore();

    const attendeeSnap = event.data;
    if (!attendeeSnap) {
      console.log(`[${FUNCTION_NAME}] no snapshot, skipping`);
      return;
    }
    const attendee = attendeeSnap.data();

    const memberId = attendee.membre_id || attendee.memberId;
    if (!memberId) {
      console.log(`[${FUNCTION_NAME}] attendee ${attendeeId} has no membre_id, skipping`);
      return;
    }

    // ---- 1. Filter on formation_active ----
    const memberSnap = await db
      .collection('clubs')
      .doc(clubId)
      .collection('members')
      .doc(memberId)
      .get();

    if (!memberSnap.exists) {
      console.log(`[${FUNCTION_NAME}] member ${memberId} not found, skipping`);
      return;
    }
    const member = memberSnap.data();

    // ---- 2. Idempotency check ----
    // Covers both variants — student and encadrant pool_checkin tasks share
    // type=pool_checkin and are keyed on the same attendee_id.
    const existingTasks = await db
      .collection('clubs')
      .doc(clubId)
      .collection('formation_tasks')
      .where('type', '==', 'pool_checkin')
      .where('member_id', '==', memberId)
      .where('context.attendee_id', '==', attendeeId)
      .limit(1)
      .get();

    if (!existingTasks.empty) {
      console.log(`[${FUNCTION_NAME}] task already exists for attendee ${attendeeId}, skipping`);
      return;
    }

    // ---- 3. Load the session planning ----
    const sessionSnap = await db
      .collection('clubs')
      .doc(clubId)
      .collection('piscine_sessions')
      .doc(sessionId)
      .get();
    const session = sessionSnap.exists ? sessionSnap.data() : null;

    // ---- 4. Encadrant branch ----
    // If the member supervises a Formation course tonight, give them the
    // ENCADRANT check-in (a different fiche), not the student one. Moniteurs
    // usually have formation_active=false, so this must run BEFORE the
    // formation_active guard below.
    if (session) {
      const encadrantGroups = findEncadrantGroups(session, memberId);
      if (encadrantGroups.length > 0) {
        await createEncadrantTask(
          db, clubId, attendeeId, member, memberId, sessionId, session, encadrantGroups
        );
        return;
      }
    }

    // ---- 5. Student branch — formation_active guard ----
    // v2.2 (2026-05-13): canonically the formation_active filter is removed
    // and every attendee gets a pool_checkin task with outcome chooser.
    // PRODUCTION DEPLOY 2026-05-14: filter temporarily reinstated until the
    // CalyMob mobile release with the outcome chooser ships — otherwise
    // non-formation members would see a stale pool_checkin task with the
    // legacy LIFRAS chip UI in their installed app. Remove this guard once
    // the new PoolCheckinScreen is in production on iOS + Android.
    if (member.formation_active !== true) {
      console.log(
        `[${FUNCTION_NAME}] member ${memberId} formation_active=false, skipping (TODO: lift after CalyMob v2.2 release)`
      );
      return;
    }

    // ---- 6. Determine target Formation group ----
    // Pass the full member object so the override `target_formation_level`
    // is respected (useful for moniteurs in pilot/refresh mode).
    const targetLevel = computeTargetLevel(member);

    if (targetLevel === null) {
      console.log(
        `[${FUNCTION_NAME}] skipped — plongeur_code=${member.plongeur_code} maps to no target level (instructor without override)`
      );
      return;
    }

    // ---- 7. Look up the level_course planning ----
    if (!session) {
      console.log(`[${FUNCTION_NAME}] session ${sessionId} not found, creating blocked task`);
      await createBlockedTask(db, clubId, attendeeId, member, memberId, sessionId, targetLevel);
      return;
    }

    const levelCourse = findLevelCourse(session, targetLevel);

    if (!levelCourse) {
      // No course planned for this level tonight → blocked task for chef d'école.
      console.log(
        `[${FUNCTION_NAME}] no level_course for ${targetLevel} in session ${sessionId}, creating blocked task`
      );
      await createBlockedTask(db, clubId, attendeeId, member, memberId, sessionId, targetLevel);
      return;
    }

    // v2.2: `candidate_validator_ids` is no longer stored on the task —
    // the student doesn't pick a monitor at check-in time. Validators are
    // derived from the chosen group at session-close (see onPoolCheckinCompleted
    // and onPoolSessionClosed).

    // ---- 5. Create the formation_task ----
    const memberName = composeMemberName(member);
    const formationGroupDisplay = `Formation ${targetLevel}`;

    const taskRef = db
      .collection('clubs')
      .doc(clubId)
      .collection('formation_tasks')
      .doc();

    await taskRef.set({
      type: 'pool_checkin',
      title: `Piscine à compléter — ${formationGroupDisplay}`,
      status: 'open',
      priority: 'normal',
      member_id: memberId,
      member_name: memberName,
      current_assignee_id: memberId,
      current_assignee_type: 'student',
      context: {
        pool_session_id: sessionId,
        attendee_id: attendeeId,
        level_course_id: levelCourse.courseId,
        target_group_level: formationGroupDisplay,
        location_id: session.lieu_id || session.location_id || null,
      },
      available_actions: [
        { key: 'complete_now', label: 'Faire maintenant', target_screen: 'pool_checkin' },
        { key: 'snooze', label: 'Plus tard' },
        { key: 'dismiss', label: 'Pas concerné' },
      ],
      notification_state: { reminder_count: 0 },
      created_by: 'system',
      created_by_name: FUNCTION_NAME,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    console.log(
      `[${FUNCTION_NAME}] created task ${taskRef.id} for member ${memberId} → ${formationGroupDisplay}`
    );
  }
);

async function createEncadrantTask(
  db, clubId, attendeeId, member, memberId, sessionId, session, encadrantGroups
) {
  const memberName = composeMemberName(member);
  const taskRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('formation_tasks')
    .doc();

  await taskRef.set({
    type: 'pool_checkin',
    title: 'Piscine encadrant à compléter',
    status: 'open',
    priority: 'normal',
    member_id: memberId,
    member_name: memberName,
    current_assignee_id: memberId,
    current_assignee_type: 'monitor',
    context: {
      pool_session_id: sessionId,
      attendee_id: attendeeId,
      role: 'encadrant',
      encadrant_groups: encadrantGroups,
      location_id: session.lieu_id || session.location_id || null,
    },
    available_actions: [
      { key: 'complete_now', label: 'Faire maintenant', target_screen: 'pool_checkin' },
      { key: 'snooze', label: 'Plus tard' },
      { key: 'dismiss', label: 'Pas concerné' },
    ],
    notification_state: { reminder_count: 0 },
    created_by: 'system',
    created_by_name: FUNCTION_NAME,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  console.log(
    `[${FUNCTION_NAME}] created ENCADRANT task ${taskRef.id} for member ${memberId} ` +
      `(${encadrantGroups.length} group(s))`
  );
}

async function createBlockedTask(db, clubId, attendeeId, member, memberId, sessionId, targetLevel) {
  // Find a school responsible to route the blocked task to. For now, route to
  // the first admin in the club. Phase 2 may introduce a dedicated
  // school_responsible role.
  const memberName = composeMemberName(member);
  const taskRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('formation_tasks')
    .doc();

  // Try to find an admin to assign the blocked task to.
  let assigneeId = memberId; // fallback : assign to member themselves, status=blocked
  let assigneeType = 'student';
  try {
    const adminQuery = await db
      .collection('clubs')
      .doc(clubId)
      .collection('members')
      .where('app_role', 'in', ['admin', 'superadmin'])
      .limit(1)
      .get();
    if (!adminQuery.empty) {
      assigneeId = adminQuery.docs[0].id;
      assigneeType = 'school_responsible';
    }
  } catch (err) {
    console.warn(`[${FUNCTION_NAME}] could not look up admin for blocked task:`, err.message);
  }

  await taskRef.set({
    type: 'pool_checkin',
    title: `Piscine à compléter — pas de groupe Formation ${targetLevel} planifié`,
    description:
      `${memberName} a scanné au scanner d'entrée mais aucun cours niveau ${targetLevel} ` +
      `n'est planifié pour cette séance. Un responsable doit assigner manuellement.`,
    status: 'blocked',
    priority: 'normal',
    member_id: memberId,
    member_name: memberName,
    current_assignee_id: assigneeId,
    current_assignee_type: assigneeType,
    context: {
      pool_session_id: sessionId,
      attendee_id: attendeeId,
      target_group_level: `Formation ${targetLevel}`,
    },
    available_actions: [
      { key: 'assign_responsible', label: 'Assigner' },
      { key: 'dismiss', label: 'Pas concerné' },
    ],
    notification_state: { reminder_count: 0 },
    created_by: 'system',
    created_by_name: FUNCTION_NAME,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  console.log(`[${FUNCTION_NAME}] created BLOCKED task ${taskRef.id} for member ${memberId}`);
}

function composeMemberName(member) {
  return memberDisplayName(member, 'Membre');
}

module.exports = {
  onPiscineAttendeeCreated,
  // Exported for unit tests
  computeTargetLevel,
  findLevelCourse,
  findEncadrantGroups,
};
