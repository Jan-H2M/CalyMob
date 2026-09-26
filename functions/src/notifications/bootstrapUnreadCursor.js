const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { isActiveMember } = require('../utils/memberStatus');

const REGION = 'europe-west1';
const SCHEMA_VERSION = 1;
const MAX_SCOPE_WRITES = 440;
const MIN_TIMESTAMP_MS = Date.UTC(2020, 0, 1);

function fail(code, message, details) {
  throw new HttpsError(code, message, details);
}

function validDocumentId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 500
    && value !== '.'
    && value !== '..'
    && !value.includes('/');
}

function normalizeTimestamp(value, nowMs, field) {
  if (!Number.isSafeInteger(value)) {
    fail('invalid-argument', `${field} doit être un timestamp valide.`);
  }
  return {
    value: Math.max(MIN_TIMESTAMP_MS, Math.min(value, nowMs)),
    clamped: value < MIN_TIMESTAMP_MS || value > nowMs,
  };
}

function normalizeScopeMap(raw, nowMs, field) {
  if (raw == null) return { values: new Map(), clamped: false };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    fail('invalid-argument', `${field} doit être un objet.`);
  }
  const values = new Map();
  let clamped = false;
  for (const [scopeId, timestamp] of Object.entries(raw)) {
    if (!validDocumentId(scopeId)) {
      fail('invalid-argument', `${field} contient un identifiant invalide.`);
    }
    const normalized = normalizeTimestamp(timestamp, nowMs, `${field}.${scopeId}`);
    values.set(scopeId, normalized.value);
    clamped ||= normalized.clamped;
  }
  return { values, clamped };
}

function normalizeInput(input, nowMs) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid-argument', 'Données de migration manquantes.');
  }
  const clubId = input.clubId;
  if (!validDocumentId(clubId) || clubId.length > 100) {
    fail('invalid-argument', 'clubId invalide.');
  }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    fail('invalid-argument', 'Version de migration non supportée.');
  }

  const fallback = normalizeTimestamp(
    input.fallbackLastSeenAtMs,
    nowMs,
    'fallbackLastSeenAtMs',
  );
  const announcements = normalizeTimestamp(
    input.announcementsLastSeenAtMs,
    nowMs,
    'announcementsLastSeenAtMs',
  );
  const events = normalizeScopeMap(input.eventConversations, nowMs, 'eventConversations');
  const teams = normalizeScopeMap(input.teamChannels, nowMs, 'teamChannels');
  const sessions = normalizeScopeMap(input.sessionChats, nowMs, 'sessionChats');
  const scopeCount = events.values.size + teams.values.size + sessions.values.size;
  if (scopeCount > MAX_SCOPE_WRITES) {
    fail('invalid-argument', 'Trop de conversations à migrer.');
  }

  const floorScopes = source => new Map(
    [...source.entries()].map(([key, value]) => [key, Math.max(fallback.value, value)]),
  );
  return {
    clubId,
    fallbackMs: fallback.value,
    announcementsMs: Math.max(fallback.value, announcements.value),
    events: floorScopes(events.values),
    teams: floorScopes(teams.values),
    sessions: floorScopes(sessions.values),
    scopeCount,
    timestampsClamped: fallback.clamped
      || announcements.clamped
      || events.clamped
      || teams.clamped
      || sessions.clamped,
  };
}

function cursorEnabledForMember(flags, uid) {
  if (flags?.unreadCursorV1Enabled !== true) return false;
  if (flags.unreadCursorV1Mode === 'on') return true;
  return flags.unreadCursorV1Mode === 'shadow'
    && Array.isArray(flags.unreadCursorV1PilotMemberIds)
    && flags.unreadCursorV1PilotMemberIds.includes(uid);
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  // Test doubles use this compact representation.
  if (Number.isSafeInteger(value?.millis)) return value.millis;
  return null;
}

