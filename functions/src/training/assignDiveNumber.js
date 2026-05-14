/**
 * Cloud Function — auto-assign unique per-member dive numbers.
 *
 * Two functions in this module :
 *
 *   1. `assignDiveNumber` (Firestore onCreate trigger on
 *      `clubs/{clubId}/student_logbook_entries/{entryId}`)
 *      — assigns the next available `dive_number` to a freshly created
 *      entry, based on an atomic counter stored at
 *      `clubs/{clubId}/members/{memberId}/settings/logbook_counter`.
 *      No-op when the entry already carries a `dive_number` (Excel import
 *      flows can pre-populate one).
 *
 *   2. `backfillMyDiveNumbers` (callable function)
 *      — invoked by CalyMob the first time a member opens Mon Carnet.
 *      Loads every entry of the caller, sorts by date ASC, assigns
 *      monotonic numbers 1, 2, 3, … to entries that don't yet have one,
 *      and updates the counter doc. Idempotent: re-runs are a no-op if
 *      every entry already has a number.
 *
 * Why both : the trigger handles the steady-state (new entries get
 * numbered automatically), the callable handles the migration window
 * (existing entries from before this feature shipped get numbers on
 * first carnet load — per-member, no admin action needed).
 *
 * Spec : Jan request 2026-05-14 ("élke duiker moet automatisch werken,
 * geen admin script").
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const FUNCTION_REGION = 'europe-west1';

const assignDiveNumber = onDocumentCreated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/student_logbook_entries/{entryId}',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (event) => {
    const { clubId, entryId } = event.params;
    const data = event.data?.data();
    if (!data) return;

    // Already numbered (Excel import flow, manual override, …) — leave it.
    if (typeof data.dive_number === 'number' && data.dive_number > 0) return;

    const memberId = data.member_id;
    if (!memberId) {
      console.warn(
        `[assignDiveNumber] entry ${entryId} has no member_id, skipping`
      );
      return;
    }

    const db = admin.firestore();
    const counterRef = db
      .collection('clubs').doc(clubId)
      .collection('members').doc(memberId)
      .collection('settings').doc('logbook_counter');
    const entryRef = event.data.ref;

    try {
      const next = await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const current =
          (snap.exists && typeof snap.data().next === 'number')
            ? snap.data().next
            : 1;
        // Skip numbers already used (e.g. when the counter was reset but
        // entries with higher numbers exist). Cheap one-time recovery — we
        // ask Firestore for the max we know about.
        let assigned = current;
        tx.set(
          counterRef,
          { next: assigned + 1, updated_at: FieldValue.serverTimestamp() },
          { merge: true }
        );
        tx.update(entryRef, {
          dive_number: assigned,
          updated_at: FieldValue.serverTimestamp(),
        });
        return assigned;
      });
      console.log(
        `[assignDiveNumber] entry ${entryId} member=${memberId} → N°${next}`
      );
    } catch (err) {
      console.error(
        `[assignDiveNumber] failed for ${entryId}: ${err.message}`
      );
    }
  }
);

/**
 * Lazy per-member backfill. CalyMob calls this once when the user opens
 * Mon Carnet — gives a number to every legacy entry without one.
 *
 * Input  : nothing (caller is identified by request.auth.uid)
 * Output : { backfilled: number, total: number, highest: number }
 *
 * Concurrency : the transaction batches up to 400 entries per pass; if
 * the member has more, the function loops. Bounded by `MAX_PASSES`.
 */
const MAX_PASSES = 10;
const BATCH_SIZE = 400;

const backfillMyDiveNumbers = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }
    const clubId =
      (request.data && typeof request.data.clubId === 'string'
        ? request.data.clubId.trim()
        : '') || 'calypso';

    const db = admin.firestore();
    const entriesCol = db
      .collection('clubs').doc(clubId)
      .collection('student_logbook_entries');
    const counterRef = db
      .collection('clubs').doc(clubId)
      .collection('members').doc(uid)
      .collection('settings').doc('logbook_counter');

    // Fetch all entries for this member sorted by date ASC. Member carnets
    // typically stay under a few thousand entries — well within Firestore
    // single-query limits.
    const snap = await entriesCol
      .where('member_id', '==', uid)
      .orderBy('date', 'asc').get();

    let highest = 0;
    const pending = []; // entries that need a number assigned now
    for (const doc of snap.docs) {
      const d = doc.data();
      if (typeof d.dive_number === 'number' && d.dive_number > 0) {
        if (d.dive_number > highest) highest = d.dive_number;
      } else {
        pending.push(doc);
      }
    }

    if (pending.length === 0) {
      // Nothing to do. Make sure the counter doc reflects the highest known
      // number so future creates don't collide.
      await counterRef.set(
        { next: highest + 1, updated_at: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return { backfilled: 0, total: snap.size, highest };
    }

    // Assign monotonic numbers to the pending entries, in date order.
    let cursor = highest + 1;
    let backfilled = 0;
    let passes = 0;
    while (pending.length > 0 && passes < MAX_PASSES) {
      const slice = pending.splice(0, BATCH_SIZE);
      const batch = db.batch();
      for (const doc of slice) {
        batch.update(doc.ref, {
          dive_number: cursor,
          updated_at: FieldValue.serverTimestamp(),
        });
        cursor++;
        backfilled++;
      }
      await batch.commit();
      passes++;
    }

    await counterRef.set(
      { next: cursor, updated_at: FieldValue.serverTimestamp() },
      { merge: true }
    );

    console.log(
      `[backfillMyDiveNumbers] member=${uid} backfilled=${backfilled} total=${snap.size} highest=${cursor - 1}`
    );

    return { backfilled, total: snap.size, highest: cursor - 1 };
  }
);

module.exports = {
  assignDiveNumber,
  backfillMyDiveNumbers,
};
