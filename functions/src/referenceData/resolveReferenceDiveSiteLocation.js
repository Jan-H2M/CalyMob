/**
 * Private reference-data location resolver.
 *
 * Both CalyCompta and CalyMob call this function. The clients never receive
 * access to the separate reference-data Firestore project; they receive only
 * a conservative exact-match coordinate result. Near matches are returned as
 * proposals only; they never cause a coordinate to be written automatically.
 *
 * Deployment prerequisite:
 * - REFERENCE_DATA_PROJECT_ID points to the separate Firebase project.
 * - This function's runtime service account has roles/datastore.user there.
 */

const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const REGION = 'europe-west1';
const REFERENCE_APP_NAME = 'calypso-reference-data';
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

function getReferenceDb() {
  const projectId = String(process.env.REFERENCE_DATA_PROJECT_ID || '').trim();
  if (!projectId) {
    throw new HttpsError(
      'failed-precondition',
      'La base de référence des sites de plongée n’est pas encore configurée.',
    );
  }
  let referenceApp = getApps().find((app) => app.name === REFERENCE_APP_NAME);
  if (!referenceApp) {
    referenceApp = initializeApp({
      projectId,
      credential: applicationDefault(),
    }, REFERENCE_APP_NAME);
  }
  return getFirestore(referenceApp);
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

    const referenceDb = getReferenceDb();
    const sites = referenceDb.collection('provider_sites');
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
      };
    }

    // Fuzzy matching is deliberately suggestion-only. A review UI can show
    // these candidates and, after confirmation, store the spelling as an
    // approved alias for deterministic future matches.
    const longestToken = normalizedName.split(' ').sort((a, b) => b.length - a.length)[0];
    let suggestions = [];
    if (longestToken && longestToken.length >= 3) {
      const tokenSnap = await sites.where('search_tokens', 'array-contains', longestToken)
        .limit(MAX_CANDIDATES)
        .get();
      suggestions = tokenSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
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
    const snap = await getReferenceDb().collection('provider_sites')
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
    };
  },
);

module.exports = {
  normalizeLocationName,
  similarity,
  suggestionScore,
  selectExactMatch,
  resolveReferenceDiveSiteLocation,
  confirmReferenceDiveSiteLocation,
};