function rootCursorMillis(section, data) {
  return timestampMillis(
    section === 'announcements' ? data?.last_seen_at : data?.global_last_seen_at,
  );
}

function isTrustedMigrationSeed(section, data, trustedBaselineMs) {
  return data?.schema_version === SCHEMA_VERSION
    && rootCursorMillis(section, data) === trustedBaselineMs
    && timestampMillis(data?.updated_at) === trustedBaselineMs;
}

async function bootstrapUnreadCursor({
  db,
  uid,
  input,
  nowMs = Date.now(),
  timestampFromMillis = value => admin.firestore.Timestamp.fromMillis(value),
  serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp(),
  reconcileBadge,
}) {
  const normalized = normalizeInput(input, nowMs);
  const memberPath = `clubs/${normalized.clubId}/members/${uid}`;
  const markerRef = db.doc(`${memberPath}/read_state_bootstraps/unread_cursor_v1`);
  const memberRef = db.doc(memberPath);
  const flagsRef = db.doc(`clubs/${normalized.clubId}/settings/feature_flags`);
  const migrationRef = db.doc(
    `clubs/${normalized.clubId}/settings/unread_cursor_v1_migration`,
  );
  const rootRefs = {
    announcements: db.doc(`${memberPath}/read_state/announcements`),
    events: db.doc(`${memberPath}/read_state/events`),
    teams: db.doc(`${memberPath}/read_state/teams`),
    sessions: db.doc(`${memberPath}/read_state/sessions`),
  };

  const scopeWrites = [
    ...[...normalized.events].map(([scopeId, timestamp]) => ({
      section: 'events', collection: 'conversations', scopeId, timestamp,
    })),
    ...[...normalized.teams].map(([scopeId, timestamp]) => ({
      section: 'teams', collection: 'channels', scopeId, timestamp,
    })),
    ...[...normalized.sessions].map(([scopeId, timestamp]) => ({
      section: 'sessions', collection: 'chats', scopeId, timestamp,
    })),
  ].map(item => ({
    ...item,
    ref: db.doc(
      `${memberPath}/read_state/${item.section}/${item.collection}/${item.scopeId}`,
    ),
  }));

  const outcome = await db.runTransaction(async transaction => {
    const [marker, member, flags] = await Promise.all([
      transaction.get(markerRef),
      transaction.get(memberRef),
      transaction.get(flagsRef),
    ]);
    if (!member.exists || !isActiveMember(member.data() || {})) {
      fail('permission-denied', 'Un membre actif du club est requis.');
    }
    if (!cursorEnabledForMember(flags.data() || {}, uid)) {
      fail('failed-precondition', 'Le compteur cursor n’est pas actif pour ce membre.');
    }
    const markerData = marker.data() || {};
    const alreadyComplete = marker.exists
      && markerData.status === 'complete'
      && markerData.schema_version === SCHEMA_VERSION;

    // Reading every root and target scope before any write makes a concurrent
    // acknowledgement retry the transaction rather than being overwritten.
    const cursorSnapshots = await Promise.all([
      ...Object.values(rootRefs).map(reference => transaction.get(reference)),
      ...scopeWrites.map(item => transaction.get(item.ref)),
    ]);
    let trustedBaselineMs = null;
    if (!alreadyComplete) {
      const migration = await transaction.get(migrationRef);
      const migrationData = migration.data() || {};
      trustedBaselineMs = timestampMillis(migrationData.baseline_at);
      if (migrationData.schema_version !== SCHEMA_VERSION
        || migrationData.status !== 'roots-seeded'
        || trustedBaselineMs == null
        || trustedBaselineMs > nowMs) {
        fail(
          'failed-precondition',
          'La base de migration cursor n’est pas validée par le serveur.',
        );
      }
    }

    const updatedAt = serverTimestamp();
    const rootSnapshots = Object.fromEntries(
      Object.keys(rootRefs).map((section, index) => [section, cursorSnapshots[index]]),
    );
    const targetRootMs = {
      announcements: normalized.announcementsMs,
      events: normalized.fallbackMs,
      teams: normalized.fallbackMs,
      sessions: normalized.fallbackMs,
    };
    let changedCount = 0;
    Object.keys(rootRefs).forEach(section => {
      const existingData = rootSnapshots[section].data() || {};
      const existingMs = rootCursorMillis(section, existingData);
      const mayReplaceSeed = !alreadyComplete && (
        existingMs == null
        || isTrustedMigrationSeed(section, existingData, trustedBaselineMs)
      );
      const finalMs = mayReplaceSeed
        ? targetRootMs[section]
        : Math.max(existingMs ?? targetRootMs[section], targetRootMs[section]);
      if (existingMs === finalMs) return;
      const cursorField = section === 'announcements'
        ? 'last_seen_at'
        : 'global_last_seen_at';
      transaction.set(rootRefs[section], {
        schema_version: SCHEMA_VERSION,
        [cursorField]: timestampFromMillis(finalMs),
        updated_at: updatedAt,
      });
      changedCount += 1;
    });

    const scopeSnapshots = cursorSnapshots.slice(Object.keys(rootRefs).length);
    scopeWrites.forEach((item, index) => {
      const existingMs = timestampMillis(scopeSnapshots[index].data()?.last_seen_at);
      if (existingMs != null && existingMs >= item.timestamp) return;
      transaction.set(item.ref, {
        last_seen_at: timestampFromMillis(item.timestamp),
        updated_at: updatedAt,
      });
      changedCount += 1;
    });

    if (!alreadyComplete) {
      transaction.set(markerRef, {
        schema_version: SCHEMA_VERSION,
        status: 'complete',
        source: 'legacy_local_v1',
        bootstrapped_at: updatedAt,
        scope_count: normalized.scopeCount,
        timestamps_clamped: normalized.timestampsClamped,
      });
      return {
        status: 'bootstrapped',
        schemaVersion: SCHEMA_VERSION,
        changedCount,
      };
    }
    if (changedCount > 0) {
      transaction.update(markerRef, {
        last_merged_at: updatedAt,
        last_merge_scope_count: normalized.scopeCount,
        last_merge_timestamps_clamped: normalized.timestampsClamped,
      });
      return {
        status: 'merged',
        schemaVersion: SCHEMA_VERSION,
        changedCount,
      };
    }
    return {
      status: 'already-complete',
      schemaVersion: SCHEMA_VERSION,
      changedCount: 0,
    };
  });

  if (outcome.changedCount > 0 && reconcileBadge) {
    try {
      await reconcileBadge({
        db,
        clubId: normalized.clubId,
        memberId: uid,
        now: nowMs,
      });
    } catch (error) {
      // Read-state migration has already committed atomically. Badge delivery
      // is best-effort; the client immediately applies the canonical count and
      // later cursor writes retry server reconciliation.
      console.error('Unread cursor bootstrap badge reconciliation failed', error);
    }
  }
  const { changedCount, ...result } = outcome;
  return result;
}

const bootstrapUnreadCursorV1 = onCall(
  { region: REGION, timeoutSeconds: 30, memory: '256MiB', maxInstances: 20 },
  async request => {
    const uid = request.auth?.uid;
    if (!uid) fail('unauthenticated', 'Authentification requise.');
    const { sendCanonicalReadStateBadge } = require('./onReadStateWritten');
    return bootstrapUnreadCursor({
      db: admin.firestore(),
      uid,
      input: request.data,
      reconcileBadge: sendCanonicalReadStateBadge,
    });
  },
);

module.exports = {
  bootstrapUnreadCursorV1,
  bootstrapUnreadCursor,
  normalizeInput,
  cursorEnabledForMember,
  isTrustedMigrationSeed,
  timestampMillis,
  MAX_SCOPE_WRITES,
  MIN_TIMESTAMP_MS,
};
