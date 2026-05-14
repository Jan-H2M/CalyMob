/**
 * Cloud Function — Carnet de Formation auto-close.
 *
 * Scheduled : every day at 04:00 Europe/Brussels.
 *
 * Closes any `piscine_sessions` doc whose status is still `open` and whose
 * `date` lies more than 18 hours in the past. The close-by-human path was
 * removed from the design after Jan flagged that the chef d'école would
 * "definitely forget" to close sessions in practice (CODEX_STATUS entry
 * 2026-05-14).
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
 * Idempotent : doesn't touch sessions that are already closed.
 *
 * Spec : `CARNET_DE_FORMATION_TECH.md` §8.7 amendment (2026-05-14).
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const FUNCTION_NAME = 'autoClosePoolSessions';
const FUNCTION_REGION = 'europe-west1';
const STALE_THRESHOLD_MS = 18 * 60 * 60 * 1000; // 18h

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

      // Query just status==open — we filter on date client-side because
      // the `date` field shape can vary (Timestamp vs missing on legacy
      // docs) and the result set per club is tiny anyway.
      const openSnap = await db
        .collection('clubs')
        .doc(clubId)
        .collection('piscine_sessions')
        .where('status', '==', 'open')
        .get();

      for (const sessionDoc of openSnap.docs) {
        totalScanned++;
        const data = sessionDoc.data();
        const sessionDate = data.date?.toDate?.() ?? null;
        if (!sessionDate) {
          // No `date` field — fall back to parsing the session ID
          // (YYYY-MM-DD format used everywhere in Calypso).
          const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(sessionDoc.id);
          if (!m) continue;
          const parsed = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
          if (parsed >= cutoff) continue;
        } else if (sessionDate >= cutoff) {
          continue;
        }

        console.log(
          `[${FUNCTION_NAME}] auto-closing ${clubId}/${sessionDoc.id}`
        );
        try {
          await sessionDoc.ref.update({
            status: 'closed',
            closedBy: 'auto',
            closedAt: FieldValue.serverTimestamp(),
            auto_closed_at: FieldValue.serverTimestamp(),
          });
          totalClosed++;
        } catch (err) {
          console.error(
            `[${FUNCTION_NAME}] failed to close ${clubId}/${sessionDoc.id}:`,
            err.message
          );
        }
      }
    }

    console.log(
      `[${FUNCTION_NAME}] cycle complete: scanned=${totalScanned}, closed=${totalClosed} (cutoff=${cutoff.toISOString()})`
    );
  }
);

module.exports = {
  autoClosePoolSessions,
};
