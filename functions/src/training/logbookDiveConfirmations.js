/**
 * Buddy confirmation flow for Mon Carnet — v2 (WP-28, 2026-07-31).
 *
 * When a member saves a dive with Calypso members in `binomes[]`, each member
 * receives a confirmation request. The dive snapshot stored on each request is
 * PERSONALISED for its recipient:
 *
 *   - binômes are rewritten to the recipient's perspective:
 *     [auteur] + (autres binômes − destinataire). Before WP-28 a recipient
 *     received a list containing themselves and missing the author.
 *   - only SHARED dive facts are included: date, lieu, profondeur, durée,
 *     heures, opération/palanquée, zone, température de l'eau, notes and the
 *     shared condition counters (nuit / mer / marée / déco). Personal fields
 *     (combi, bouteille, lestage, O₂, rôles DP/SF, surveillance, exo, nitrox)
 *     are never copied — everyone records their own (décision Jan 31/07/2026 ;
 *     notes are shared but stay editable on the recipient's copy).
 *
 * Lifecycle (WP-28):
 *   - entry deleted          → pending confirmations are cancelled;
 *   - binôme removed on edit → their pending confirmation is cancelled;
 *   - dive facts edited      → pending snapshots are refreshed in place;
 *   - dive facts edited after a refusal → the refuser is asked again with a
 *     fresh snapshot (décision Jan 31/07/2026). Unchanged facts never re-ask.
 *
 * If older/mobile clients store a Calypso member as a text buddy, the trigger
 * resolves the name conservatively before deciding whether to create a request.
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const {
  collectTokensAndMembers,
  filterByPreference,
  sendNotificationsWithBadge,
} = require('../utils/badge-helper');
const { memberDisplayName: resolveMemberDisplayName } = require('../utils/memberName');

const FUNCTION_REGION = 'europe-west1';
const CONFIRMATIONS = 'logbook_dive_confirmations';

// WP-28 — counters shared by the whole palanquée (conditions / profile).
// Everything else in `counters` is personal per diver. `deco` is shared —
// the palanquée dives one profile (décision Jan 31/07/2026).
const SHARED_COUNTER_KEYS = ['nuit', 'mer', 'maree', 'deco'];
const PERSONAL_COUNTER_KEYS = ['exo', 'nitrox', 'dp', 'sf', 'surveillance'];

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function toTimestamp(value) {
  const d = asDate(value);
  return d ? Timestamp.fromDate(d) : value || null;
}

function dateKey(value) {
  const d = asDate(value);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tsMillis(value) {
  const d = asDate(value);
  return d ? d.getTime() : 0;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function locationsMatch(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
}

function mergeSharedNotes(existingNotes, sharedNotes) {
  const existing = String(existingNotes || '').trim();
  const shared = String(sharedNotes || '').trim();
  if (!shared) return existing || null;
  if (!existing) return shared;
  if (normalizeText(existing).includes(normalizeText(shared))) return existing;
  return `${existing}\n\n${shared}`;
}

function memberDisplayName(data = {}) {
  return resolveMemberDisplayName(data, 'Membre');
}

function binomeDisplayName(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  if (typeof item !== 'object') return '';
  return item.display_name || item.displayName || item.name || item.nom || '';
}

function removeEmpty(payload) {
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

// WP-28 — only-true-values convention, filtered per audience.
function sharedCounters(counters = {}) {
  const out = {};
  if (!counters || typeof counters !== 'object') return out;
  for (const key of SHARED_COUNTER_KEYS) {
    if (counters[key] === true) out[key] = true;
  }
  return out;
}

function personalCounters(counters = {}) {
  const out = {};
  if (!counters || typeof counters !== 'object') return out;
  for (const key of PERSONAL_COUNTER_KEYS) {
    if (counters[key] === true) out[key] = true;
  }
  return out;
}

function countersEqual(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    if (((a || {})[key] === true) !== (((b || {})[key]) === true)) return false;
  }
  return true;
}

function collectBinomeCandidates(entry = {}) {
  const candidates = [];
  const seen = new Set();
  const rawBinomes = Array.isArray(entry.binomes) ? entry.binomes : [];
  for (const item of rawBinomes) {
    if (!item || typeof item !== 'object') continue;
    const memberId = item.member_id || item.memberId;
    const type = item.type || 'member';
    const displayName = binomeDisplayName(item);
    if (type === 'member' && memberId) {
      if (seen.has(`id:${memberId}`)) continue;
      seen.add(`id:${memberId}`);
      candidates.push({
        memberId,
        displayName: displayName || 'Membre',
        explicit: true,
      });
      continue;
    }
    if (!displayName) continue;
    const key = `name:${normalizeText(displayName)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      memberId: null,
      displayName,
      explicit: false,
    });
  }

  const legacyBuddies = Array.isArray(entry.buddies) ? entry.buddies : [];
  for (const item of legacyBuddies) {
    const memberId =
      item && typeof item === 'object' ? item.member_id || item.memberId : null;
    const displayName = binomeDisplayName(item);
    if (memberId) {
      if (seen.has(`id:${memberId}`)) continue;
      seen.add(`id:${memberId}`);
      candidates.push({
        memberId,
        displayName: displayName || 'Membre',
        explicit: true,
      });
      continue;
    }
    if (!displayName) continue;
    const key = `name:${normalizeText(displayName)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      memberId: null,
      displayName,
      explicit: false,
    });
  }
  return candidates;
}

function exactTokenNameMatch(rawName, memberName) {
  const candidate = normalizeText(rawName);
  const target = normalizeText(memberName);
  if (!candidate || !target) return false;
  if (candidate === target) return true;

  const candidateParts = candidate.split(' ').filter((p) => p.length >= 3);
  const targetParts = new Set(target.split(' ').filter((p) => p.length >= 3));
  if (candidateParts.length < 2 || targetParts.size < 2) return false;
  return candidateParts.every((part) => targetParts.has(part));
}

async function resolveTextBinomes(db, clubId, candidates) {
  if (!candidates.some((candidate) => !candidate.memberId)) {
    return candidates.filter((candidate) => candidate.memberId);
  }

  const membersSnap = await db
    .collection('clubs').doc(clubId)
    .collection('members')
    .get();
  const members = membersSnap.docs.map((doc) => ({
    id: doc.id,
    displayName: memberDisplayName(doc.data()),
  }));

  const resolved = [];
  const seenIds = new Set();
  for (const candidate of candidates) {
    if (candidate.memberId) {
      if (seenIds.has(candidate.memberId)) continue;
      seenIds.add(candidate.memberId);
      resolved.push(candidate);
      continue;
    }

    const matches = members.filter((member) =>
      exactTokenNameMatch(candidate.displayName, member.displayName)
    );
    if (matches.length !== 1) continue;
    const match = matches[0];
    if (seenIds.has(match.id)) continue;
    seenIds.add(match.id);
    resolved.push({
      memberId: match.id,
      displayName: match.displayName,
      explicit: false,
      resolvedFromName: candidate.displayName,
    });
  }
  return resolved;
}

async function extractMemberBinomes(db, clubId, entry = {}) {
  return resolveTextBinomes(db, clubId, collectBinomeCandidates(entry));
}

/**
 * WP-28 — SHARED dive facts only. Personal fields (combi, combi_type, tank,
 * lestage_kg, o2_pct, personal counters) are deliberately absent. `zone` and
 * `water_temp_c` are shared context (zone counts for the Zélande MIL keys;
 * water_temp_c ships with the app/web forms in a later release but is passed
 * through as soon as an entry carries it). Binômes/buddies are added per
 * recipient by `snapshotForTarget`.
 */
