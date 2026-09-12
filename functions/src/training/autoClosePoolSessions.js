/**
 * Cloud Function — Carnet de Formation auto-close.
 *
 * Scheduled : every day at 04:00 Europe/Brussels.
 *
 * Closes any NEW `piscine_sessions` doc whose current `statut` is `termine`, or
 * whose legacy `status` is still `open`, once its date lies more than 18 hours
 * in the past. CalyCompta writes the French `statut` field; older sessions and
 * the carnet fan-out still use the English `status` field.
 *
 * Setting status='closed' fires `onPoolSessionClosed`, which in turn
 * creates `student_logbook_entries` + `monitor_observation` tasks for
 * every training attendee. We therefore only flip docs that haven't
 * already been closed, and we set `closedBy='auto'` + `closedAt` so the
 * trigger has a clean transition to act on.
 *
 * Why 18 hours rather than 24h: a Tuesday pool evening typically ends
 * around 22:00 Europe/Brussels; the 04:00 cron the next morning is six
 * hours later, comfortably past close-up time. We use 18h as a safety
 * window so that even a session that ran late (say, ended at 23:30) is
 * still picked up the next morning rather than waiting a full extra day.
 *
 * Historical sessions whose `status` is already `closed` are deliberately not
 * queried or written here, irrespective of `carnet_processing_version`. Their
 * one-time migration is owned by the guarded backfill script. This separation
 * prevents the daily schedule from becoming an implicit historical backfill.
 *
 * Idempotent : doesn't touch sessions whose legacy `status` is already closed.
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` §8.7 amendment (2026-05-14).
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const {
  CARNET_PROCESSING_VERSION,
} = require('./poolSessionCarnetBackfill');

const FUNCTION_NAME = 'autoClosePoolSessions';
const FUNCTION_REGION = 'europe-west1';
const STALE_THRESHOLD_MS = 18 * 60 * 60 * 1000; // 18h

function sessionDateFrom(data, sessionId) {
  const timestampDate = data.date?.toDate?.();
  if (timestampDate instanceof Date && !Number.isNaN(timestampDate.getTime())) {
    return timestampDate;
  }
  if (data.date instanceof Date && !Number.isNaN(data.date.getTime())) {
    return data.date;
  }

  // Session IDs use YYYY-MM-DD. Keep the historical UTC interpretation so
  // the threshold behaviour remains unchanged for legacy documents.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(sessionId);
  if (!match) return null;
  return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
}

function isAutoCloseCandidate(data, sessionId, cutoff) {
  // Closed is final for this daily path. Missing/stale processing markers are
  // migration state and must never turn a scheduled close into a backfill.
  if (data.status === 'closed') return false;

  const usesCurrentFinishedState = data.statut === 'termine';
  const usesLegacyOpenState = data.status === 'open';
  if (!usesCurrentFinishedState && !usesLegacyOpenState) return false;

  const sessionDate = sessionDateFrom(data, sessionId);
  return sessionDate !== null && sessionDate < cutoff;
}

async function loadPendingSessionDocs(sessionsRef) {
  // A session can match both queries. De-duplicate by document ID so one
  // scheduler run can never write the same transition twice.
  const [legacyOpenSnap, currentFinishedSnap] = await Promise.all([
    sessionsRef.where('status', '==', 'open').get(),
    sessionsRef.where('statut', '==', 'termine').get(),
  ]);
  const uniqueDocs = new Map();
  for (const sessionDoc of [
    ...legacyOpenSnap.docs,
    ...currentFinishedSnap.docs,
  ]) {
    uniqueDocs.set(sessionDoc.id, sessionDoc);
  }
  return [...uniqueDocs.values()];
}

async function closeEligiblePoolSessions(db, sessionsRef, clubId, cutoff) {
  const sessionDocs = await loadPendingSessionDocs(sessionsRef);
  let closed = 0;

  for (const sessionDoc of sessionDocs) {
    if (!isAutoCloseCandidate(sessionDoc.data(), sessionDoc.id, cutoff)) {
      continue;
    }

    try {
      const didClose = await db.runTransaction(async (transaction) => {
        // The query result is only a candidate list. A manual close can race
        // the scheduler, so eligibility must be checked again in the same
        // transaction that performs the transition. Firestore retries this
        // callback if the document changes after this read.
        const freshSnapshot = await transaction.get(sessionDoc.ref);
        if (
          !freshSnapshot.exists ||
          !isAutoCloseCandidate(
            freshSnapshot.data(),
            sessionDoc.id,
            cutoff,
          )
        ) {
          return false;
        }

        transaction.update(sessionDoc.ref, {
          status: 'closed',
          carnet_processing_version: CARNET_PROCESSING_VERSION,
          closedBy: 'auto',
          closedAt: FieldValue.serverTimestamp(),
          auto_closed_at: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (didClose) {
        console.log(
          `[${FUNCTION_NAME}] auto-closed ${clubId}/${sessionDoc.id}`
        );
        closed++;
      }
    } catch (err) {
      console.error(
        `[${FUNCTION_NAME}] failed to close ${clubId}/${sessionDoc.id}:`,
        err.message
      );
    }
  }

  return { scanned: sessionDocs.length, closed };
}

const autoClosePoolSessions = onSchedule(
  {
    region: FUNCTION_REGION,
    schedule: '0 4 * * *', // 04:00 every day
    timeZone: 'Europe/Brussels',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    const db = admin.firestore();
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
    let totalClosed = 0;
    let totalScanned = 0;

    const clubsSnap = await db.collection('clubs').get();
    for (const clubDoc of clubsSnap.docs) {
      const clubId = clubDoc.id;

      const sessionsRef = db
        .collection('clubs')
        .doc(clubId)
        .collection('piscine_sessions');
      const result = await closeEligiblePoolSessions(
        db,
        sessionsRef,
        clubId,
        cutoff
      );
      totalScanned += result.scanned;
      totalClosed += result.closed;
    }

    console.log(
      `[${FUNCTION_NAME}] cycle complete: scanned=${totalScanned}, closed=${totalClosed} ` +
        `(cutoff=${cutoff.toISOString()})`
    );
  }
);

module.exports = {
  autoClosePoolSessions,
  closeEligiblePoolSessions,
  CARNET_PROCESSING_VERSION,
  isAutoCloseCandidate,
  loadPendingSessionDocs,
  sessionDateFrom,
};
