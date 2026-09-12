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

function positiveDiveNumber(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function incrementDiveNumber(value) {
  const safe = positiveDiveNumber(value);
  if (safe == null || safe >= Number.MAX_SAFE_INTEGER) {
    throw new Error('No safe positive dive number remains');
  }
  return safe + 1;
}

function shouldSkipDiveNumberAssignment(data = {}) {
  return !data
    || data.source === 'piscine'
    || positiveDiveNumber(data.dive_number) != null;
}

function highestDiveNumberFromDocs(docs = [], excludedEntryId = null) {
  let highest = 0;
  for (const doc of docs) {
    if (excludedEntryId && doc.id === excludedEntryId) continue;
    const data = doc.data();
    if (data.source === 'piscine') continue;
    const number = positiveDiveNumber(data.dive_number);
    if (number != null && number > highest) highest = number;
  }
  return highest;
}

function nextDiveNumber(counterNext, highestExisting) {
  const current = positiveDiveNumber(counterNext) || 1;
  const highest = highestExisting === 0 ? 0 : positiveDiveNumber(highestExisting);
  if (highestExisting !== 0 && highest == null) {
    throw new Error('Invalid highest existing dive number');
  }
  const afterHighest = highest === 0 ? 1 : incrementDiveNumber(highest);
  const assigned = Math.max(current, afterHighest);
  if (positiveDiveNumber(assigned) == null) {
    throw new Error('Invalid allocated dive number');
  }
  return assigned;
}

function monotonicCounterNext(currentNext, proposedNext) {
  const proposed = positiveDiveNumber(proposedNext);
  if (proposed == null) throw new Error('Invalid proposed counter value');
  const current = positiveDiveNumber(currentNext);
  return current == null ? proposed : Math.max(current, proposed);
}

function diveNumberAllocationPatch(assigned, source) {
  if (positiveDiveNumber(assigned) == null) {
    throw new Error('Invalid allocated dive number');
  }
  return {
    dive_number: assigned,
    dive_number_source: source,
    dive_number_allocated_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
}

function planBackfillDiveNumbers(docs = []) {
  let highest = 0;
  const pending = [];
  for (const doc of docs) {
    const data = doc.data();
    if (data.source === 'piscine') continue;
    const number = positiveDiveNumber(data.dive_number);
    if (number != null) {
      if (number > highest) highest = number;
    } else {
      pending.push(doc);
    }
  }
  return { highest, pending };
}

function entryDateMillis(doc) {
  const value = doc.data().date;
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return 0;
}

function sortBackfillDocs(docs = []) {
  return [...docs].sort((left, right) => {
    const byDate = entryDateMillis(left) - entryDateMillis(right);
    return byDate || left.id.localeCompare(right.id);
  });
}

function memberEntriesQuery(db, clubId, memberId) {
  return db.collection('clubs').doc(clubId)
    .collection('student_logbook_entries')
    .where('member_id', '==', memberId);
}

function memberCounterRef(db, clubId, memberId) {
  return db.collection('clubs').doc(clubId)
    .collection('members').doc(memberId)
    .collection('settings').doc('logbook_counter');
}

function counterPatch(next) {
  if (positiveDiveNumber(next) == null) throw new Error('Invalid counter value');
  return {
    next,
    allocator_version: 1,
    updated_at: FieldValue.serverTimestamp(),
  };
}

function planDiveNumberAllocation({ counterNext, entryDocs, excludedEntryId = null }) {
  const highestExisting = highestDiveNumberFromDocs(entryDocs, excludedEntryId);
  const assigned = nextDiveNumber(counterNext, highestExisting);
  return {
    assigned,
    next: monotonicCounterNext(counterNext, incrementDiveNumber(assigned)),
  };
}

async function allocateCreatedEntry({ db, clubId, entryId, entryRef }) {
  return db.runTransaction(async (tx) => {
    const liveEntrySnap = await tx.get(entryRef);
    if (!liveEntrySnap.exists) return { outcome: 'missing', assigned: null };
    const liveEntry = liveEntrySnap.data();
    if (shouldSkipDiveNumberAssignment(liveEntry)) {
      return {
        outcome: positiveDiveNumber(liveEntry.dive_number) == null
          ? 'skipped'
          : 'already_numbered',
        assigned: positiveDiveNumber(liveEntry.dive_number),
      };
    }

    const memberId = liveEntry.member_id;
    if (!memberId) return { outcome: 'missing_member', assigned: null };
    const counterRef = memberCounterRef(db, clubId, memberId);
    const [counterSnap, entriesSnap] = await Promise.all([
      tx.get(counterRef),
      tx.get(memberEntriesQuery(db, clubId, memberId)),
    ]);
    const counterNext = counterSnap.exists ? counterSnap.data().next : null;
    const allocation = planDiveNumberAllocation({
      counterNext,
      entryDocs: entriesSnap.docs,
      excludedEntryId: entryId,
    });

    tx.set(counterRef, counterPatch(allocation.next), { merge: true });
    tx.update(
      entryRef,
      diveNumberAllocationPatch(allocation.assigned, 'assignDiveNumber')
    );
    return {
      outcome: 'assigned',
      assigned: allocation.assigned,
      memberId,
      next: allocation.next,
    };
  });
}

const assignDiveNumber = onDocumentCreated(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/student_logbook_entries/{entryId}',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (event) => {
    const { clubId, entryId } = event.params;
    if (!event.data?.ref) return;

    const db = admin.firestore();
    const entryRef = event.data.ref;

    try {
      const result = await allocateCreatedEntry({ db, clubId, entryId, entryRef });
      if (result.outcome === 'missing_member') {
        console.warn(`[assignDiveNumber] entry ${entryId} has no member_id, skipping`);
      } else if (result.outcome === 'assigned') {
        console.log(
          `[assignDiveNumber] entry ${entryId} member=${result.memberId} → N°${result.assigned}`
        );
      }
      return result;
    } catch (err) {
      console.error(
        `[assignDiveNumber] failed for ${entryId}: ${err.message}`
      );
      throw err;
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

async function runBackfillPass({ db, clubId, memberId }) {
  const counterRef = memberCounterRef(db, clubId, memberId);
  return db.runTransaction(async (tx) => {
    const [counterSnap, entriesSnap] = await Promise.all([
      tx.get(counterRef),
      tx.get(memberEntriesQuery(db, clubId, memberId)),
    ]);
    const counterNext = counterSnap.exists ? counterSnap.data().next : null;
    const docs = sortBackfillDocs(entriesSnap.docs);
    const plan = planBackfillDiveNumbers(docs);
    const pending = plan.pending.slice(0, BATCH_SIZE);

    if (pending.length === 0) {
      const floor = plan.highest === 0 ? 1 : incrementDiveNumber(plan.highest);
      const next = monotonicCounterNext(counterNext, floor);
      if (!counterSnap.exists || positiveDiveNumber(counterNext) !== next) {
        tx.set(counterRef, counterPatch(next), { merge: true });
      }
      return {
        backfilled: 0,
        remaining: 0,
        total: docs.length,
        highest: plan.highest,
        next,
      };
    }

    let cursor = nextDiveNumber(counterNext, plan.highest);
    let highestAssigned = plan.highest;
    for (const doc of pending) {
      const assigned = cursor;
      tx.update(doc.ref, diveNumberAllocationPatch(assigned, 'backfillMyDiveNumbers'));
      highestAssigned = Math.max(highestAssigned, assigned);
      cursor = incrementDiveNumber(assigned);
    }
    const next = monotonicCounterNext(counterNext, cursor);
    tx.set(counterRef, counterPatch(next), { merge: true });
    return {
      backfilled: pending.length,
      remaining: plan.pending.length - pending.length,
      total: docs.length,
      highest: highestAssigned,
      next,
    };
  });
}

async function backfillMemberDiveNumbers({ db, clubId, memberId }) {
  let backfilled = 0;
  let total = 0;
  let highest = 0;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const result = await runBackfillPass({ db, clubId, memberId });
    backfilled += result.backfilled;
    total = result.total;
    highest = result.highest;
    if (result.remaining === 0) {
      return { backfilled, total, highest };
    }
  }
  throw new Error(`Backfill exceeded ${MAX_PASSES * BATCH_SIZE} entries`);
}

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
    const result = await backfillMemberDiveNumbers({
      db,
      clubId,
      memberId: uid,
    });

    console.log(
      `[backfillMyDiveNumbers] member=${uid} backfilled=${result.backfilled} total=${result.total} highest=${result.highest}`
    );

    return result;
  }
);

module.exports = {
  assignDiveNumber,
  backfillMyDiveNumbers,
  positiveDiveNumber,
  incrementDiveNumber,
  shouldSkipDiveNumberAssignment,
  highestDiveNumberFromDocs,
  nextDiveNumber,
  monotonicCounterNext,
  diveNumberAllocationPatch,
  planBackfillDiveNumbers,
  sortBackfillDocs,
  memberEntriesQuery,
  memberCounterRef,
  counterPatch,
  planDiveNumberAllocation,
  allocateCreatedEntry,
  runBackfillPass,
  backfillMemberDiveNumbers,
};