function buildDiveSnapshot(entry = {}) {
  return removeEmpty({
    date: toTimestamp(entry.date),
    location_id: entry.location_id || null,
    location_name: entry.location_name || entry.lieu || '',
    country: entry.country || null,
    depth_max_meters: numberOrNull(entry.depth_max_meters),
    duration_minutes: numberOrNull(entry.duration_minutes),
    counters: sharedCounters(entry.counters),
    notes: entry.notes || null,
    entry_time: toTimestamp(entry.entry_time),
    exit_time: toTimestamp(entry.exit_time),
    entry_time_str: entry.entry_time_str || null,
    exit_time_str: entry.exit_time_str || null,
    operation_id: entry.operation_id || null,
    operation_title: entry.operation_title || null,
    palanquee_id: entry.palanquee_id || null,
    zone: entry.zone || null,
    water_temp_c: numberOrNull(entry.water_temp_c),
  });
}

function isSameBinome(item, memberId, displayName) {
  if (!item) return false;
  if (typeof item === 'string') {
    return !!displayName && normalizeText(item) === normalizeText(displayName);
  }
  if (typeof item !== 'object') return false;
  const id = item.member_id || item.memberId;
  if (id) return !!memberId && id === memberId;
  const name = binomeDisplayName(item);
  return !!name && !!displayName && normalizeText(name) === normalizeText(displayName);
}

