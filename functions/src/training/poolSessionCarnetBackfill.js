const { FieldValue } = require('firebase-admin/firestore');

const CARNET_PROCESSING_VERSION = 2;
const BACKFILL_SOURCE = 'explicit_allowlist_v2';

function processingVersion(data = {}) {
  const version = Number(data.carnet_processing_version || 0);
  return Number.isFinite(version) ? version : 0;
}

function isHistoricalCarnetBackfillCandidate(data = {}) {
  return data.status === 'closed' &&
    processingVersion(data) < CARNET_PROCESSING_VERSION;
}

function normalizeAllowlist(values = []) {
  const ids = [];
  const seen = new Set();
  for (const value of values) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id || id.includes('/') || id.length > 200) {
      throw new Error(`Invalid session allowlist id: ${String(value)}`);
    }
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function assertApplyGuard({ apply, allowlist }) {
  if (apply !== true) return;
  if (allowlist.length === 0) {
    throw new Error(
      'Backfill apply refused: pass at least one explicit --session allowlist id.',
    );
  }
}

function sessionPreview(doc) {
  const data = doc.data();
  const rawDate = data.date?.toDate?.() || data.date || null;
  return {
    id: doc.id,
    status: data.status || null,
    statut: data.statut || null,
    carnet_processing_version: processingVersion(data),
    date: rawDate instanceof Date && !Number.isNaN(rawDate.getTime())
      ? rawDate.toISOString()
      : null,
  };
}

async function loadHistoricalCarnetBackfillDocs(sessionsRef) {
  const closedSnap = await sessionsRef.where('status', '==', 'closed').get();
  return closedSnap.docs.filter((doc) =>
    isHistoricalCarnetBackfillCandidate(doc.data()));
}

async function runHistoricalCarnetBackfill({
  db,
  clubId,
  apply = false,
  allowlist = [],
}) {
  if (!db || typeof db.collection !== 'function') {
    throw new Error('A Firestore database is required.');
  }
  const normalizedClubId = typeof clubId === 'string' ? clubId.trim() : '';
  if (!normalizedClubId || normalizedClubId.includes('/')) {
    throw new Error('A valid --club id is required.');
  }
  const allowedIds = normalizeAllowlist(allowlist);
  assertApplyGuard({ apply, allowlist: allowedIds });

  const sessionsRef = db
    .collection('clubs')
    .doc(normalizedClubId)
    .collection('piscine_sessions');
  const candidates = await loadHistoricalCarnetBackfillDocs(sessionsRef);
  const byId = new Map(candidates.map((doc) => [doc.id, doc]));
  const selected = allowedIds.length === 0
    ? candidates
    : allowedIds.map((id) => byId.get(id)).filter(Boolean);
  const unknownIds = allowedIds.filter((id) => !byId.has(id));

  const result = {
    mode: apply ? 'apply' : 'dry-run',
    clubId: normalizedClubId,
    candidateCount: candidates.length,
    selectedCount: selected.length,
    selected: selected.map(sessionPreview),
    unknownIds,
    appliedCount: 0,
  };
  if (!apply) return result;

  // Fail before the first write if the preview and explicit allowlist differ.
  // This avoids a partial or unexpectedly broadened historical migration.
  if (unknownIds.length > 0) {
    throw new Error(
      `Backfill apply refused: allowlisted sessions are no longer candidates: ${unknownIds.join(', ')}`,
    );
  }

  await db.runTransaction(async (transaction) => {
    const freshSnapshots = await Promise.all(
      selected.map((doc) => transaction.get(doc.ref)),
    );
    const changedIds = freshSnapshots
      .filter((snapshot) =>
        !snapshot.exists ||
        !isHistoricalCarnetBackfillCandidate(snapshot.data()))
      .map((snapshot, index) => snapshot.id || selected[index].id);
    if (changedIds.length > 0) {
      throw new Error(
        `Backfill apply refused: sessions changed after preview: ${changedIds.join(', ')}`,
      );
    }

    for (const snapshot of freshSnapshots) {
      transaction.update(snapshot.ref, {
        carnet_processing_version: CARNET_PROCESSING_VERSION,
        carnet_backfill_applied_at: FieldValue.serverTimestamp(),
        carnet_backfill_source: BACKFILL_SOURCE,
      });
    }
  });

  result.appliedCount = selected.length;
  return result;
}

module.exports = {
  BACKFILL_SOURCE,
  CARNET_PROCESSING_VERSION,
  assertApplyGuard,
  isHistoricalCarnetBackfillCandidate,
  loadHistoricalCarnetBackfillDocs,
  normalizeAllowlist,
  processingVersion,
  runHistoricalCarnetBackfill,
  sessionPreview,
};
