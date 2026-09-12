/**
 * Cloud Function — Carnet de Formation phase A (v2.2)
 *
 * Trigger : `clubs/{clubId}/piscine_sessions/{sessionId}` onUpdate
 *
 * Fires when the chef d'école closes a pool session ('open' → 'closed').
 * Fans out, per attendee with `outcome == 'training'`:
 *   1. one `student_logbook_entries/{auto}` doc with `source='piscine'`
 *   2. one `formation_tasks/{auto}` of type `monitor_observation`,
 *      assigned to that attendee's validator
 *
 * Idempotency
 *   - Skips attendees that already have a logbook entry for this
 *     (member_id, session_id) pair.
 *   - Skips re-creating monitor_observation tasks that are already
 *     present for the same (pool_session_id, member_id).
 *
 * Stop condition ⚠️
 *   ONE close can trigger N × (1 logbook + 1 task) writes which in turn
 *   can fire push reminders via `processFormationTaskReminders`. Honour
 *   the `DRY_RUN_POOL_CLOSE` env flag for the first live close during
 *   rollout. Set `DRY_RUN_POOL_CLOSE=true` to log planned writes without
 *   committing them.
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` §8.7
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { createHash } = require('crypto');
const { memberDisplayName } = require('../utils/memberName');

const FUNCTION_NAME = 'onPoolSessionClosed';
const FUNCTION_REGION = 'europe-west1';
// Each attendee writes up to 2 docs → keep below the 500-write batch ceiling.
const BATCH_OPS_LIMIT = 450;
const CARNET_PROCESSING_VERSION = 2;

function shouldProcessSessionUpdate(before, after) {
  if (after.status !== 'closed') return false;
  if (before.status !== 'closed') return true;
  const beforeVersion = Number(before.carnet_processing_version || 0);
  const afterVersion = Number(after.carnet_processing_version || 0);
  return (
    afterVersion >= CARNET_PROCESSING_VERSION && afterVersion > beforeVersion
  );
}

function artifactDocumentId(kind, sessionId, memberId) {
  const digest = createHash('sha256')
    .update(`${sessionId}\u0000${memberId}`)
    .digest('hex')
    .slice(0, 32);
  return `pool_${kind}_${digest}`;
}

const onPoolSessionClosed = onDocumentUpdated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/piscine_sessions/{sessionId}',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (event) => {
    const { clubId, sessionId } = event.params;
    const before = event.data && event.data.before && event.data.before.data();
    const after = event.data && event.data.after && event.data.after.data();
    if (!before || !after) return;

    if (!shouldProcessSessionUpdate(before, after)) return;

    const dryRun = process.env.DRY_RUN_POOL_CLOSE === 'true';

    const db = admin.firestore();
    const sessionRef = db
      .collection('clubs')
      .doc(clubId)
      .collection('piscine_sessions')
      .doc(sessionId);

    // v4 (2026-07-07) : an encadrant can have supervised one hour and
    // trained (suivi) the other — outcome=='encadrant' but with a
    // groupAssignment that must still produce a logbook entry. So select on
    // groupAssignment presence instead of outcome=='training' only.
    const attendeesSnap = await sessionRef.collection('attendees').get();
    const trainingAttendees = selectCanonicalTrainingAttendees(attendeesSnap.docs);

    if (trainingAttendees.length === 0) {
      console.log(`[${FUNCTION_NAME}] session ${sessionId} closed — no training attendees`);
      return;
    }

    const poolName =
      after.pool_name ||
      after.lieu ||
      after.location_name ||
      'Watermael-Boitsfort';
    const sessionDate = parseSessionDate(sessionId, after.date);

    let plannedLogbookCreates = 0;
    let plannedTaskCreates = 0;
    let plannedDateRepairs = 0;
    let skippedExistingLogbook = 0;
    let skippedExistingTask = 0;
    let skippedNoValidator = 0;

    // Build a peer-lookup keyed by (level, groupNumber) so each member's
    // logbook entry can carry a snapshot of who else was in their group.
    // We prefer (level + groupNumber) over groupKey because production
    // sessions usually don't have an explicit groups subcollection yet.
    const groupPeers = buildGroupPeers(trainingAttendees);

    // Pre-resolve display names for every validator + moniteur referenced
    // across the session. Snapshotting names on the logbook entry means the
    // student can still see who taught them years later even if the moniteur
    // has since left the club. Names are resolved once per CF run rather
    // than per-attendee to avoid quadratic Firestore reads on busy sessions.
    const monitorIdSet = new Set();
    for (const attendee of trainingAttendees) {
      const ga = attendee.data.groupAssignment || null;
      if (!ga) continue;
      if (ga.validatorId) monitorIdSet.add(ga.validatorId);
      if (Array.isArray(ga.moniteurIds)) {
        for (const id of ga.moniteurIds) {
          if (id) monitorIdSet.add(id);
        }
      }
    }
    const monitorNames = new Map();
    for (const id of monitorIdSet) {
      try {
        const m = await db.collection('clubs').doc(clubId)
          .collection('members').doc(id).get();
        if (m.exists) {
          const v = m.data() || {};
          const display = memberDisplayName(v, '');
          if (display) monitorNames.set(id, display);
        }
      } catch (err) {
        console.warn(
          `[${FUNCTION_NAME}] could not resolve monitor ${id}: ${err.message}`
        );
      }
    }

    let batch = db.batch();
    let batchOps = 0;

    for (const attendee of trainingAttendees) {
      const att = attendee.data;
      const memberId = attendee.memberId;
      const memberName = attendee.memberName;
      const ga = att.groupAssignment || null;
      if (!ga) continue;

      // Peers in the same group (level + groupNumber), excluding self.
      const peers = peersForAttendee(groupPeers, ga, memberId);

      // ---- Idempotency: existing logbook entry? ----
      const existingLogbook = await db
        .collection('clubs')
        .doc(clubId)
        .collection('student_logbook_entries')
        .where('member_id', '==', memberId)
        .where('session_id', '==', sessionId)
        .limit(1)
        .get();

      // ---- Idempotency: existing open monitor_observation task? ----
      const existingTask = ga.validatorId
        ? await db
            .collection('clubs')
            .doc(clubId)
            .collection('formation_tasks')
            .where('type', '==', 'monitor_observation')
            .where('member_id', '==', memberId)
            .where('context.pool_session_id', '==', sessionId)
            .limit(1)
            .get()
        : null;

      const creationPlan = buildArtifactCreationPlan(existingLogbook, existingTask);
      let logbookEntryId = creationPlan.existingLogbookEntryId;
      if (!creationPlan.createLogbook) {
        skippedExistingLogbook++;
        const existingEntry = existingLogbook.docs[0];
        if (!sameTimestamp(existingEntry.data().date, sessionDate)) {
          plannedDateRepairs++;
          if (!dryRun) {
            batch.update(existingEntry.ref, {
              date: sessionDate,
              updated_at: FieldValue.serverTimestamp(),
            });
            batchOps++;
          }
        }
      } else {
        plannedLogbookCreates++;
        if (!dryRun) {
          const logbookRef = db
            .collection('clubs')
            .doc(clubId)
            .collection('student_logbook_entries')
            .doc(artifactDocumentId('logbook', sessionId, memberId));
          logbookEntryId = logbookRef.id;
          const moniteurIds = Array.isArray(ga.moniteurIds) ? ga.moniteurIds : [];
          const moniteurNames = moniteurIds
            .map((id) => monitorNames.get(id))
            .filter(Boolean);
          batch.set(logbookRef, {
            member_id: memberId,
            member_name: memberName,
            date: sessionDate,
            location_name: poolName,
            source: 'piscine',
            session_id: sessionId,
            theme_snapshot: ga.themeSnapshot || null,
            validator_id: ga.validatorId || null,
            validator_name: ga.validatorId
              ? monitorNames.get(ga.validatorId) || null
              : null,
            moniteur_ids: moniteurIds,
            moniteur_names: moniteurNames,
            // Pool-specific snapshot — surfaces in the carnet detail view.
            group_level: ga.level || null,
            group_number:
              typeof ga.groupNumber === 'number' ? ga.groupNumber : null,
            group_key: ga.groupKey || null,
            pool_group_members: peers,
            notes: att.personalNotes || null,
            counters: {},
            binomes: [],
            exercise_claim_ids: [],
            validation_status: 'personal',
            source_locked_fields: [
              'date',
              'location_name',
              'source',
              'theme_snapshot',
              'validator_id',
              'validator_name',
              'moniteur_ids',
              'moniteur_names',
              'group_level',
              'group_number',
              'group_key',
              'pool_group_members',
            ],
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
            created_by: 'system',
          });
          batchOps++;
        }
      }

      if (!ga.validatorId) {
        console.warn(
          `[${FUNCTION_NAME}] attendee ${memberId} has no validatorId — ` +
            'personal logbook only'
        );
        skippedNoValidator++;
      } else if (!creationPlan.createTask) {
        skippedExistingTask++;
      } else {
        plannedTaskCreates++;
        if (!dryRun) {
          const taskRef = db
            .collection('clubs')
            .doc(clubId)
            .collection('formation_tasks')
            .doc(artifactDocumentId('observation', sessionId, memberId));
          const rosterKey = buildRosterKey(
            sessionId,
            ga.groupKey,
            ga.validatorId,
          );
          batch.set(taskRef, {
            type: 'monitor_observation',
            status: 'open',
            priority: 'normal',
            title: composeTaskTitle(memberName, ga),
            member_id: memberId,
            member_name: memberName,
            current_assignee_id: ga.validatorId,
            current_assignee_type: 'monitor',
            roster_key: rosterKey,
            context: {
              pool_session_id: sessionId,
              group_key: ga.groupKey || null,
              theme_snapshot: ga.themeSnapshot || null,
              level: ga.level || null,
              logbook_entry_id: logbookEntryId,
            },
            available_actions: [
              { key: 'open', label: 'Évaluer', target_screen: 'monitor_observation' },
              { key: 'snooze', label: 'Plus tard' },
            ],
            notification_state: { reminder_count: 0 },
            created_by: 'system',
            created_by_name: FUNCTION_NAME,
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          });
          batchOps++;
        }
      }

      // Flush the batch once it approaches Firestore's 500-write ceiling.
      if (batchOps >= BATCH_OPS_LIMIT) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }

    if (batchOps > 0 && !dryRun) {
      await batch.commit();
    }

    console.log(
      `[${FUNCTION_NAME}] session ${sessionId} closed — dryRun=${dryRun} ` +
        `logbook_creates=${plannedLogbookCreates} (skipped_existing=${skippedExistingLogbook}) ` +
        `date_repairs=${plannedDateRepairs} ` +
        `task_creates=${plannedTaskCreates} (skipped_existing=${skippedExistingTask}) ` +
        `no_validator=${skippedNoValidator}`
    );
  }
);

function memberIdForAttendee(doc) {
  const data = doc.data() || {};
  const raw = data.memberId || data.membre_id || doc.id;
  return raw == null ? '' : String(raw).trim();
}

function memberNameForAttendee(data) {
  const raw = data.memberName || data.member_name || '';
  return raw == null ? '' : String(raw).trim();
}

function isTrainingAttendee(data) {
  if (!data || data.isGuest === true || !data.groupAssignment) return false;
  return data.outcome === 'training' || data.outcome === 'encadrant';
}

function trainingAttendeeScore(doc, data, memberId) {
  let score = 0;
  // A usable validator assignment is more important than the storage id:
  // historical duplicates may hold the completed assignment only on the
  // random-id document while an incomplete canonical document also exists.
  if (data.groupAssignment && data.groupAssignment.validatorId) score += 16;
  if (String(doc.id) === memberId) score += 4;
  if (data.checkinCompletedAt) score += 2;
  if (data.personalNotes) score += 1;
  return score;
}

/**
 * Collapse historical random-id and canonical attendee documents before any
 * peer-map, logbook or task work. Only an explicitly eligible training record
 * can represent the member; identity fields may be enriched from its legacy
 * duplicate without importing stale outcome/group data.
 */