// Legacy entries (pre-binomes clients) only carry `buddies[]`.
function rawBinomesOf(entry = {}) {
  const binomes = Array.isArray(entry.binomes) ? entry.binomes : [];
  if (binomes.length > 0) return binomes;
  const buddies = Array.isArray(entry.buddies) ? entry.buddies : [];
  return buddies
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim() ? { type: 'external', display_name: item.trim(), displayName: item.trim() } : null;
      }
      if (!item || typeof item !== 'object') return null;
      const memberId = item.member_id || item.memberId || null;
      const name = binomeDisplayName(item);
      if (!memberId && !name) return null;
      return removeEmpty({
        type: memberId ? 'member' : 'external',
        member_id: memberId,
        memberId,
        display_name: name || null,
        displayName: name || null,
        club: item.external_organization || item.club || null,
      });
    })
    .filter(Boolean);
}

/**
 * WP-28 — rewrite the binômes list to the recipient's perspective:
 * [auteur] + (autres − destinataire). External / text buddies are kept as-is;
 * the author is deduplicated should they appear in their own list.
 */
function binomesForTarget(entry = {}, target, sourceMemberId, sourceMemberName) {
  const raw = rawBinomesOf(entry);
  const others = raw.filter((item) =>
    !isSameBinome(item, target.memberId, target.displayName)
    && !isSameBinome(item, sourceMemberId, sourceMemberName));
  const now = Timestamp.now();
  return [
    {
      type: 'member',
      member_id: sourceMemberId,
      memberId: sourceMemberId,
      display_name: sourceMemberName,
      displayName: sourceMemberName,
      added_at: now,
      addedAt: now,
    },
    ...others.map((item) =>
      (typeof item === 'string'
        ? { type: 'external', display_name: item, displayName: item }
        : item)),
  ];
}

// Same derivation the mobile form applies for backwards compatibility.
function legacyBuddiesFromBinomes(binomes = []) {
  return (Array.isArray(binomes) ? binomes : [])
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim() ? { name: item.trim() } : null;
      }
      if (!item || typeof item !== 'object') return null;
      const name = binomeDisplayName(item)
        || [item.niveau, item.club].filter(Boolean).join(' · ')
        || 'Binôme';
      return removeEmpty({
        member_id: item.member_id || item.memberId || null,
        name,
        external_organization: item.club || null,
      });
    })
    .filter(Boolean);
}

function snapshotForTarget(baseSnapshot, entry, target, sourceMemberId, sourceMemberName) {
  const binomes = binomesForTarget(entry, target, sourceMemberId, sourceMemberName);
  return {
    ...baseSnapshot,
    binomes,
    buddies: legacyBuddiesFromBinomes(binomes),
  };
}

function simplifyBinomes(binomes = []) {
  return (Array.isArray(binomes) ? binomes : []).map((b) =>
    (typeof b === 'string'
      ? { id: null, name: normalizeText(b) }
      : { id: (b && (b.member_id || b.memberId)) || null, name: normalizeText(binomeDisplayName(b)) }));
}

/**
 * WP-28 — did the shared facts change between two snapshots?
 * With `includeNotes: false` the comparison ignores notes and binômes: used to
 * decide whether a refuser should be asked AGAIN (typo fixes in notes or
 * buddy-list cosmetics must not re-ask). The full comparison decides whether a
 * pending snapshot needs an in-place refresh.
 */
function snapshotDiffers(a = {}, b = {}, { includeNotes = true } = {}) {
  if (dateKey(a.date) !== dateKey(b.date)) return true;
  if (normalizeText(a.location_name) !== normalizeText(b.location_name)) return true;
  if ((a.country || null) !== (b.country || null)) return true;
  if (numberOrNull(a.depth_max_meters) !== numberOrNull(b.depth_max_meters)) return true;
  if (numberOrNull(a.duration_minutes) !== numberOrNull(b.duration_minutes)) return true;
  if ((a.entry_time_str || null) !== (b.entry_time_str || null)) return true;
  if ((a.exit_time_str || null) !== (b.exit_time_str || null)) return true;
  if ((a.zone || null) !== (b.zone || null)) return true;
  if (numberOrNull(a.water_temp_c) !== numberOrNull(b.water_temp_c)) return true;
  if ((a.operation_id || null) !== (b.operation_id || null)) return true;
  if (!countersEqual(sharedCounters(a.counters), sharedCounters(b.counters))) return true;
  if (includeNotes) {
    if ((a.notes || null) !== (b.notes || null)) return true;
    if (JSON.stringify(simplifyBinomes(a.binomes)) !== JSON.stringify(simplifyBinomes(b.binomes))) {
      return true;
    }
  }
  return false;
}

