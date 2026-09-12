const { FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');

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

function parseAllowlistEntry(value) {
  if (typeof value === 'object' && value !== null) {
    return {
      id: typeof value.id === 'string' ? value.id.trim() : '',
      fingerprint: typeof value.fingerprint === 'string'
        ? value.fingerprint.trim().toLowerCase()
        : '',
    };
  }
  const raw = typeof value === 'string' ? value.trim() : '';
  const separator = raw.lastIndexOf(':');
  if (separator > 0) {
    return {
      id: raw.slice(0, separator).trim(),
      fingerprint: raw.slice(separator + 1).trim().toLowerCase(),
    };
  }
  return { id: raw, fingerprint: '' };
}

function normalizeAllowlist(values = []) {
  const entries = [];
  const seen = new Set();
  for (const value of values) {
    const entry = parseAllowlistEntry(value);
    const { id, fingerprint } = entry;
    if (!id || id.includes('/') || id.length > 200) {
      throw new Error(`Invalid session allowlist id: ${String(value)}`);
    }
    if (fingerprint && !/^[a-f0-9]{64}$/.test(fingerprint)) {
      throw new Error(`Invalid session preview fingerprint for: ${id}`);
    }
    if (!seen.has(id)) {
      seen.add(id);
      entries.push(entry);
    } else {
      const previous = entries.find((candidate) => candidate.id === id);
      if (previous.fingerprint !== fingerprint) {
        throw new Error(`Conflicting session preview fingerprints for: ${id}`);
      }
    }
  }
  return entries;
}

function assertApplyGuard({ apply, allowlist }) {
  if (apply !== true) return;
  if (allowlist.length === 0) {
    throw new Error(
      'Backfill apply refused: pass at least one preview-bound --session=<id>:<fingerprint>.',
    );
  }
  const unboundIds = allowlist
    .filter((entry) => !entry.fingerprint)
    .map((entry) => entry.id);
  if (unboundIds.length > 0) {
    throw new Error(
      `Backfill apply refused: missing preview fingerprint for: ${unboundIds.join(', ')}`,
    );
  }
}

function canonicalize(value) {
  if (value === undefined) return { __type: 'undefined' };
  if (value === null || typeof value === 'string' ||
      typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : { __type: 'number', value: String(value) };
  }
  if (value instanceof Date) return { __type: 'date', value: value.toISOString() };
  if (Buffer.isBuffer(value)) {
    return { __type: 'bytes', value: value.toString('base64') };
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds;
    const nanoseconds = value.nanoseconds ?? value._nanoseconds;
    if (Number.isInteger(seconds) && Number.isInteger(nanoseconds)) {
      return { __type: 'timestamp', seconds, nanoseconds };
    }
    if (typeof value.path === 'string' && typeof value.id === 'string') {
      return { __type: 'reference', path: value.path };
    }
    if (Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) {
      return {
        __type: 'geopoint',
        latitude: value.latitude,
        longitude: value.longitude,
      };
    }
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  throw new Error(`Unsupported session value in preview: ${typeof value}`);
}

function sessionFingerprint(doc) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize({ id: doc.id, data: doc.data() })))
    .digest('hex');
}

function sessionPreview(doc) {
  const data = doc.data();
  const rawDate = data.date?.toDate?.() || data.date || null;
  return {
    id: doc.id,
    status: data.status || null,
    statut: data.statut || null,
    carnet_processing_version: processingVersion(data),
    preview_fingerprint: sessionFingerprint(doc),
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
  const allowedEntries = normalizeAllowlist(allowlist);
  assertApplyGuard({ apply, allowlist: allowedEntries });

  const sessionsRef = db
    .collection('clubs')
    .doc(normalizedClubId)
    .collection('piscine_sessions');
  const candidates = await loadHistoricalCarnetBackfillDocs(sessionsRef);
  const byId = new Map(candidates.map((doc) => [doc.id, doc]));
  const selected = allowedEntries.length === 0
    ? candidates
    : allowedEntries.map((entry) => byId.get(entry.id)).filter(Boolean);
  const unknownIds = allowedEntries
    .map((entry) => entry.id)
    .filter((id) => !byId.has(id));

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

  const expectedFingerprints = new Map(
    allowedEntries.map((entry) => [entry.id, entry.fingerprint]),
  );
  const stalePreviewIds = selected
    .filter((doc) => sessionFingerprint(doc) !== expectedFingerprints.get(doc.id))
    .map((doc) => doc.id);
  if (stalePreviewIds.length > 0) {
    throw new Error(
      `Backfill apply refused: preview fingerprint mismatch for: ${stalePreviewIds.join(', ')}`,
    );
  }

  await db.runTransaction(async (transaction) => {
    const freshSnapshots = await Promise.all(
      selected.map((doc) => transaction.get(doc.ref)),
    );
    const changedIds = freshSnapshots.reduce((ids, snapshot, index) => {
      const id = snapshot.id || selected[index].id;
      if (
        !snapshot.exists ||
        !isHistoricalCarnetBackfillCandidate(snapshot.data()) ||
        sessionFingerprint(snapshot) !== expectedFingerprints.get(id)
      ) {
        ids.push(id);
      }
      return ids;
    }, []);
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
  sessionFingerprint,
  sessionPreview,
};
