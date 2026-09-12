/**
 * Cloud Function — Carnet de Formation (v2.2)
 *
 * Trigger : onDocumentUpdated `clubs/{clubId}/formation_tasks/{taskId}`
 *
 * When a `monitor_observation` task transitions to `done`, materialise the
 * verdict into a permanent `member_observations` record. A later explicit
 * correction of `completion_data` updates that same deterministic record.
 * Without this, the verdict only lives in the task and is invisible to the
 * student's progression view.
 *
 * Today the form captures ONE theme-level verdict (acquis / en_progres /
 * a_revoir) — not a per-LIFRAS-code breakdown. So this CF writes ONE
 * observation per task, with `category='pool_theme'` and the theme name as
 * the code. The downstream `onObservationAcquis` CF only promotes
 * `category='exercice_lifras'` observations to `exercices_valides`, so a
 * theme-level acquis verdict is captured but does NOT automatically credit
 * a specific LIFRAS exercise yet. That second step (theme → exercise
 * codes mapping + per-code ticking in the form) is tracked as a follow-up.
 *
 * Idempotency : the observation document ID is derived from the logical
 *   club/session/group/member identity. Legacy duplicate tasks therefore
 *   converge on one observation and only append their task ID as provenance.
 *   Explicitly absent members complete their tasks without an A/P/R record.
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` v2.2 §5.4 (pool fan-out),
 *   audit 2026-05-14 blocker #2.
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const crypto = require('crypto');

const FUNCTION_NAME = 'onMonitorObservationCompleted';
const FUNCTION_REGION = 'europe-west1';

const onMonitorObservationCompleted = onDocumentUpdated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/formation_tasks/{taskId}',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (event) => handleMonitorObservationCompleted(event, admin.firestore()),
);

async function handleMonitorObservationCompleted(event, db) {
  const { clubId, taskId } = event.params;
  const before = event.data && event.data.before && event.data.before.data();
  const after = event.data && event.data.after && event.data.after.data();
  if (!before || !after) return;

  if (after.type !== 'monitor_observation') return;
  if (!isDone(after.status)) return;
  const wasDone = isDone(before.status);
  if (wasDone && !materializationChanged(before, after)) return;

  const clubRef = db.collection('clubs').doc(clubId);
  const taskRef = clubRef.collection('formation_tasks').doc(taskId);
  const outcome = await db.runTransaction(async (transaction) => {
    // Every trigger delivery is compared with the current source document in
    // the same transaction that materialises both durable destinations. If a
    // newer correction has landed, Firestore retries this read and the stale
    // event performs no observation or logbook write.
    const currentSnapshot = await transaction.get(taskRef);
    if (!currentSnapshot.exists) return { status: 'missing-task' };
    const current = currentSnapshot.data();
    if (!materializationStateMatches(after, current)) {
      return { status: 'stale' };
    }

    const materialization = buildMaterialization({ clubId, taskId, task: current });
    if (materialization.status !== 'ready') return materialization;

    const observationRef = clubRef
      .collection('member_observations')
      .doc(observationDocumentId(materialization.canonicalKey));
    const logbookRef = materialization.logbookEntryId
      ? clubRef
          .collection('student_logbook_entries')
          .doc(materialization.logbookEntryId)
      : null;

    // Firestore transactions require all reads before writes.
    const observationSnapshot = await transaction.get(observationRef);
    const logbookSnapshot = logbookRef
      ? await transaction.get(logbookRef)
      : null;
    const observation = observationSnapshot.exists
      ? observationSnapshot.data()
      : null;

    // The initial completion of a legacy duplicate task must never overwrite
    // the first evaluator decision for the same logical observation.
    if (!wasDone && observation &&
        observation.materialization_marker !== materialization.marker) {
      const sourceTaskIds = Array.isArray(observation.source_task_ids)
        ? observation.source_task_ids
        : [];
      if (!sourceTaskIds.includes(taskId)) {
        transaction.set(
          observationRef,
          { source_task_ids: FieldValue.arrayUnion(taskId) },
          { merge: true },
        );
      }
      return {
        status: 'duplicate-linked',
        canonicalKey: materialization.canonicalKey,
      };
    }

    if (!observation ||
        observation.materialization_marker !== materialization.marker) {
      const observationPayload = buildObservationPayload({
        taskId,
        task: current,
        materialization,
      });
      transaction.set(
        observationRef,
        observation
          ? buildObservationCorrectionPayload(observationPayload)
          : {
              ...observationPayload,
              created_at: FieldValue.serverTimestamp(),
            },
        { merge: true },
      );
    }

    if (logbookRef && logbookSnapshot.exists) {
      const logbook = logbookSnapshot.data() || {};
      const existingEvaluation = logbook.monitor_evaluation || {};
      if (existingEvaluation.materialization_marker !== materialization.marker) {
        transaction.update(logbookRef, {
          monitor_evaluation: {
            result: materialization.result,
            comment: materialization.completion.comment || '',
            theme_snapshot: materialization.themeSnapshot || null,
            observer_id: materialization.observerId,
            observer_name: materialization.observerName,
            observation_id: observationRef.id,
            correction_revision: materialization.revision,
            materialization_marker: materialization.marker,
            evaluated_at: FieldValue.serverTimestamp(),
          },
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    }

    return {
      status: 'materialized',
      observationId: observationRef.id,
      memberId: materialization.memberId,
      result: materialization.result,
      themeSnapshot: materialization.themeSnapshot,
    };
  });

  if (outcome.status === 'absent') {
    console.log(
      `[${FUNCTION_NAME}] task ${taskId} completed as absent — no observation`,
    );
  } else if (outcome.status === 'missing-verdict') {
    console.warn(
      `[${FUNCTION_NAME}] task ${taskId} completed without a valid verdict — skipping`,
    );
  } else if (outcome.status === 'missing-member') {
    console.warn(`[${FUNCTION_NAME}] task ${taskId} has no member_id — skipping`);
  } else if (outcome.status === 'materialized') {
    console.log(
      `[${FUNCTION_NAME}] task ${taskId} → observation ${outcome.observationId} ` +
        `member=${outcome.memberId} verdict=${outcome.result} ` +
        `theme="${outcome.themeSnapshot}"`,
    );
  }
}

function isDone(status) {
  return status === 'done' || status === 'completed';
}

function normaliseCorrectionRevision(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function materializationChanged(before, after) {
  return completionDataChanged(before, after) ||
    normaliseCorrectionRevision(before.correction_revision) !==
      normaliseCorrectionRevision(after.correction_revision);
}

function materializationStateMatches(eventAfter, current) {
  return JSON.stringify(materializationState(eventAfter)) ===
    JSON.stringify(materializationState(current));
}

function materializationState(task) {
  return canonicalJsonValue({
    type: task.type || null,
    status: task.status || null,
    member_id: task.member_id || null,
    member_name: task.member_name || null,
    completed_by: task.completed_by || null,
    completed_by_name: task.completed_by_name || null,
    last_action_by: task.last_action_by || null,
    context: task.context || {},
    completion_data: task.completion_data || {},
    correction_revision: normaliseCorrectionRevision(task.correction_revision),
  });
}

function buildMaterialization({ clubId, taskId, task }) {
  const completion = task.completion_data || {};
  if (normaliseAttendanceStatus(completion.attendance_status) === 'absent') {
    return { status: 'absent' };
  }
  const result = normaliseVerdict(String(completion.verdict || '').toLowerCase());
  if (!result) return { status: 'missing-verdict' };
  const memberId = task.member_id || completion.member_id;
  if (!memberId) return { status: 'missing-member' };

  const poolSessionId =
    (task.context && task.context.pool_session_id) ||
    completion.pool_session_id ||
    null;
  const groupKey =
    (task.context && task.context.group_key) || completion.group_key || null;
  const themeSnapshot = firstNonBlank(
    completion.theme_snapshot,
    task.context && task.context.theme_snapshot,
  );
  const revision = normaliseCorrectionRevision(task.correction_revision);
  const canonicalKey = buildObservationCanonicalKey({
    clubId,
    poolSessionId,
    groupKey,
    memberId,
  });
  const marker = crypto
    .createHash('sha256')
    .update(JSON.stringify({ taskId, state: materializationState(task) }))
    .digest('hex');

  return {
    status: 'ready',
    canonicalKey,
    marker,
    revision,
    completion,
    memberId,
    poolSessionId,
    groupKey,
    themeSnapshot,
    level: (task.context && task.context.level) || null,
    result,
    observerId:
      completion.observer_id || task.completed_by || task.last_action_by || '',
    observerName: completion.observer_name || task.completed_by_name || '',
    logbookEntryId: firstNonBlank(
      completion.logbook_entry_id,
      task.context && task.context.logbook_entry_id,
    ),
  };
}

function buildObservationPayload({ taskId, task, materialization }) {
  return {
    task_id: taskId,
    source_task_ids: FieldValue.arrayUnion(taskId),
    canonical_key: materialization.canonicalKey,
    materialization_marker: materialization.marker,
    correction_revision: materialization.revision,
    memberId: materialization.memberId,
    memberName: task.member_name || '',
    category: 'pool_theme',
    exerciceCode:
      materialization.themeSnapshot || materialization.groupKey || 'pool_session',
    exerciceDescription: materialization.themeSnapshot || '',
    memberNiveau: materialization.level || '',
    result: materialization.result,
    observerId: materialization.observerId,
    observerName: materialization.observerName,
    contextType: 'piscine',
    contextId: materialization.poolSessionId,
    contextTitle: materialization.themeSnapshot || '',
    contextDate: Timestamp.now(),
    groupKey: materialization.groupKey,
    comment: materialization.completion.comment || '',
    created_by: 'system',
    source: 'monitor_observation_form',
  };
}

function buildObservationCorrectionPayload(payload) {
  return {
    source_task_ids: payload.source_task_ids,
    materialization_marker: payload.materialization_marker,
    correction_revision: payload.correction_revision,
    exerciceCode: payload.exerciceCode,
    exerciceDescription: payload.exerciceDescription,
    result: payload.result,
    observerId: payload.observerId,
    observerName: payload.observerName,
    contextTitle: payload.contextTitle,
    comment: payload.comment,
    corrected_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
}

function normaliseAttendanceStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'absent') return 'absent';
  if (value === 'present') return 'present';
  return 'unknown';
}

function firstNonBlank(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function completionDataChanged(before, after) {
  return JSON.stringify(canonicalJsonValue(before.completion_data || {})) !==
    JSON.stringify(canonicalJsonValue(after.completion_data || {}));
}

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalJsonValue(value[key]);
        return result;
      }, {});
  }
  return value;
}

function buildObservationCanonicalKey({
  clubId,
  poolSessionId,
  groupKey,
  memberId,
}) {
  return [
    String(clubId || '').trim(),
    String(poolSessionId || 'unknown-session').trim(),
    String(groupKey || 'unknown-group').trim(),
    String(memberId || '').trim(),
  ].join('|');
}

function observationDocumentId(canonicalKey) {
  return `monitor_${crypto
    .createHash('sha256')
    .update(canonicalKey)
    .digest('hex')
    .slice(0, 40)}`;
}

/**
 * Map the form's verdict tokens onto the `member_observations.result`
 * vocabulary that `onObservationAcquis` and the mobile carnet UI both
 * understand.
 *
 * Accepts French keys ("acquis"/"en_progres"/"a_revoir") and a few
 * sensible aliases. Returns `null` for anything we don't recognise so the
 * caller can skip.
 */
function normaliseVerdict(verdict) {
  switch (verdict) {
    case 'acquis':
    case 'validated':
    case 'validate':
      return 'acquis';
    case 'en_progres':
    case 'en_progress':
    case 'progress':
      return 'en_progres';
    case 'a_revoir':
    case 'à_revoir':
    case 'a-revoir':
    case 'revoir':
    case 'not_acquired':
      return 'a_revoir';
    default:
      return null;
  }
}

module.exports = {
  onMonitorObservationCompleted,
  // exposed for unit tests
  handleMonitorObservationCompleted,
  normaliseVerdict,
  normaliseAttendanceStatus,
  completionDataChanged,
  firstNonBlank,
  buildObservationCanonicalKey,
  observationDocumentId,
};
