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

const FUNCTION_NAME = 'onPoolSessionClosed';
const FUNCTION_REGION = 'europe-west1';
// Each attendee writes up to 2 docs → keep below the 500-write batch ceiling.
const BATCH_OPS_LIMIT = 450;

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

    if (before.status === 'closed') return;
    if (after.status !== 'closed') return;

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
    const trainingDocs = attendeesSnap.docs.filter((d) => {
      const a = d.data();
      if (!a.groupAssignment) return false;
      return a.outcome === 'training' || a.outcome === 'encadrant';
    });

    if (trainingDocs.length === 0) {
      console.log(`[${FUNCTION_NAME}] session ${sessionId} closed — no training attendees`);
      return;
    }

    const poolName =
      after.pool_name ||
      after.lieu ||
      after.location_name ||
      'Watermael-Boitsfort';
    const sessionDate = parseSessionDate(sessionId);

    let plannedLogbookCreates = 0;
    let plannedTaskCreates = 0;
    let skippedExistingLogbook = 0;
    let skippedExistingTask = 0;
    let skippedNoValidator = 0;

    // Build a peer-lookup keyed by (level, groupNumber) so each member's
    // logbook entry can carry a snapshot of who else was in their group.
    // We prefer (level + groupNumber) over groupKey because production
    // sessions usually don't have an explicit groups subcollection yet.
    const groupPeers = new Map();
    const peerKey = (level, groupNumber) =>
      `${level || ''}#${groupNumber == null ? '' : groupNumber}`;
    for (const attDoc of trainingDocs) {
      const att = attDoc.data();
      const ga = att.groupAssignment || null;
      if (!ga) continue;
      const k = peerKey(ga.level, ga.groupNumber);
      if (!groupPeers.has(k)) groupPeers.set(k, []);
      groupPeers.get(k).push({
        member_id: att.memberId || att.membre_id || attDoc.id,
        displayName: att.memberName || att.member_name || 'Membre',
      });
    }

    // Pre-resolve display names for every validator + moniteur referenced
    // across the session. Snapshotting names on the logbook entry means the
    // student can still see who taught them years later even if the moniteur
    // has since left the club. Names are resolved once per CF run rather
    // than per-attendee to avoid quadratic Firestore reads on busy sessions.
    const monitorIdSet = new Set();
    for (const attDoc of trainingDocs) {
      const ga = attDoc.data().groupAssignment || null;
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
          const display = `${v.prenom || ''} ${v.nom || ''}`.trim();
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

    for (const attDoc of trainingDocs) {
      const att = attDoc.data();
      const memberId = att.memberId || att.membre_id || attDoc.id;
      const memberName = att.memberName || att.member_name || 'Membre';
      const ga = att.groupAssignment || null;

      if (!ga || !ga.validatorId) {
        console.warn(
          `[${FUNCTION_NAME}] attendee ${memberId} training but no validatorId — skipping`
        );
        skippedNoValidator++;
        continue;
      }

      // Peers in the same group (level + groupNumber), excluding self.
      const peers = (groupPeers.get(peerKey(ga.level, ga.groupNumber)) || [])
        .filter((p) => p.member_id !== memberId);

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
      const existingTask = await db
        .collection('clubs')
        .doc(clubId)
        .collection('formation_tasks')
        .where('type', '==', 'monitor_observation')
        .where('member_id', '==', memberId)
        .where('context.pool_session_id', '==', sessionId)
        .limit(1)
        .get();

      if (!existingLogbook.empty) {
        skippedExistingLogbook++;
      } else {
        plannedLogbookCreates++;
        if (!dryRun) {
          const logbookRef = db
            .collection('clubs')
            .doc(clubId)
            .collection('student_logbook_entries')
            .doc();
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
            validator_id: ga.validatorId,
            validator_name: monitorNames.get(ga.validatorId) || null,
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

      if (!existingTask.empty) {
        skippedExistingTask++;
      } else {
        plannedTaskCreates++;
        if (!dryRun) {
          const taskRef = db
            .collection('clubs')
            .doc(clubId)
            .collection('formation_tasks')
            .doc();
          batch.set(taskRef, {
            type: 'monitor_observation',
            status: 'open',
            priority: 'normal',
            title: composeTaskTitle(memberName, ga),
            member_id: memberId,
            member_name: memberName,
            current_assignee_id: ga.validatorId,
            current_assignee_type: 'monitor',
            context: {
              pool_session_id: sessionId,
              group_key: ga.groupKey || null,
              theme_snapshot: ga.themeSnapshot || null,
              level: ga.level || null,
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
        `task_creates=${plannedTaskCreates} (skipped_existing=${skippedExistingTask}) ` +
        `no_validator=${skippedNoValidator}`
    );
  }
);

function composeTaskTitle(memberName, ga) {
  const level = ga.level || '';
  const theme = ga.themeSnapshot || '';
  const tail = [level, theme].filter(Boolean).join(' ');
  return tail ? `Évaluer ${memberName} (${tail})` : `Évaluer ${memberName}`;
}

function parseSessionDate(sessionId) {
  // Calypso pool sessions are keyed by YYYY-MM-DD (Europe/Brussels).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionId);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return Timestamp.fromDate(d);
  }
  return Timestamp.now();
}

module.exports = {
  onPoolSessionClosed,
  // Exported for tests
  parseSessionDate,
  composeTaskTitle,
};