function selectCanonicalTrainingAttendees(attendeeDocs) {
  const byMember = new Map();

  for (const doc of attendeeDocs || []) {
    const data = doc.data() || {};
    const memberId = memberIdForAttendee(doc);
    if (!memberId) continue;

    let aggregate = byMember.get(memberId);
    if (!aggregate) {
      aggregate = { memberId, memberName: '', selected: null };
      byMember.set(memberId, aggregate);
    }

    const candidateName = memberNameForAttendee(data);
    if (!aggregate.memberName && candidateName) {
      aggregate.memberName = candidateName;
    }

    if (!isTrainingAttendee(data)) continue;

    const candidate = {
      sourceId: String(doc.id),
      data,
      score: trainingAttendeeScore(doc, data, memberId),
    };
    const current = aggregate.selected;
    if (
      !current ||
      candidate.score > current.score ||
      (candidate.score === current.score &&
        candidate.sourceId.localeCompare(current.sourceId) < 0)
    ) {
      aggregate.selected = candidate;
    }
  }

  return Array.from(byMember.values())
    .filter((aggregate) => aggregate.selected)
    .map((aggregate) => {
      const selectedData = aggregate.selected.data;
      const selectedName = memberNameForAttendee(selectedData);
      const memberName = selectedName || aggregate.memberName || 'Membre';
      return {
        sourceId: aggregate.selected.sourceId,
        memberId: aggregate.memberId,
        memberName,
        data: {
          ...selectedData,
          memberId: aggregate.memberId,
          memberName,
        },
      };
    })
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
}