function compareDive(snapshot = {}, entry = {}) {
  const differences = [];
  if (dateKey(snapshot.date) !== dateKey(entry.date)) {
    differences.push({
      field: 'date',
      source: dateKey(snapshot.date),
      existing: dateKey(entry.date),
    });
  }

  const sourceLocation = normalizeText(snapshot.location_name || snapshot.lieu);
  const existingLocation = normalizeText(entry.location_name || entry.lieu);
  const sameLocation = locationsMatch(sourceLocation, existingLocation);
  if (!sameLocation) {
    differences.push({
      field: 'location_name',
      source: snapshot.location_name || '',
      existing: entry.location_name || entry.lieu || '',
    });
  }

  const sourceDepth = numberOrNull(snapshot.depth_max_meters);
  const existingDepth = numberOrNull(entry.depth_max_meters);
  if (sourceDepth !== existingDepth) {
    differences.push({
      field: 'depth_max_meters',
      source: sourceDepth,
      existing: existingDepth,
    });
  }

  const sourceDuration = numberOrNull(snapshot.duration_minutes);
  const existingDuration = numberOrNull(entry.duration_minutes);
  if (sourceDuration !== existingDuration) {
    differences.push({
      field: 'duration_minutes',
      source: sourceDuration,
      existing: existingDuration,
    });
  }

  const sameDate = dateKey(snapshot.date) === dateKey(entry.date);
  const similar =
    sameDate &&
    (sameLocation ||
      Math.abs((sourceDepth || 0) - (existingDepth || 0)) <= 3 ||
      Math.abs((sourceDuration || 0) - (existingDuration || 0)) <= 10);

  return {
    matchType: differences.length === 0 ? 'identical' : similar ? 'similar' : 'none',
    differences,
  };
}

async function findExistingMatch(db, clubId, targetMemberId, snapshot) {
  const day = asDate(snapshot.date);
  if (!day) return { matchType: 'none', differences: [], entryId: null };

  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const snap = await db
    .collection('clubs').doc(clubId)
    .collection('student_logbook_entries')
    .where('member_id', '==', targetMemberId)
    .get();

  let best = { matchType: 'none', differences: [], entryId: null };
  for (const doc of snap.docs) {
    const entry = doc.data();
    const entryDate = asDate(entry.date);
    if (!entryDate || entryDate < start || entryDate >= end) continue;

    const cmp = compareDive(snapshot, entry);
    if (cmp.matchType === 'identical') {
      return { ...cmp, entryId: doc.id };
    }
    if (cmp.matchType === 'similar' && best.matchType === 'none') {
      best = { ...cmp, entryId: doc.id };
    }
  }
  return best;
}

function confirmationBody(snapshot = {}) {
  const parts = [snapshot.location_name || 'Plongée'];
  const depth = numberOrNull(snapshot.depth_max_meters);
  const duration = numberOrNull(snapshot.duration_minutes);
  if (depth != null) parts.push(`${depth} m`);
  if (duration != null) parts.push(`${duration} min`);
  return parts.join(' - ');
}

async function sendMemberNotification(clubId, recipientId, senderId, title, body, data) {
  const db = admin.firestore();
  const memberDoc = await db
    .collection('clubs').doc(clubId)
    .collection('members').doc(recipientId).get();
  if (!memberDoc.exists) return { successCount: 0, failureCount: 0 };

  const docs = filterByPreference([memberDoc], 'logbook_confirmations');
  const { memberTokenGroups } = collectTokensAndMembers(docs, senderId || null);
  if (memberTokenGroups.size === 0) return { successCount: 0, failureCount: 0 };

  const basePayload = {
    notification: { title, body },
    data: {
      ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '')])),
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'event_messages',
        priority: 'high',
        sound: 'default',
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-expiration': '0',
      },
      payload: {
        aps: {
          alert: { title, body },
          sound: 'default',
          'content-available': 1,
        },
      },
    },
  };

  return sendNotificationsWithBadge(clubId, memberTokenGroups, basePayload, 'event_messages');
}

