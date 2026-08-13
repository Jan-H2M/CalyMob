/**
 * Read-only inventory for the central dive-location catalogue.
 *
 * This callable deliberately produces a preview only. It identifies canonical
 * records, linked consumers and deterministic free-text matches without
 * changing production logbooks or activities.
 */

const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

const REGION = 'europe-west1';

async function requireClubAdmin(clubId, uid) {
  const member = await admin.firestore()
    .collection('clubs').doc(clubId).collection('members').doc(uid).get();
  if (!member.exists) throw new HttpsError('permission-denied', 'Membre du club requis.');
  const role = String(member.data()?.app_role || '').toLowerCase();
  if (role !== 'admin' && role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Réservé aux administrateurs.');
  }
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sourceOf(data) {
  return String(data.source || data.import_source || data.origin || data.source_system || 'unknown').trim().toLowerCase() || 'unknown';
}

function buildReconciliationSummary({ locations, operations, logbookEntries }) {
  const activeLocations = locations.filter((location) => !location.merged_into_location_id);
  const byName = new Map();
  for (const location of activeLocations) {
    const key = normalize(location.name);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) || []), location]);
  }

  const backfill = { safe: 0, ambiguous: 0, no_match: 0 };
  const backfillSamples = { safe: [], ambiguous: [], no_match: [] };
  for (const entry of logbookEntries) {
    if (entry.location_id) continue;
    const name = String(entry.location_name || entry.lieu || '').trim();
    if (!name) continue;
    const candidates = byName.get(normalize(name)) || [];
    const bucket = candidates.length === 1 ? 'safe' : candidates.length > 1 ? 'ambiguous' : 'no_match';
    backfill[bucket] += 1;
    if (backfillSamples[bucket].length < 10) {
      backfillSamples[bucket].push({ name, candidate_ids: candidates.slice(0, 5).map((candidate) => candidate.id) });
    }
  }

  const locationRows = activeLocations.map((location) => {
    const linkedOperations = operations.filter((operation) => operation.location_id === location.id || operation.lieu_id === location.id).length;
    const linkedLogbooks = logbookEntries.filter((entry) => entry.location_id === location.id).length;
    const exactFreeText = logbookEntries.filter((entry) => !entry.location_id && normalize(entry.location_name || entry.lieu) === normalize(location.name)).length;
    return {
      id: location.id,
      name: String(location.name || ''),
      country: location.country || null,
      canonical_id: location.id,
      merged_into_location_id: location.merged_into_location_id || null,
      source: location.source || location.import_source || location.origin || 'club_catalogue',
      sync_status: location.sync_status || (location.reference_match ? 'reference_linked' : 'catalogue_only'),
      linked_operations: linkedOperations,
      linked_logbooks: linkedLogbooks,
      exact_free_text_candidates: exactFreeText,
    };
  });

  const sourceBreakdown = { club_catalogue: activeLocations.length, operations: operations.length, logbooks: logbookEntries.length };
  for (const record of [...operations, ...logbookEntries]) {
    const source = sourceOf(record);
    if (source !== 'unknown') sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
  }

  return {
    generated_at: new Date().toISOString(),
    totals: {
      canonical_locations: activeLocations.length,
      operations: operations.length,
      logbook_entries: logbookEntries.length,
      linked_operations: operations.filter((operation) => operation.location_id || operation.lieu_id).length,
      linked_logbook_entries: logbookEntries.filter((entry) => entry.location_id).length,
    },
    source_breakdown: sourceBreakdown,
    backfill_preview: { ...backfill, samples: backfillSamples },
    locations: locationRows,
  };
}

const previewDiveLocationReconciliation = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const clubId = String(request.data?.clubId || '').trim();
  if (!clubId || clubId.length > 100) throw new HttpsError('invalid-argument', 'clubId est requis.');
  await requireClubAdmin(clubId, uid);
  const clubRef = admin.firestore().collection('clubs').doc(clubId);
  const [locationSnap, operationSnap, logbookSnap] = await Promise.all([
    clubRef.collection('dive_locations').get(),
    clubRef.collection('operations').get(),
    clubRef.collection('student_logbook_entries').get(),
  ]);
  return buildReconciliationSummary({
    locations: locationSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    operations: operationSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    logbookEntries: logbookSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  });
});

module.exports = { normalize, sourceOf, buildReconciliationSummary, previewDiveLocationReconciliation };