const peerKey = (level, groupNumber) =>
  `${level || ''}#${groupNumber == null ? '' : groupNumber}`;

function buildGroupPeers(trainingAttendees) {
  const groupPeers = new Map();
  for (const attendee of trainingAttendees) {
    const ga = attendee.data.groupAssignment;
    const key = peerKey(ga.level, ga.groupNumber);
    if (!groupPeers.has(key)) groupPeers.set(key, []);
    groupPeers.get(key).push({
      member_id: attendee.memberId,
      displayName: attendee.memberName,
    });
  }
  return groupPeers;
}

function peersForAttendee(groupPeers, groupAssignment, memberId) {
  return (
    groupPeers.get(
      peerKey(groupAssignment.level, groupAssignment.groupNumber)
    ) || []
  ).filter((peer) => peer.member_id !== memberId);
}

function buildArtifactCreationPlan(existingLogbook, existingTask) {
  return {
    createLogbook: existingLogbook.empty,
    createTask: existingTask != null && existingTask.empty,
    existingLogbookEntryId: existingLogbook.empty
      ? null
      : existingLogbook.docs[0].id,
  };
}

function composeTaskTitle(memberName, ga) {
  const level = ga.level || '';
  const theme = ga.themeSnapshot || '';
  const tail = [level, theme].filter(Boolean).join(' ');
  return tail ? `Évaluer ${memberName} (${tail})` : `Évaluer ${memberName}`;
}

function buildRosterKey(sessionId, groupKey, validatorId) {
  return [sessionId, groupKey || 'unknown-group', validatorId].join('::');
}

function parseSessionDate(sessionId, rawDate) {
  if (rawDate?.toDate?.() instanceof Date) return rawDate;
  if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    return Timestamp.fromDate(rawDate);
  }

  // Older Calypso pool sessions were keyed by YYYY-MM-DD.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionId);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return Timestamp.fromDate(d);
  }
  return Timestamp.now();
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const date = typeof value?.toDate === 'function' ? value.toDate() : value;
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.getTime()
    : null;
}

function sameTimestamp(left, right) {
  const leftMillis = timestampMillis(left);
  const rightMillis = timestampMillis(right);
  return leftMillis !== null && rightMillis !== null && leftMillis === rightMillis;
}

module.exports = {
  onPoolSessionClosed,
  // Exported for tests
  parseSessionDate,
  sameTimestamp,
  shouldProcessSessionUpdate,
  composeTaskTitle,
  buildRosterKey,
  selectCanonicalTrainingAttendees,
  buildGroupPeers,
  peersForAttendee,
  buildArtifactCreationPlan,
  artifactDocumentId,
};
