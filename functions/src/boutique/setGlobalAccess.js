const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { REGION } = require('./shared');

const REQUIRED_BOUTIQUE_VERSION = '1.23.0';
const BOUTIQUE_ACCESS_WORK_ITEM = 'BTQ-ACCESS-20260926';
const BOUTIQUE_SECTION_KEYS = [
  'produits',
  'panier',
  'commandes',
  'cotisation',
  'pretsMateriel',
];
const BOUTIQUE_CONTROL_FIELDS = [
  'boutiqueEnabled',
  'boutiqueMobileEnabled',
  'boutiqueAdminOnly',
  'boutiqueAccess',
  'boutiqueSections',
];

function isValidClubId(value) {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && value.length <= 100
    && !value.includes('/');
}

function validateRequestData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Requête Boutique invalide.');
  }

  const keys = Object.keys(data).sort();
  if (keys.length !== 2 || keys[0] !== 'clubId' || keys[1] !== 'mode') {
    throw new HttpsError(
      'invalid-argument',
      'La requête accepte uniquement clubId et mode.',
    );
  }
  if (!isValidClubId(data.clubId) || !['testeurs', 'tous'].includes(data.mode)) {
    throw new HttpsError('invalid-argument', 'clubId ou mode invalide.');
  }

  return { clubId: data.clubId, mode: data.mode };
}

function parseStrictSemver(value) {
  if (typeof value !== 'string') return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  return match.slice(1).map((part) => BigInt(part));
}

function compareStrictSemver(left, right) {
  const parsedLeft = parseStrictSemver(left);
  const parsedRight = parseStrictSemver(right);
  if (!parsedLeft || !parsedRight) return null;

  for (let index = 0; index < parsedLeft.length; index += 1) {
    if (parsedLeft[index] > parsedRight[index]) return 1;
    if (parsedLeft[index] < parsedRight[index]) return -1;
  }
  return 0;
}

function buildBoutiqueAccessState(mode) {
  return {
    boutiqueEnabled: true,
    boutiqueMobileEnabled: true,
    boutiqueAdminOnly: true,
    boutiqueAccess: mode,
    boutiqueSections: Object.fromEntries(
      BOUTIQUE_SECTION_KEYS.map((key) => [key, mode]),
    ),
  };
}

function boutiqueSubset(data) {
  const source = data && typeof data === 'object' ? data : {};
  const subset = {};

  for (const field of BOUTIQUE_CONTROL_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    if (field !== 'boutiqueSections') {
      subset[field] = source[field];
      continue;
    }

    const sections = source.boutiqueSections;
    if (!sections || typeof sections !== 'object' || Array.isArray(sections)) {
      subset.boutiqueSections = sections;
      continue;
    }
    subset.boutiqueSections = Object.fromEntries(
      BOUTIQUE_SECTION_KEYS
        .filter((key) => Object.prototype.hasOwnProperty.call(sections, key))
        .map((key) => [key, sections[key]]),
    );
  }

  return subset;
}

function hasExactBoutiqueState(data, target) {
  const source = data && typeof data === 'object' ? data : {};
  if (source.boutiqueEnabled !== target.boutiqueEnabled
    || source.boutiqueMobileEnabled !== target.boutiqueMobileEnabled
    || source.boutiqueAdminOnly !== target.boutiqueAdminOnly
    || source.boutiqueAccess !== target.boutiqueAccess) {
    return false;
  }

  const sections = source.boutiqueSections;
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) {
    return false;
  }
  const sectionKeys = Object.keys(sections).sort();
  if (sectionKeys.length !== BOUTIQUE_SECTION_KEYS.length
    || !BOUTIQUE_SECTION_KEYS.every((key) => sectionKeys.includes(key))) {
    return false;
  }
  return BOUTIQUE_SECTION_KEYS.every(
    (key) => sections[key] === target.boutiqueSections[key],
  );
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number.NaN;
}

function hasValidSession(sessionSnapshot, now) {
  if (!sessionSnapshot.exists) return true;
  const session = sessionSnapshot.data() || {};
  return session.isActive === true
    && timestampMillis(session.expiresAt) > timestampMillis(now);
}

function cleanOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function actorName(member) {
  const explicit = cleanOptionalString(member.displayName)
    || cleanOptionalString(member.name);
  if (explicit) return explicit;

  const firstName = cleanOptionalString(member.prenom)
    || cleanOptionalString(member.firstName);
  const lastName = cleanOptionalString(member.nom)
    || cleanOptionalString(member.lastName);
  const combined = [firstName, lastName].filter(Boolean).join(' ');
  return combined || null;
}

