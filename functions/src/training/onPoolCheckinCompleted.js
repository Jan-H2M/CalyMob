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
 *        c. first encadrant from the exact selected course/group on the
 *           session document
 *        d. first member id in `completion.moniteurIds` (legacy fallback)
 *   4. Merge `groupAssignment`, `personalNotes`, `outcome`, and
 *      `checkinCompletedAt` onto the original attendee document referenced by
 *      `context.attendee_id` (fallback: existing member attendee, then userId).
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
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { normalizeGroupKey } = require('../utils/groupKey');

const FUNCTION_NAME = 'onPoolCheckinCompleted';
const FUNCTION_REGION = 'europe-west1';

function normalizedMonitorIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((id) => (id == null ? '' : String(id).trim()))
    .filter(Boolean)));
}

function groupNumberFrom(rawValue, rawGroupKey) {
  const numeric = Number(rawValue);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  const normalizedKey = normalizeGroupKey(rawGroupKey);
  const match = normalizedKey && /_groupe(\d+)$/.exec(normalizedKey);
  return match ? Number(match[1]) : null;
}

function cleanHourKey(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function hourContract(outerHourKey, embeddedValues) {
  const outer = cleanHourKey(outerHourKey);
  const embedded = (embeddedValues || []).map(cleanHourKey).filter(Boolean);
  const uniqueEmbedded = Array.from(new Set(embedded));
  const embeddedHourKey = uniqueEmbedded[0] || null;
  return {
    hourKey: outer || embeddedHourKey,
    conflict: uniqueEmbedded.length > 1 || Boolean(
      outer && embeddedHourKey && embeddedHourKey !== outer
    ),
  };
}

function encadrantGroupContract(rawGroup, outerHourKey) {
  const group = rawGroup && typeof rawGroup === 'object' ? rawGroup : {};
  const hours = hourContract(outerHourKey, [
    group.heure,
    group.hourKey,
    group.hour_key,
  ]);
  return {
    ...group,
    heure: hours.hourKey,
    contractConflict: {
      ...(group.contractConflict && typeof group.contractConflict === 'object'
        ? group.contractConflict
        : {}),
      hourKey: hours.conflict,
    },
  };
}

/** Normalize both current camelCase and production legacy snake_case input. */
function selectedGroupContract(rawGroup, completion = {}, hourKey = null) {
  const group = rawGroup && typeof rawGroup === 'object' ? rawGroup : {};
  const rawLevel = group.level || completion.level || null;
  const rawGroupKey =
    group.groupKey || group.group_key || completion.groupKey || completion.group_key;
  const rawGroupNumber =
    group.groupNumber ?? group.group_number ??
    completion.groupNumber ?? completion.group_number;
  const hours = hourContract(hourKey, [
    group.heure,
    group.hourKey,
    completion.heure,
    completion.hourKey,
  ]);
  // In the v4 shape, the `completion.hours` map key is authoritative. Any
  // contradictory embedded value must fail closed instead of selecting a
  // course from another hour. A flat legacy payload has no outer context and
  // may therefore keep using its embedded hour.
  const level = rawLevel;
  const groupKey = normalizeGroupKey(
    rawGroupKey
  );
  const groupNumber = groupNumberFrom(
    rawGroupNumber,
    groupKey
  );
  const monitorIds = normalizedMonitorIds(
    group.moniteurIds || group.moniteur_ids ||
      completion.moniteurIds || completion.moniteur_ids
  );
  return {
    level,
    groupNumber,
    groupKey,
    hourKey: hours.hourKey,
    contractPresence: {
      level: Boolean(rawLevel),
      groupNumber: rawGroupNumber != null && String(rawGroupNumber).trim() !== '',
      groupKey: Boolean(rawGroupKey && String(rawGroupKey).trim()),
      hourKey: Boolean(hours.hourKey),
    },
    contractConflict: {
      hourKey: hours.conflict,
    },
    monitorIds,
    themeSnapshot:
      group.themeSnapshot || group.theme_snapshot || group.theme ||
      completion.themeSnapshot || completion.theme_snapshot || null,
  };
}

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
    // 'encadrant' carries an encadrantReport instead of (or, since v4, next
    // to) a student groupAssignment.
    const VALID_OUTCOMES = ['training', 'service_only', 'nage_libre', 'encadrant'];
    const outcome = VALID_OUTCOMES.includes(rawOutcome) ? rawOutcome : null;
    if (!outcome) {
      console.warn(
        `[${FUNCTION_NAME}] task ${taskId} has unexpected outcome=${rawOutcome} — writing null`
      );
    }

    const db = admin.firestore();

    // ---- v4 path (2026-07-07) : per-hour completion_data -------------------
    // completion.hours = { '1ere_heure': {activity, role?, groups?|group?,
    // service?, service_other?}, '2eme_heure': {...} }. An encadrant can have
    // encadré one hour and suivi (student) the other, so BOTH encadrantReport
    // and groupAssignment may be set. Older app versions send the flat shape;
    // that legacy path is kept below untouched.
    const hoursMap =
      completion.hours && typeof completion.hours === 'object'
        ? completion.hours
        : null;

    if (hoursMap) {
      const hoursReport = {};
      const encGroupsRaw = [];
      let firstEleveGroup = null;

      for (const [hourKey, rawEntry] of Object.entries(hoursMap)) {
        if (!rawEntry || typeof rawEntry !== 'object') continue;
        const entry = { activity: rawEntry.activity || null };
        if (rawEntry.service) entry.service = rawEntry.service;
        if (rawEntry.service_other) entry.service_other = rawEntry.service_other;
        if (rawEntry.role === 'encadrant' && Array.isArray(rawEntry.groups)) {
          entry.role = 'encadrant';
          // The hour key is the authoritative heure for the group (needed by
          // the level+group_number+heure match below).
          entry.groups = rawEntry.groups
            .filter((g) => g && typeof g === 'object')
            .map((g) => encadrantGroupContract(g, hourKey));
          encGroupsRaw.push(...entry.groups);
        } else if (
          rawEntry.role === 'eleve' &&
          rawEntry.group &&
          typeof rawEntry.group === 'object'
        ) {
          entry.role = 'eleve';
          entry.group = rawEntry.group;
          if (!firstEleveGroup) {
            firstEleveGroup = selectedGroupContract(
              rawEntry.group,
              completion,
              hourKey
            );
          }
        }
        hoursReport[hourKey] = entry;
      }

      let encadrantReport = null;
      if (encGroupsRaw.length > 0) {
        const hasHourConflict = encGroupsRaw.some(
          (group) => group.contractConflict && group.contractConflict.hourKey
        );
        // Reject the entire encadrant reconciliation before opening a
        // transaction when any embedded hour contradicts its authoritative
        // completion.hours map key. This guarantees zero planning writes.
        const reconciled = hasHourConflict
          ? encGroupsRaw.map((group) => ({ ...group, matched: false }))
          : await reconcileEncadrantGroups(
            db, clubId, sessionId, userId, encGroupsRaw
          );
        // Substitute the enriched groups back into the per-hour report
        // (reconcile preserves order across the flattened array).
        let idx = 0;
        for (const hourKey of Object.keys(hoursReport)) {
          const entry = hoursReport[hourKey];
          if (entry.role === 'encadrant' && Array.isArray(entry.groups)) {
            entry.groups = entry.groups.map(() => reconciled[idx++]);
          }
        }
        encadrantReport = {
          groups: reconciled,
          workedOn: completion.workedOn || null,
        };
      }

      let groupAssignment = null;
      if (firstEleveGroup) {
        const supervision = await resolveGroupSupervision(
          db,
          clubId,
          sessionId,
          { ...firstEleveGroup, participantMemberId: userId }
        );
        groupAssignment = {
          level: firstEleveGroup.level,
          groupNumber: firstEleveGroup.groupNumber,
          groupKey: firstEleveGroup.groupKey,
          themeSnapshot:
            firstEleveGroup.themeSnapshot || supervision.themeSnapshot,
          moniteurIds: supervision.monitorIds,
          validatorId: supervision.validatorId,
        };
      }

      const attendeeRef = await resolveAttendeeRef(db, clubId, sessionId, after);

      await attendeeRef.set(
        {
          ...buildAttendeeIdentityPatch(after),
          groupAssignment,
          encadrantReport,
          hoursReport,
          personalNotes: completion.personalNotes || null,
          outcome,
          checkinCompletedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(
        `[${FUNCTION_NAME}] task ${taskId} → attendee ${attendeeRef.id} (v4 hours) ` +
          `outcome=${outcome || 'n/a'} enc_groups=${encGroupsRaw.length} ` +
          `eleve_group=${(groupAssignment && groupAssignment.groupKey) || 'n/a'}`
      );
      return;
    }

    // ---- Legacy path (pre-v4 completion_data) ------------------------------

    // Encadrant check-in : snapshot what the monitor supervised onto the
    // attendee doc so CalyCompta can surface it. No validator / logbook.
    //
    // v2.3 : the fiche lets the encadrant add groups himself —
    //   - source=='planning_other' : another planned course (has course_id);
    //     the encadrant is appended to that course's encadrants[] so validator
    //     resolution & the roster reflect reality.
    //   - source=='manual' (course_id null) : matched here against the
    //     planning on level+group_number+heure. Match → enriched with
    //     course_id/theme + appended to encadrants[] (behaves as planned).
    //     No match → kept informative only (matched:false).
    //   - noCourse==true : the encadrant explicitly did not supervise
    //     anything tonight (not enough students) — empty groups.
    let encadrantReport = null;
    if (outcome === 'encadrant') {
      const noCourse = completion.noCourse === true;
      const rawGroups =
        noCourse || !Array.isArray(completion.groups) ? [] : completion.groups;
      const groups = await reconcileEncadrantGroups(
        db, clubId, sessionId, userId, rawGroups
      );
      encadrantReport = {
        groups,
        workedOn: noCourse ? null : completion.workedOn || null,
        noCourse,
      };
    }

    let groupAssignment = null;
    if (outcome === 'training') {
      const selectedGroup = selectedGroupContract(null, completion);
      const supervision = await resolveGroupSupervision(
        db,
        clubId,
        sessionId,
        { ...selectedGroup, participantMemberId: userId }
      );
      groupAssignment = {
        level: selectedGroup.level,
        groupNumber: selectedGroup.groupNumber,
        groupKey: selectedGroup.groupKey,
        themeSnapshot:
          selectedGroup.themeSnapshot || supervision.themeSnapshot,
        moniteurIds: supervision.monitorIds,
        validatorId: supervision.validatorId,
      };
    }

    const attendeeRef = await resolveAttendeeRef(db, clubId, sessionId, after);

    await attendeeRef.set(
      {
        ...buildAttendeeIdentityPatch(after),
        groupAssignment,
        encadrantReport,
        personalNotes: completion.personalNotes || null,
        outcome,
        checkinCompletedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(
      `[${FUNCTION_NAME}] task ${taskId} → attendee ${attendeeRef.id} ` +
        `(outcome=${outcome || 'n/a'}, group=${(groupAssignment && groupAssignment.groupKey) || 'n/a'}` +
        `${encadrantReport ? `, encadrant_groups=${encadrantReport.groups.length}` : ''})`
    );
  }
);

function buildAttendeeIdentityPatch(task) {
  const memberId = task && task.member_id;
  const memberName = task && (task.member_name || task.memberName);
  const patch = {};
  if (memberId) patch.memberId = memberId;
  if (memberName) patch.memberName = memberName;
  return patch;
}

async function resolveAttendeeRef(db, clubId, sessionId, task) {
  const attendeesRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('piscine_sessions')
    .doc(sessionId)
    .collection('attendees');

  const context = (task && task.context) || {};
  const contextAttendeeId = context.attendee_id || context.attendeeId;
  if (contextAttendeeId) {
    return attendeesRef.doc(String(contextAttendeeId));
  }

  const memberId = task && task.member_id;
  if (memberId) {
    const byMemberId = await attendeesRef
      .where('memberId', '==', memberId)
      .limit(1)
      .get();
    if (!byMemberId.empty) return byMemberId.docs[0].ref;

    const byLegacyMemberId = await attendeesRef
      .where('membre_id', '==', memberId)
      .limit(1)
      .get();
    if (!byLegacyMemberId.empty) return byLegacyMemberId.docs[0].ref;

    return attendeesRef.doc(String(memberId));
  }

  return attendeesRef.doc();
}

/**
 * Reconcile the encadrant's reported groups against the session planning.
 *
 * Runs in a transaction on the session doc :
 *   1. groups WITH course_id whose course doesn't list this encadrant yet
 *      (source=='planning_other') → append {membre_id} to encadrants[].
 *   2. groups WITHOUT course_id (source=='manual') → find the planned course
 *      with the same level + group_number + heure. Found → enrich the group
 *      (course_id, theme, matched:true) and append the encadrant. Not found
 *      → matched:false, group stays informative.
 *
 * Returns the (possibly enriched) groups array. Never throws — on any error
 * the raw groups are returned so the attendee write still succeeds.
 */
async function reconcileEncadrantGroups(db, clubId, sessionId, memberId, rawGroups) {
  if (!Array.isArray(rawGroups) || rawGroups.length === 0) return [];
  if (rawGroups.some(
    (group) => group && group.contractConflict && group.contractConflict.hourKey
  )) {
    return rawGroups.map((group) => (
      group && typeof group === 'object' ? { ...group, matched: false } : group
    ));
  }

  const sessionRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('piscine_sessions')
    .doc(sessionId);

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(sessionRef);
      if (!snap.exists) {
        return rawGroups.map((g) =>
          g && !g.course_id ? { ...g, matched: false } : g
        );
      }
      const session = snap.data() || {};
      const niveaux = session.niveaux || {};
      let planningDirty = false;

      const hasEncadrant = (course) =>
        Array.isArray(course.encadrants) &&
        course.encadrants.some(
          (e) => e && (e.membre_id === memberId || e.membreId === memberId)
        );
      const appendEncadrant = (course) => {
        if (!Array.isArray(course.encadrants)) course.encadrants = [];
        course.encadrants.push({ membre_id: memberId });
        planningDirty = true;
      };

      const findCourse = (predicate) => {
        for (const level of Object.keys(niveaux)) {
          const la = niveaux[level];
          if (!la || typeof la !== 'object') continue;
          const cbh = la.courses_by_hour || la.coursesByHour;
          if (!cbh || typeof cbh !== 'object') continue;
          for (const heure of Object.keys(cbh)) {
            const courses = cbh[heure];
            if (!Array.isArray(courses)) continue;
            for (let i = 0; i < courses.length; i++) {
              const course = courses[i];
              if (!course || typeof course !== 'object') continue;
              const groupNumber =
                typeof course.order === 'number' ? course.order + 1 : i + 1;
              const courseId = course.id || `${level}_${heure}_${i}`;
              if (predicate({ level, heure, groupNumber, courseId, course })) {
                return { level, heure, groupNumber, courseId, course };
              }
            }
          }
        }
        return null;
      };

      const out = rawGroups.map((g) => {
        if (!g || typeof g !== 'object') return g;

        if (g.course_id) {
          const hit = findCourse((c) => c.courseId === g.course_id);
          if (hit && !hasEncadrant(hit.course)) appendEncadrant(hit.course);
          return g;
        }

        // Manual group — match on level + group_number + heure.
        const hit = findCourse(
          (c) =>
            c.level === g.level &&
            c.groupNumber === g.group_number &&
            (!g.heure || c.heure === g.heure)
        );
        if (!hit) return { ...g, matched: false };
        if (!hasEncadrant(hit.course)) appendEncadrant(hit.course);
        return {
          ...g,
          course_id: hit.courseId,
          theme: g.theme || hit.course.theme || null,
          heure: g.heure || hit.heure,
          matched: true,
        };
      });

      if (planningDirty) {
        tx.update(sessionRef, {
          niveaux,
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      return out;
    });
  } catch (err) {
    console.warn(
      `[${FUNCTION_NAME}] reconcileEncadrantGroups failed for session ${sessionId}: ${err.message}`
    );
    return rawGroups;
  }
}

/**
 * Resolve the selected group's monitor list and validator member_id.
 *
 * Priority (per v2.2 §3 validator-per-group rule):
 *   1. piscine_sessions/{sessionId}/groups/{groupKey}.supervisorId
 *      — used when an AM is the monitor and an MC/MF/MN supervises.
 *   2. piscine_sessions/{sessionId}/groups/{groupKey}.validatorId
 *      — explicit override at group creation.
 *   3. First encadrant of the exact selected level/hour/group on the session
 *      document — applies when the monitor validates themselves.
 *   4. First moniteurId in the completion payload for legacy sessions that
 *      have no matching persisted group plan.
 *
 * Never substitutes another numbered group. Returns null validatorId if
 * nothing resolves (caller logs a warning).
 */
function memberIdsFromEncadrants(encadrants) {
  if (!Array.isArray(encadrants)) return [];
  return normalizedMonitorIds(encadrants.map((entry) =>
    entry && (entry.membre_id || entry.membreId || entry.member_id || entry.memberId)
  ));
}

function canonicalGroupKey(level, groupNumber) {
  if (!level || !groupNumber) return null;
  return normalizeGroupKey(`${level}-${groupNumber}`);
}

function hasPersistedCourses(session) {
  const niveaux = session && session.niveaux;
  if (!niveaux || typeof niveaux !== 'object') return false;
  return Object.values(niveaux).some((assignment) =>
    assignment && typeof assignment === 'object' &&
    (Object.prototype.hasOwnProperty.call(assignment, 'courses_by_hour') ||
      Object.prototype.hasOwnProperty.call(assignment, 'coursesByHour'))
  );
}

function courseMatchesSelection(course, selection, derivedGroupNumber, hourKey) {
  if (derivedGroupNumber !== selection.groupNumber) return false;
  const courseLevel = course.level || course.niveau || null;
  if (courseLevel && courseLevel !== selection.level) return false;
  const courseHour = course.heure || course.hourKey || course.hour_key || null;
  if (courseHour && courseHour !== hourKey) return false;
  const rawCourseNumber = course.groupNumber ?? course.group_number;
  if (rawCourseNumber != null && Number(rawCourseNumber) !== selection.groupNumber) {
    return false;
  }
  const courseGroupKey = normalizeGroupKey(course.groupKey || course.group_key);
  return !courseGroupKey || courseGroupKey === selection.groupKey;
}

function findPlannedGroup(session, selection) {
  if (selection && selection.contractConflict &&
      selection.contractConflict.hourKey) {
    return null;
  }
  if (!session || !selection.level) return null;
  const niveaux = session.niveaux || {};
  const levelAssignment = niveaux[selection.level];
  if (!levelAssignment || typeof levelAssignment !== 'object') return null;
  const coursesByHour =
    levelAssignment.courses_by_hour || levelAssignment.coursesByHour;

  if (coursesByHour && typeof coursesByHour === 'object') {
    // Current planning is unambiguous only with the complete selected-group
    // contract. Never search another hour or infer a group from a supplied key.
    const presence = selection.contractPresence || {
      level: Boolean(selection.level),
      groupNumber: Boolean(selection.groupNumber),
      groupKey: Boolean(selection.groupKey),
      hourKey: Boolean(selection.hourKey),
    };
    if (!presence.level || !presence.groupNumber ||
        !presence.groupKey || !presence.hourKey) {
      return null;
    }
    if (selection.groupKey !== canonicalGroupKey(
      selection.level,
      selection.groupNumber
    )) {
      return null;
    }
    const courses = coursesByHour[selection.hourKey];
    if (!Array.isArray(courses)) return null;
    for (let index = 0; index < courses.length; index++) {
      const course = courses[index];
      if (!course || typeof course !== 'object') continue;
      const number = typeof course.order === 'number' ? course.order + 1 : index + 1;
      if (number !== selection.groupNumber) continue;
      if (!courseMatchesSelection(course, selection, number, selection.hourKey)) {
        return null;
      }
      return {
        schema: 'modern',
        monitorIds: memberIdsFromEncadrants(course.encadrants),
        themeSnapshot: course.theme || null,
      };
    }
    return null;
  }

  // A payload fallback is safe only when the entire persisted session proves
  // it uses the old one-unnumbered-group-per-level shape. Mixed/current
  // sessions are never treated as legacy merely because one level is missing.
  if (hasPersistedCourses(session)) return null;
  const hasLegacyShape =
    Object.prototype.hasOwnProperty.call(levelAssignment, 'encadrants') ||
    Object.prototype.hasOwnProperty.call(levelAssignment, 'theme') ||
    Object.prototype.hasOwnProperty.call(levelAssignment, 'theme_1ere_heure') ||
    Object.prototype.hasOwnProperty.call(levelAssignment, 'theme_2eme_heure');
  if (!hasLegacyShape) return null;
  if (selection.groupNumber != null && selection.groupNumber !== 1) return null;
  const expectedGroupKey = canonicalGroupKey(selection.level, 1);
  if (selection.groupKey && selection.groupKey !== expectedGroupKey) return null;
  return {
    schema: 'legacy-single-group',
    monitorIds: memberIdsFromEncadrants(levelAssignment.encadrants),
    themeSnapshot: levelAssignment.theme || null,
  };
}

function groupDocumentMatchesSelection(group, selection) {
  if (!group || typeof group !== 'object') return false;
  const groupLevel = group.level || group.niveau || null;
  if (groupLevel && groupLevel !== selection.level) return false;
  const groupNumber = group.groupNumber ?? group.group_number;
  if (groupNumber != null && Number(groupNumber) !== selection.groupNumber) {
    return false;
  }
  const groupKey = normalizeGroupKey(group.groupKey || group.group_key);
  if (groupKey && groupKey !== selection.groupKey) return false;
  const hourKey = group.heure || group.hourKey || group.hour_key || null;
  if (hourKey && hourKey !== selection.hourKey) return false;
  return true;
}

async function resolveGroupSupervision(db, clubId, sessionId, selection) {
  if (selection && selection.contractConflict &&
      selection.contractConflict.hourKey) {
    return { validatorId: null, monitorIds: [], themeSnapshot: null };
  }
  const groupKey = normalizeGroupKey(selection.groupKey);
  const normalizedSelection = { ...selection, groupKey };
  const participantMemberId = String(selection.participantMemberId || '').trim();

  let plannedGroup = null;
  const sessionRef = db
    .collection('clubs')
    .doc(clubId)
    .collection('piscine_sessions')
    .doc(sessionId);
  try {
    const sessionSnap = await sessionRef.get();
    if (sessionSnap.exists) {
      plannedGroup = findPlannedGroup(sessionSnap.data(), normalizedSelection);
    }
  } catch (err) {
    console.warn(`[${FUNCTION_NAME}] could not read session for group resolve: ${err.message}`);
  }

  if (!plannedGroup) {
    return { validatorId: null, monitorIds: [], themeSnapshot: null };
  }

  let explicitValidatorId = null;
  if (groupKey) {
    // Dormant today, but an explicit group override may only augment a group
    // already proven to match the persisted session plan. Conflicting group
    // metadata is ignored rather than letting a key select another group.
    try {
      const groupSnap = await sessionRef.collection('groups').doc(groupKey).get();
      if (groupSnap.exists && groupDocumentMatchesSelection(
        groupSnap.data(),
        normalizedSelection
      )) {
        const group = groupSnap.data();
        explicitValidatorId = normalizedMonitorIds([
          group.supervisorId || group.validatorId,
        ])[0] || null;
      }
    } catch (err) {
      console.warn(`[${FUNCTION_NAME}] could not read groups/${groupKey}: ${err.message}`);
    }
  }

  const withoutParticipant = (ids) => normalizedMonitorIds(ids)
    .filter((id) => !participantMemberId || id !== participantMemberId);
  const plannedMonitorIds = withoutParticipant(plannedGroup.monitorIds);
  const payloadMonitorIds = plannedGroup.schema === 'legacy-single-group'
    ? withoutParticipant(selection.monitorIds)
    : [];
  const monitorIds = plannedMonitorIds.length > 0
    ? plannedMonitorIds
    : payloadMonitorIds;
  if (explicitValidatorId === participantMemberId) explicitValidatorId = null;
  return {
    validatorId: explicitValidatorId || monitorIds[0] || null,
    monitorIds,
    themeSnapshot: plannedGroup && plannedGroup.themeSnapshot || null,
  };
}

async function resolveValidator(
  db,
  clubId,
  sessionId,
  rawGroupKey,
  level,
  moniteurIds,
  groupNumber = null,
  hourKey = null
) {
  const supervision = await resolveGroupSupervision(db, clubId, sessionId, {
    groupKey: rawGroupKey,
    level,
    groupNumber: groupNumberFrom(groupNumber, rawGroupKey),
    hourKey,
    monitorIds: normalizedMonitorIds(moniteurIds),
  });
  return supervision.validatorId;
}

module.exports = {
  onPoolCheckinCompleted,
  // Exported for tests
  resolveValidator,
  resolveGroupSupervision,
  selectedGroupContract,
  encadrantGroupContract,
  findPlannedGroup,
  hasPersistedCourses,
  groupDocumentMatchesSelection,
  reconcileEncadrantGroups,
  buildAttendeeIdentityPatch,
  resolveAttendeeRef,
};