/**
 * WP-28 — defensive cleanup applied when a confirmation is ANSWERED. Pending
 * confirmations created before WP-28 still carry the author's full entry
 * (recipient in the binômes, equipment and personal counters included); this
 * re-derives a clean, recipient-perspective snapshot from whatever is stored.
 * Snapshots created after WP-28 pass through unchanged (idempotent).
 */
function sanitizeSnapshotForTarget(snapshot = {}, targetMemberId, targetName, sourceMemberId, sourceMemberName) {
  const cleaned = buildDiveSnapshot(snapshot);
  const raw = rawBinomesOf(snapshot);
  const containsTarget = raw.some((b) => isSameBinome(b, targetMemberId, targetName));
  const containsSource = raw.some((b) => isSameBinome(b, sourceMemberId, sourceMemberName));
  const binomes = (containsTarget || !containsSource)
    ? binomesForTarget(
        { binomes: raw },
        { memberId: targetMemberId, displayName: targetName || '' },
        sourceMemberId,
        sourceMemberName
      )
    : raw;
  return { ...cleaned, binomes, buddies: legacyBuddiesFromBinomes(binomes) };
}

function buildCopyPayload(cleanSnapshot, targetMemberId, targetMemberName, confirmationId, sourceMemberId, sourceEntryId) {
  return removeEmpty({
    member_id: targetMemberId,
    member_name: targetMemberName || null,
    source: 'shared_logbook',
    date: cleanSnapshot.date,
    location_id: cleanSnapshot.location_id || null,
    location_name: cleanSnapshot.location_name || '',
    country: cleanSnapshot.country || null,
    operation_id: cleanSnapshot.operation_id || null,
    operation_title: cleanSnapshot.operation_title || null,
    palanquee_id: cleanSnapshot.palanquee_id || null,
    depth_max_meters: numberOrNull(cleanSnapshot.depth_max_meters),
    duration_minutes: numberOrNull(cleanSnapshot.duration_minutes),
    counters: sharedCounters(cleanSnapshot.counters),
    notes: cleanSnapshot.notes || null,
    binomes: Array.isArray(cleanSnapshot.binomes) ? cleanSnapshot.binomes : [],
    buddies: Array.isArray(cleanSnapshot.buddies) ? cleanSnapshot.buddies : [],
    entry_time: cleanSnapshot.entry_time || null,
    exit_time: cleanSnapshot.exit_time || null,
    entry_time_str: cleanSnapshot.entry_time_str || null,
    exit_time_str: cleanSnapshot.exit_time_str || null,
    zone: cleanSnapshot.zone || null,
    water_temp_c: numberOrNull(cleanSnapshot.water_temp_c),
    validation_status: 'buddy_confirmed',
    shared_from_member_id: sourceMemberId,
    shared_from_entry_id: sourceEntryId,
    logbook_confirmation_id: confirmationId,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
}

/**
 * WP-28 — « Confirmer et remplacer » only overwrites the SHARED dive facts of
 * the member's existing entry. Everything personal stays untouched: combi,
 * bouteille, lestage, o2_pct, dive_number, member_name, source, binômes (the
 * member's own perspective) and the personal counter keys, which are merged
 * back into the counters map (an update replaces the whole map value).
 * Non-destructive for absent shared scalars: they are simply not written.
 */
function buildReplaceUpdate(cleanSnapshot, existingEntry, confirmationId, sourceMemberId, sourceEntryId) {
  const mergedCounters = {
    ...personalCounters((existingEntry || {}).counters),
    ...sharedCounters(cleanSnapshot.counters),
  };
  return removeEmpty({
    date: cleanSnapshot.date,
    location_id: cleanSnapshot.location_id || null,
    location_name: cleanSnapshot.location_name || null,
    country: cleanSnapshot.country || null,
    operation_id: cleanSnapshot.operation_id || null,
    operation_title: cleanSnapshot.operation_title || null,
    palanquee_id: cleanSnapshot.palanquee_id || null,
    depth_max_meters: numberOrNull(cleanSnapshot.depth_max_meters),
    duration_minutes: numberOrNull(cleanSnapshot.duration_minutes),
    counters: mergedCounters,
    notes: cleanSnapshot.notes || null,
    entry_time: cleanSnapshot.entry_time || null,
    exit_time: cleanSnapshot.exit_time || null,
    entry_time_str: cleanSnapshot.entry_time_str || null,
    exit_time_str: cleanSnapshot.exit_time_str || null,
    zone: cleanSnapshot.zone || null,
    water_temp_c: numberOrNull(cleanSnapshot.water_temp_c),
    validation_status: 'buddy_confirmed',
    shared_from_member_id: sourceMemberId,
    shared_from_entry_id: sourceEntryId,
    logbook_confirmation_id: confirmationId,
    updated_at: FieldValue.serverTimestamp(),
  });
}

async function cancelPendingConfirmations(db, clubId, entryId, reason) {
  const snap = await db
    .collection('clubs').doc(clubId)
    .collection(CONFIRMATIONS)
    .where('source_entry_id', '==', entryId)
    .get();
  for (const doc of snap.docs) {
    if (doc.data().status !== 'pending') continue;
    await doc.ref.update({
      status: 'cancelled',
      cancelled_reason: reason,
      updated_at: FieldValue.serverTimestamp(),
    });
  }
}

async function createConfirmation(
  db, clubId, entryId, sourceMemberId, sourceMemberName, target, targetSnapshot, previousConfirmationId
) {
  const match = await findExistingMatch(db, clubId, target.memberId, targetSnapshot);
  const docRef = await db
    .collection('clubs').doc(clubId)
    .collection(CONFIRMATIONS)
    .add(removeEmpty({
      source_entry_id: entryId,
      source_member_id: sourceMemberId,
      source_member_name: sourceMemberName,
      target_member_id: target.memberId,
      target_member_name: target.displayName,
      status: 'pending',
      dive_snapshot: targetSnapshot,
      match_type: match.matchType,
      matched_entry_id: match.entryId,
      differences: match.differences,
      // WP-28 — re-ask after a refusal keeps the refused doc as history.
      previous_confirmation_id: previousConfirmationId || null,
      reasked_after_decline: previousConfirmationId ? true : null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }));

  await sendMemberNotification(
    clubId,
    target.memberId,
    sourceMemberId,
    `${sourceMemberName} te demande de confirmer ta plongée`,
    `${confirmationBody(targetSnapshot)}. Confirme si vous avez fait cette plongée ensemble.`,
    {
      type: 'logbook_dive_confirmation',
      club_id: clubId,
      confirmation_id: docRef.id,
      source_entry_id: entryId,
    }
  );
  return docRef;
}

const onLogbookDiveBuddiesChanged = onDocumentWritten(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/student_logbook_entries/{entryId}',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (event) => {
    const { clubId, entryId } = event.params;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    const db = admin.firestore();

    // WP-28 — a deleted dive cancels its outstanding requests so a binôme can
    // no longer confirm (and import) an entry that no longer exists.
    if (!after) {
      if (!before) return;
      await cancelPendingConfirmations(db, clubId, entryId, 'entry_deleted');
      return;
    }

    // WP-24 (D4) — un import OCR ne déclenche JAMAIS de demandes de
    // confirmation binôme (les binômes viennent d'une vieille page papier).
    // Pool sessions and shared copies never trigger either.
    if (after.source === 'piscine' || after.source === 'shared_logbook'
        || after.source === 'ocr_import' || after.import_origin === 'ocr') return;

    const sourceMemberId = after.member_id;
    if (!sourceMemberId) return;

    const targets = (await extractMemberBinomes(db, clubId, after))
      .filter((b) => b.memberId && b.memberId !== sourceMemberId);

    // All confirmations already emitted for this entry, grouped per target.
    const existingSnap = await db
      .collection('clubs').doc(clubId)
      .collection(CONFIRMATIONS)
      .where('source_entry_id', '==', entryId)
      .get();
    const byTarget = new Map();
    for (const doc of existingSnap.docs) {
      const tid = doc.data().target_member_id;
      if (!byTarget.has(tid)) byTarget.set(tid, []);
      byTarget.get(tid).push(doc);
    }

    // WP-28 — binôme removed on edit → cancel their pending request.
    const targetIds = new Set(targets.map((t) => t.memberId));
    for (const [tid, docs] of byTarget.entries()) {
      if (targetIds.has(tid)) continue;
      for (const doc of docs) {
        if (doc.data().status !== 'pending') continue;
        await doc.ref.update({
          status: 'cancelled',
          cancelled_reason: 'binome_removed',
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    }

    if (targets.length === 0) return;

    const sourceMemberSnap = await db
      .collection('clubs').doc(clubId)
      .collection('members').doc(sourceMemberId).get();
    const sourceMemberName = sourceMemberSnap.exists
      ? memberDisplayName(sourceMemberSnap.data())
      : after.member_name || 'Un membre';
    const baseSnapshot = buildDiveSnapshot(after);

    for (const target of targets) {
      const targetSnapshot = snapshotForTarget(
        baseSnapshot, after, target, sourceMemberId, sourceMemberName
      );
      const docs = byTarget.get(target.memberId) || [];
      const pending = docs.find((d) => d.data().status === 'pending');
      const answered = docs.find((d) => String(d.data().status || '').startsWith('confirmed'));
      const declined = docs
        .filter((d) => d.data().status === 'declined')
        .sort((x, y) => tsMillis(y.data().responded_at) - tsMillis(x.data().responded_at))[0];

      if (pending) {
        // WP-28 — refresh the pending snapshot in place when the dive changed
        // (no new notification; the pending card simply shows current data).
        if (snapshotDiffers(pending.data().dive_snapshot || {}, targetSnapshot)) {
          const match = await findExistingMatch(db, clubId, target.memberId, targetSnapshot);
          await pending.ref.update({
            dive_snapshot: targetSnapshot,
            match_type: match.matchType,
            matched_entry_id: match.entryId,
            differences: match.differences,
            snapshot_refreshed_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          });
        }
        continue;
      }
      if (answered) continue;
      if (declined
          && !snapshotDiffers(declined.data().dive_snapshot || {}, targetSnapshot, { includeNotes: false })) {
        // Refused and no substantive change since → never spam the refuser.
        continue;
      }
      await createConfirmation(
        db, clubId, entryId, sourceMemberId, sourceMemberName,
        target, targetSnapshot, declined ? declined.id : null
      );
    }
  }
);

const respondToLogbookDiveConfirmation = onCall(
  {
    region: FUNCTION_REGION,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Authentification requise');

    const clubId =
      typeof request.data?.clubId === 'string' && request.data.clubId.trim()
        ? request.data.clubId.trim()
        : 'calypso';
    const confirmationId = String(request.data?.confirmationId || '').trim();
    const action = String(request.data?.action || '').trim();
    const matchedEntryId = String(request.data?.matchedEntryId || '').trim();
    if (!confirmationId) throw new HttpsError('invalid-argument', 'confirmationId manquant');

    const allowed = new Set([
      'confirm_copy',
      'confirm_existing_identical',
      'confirm_merge_notes',
      'confirm_keep_existing',
      'confirm_replace_existing',
      'confirm_no_import',
      'decline',
    ]);
    if (!allowed.has(action)) throw new HttpsError('invalid-argument', 'Action invalide');

    const db = admin.firestore();
    const ref = db.collection('clubs').doc(clubId).collection(CONFIRMATIONS).doc(confirmationId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Confirmation introuvable');
    const confirmation = snap.data();

    if (confirmation.target_member_id !== uid) {
      throw new HttpsError('permission-denied', 'Seul le membre concerné peut répondre');
    }
    if (confirmation.status !== 'pending') {
      return {
        status: confirmation.status,
        copiedEntryId: confirmation.copied_entry_id || null,
        matchedEntryId: confirmation.matched_entry_id || null,
      };
    }

    const targetName = confirmation.target_member_name || '';
    // WP-28 — sanitize old-style snapshots at answer time (remap + strip).
    const snapshot = sanitizeSnapshotForTarget(
      confirmation.dive_snapshot || {},
      uid,
      targetName,
      confirmation.source_member_id,
      confirmation.source_member_name || 'Un membre'
    );

    // WP-28 — the copy carries the member's REAL display name, not the
    // informal spelling the author typed in their binôme chip.
    const respondentSnap = await db
      .collection('clubs').doc(clubId)
      .collection('members').doc(uid).get();
    const respondentName = respondentSnap.exists
      ? memberDisplayName(respondentSnap.data())
      : targetName;

    let status = 'declined';
    let copiedEntryId = null;
    let finalMatchedEntryId = matchedEntryId || confirmation.matched_entry_id || null;

    if (action === 'decline') {
      status = 'declined';
    } else if (action === 'confirm_copy') {
      // Recheck immediately before writing. A matching entry can have been
      // added after the request was created, or an older request can carry an
      // incomplete match result. Never create a second carnet entry then.
      const liveMatch = await findExistingMatch(db, clubId, uid, snapshot);
      if (liveMatch.entryId) {
        finalMatchedEntryId = liveMatch.entryId;
        status = liveMatch.matchType === 'identical'
          ? 'confirmed_existing_identical'
          : 'confirmed_existing_different';
      } else {
        const entryRef = db.collection('clubs').doc(clubId).collection('student_logbook_entries').doc();
        await entryRef.set(buildCopyPayload(
          snapshot,
          uid,
          respondentName,
          confirmationId,
          confirmation.source_member_id,
          confirmation.source_entry_id
        ));
        copiedEntryId = entryRef.id;
        status = 'confirmed_copied';
      }
    } else if (action === 'confirm_existing_identical') {
      if (!finalMatchedEntryId) {
        const match = await findExistingMatch(db, clubId, uid, snapshot);
        finalMatchedEntryId = match.entryId;
      }
      status = 'confirmed_existing_identical';
    } else if (action === 'confirm_merge_notes') {
      if (!finalMatchedEntryId) throw new HttpsError('invalid-argument', 'matchedEntryId manquant');
      const existingRef = db.collection('clubs').doc(clubId)
        .collection('student_logbook_entries').doc(finalMatchedEntryId);
      const existingSnap = await existingRef.get();
      if (!existingSnap.exists) {
        throw new HttpsError('not-found', 'Plongée existante introuvable');
      }
      if (existingSnap.data().member_id !== uid) {
        throw new HttpsError('permission-denied', 'Cette plongée ne t’appartient pas');
      }
      await existingRef.update({
        notes: mergeSharedNotes(existingSnap.data().notes, snapshot.notes),
        validation_status: 'buddy_confirmed',
        shared_from_member_id: confirmation.source_member_id,
        shared_from_entry_id: confirmation.source_entry_id,
        logbook_confirmation_id: confirmationId,
        updated_at: FieldValue.serverTimestamp(),
      });
      status = 'confirmed_existing_notes_merged';
    } else if (action === 'confirm_keep_existing') {
      status = 'confirmed_existing_different';
    } else if (action === 'confirm_no_import') {
      status = 'confirmed_no_import';
    } else if (action === 'confirm_replace_existing') {
      if (!finalMatchedEntryId) throw new HttpsError('invalid-argument', 'matchedEntryId manquant');
      const existingRef = db.collection('clubs').doc(clubId)
        .collection('student_logbook_entries').doc(finalMatchedEntryId);
      const existingSnap = await existingRef.get();
      if (!existingSnap.exists) {
        throw new HttpsError('not-found', 'Plongée existante introuvable');
      }
      if (existingSnap.data().member_id !== uid) {
        throw new HttpsError('permission-denied', 'Cette plongée ne t’appartient pas');
      }
      await existingRef.update(buildReplaceUpdate(
        snapshot,
        existingSnap.data(),
        confirmationId,
        confirmation.source_member_id,
        confirmation.source_entry_id
      ));
      status = 'confirmed_existing_different';
    }

    await ref.update({
      status,
      copied_entry_id: copiedEntryId,
      matched_entry_id: finalMatchedEntryId,
      responded_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    const labels = {
      confirmed_copied: 'confirmée et copiée dans son carnet',
      confirmed_existing_identical: 'confirmée : une plongée identique existait déjà',
      confirmed_existing_notes_merged: 'confirmée : ses remarques ont été ajoutées à sa plongée existante',
      confirmed_existing_different: 'confirmée : la plongée existante diffère',
      confirmed_no_import: 'confirmée sans import',
      declined: 'refusée',
    };
    await sendMemberNotification(
      clubId,
      confirmation.source_member_id,
      uid,
      `${respondentName || 'Un membre'} a répondu à ta plongée`,
      `${respondentName || 'Un membre'} a ${labels[status] || status} la plongée.`,
      {
        type: 'logbook_dive_confirmation_result',
        club_id: clubId,
        confirmation_id: confirmationId,
        source_entry_id: confirmation.source_entry_id,
      }
    );

    return { status, copiedEntryId, matchedEntryId: finalMatchedEntryId };
  }
);

module.exports = {
  onLogbookDiveBuddiesChanged,
  respondToLogbookDiveConfirmation,
  // Exported for unit tests (WP-28)
  buildDiveSnapshot,
  locationsMatch,
  mergeSharedNotes,
  sharedCounters,
  personalCounters,
  countersEqual,
  isSameBinome,
  rawBinomesOf,
  binomesForTarget,
  legacyBuddiesFromBinomes,
  snapshotForTarget,
  simplifyBinomes,
  snapshotDiffers,
  sanitizeSnapshotForTarget,
  buildCopyPayload,
  buildReplaceUpdate,
  compareDive,
};