async function setBoutiqueGlobalAccessHandler(request, dependencies = {}) {
  const uid = request && request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentification requise.');
  }

  const { clubId, mode } = validateRequestData(request.data);
  const db = dependencies.db || admin.firestore();
  const now = dependencies.now || new Date();
  const serverTimestamp = dependencies.serverTimestamp
    || (() => FieldValue.serverTimestamp());

  const clubRef = db.collection('clubs').doc(clubId);
  const memberRef = clubRef.collection('members').doc(uid);
  const sessionRef = clubRef.collection('sessions').doc(uid);
  const versionRef = db.collection('settings').doc('app_version');
  const flagsRef = clubRef.collection('settings').doc('feature_flags');
  const auditRef = clubRef.collection('audit_logs').doc();
  const target = buildBoutiqueAccessState(mode);

  return db.runTransaction(async (transaction) => {
    // Keep all authorization, rollout and current-state reads inside this one
    // transaction so Firestore retries if any precondition changes.
    const memberSnapshot = await transaction.get(memberRef);
    const sessionSnapshot = await transaction.get(sessionRef);
    const versionSnapshot = await transaction.get(versionRef);
    const flagsSnapshot = await transaction.get(flagsRef);

    const member = memberSnapshot.exists ? memberSnapshot.data() || {} : {};
    if (!memberSnapshot.exists || !['admin', 'superadmin'].includes(member.app_role)) {
      throw new HttpsError(
        'permission-denied',
        'Droits administrateur requis pour ce club.',
      );
    }
    if (!hasValidSession(sessionSnapshot, now)) {
      throw new HttpsError('permission-denied', 'Session expirée ou inactive.');
    }

    const version = versionSnapshot.exists ? versionSnapshot.data() || {} : {};
    const minSupportedVersion = version.minSupportedVersion ?? null;
    const versionComparison = compareStrictSemver(
      minSupportedVersion,
      REQUIRED_BOUTIQUE_VERSION,
    );
    if (mode === 'tous' && (versionComparison == null || versionComparison < 0)) {
      throw new HttpsError(
        'failed-precondition',
        'La version minimale de CalyMob ne permet pas encore cette ouverture.',
        {
          reason: 'boutique-min-version',
          minSupportedVersion,
          requiredVersion: REQUIRED_BOUTIQUE_VERSION,
        },
      );
    }

    const flags = flagsSnapshot.exists ? flagsSnapshot.data() || {} : {};
    if (hasExactBoutiqueState(flags, target)) {
      return { success: true, changed: false, state: target };
    }

    transaction.set(flagsRef, target, { mergeFields: BOUTIQUE_CONTROL_FIELDS });

    const audit = {
      action: mode === 'tous'
        ? 'boutique.access.opened_all'
        : 'boutique.access.preparation_enabled',
      userId: uid,
      targetId: 'feature_flags',
      targetType: 'boutique_settings',
      targetName: 'Boutique',
      previousValue: boutiqueSubset(flags),
      newValue: target,
      clubId,
      timestamp: serverTimestamp(),
      mode,
      requiredVersion: REQUIRED_BOUTIQUE_VERSION,
      workItemId: BOUTIQUE_ACCESS_WORK_ITEM,
    };
    const email = cleanOptionalString(member.email);
    const name = actorName(member);
    if (email) audit.userEmail = email;
    if (name) audit.userName = name;
    transaction.create(auditRef, audit);

    return { success: true, changed: true, state: target };
  });
}

const setBoutiqueGlobalAccess = onCall(
  { region: REGION },
  (request) => setBoutiqueGlobalAccessHandler(request),
);

module.exports = {
  BOUTIQUE_ACCESS_WORK_ITEM,
  BOUTIQUE_CONTROL_FIELDS,
  BOUTIQUE_SECTION_KEYS,
  REQUIRED_BOUTIQUE_VERSION,
  actorName,
  boutiqueSubset,
  buildBoutiqueAccessState,
  compareStrictSemver,
  hasExactBoutiqueState,
  hasValidSession,
  isValidClubId,
  parseStrictSemver,
  setBoutiqueGlobalAccess,
  setBoutiqueGlobalAccessHandler,
  validateRequestData,
};
