/**
 * Private reference-data location resolver.
 *
 * Both CalyCompta and CalyMob call this function. The clients never receive
 * direct access to the internal reference collection; they receive only a
 * conservative exact-match coordinate result. Near matches are returned as
 * proposals only; they never cause a coordinate to be written automatically.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const REGION = 'europe-west1';
const MAX_CANDIDATES = 50;
const MAX_SUGGESTIONS = 3;
const MIN_SUGGESTION_SCORE = 0.78;

function normalizeLocationName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isCoordinatePair(value) {
  const latitude = value?.location?.latitude;
  const longitude = value?.location?.longitude;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}

function levenshteinDistance(left, right) {
  const source = String(left || '');
  const target = String(right || '');
  if (source === target) return 0;
  if (!source) return target.length;
  if (!target) return source.length;

  let previous = Array.from({ length: target.length + 1 }, (_, index) => index);
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    const current = [sourceIndex];
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      current[targetIndex] = Math.min(
        current[targetIndex - 1] + 1,
        previous[targetIndex] + 1,
        previous[targetIndex - 1] + (source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[target.length];
}

function similarity(left, right) {
  const longest = Math.max(String(left || '').length, String(right || '').length);
  return longest === 0 ? 1 : 1 - (levenshteinDistance(left, right) / longest);
}

function suggestionScore(normalizedName, site) {
  const keys = Array.isArray(site.match_keys) && site.match_keys.length
    ? site.match_keys
    : [site.normalized_name || site.display_name];
  return Math.max(...keys.map((key) => similarity(normalizedName, normalizeLocationName(key))));
}

function publicSuggestion(site, score) {
  return {
    displayName: site.display_name,
    countryIso3: site.country_iso3 || null,
    provider: 'ssi',
    providerSiteId: site.provider_site_id,
    score: Number(score.toFixed(3)),
  };
}

function publicReferenceSite(site) {
  return {
    id: site.provider_site_id,
    displayName: site.display_name,
    countryIso3: site.country_iso3 || null,
    latitude: site.location?.latitude ?? null,
    longitude: site.location?.longitude ?? null,
    hasFrenchDescription: Boolean(site.descriptions?.fr),
  };
}

function compactName(value) {
  return normalizeLocationName(value).replace(/ /g, '');
}

function matchesReferenceQuery(site, query) {
  const compactQuery = compactName(query);
  if (!compactQuery) return true;
  return [site.display_name, ...(Array.isArray(site.match_keys) ? site.match_keys : [])]
    .some((value) => compactName(value).includes(compactQuery));
}

function referenceDescription(site) {
  const descriptions = site?.descriptions;
  if (!descriptions || typeof descriptions !== 'object') return null;
  // Prefer a reviewed French value when one is available; the SSI import
  // currently preserves English as the source fallback. The club receives a
  // copy only when an administrator adopts the matching site and may edit it.
  for (const language of ['fr', 'en']) {
    const value = descriptions[language];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function eligibleSite(site) {
  return site.provider === 'ssi'
    && site.quality?.status !== 'rejected'
    && isCoordinatePair(site);
}

async function getClubMember(clubId, uid) {
  const member = await admin.firestore()
    .collection('clubs').doc(clubId).collection('members').doc(uid).get();
  if (!member.exists) throw new HttpsError('permission-denied', 'Membre du club requis.');
  return member.data();
}

function requireAdmin(member) {
  const role = String(member.app_role || '').toLowerCase();
  if (role !== 'admin' && role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Réservé aux administrateurs.');
  }
}

function getReferenceSites(clubId) {
  // Reference data belongs to the existing Calypso Firestore project but is
  // deliberately stored in a server-only collection. This avoids exposing the
  // raw provider catalogue to clients or relying on a second Firebase project.
  return admin.firestore().collection('clubs').doc(clubId).collection('reference_dive_sites');
}

function selectExactMatch(candidates) {
  if (candidates.length !== 1) return null;
  return candidates[0];
}

const resolveReferenceDiveSiteLocation = onCall(
  {
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 15,
    maxInstances: 20,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');

    const clubId = typeof request.data?.clubId === 'string' ? request.data.clubId.trim() : '';
    const locationName = typeof request.data?.locationName === 'string'
      ? request.data.locationName.trim()
      : '';
    const normalizedName = normalizeLocationName(locationName);
    if (!clubId || clubId.length > 100 || !normalizedName || normalizedName.length > 180) {
      throw new HttpsError('invalid-argument', 'clubId et locationName valides sont requis.');
    }

    // The callable is available only to actual club members, not any signed-in
    // Firebase account. This mirrors the access bar used throughout Calypso.
    await getClubMember(clubId, uid);

    const sites = getReferenceSites(clubId);
    // The legacy normalized_name query permits existing imports to keep
    // working. match_keys includes approved aliases and generic-prefix forms.
    const [nameSnap, aliasSnap] = await Promise.all([
      sites.where('normalized_name', '==', normalizedName).limit(MAX_CANDIDATES).get(),
      sites.where('match_keys', 'array-contains', normalizedName).limit(MAX_CANDIDATES).get(),
    ]);
    const byId = new Map();
    for (const doc of [...nameSnap.docs, ...aliasSnap.docs]) {
      byId.set(doc.id, { id: doc.id, ...doc.data() });
    }
    const candidates = [...byId.values()].filter(eligibleSite);

    // Exact names and approved aliases are the only automatic GPS path.
    const match = selectExactMatch(candidates);
    if (match) {
      return {
        found: true,
        latitude: match.location.latitude,
        longitude: match.location.longitude,
        displayName: match.display_name,
        countryIso3: match.country_iso3 || null,
        provider: 'ssi',
        providerSiteId: match.provider_site_id,
        confidence: 'exact_name_or_alias',
        description: referenceDescription(match),
      };
    }

    // Fuzzy matching is deliberately suggestion-only. A review UI can show
    // these candidates and, after confirmation, store the spelling as an
    // approved alias for deterministic future matches.
    // A historical club spelling can split an SSI compound word, for example
    // "Anna jacoba polder" versus SSI's "Anna Jacobapolder". Query a few of
    // the most distinctive tokens and merge the result set before scoring;
    // this remains suggestion-only, never an automatic write.
    const searchTokens = [...new Set(normalizedName.split(' ')
      .filter((token) => token.length >= 3))]
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);
    let suggestions = [];
    if (searchTokens.length) {
      const tokenSnapshots = await Promise.all(searchTokens.map((token) => sites
        .where('search_tokens', 'array-contains', token)
        .limit(MAX_CANDIDATES)
        .get()));
      const suggestedById = new Map();
      for (const snapshot of tokenSnapshots) {
        for (const doc of snapshot.docs) {
          suggestedById.set(doc.id, { id: doc.id, ...doc.data() });
        }
      }
      suggestions = [...suggestedById.values()]
        .filter(eligibleSite)
        .map((site) => ({ site, score: suggestionScore(normalizedName, site) }))
        .filter(({ score }) => score >= MIN_SUGGESTION_SCORE)
        .sort((left, right) => right.score - left.score)
        .slice(0, MAX_SUGGESTIONS)
        .map(({ site, score }) => publicSuggestion(site, score));
    }

    if (candidates.length > 1) {
      return {
        found: false,
        reason: 'ambiguous_exact_name',
        suggestions: candidates.slice(0, MAX_SUGGESTIONS)
          .map((site) => publicSuggestion(site, 1)),
      };
    }
    return {
      found: false,
      reason: suggestions.length ? 'review_suggested' : 'not_found',
      suggestions,
    };
  },
);

/**
 * Resolves the coordinates only after an administrator deliberately confirms
 * one of the suggestion cards in the dive-locations settings screen.
 */
