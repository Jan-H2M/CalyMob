/**
 * Cloud Function — Carnet de Formation (v2.2)
 *
 * Trigger : onDocumentUpdated `clubs/{clubId}/formation_tasks/{taskId}`
 *
 * When a `monitor_observation` task transitions from any non-done state
 * to `done`, materialise the verdict into a permanent
 * `member_observations` record. Without this, the verdict only lives in
 * `task.completion_data` and is invisible to the student's progression
 * view — which is exactly the audit blocker #2 from 2026-05-14.
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

    // Only react to monitor_observation completions
    if (after.type !== 'monitor_observation') return;
    if (before.status === 'done' || before.status === 'completed') return;
    if (after.status !== 'done' && after.status !== 'completed') return;

    const completion = after.completion_data || {};
    const attendanceStatus = normaliseAttendanceStatus(
      completion.attendance_status,
    );
    if (attendanceStatus === 'absent') {
      console.log(
        `[${FUNCTION_NAME}] task ${taskId} completed as absent — no observation`,
      );
      return;
    }
    const verdict = String(completion.verdict || '').toLowerCase();
    if (!verdict) {
      console.warn(
        `[${FUNCTION_NAME}] task ${taskId} completed without a verdict — skipping`,
      );
      return;
    }
    // Normalise to the values onObservationAcquis recognises.
    const normalisedResult = normaliseVerdict(verdict);
    if (!normalisedResult) {
      console.warn(
        `[${FUNCTION_NAME}] task ${taskId} unknown verdict "${verdict}" — skipping`,
      );
      return;
    }

    const memberId = after.member_id || completion.member_id;
    if (!memberId) {
      console.warn(
        `[${FUNCTION_NAME}] task ${taskId} has no member_id — skipping`,
      );
      return;
    }

    const clubRef = db.collection('clubs').doc(clubId);

    // ---- Idempotency ------------------------------------------------------
    const poolSessionId =
      (after.context && after.context.pool_session_id) ||
      completion.pool_session_id ||
      null;
    const groupKey =
      (after.context && after.context.group_key) ||
      completion.group_key ||
      null;
    const canonicalKey = buildObservationCanonicalKey({
      clubId,
      poolSessionId,
      groupKey,
      memberId,
    });

    // ---- Build observation doc -------------------------------------------
    // A validator correction stored in completion_data takes precedence over
    // the immutable planning snapshot kept in context.
    const themeSnapshot = firstNonBlank(
      completion.theme_snapshot,
      after.context && after.context.theme_snapshot,
    );
    const level = (after.context && after.context.level) || null;

    // Theme-level verdict. We tag the category 'pool_theme' so that
    // `onObservationAcquis` (which only fans out `exercice_lifras`)
    // ignores it. The exercices_valides credit chain will fire only when
    // the form is extended to capture per-code verdicts.
    const observationRef = clubRef
      .collection('member_observations')
      .doc(observationDocumentId(canonicalKey));
    const payload = {
      task_id: taskId,
      source_task_ids: FieldValue.arrayUnion(taskId),
      canonical_key: canonicalKey,
      memberId,
      memberName: after.member_name || '',
      category: 'pool_theme',
      exerciceCode: themeSnapshot || groupKey || 'pool_session',
      exerciceDescription: themeSnapshot || '',
      memberNiveau: level || '',
      result: normalisedResult,
      observerId:
        completion.observer_id ||
        after.completed_by ||
        after.last_action_by ||
        '',
      observerName:
        completion.observer_name ||
        after.completed_by_name ||
        '',
      contextType: 'piscine',
      contextId: poolSessionId,
      contextTitle: themeSnapshot || '',
      contextDate: Timestamp.now(),
      groupKey,
      comment: completion.comment || '',
      created_at: FieldValue.serverTimestamp(),
      created_by: 'system',
      source: 'monitor_observation_form',
    };

    try {
      await observationRef.create(payload);
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error;
      // A duplicate legacy task for the same logical member/session/group
      // must not overwrite the first evaluator decision. Keep provenance only.
      await observationRef.update({
        source_task_ids: FieldValue.arrayUnion(taskId),
      });
      console.log(
        `[${FUNCTION_NAME}] logical observation ${canonicalKey} already exists — linked duplicate task ${taskId}`,
      );
      return;
    }
    const logbookEntryId = firstNonBlank(
      completion.logbook_entry_id,
      after.context && after.context.logbook_entry_id,
    );
    if (logbookEntryId) {
      try {
        await clubRef
          .collection('student_logbook_entries')
          .doc(logbookEntryId)
          .update({
            monitor_evaluation: {
              result: normalisedResult,
              comment: completion.comment || '',
              theme_snapshot: themeSnapshot || null,
              observer_id: payload.observerId,
              observer_name: payload.observerName,
              observation_id: observationRef.id,
              evaluated_at: FieldValue.serverTimestamp(),
            },
            updated_at: FieldValue.serverTimestamp(),
          });
      } catch (error) {
        console.warn(
          `[${FUNCTION_NAME}] observation saved but logbook link ${logbookEntryId} failed: ${error.message}`,
        );
      }
    }
    console.log(
      `[${FUNCTION_NAME}] task ${taskId} → observation ${observationRef.id} ` +
        `member=${memberId} verdict=${normalisedResult} theme="${themeSnapshot}"`,
    );
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

function isAlreadyExistsError(error) {
  return (
    error &&
    (error.code === 6 ||
      error.code === '6' ||
      error.code === 'already-exists' ||
      error.code === 'ALREADY_EXISTS')
  );
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
  firstNonBlank,
  isAlreadyExistsError,
  buildObservationCanonicalKey,
  observationDocumentId,
};
