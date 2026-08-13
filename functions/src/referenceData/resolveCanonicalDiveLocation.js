/**
 * Canonical club dive-location resolver shared by OCR, dictation and imports.
 *
 * The resolver deliberately reads the complete club catalogue. Client-side
 * limits (200/300/500) must never change whether a location can be linked.
 * Fuzzy matches are suggestions only; an id is written automatically only for
 * one exact name/alias or an explicit candidate confirmation.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const REGION = 'europe-west1';
const VERSION = 'canonical-location-v1';
const SOURCES = new Set(['ocr', 'dictation', 'import', 'manual']);
const MAX_SUGGESTIONS = 5;

function normalizeLocationName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(left, right) {
  const a = normalizeLocationName(left);
  const b = normalizeLocationName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function asString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canonicalLocation(id, data = {}) {
  const waterType = asString(data.water_type || data.waterType || data.type);
  const locationType = asString(data.location_type || data.locationType);
  const zone = asString(data.zone || data.region);
  const latitude = Number(data.latitude ?? data.coordinates?.latitude);
  const longitude = Number(data.longitude ?? data.coordinates?.longitude);
  return {
    id,
    name: asString(data.name || data.nom || data.display_name || data.location_name) || id,
    country: asString(data.country || data.pays),
    waterType,
    locationType,
    zone,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    aliases: aliasValues(data),
  };
}

function aliasValues(data) {
  const values = [];
  const add = (value) => {
    if (typeof value === 'string' && value.trim()) values.push(value.trim());
  };
  const aliases = data.aliases || data.location_aliases || data.logbook_import?.aliases;
  if (Array.isArray(aliases)) aliases.forEach(add);
  add(data.reference_match?.display_name);
  add(data.display_name);
  return [...new Set(values)];
}

function publicLocation(location, score = null) {
  return {
    id: location.id,
    name: location.name,
    country: location.country,
    waterType: location.waterType,
    locationType: location.locationType,
    zone: location.zone,
    latitude: location.latitude,
    longitude: location.longitude,
    ...(score == null ? {} : { score: Number(score.toFixed(3)) }),
  };
}

function locationKeys(location) {
  return [location.name, ...(location.aliases || [])]
    .map(normalizeLocationName)
    .filter(Boolean);
}

/** Pure resolver used by the callable and unit tests. */
function resolveLocationCandidates(query, locations, selectedLocationId = null) {
  const normalized = normalizeLocationName(query);
  const available = (Array.isArray(locations) ? locations : [])
    .filter((location) => location && location.id && location.name);
  if (selectedLocationId) {
    const selected = available.find((location) => location.id === selectedLocationId);
    if (!selected) return { status: 'not_found', canonical: null, suggestions: [] };
    return {
      status: 'exact',
      canonical: publicLocation(selected),
      suggestions: [],
      confirmation: 'selected',
    };
  }
  if (!normalized) return { status: 'not_found', canonical: null, suggestions: [] };

  const exact = available.filter((location) => locationKeys(location).includes(normalized));
  if (exact.length === 1) {
    return { status: 'exact', canonical: publicLocation(exact[0]), suggestions: [] };
  }
  if (exact.length > 1) {
    return {
      status: 'ambiguous',
      canonical: null,
      suggestions: exact.slice(0, MAX_SUGGESTIONS).map((location) => publicLocation(location, 1)),
    };
  }

  const suggestions = available
    .map((location) => ({
      location,
      score: Math.max(...locationKeys(location).map((key) => similarity(normalized, key))),
    }))
    .filter(({ score }) => score >= 0.52)
    .sort((a, b) => b.score - a.score || a.location.name.localeCompare(b.location.name))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ location, score }) => publicLocation(location, score));
  return {
    status: suggestions.length ? 'ambiguous' : 'not_found',
    canonical: null,
    suggestions,
  };
}

async function requireClubMember(clubId, uid) {
  const member = await admin.firestore()
    .collection('clubs').doc(clubId).collection('members').doc(uid).get();
  if (!member.exists) throw new HttpsError('permission-denied', 'Membre du club requis.');
}

async function loadCanonicalLocations(clubId) {
  const snap = await admin.firestore()
    .collection('clubs').doc(clubId).collection('dive_locations').get();
  return snap.docs
    .filter((doc) => {
      const data = doc.data() || {};
      return !data.merged_into_location_id &&
        !['merged', 'archived', 'deleted'].includes(String(data.status || '').toLowerCase());
    })
    .map((doc) => canonicalLocation(doc.id, doc.data() || {}))
    .filter((location) => location.name && location.id);
}

const resolveCanonicalDiveLocation = onCall({
  region: REGION,
  memory: '256MiB',
  timeoutSeconds: 30,
  maxInstances: 20,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  const data = request.data || {};
  const clubId = typeof data.clubId === 'string' ? data.clubId.trim() : '';
  const query = typeof data.locationName === 'string' ? data.locationName.trim() : '';
  const selectedLocationId = typeof data.locationId === 'string' ? data.locationId.trim() : null;
  const source = typeof data.source === 'string' ? data.source.trim() : 'manual';
  if (!clubId || clubId.length > 100 || query.length > 180 || !SOURCES.has(source)) {
    throw new HttpsError('invalid-argument', 'clubId, locationName et source sont invalides.');
  }
  if (!query && !selectedLocationId) {
    throw new HttpsError('invalid-argument', 'locationName ou locationId requis.');
  }
  await requireClubMember(clubId, uid);
  const result = resolveLocationCandidates(query, await loadCanonicalLocations(clubId), selectedLocationId);
  return {
    status: result.status,
    query,
    canonical: result.canonical || null,
    suggestions: result.suggestions || [],
    linkSource: source,
    resolverVersion: VERSION,
    ...(result.confirmation ? { confirmation: result.confirmation } : {}),
  };
});

module.exports = {
  resolveCanonicalDiveLocation,
  normalizeLocationName,
  canonicalLocation,
  resolveLocationCandidates,
  loadCanonicalLocations,
};