const confirmReferenceDiveSiteLocation = onCall(
  {
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 15,
    maxInstances: 20,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');

    const clubId = typeof request.data?.clubId === 'string' ? request.data.clubId.trim() : '';
    const providerSiteId = typeof request.data?.providerSiteId === 'string'
      ? request.data.providerSiteId.trim()
      : '';
    if (!clubId || clubId.length > 100 || !/^[A-Za-z0-9_-]{1,150}$/.test(providerSiteId)) {
      throw new HttpsError('invalid-argument', 'clubId et providerSiteId valides sont requis.');
    }

    requireAdmin(await getClubMember(clubId, uid));
    const snap = await getReferenceSites(clubId)
      .doc(`ssi_${providerSiteId}`)
      .get();
    if (!snap.exists || !eligibleSite(snap.data())) {
      throw new HttpsError('not-found', 'Site de référence introuvable ou non exploitable.');
    }
    const site = snap.data();
    return {
      found: true,
      latitude: site.location.latitude,
      longitude: site.location.longitude,
      displayName: site.display_name,
      countryIso3: site.country_iso3 || null,
      provider: 'ssi',
      providerSiteId: site.provider_site_id,
      confidence: 'manual_admin_confirmation',
      description: referenceDescription(site),
    };
  },
);

/**
 * Compact, administrator-only browser for the local SSI reference catalogue.
 * The raw descriptions stay server-side; the UI receives only list metadata.
 */
const listReferenceDiveSites = onCall(
  { region: REGION, memory: '256MiB', timeoutSeconds: 15, maxInstances: 20 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
    const clubId = typeof request.data?.clubId === 'string' ? request.data.clubId.trim() : '';
    const query = typeof request.data?.query === 'string' ? request.data.query.trim() : '';
    const cursor = typeof request.data?.cursor === 'string' ? request.data.cursor.trim() : '';
    const requestedLimit = Number(request.data?.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 10), 100) : 50;
    if (!clubId || clubId.length > 100 || query.length > 180 || cursor.length > 200) {
      throw new HttpsError('invalid-argument', 'Paramètres de recherche invalides.');
    }
    requireAdmin(await getClubMember(clubId, uid));
    const sites = getReferenceSites(clubId);

    if (query) {
      const token = normalizeLocationName(query).split(' ').filter((value) => value.length >= 3)
        .sort((left, right) => right.length - left.length)[0];
      if (!token) return { items: [], nextCursor: null, searched: true };
      const snap = await sites.where('search_tokens', 'array-contains', token).limit(200).get();
      const items = snap.docs.map((doc) => doc.data()).filter(eligibleSite).filter((site) => matchesReferenceQuery(site, query))
        .sort((left, right) => left.display_name.localeCompare(right.display_name, 'fr'))
        .slice(0, limit).map(publicReferenceSite);
      return { items, nextCursor: null, searched: true };
    }

    let startAfter = null;
    if (cursor) {
      const cursorSnap = await sites.doc(cursor).get();
      if (cursorSnap.exists) startAfter = cursorSnap;
    }
    let requestQuery = sites.orderBy('display_name').limit(limit + 1);
    if (startAfter) requestQuery = requestQuery.startAfter(startAfter);
    const snap = await requestQuery.get();
    const page = snap.docs.slice(0, limit);
    return {
      items: page.map((doc) => publicReferenceSite(doc.data())),
      nextCursor: snap.docs.length > limit ? page[page.length - 1].id : null,
      searched: false,
    };
  },
);

module.exports = {
  normalizeLocationName,
  similarity,
  suggestionScore,
  selectExactMatch,
  referenceDescription,
  matchesReferenceQuery,
  resolveReferenceDiveSiteLocation,
  confirmReferenceDiveSiteLocation,
  listReferenceDiveSites,
};
