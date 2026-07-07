/**
 * Buddy confirmation flow for Mon Carnet.
 *
 * When a member saves a dive with Calypso members in `binomes[]`, each member
 * receives a confirmation request. If older/mobile clients store a Calypso
 * member as a text buddy, the trigger resolves the name conservatively before
 * deciding whether to create a request.
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

const FUNCTION_REGION = 'europe-west1';
const CONFIRMATIONS = 'logbook_dive_confirmations';

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

function memberDisplayName(data = {}) {
  const name = `${data.prenom || data.first_name || ''} ${data.nom || data.last_name || ''}`.trim();
  return name || data.displayName || data.display_name || 'Membre';
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

function buildDiveSnapshot(entry = {}) {
  return removeEmpty({
    date: toTimestamp(entry.date),
    location_id: entry.location_id || null,
    location_name: entry.location_name || entry.lieu || '',
    country: entry.country || null,
    depth_max_meters: numberOrNull(entry.depth_max_meters),
    duration_minutes: numberOrNull(entry.duration_minutes),
    counters: entry.counters || {},
    notes: entry.notes || null,
    entry_time: toTimestamp(entry.entry_time),
    exit_time: toTimestamp(entry.exit_time),
    entry_time_str: entry.entry_time_str || null,
    exit_time_str: entry.exit_time_str || null,
    operation_id: entry.operation_id || null,
    operation_title: entry.operation_title || null,
    palanquee_id: entry.palanquee_id || null,
    binomes: Array.isArray(entry.binomes) ? entry.binomes : [],
    buddies: Array.isArray(entry.buddies) ? entry.buddies : [],
    combi: entry.combi || null,
    combi_type: entry.combi_type || null,
    tank: entry.tank || null,
    lestage_kg: numberOrNull(entry.lestage_kg),
  });
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
  const sameLocation = sourceLocation && existingLocation && sourceLocation === existingLocation;
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

const onLogbookDiveBuddiesChanged = onDocumentWritten(
  {
    region: FUNCTION_REGION,
    document: 'clubs/{clubId}/student_logbook_entries/{entryId}',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (event) => {
    const { clubId, entryId } = event.params;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after || after.source === 'piscine' || after.source === 'shared_logbook') return;

    const sourceMemberId = after.member_id;
    if (!sourceMemberId) return;

    const db = admin.firestore();
    const targets = (await extractMemberBinomes(db, clubId, after))
      .filter((b) => b.memberId && b.memberId !== sourceMemberId);
    if (targets.length === 0) return;

    const sourceMemberSnap = await db
      .collection('clubs').doc(clubId)
      .collection('members').doc(sourceMemberId).get();
    const sourceMemberName = sourceMemberSnap.exists
      ? memberDisplayName(sourceMemberSnap.data())
      : after.member_name || 'Un membre';
    const snapshot = buildDiveSnapshot(after);

    for (const target of targets) {
      const existing = await db
        .collection('clubs').doc(clubId)
        .collection(CONFIRMATIONS)
        .where('source_entry_id', '==', entryId)
        .where('target_member_id', '==', target.memberId)
        .limit(1)
        .get();
      if (!existing.empty) continue;

      const match = await findExistingMatch(db, clubId, target.memberId, snapshot);
      const docRef = await db
        .collection('clubs').doc(clubId)
        .collection(CONFIRMATIONS)
        .add({
          source_entry_id: entryId,
          source_member_id: sourceMemberId,
          source_member_name: sourceMemberName,
          target_member_id: target.memberId,
          target_member_name: target.displayName,
          status: 'pending',
          dive_snapshot: snapshot,
          match_type: match.matchType,
          matched_entry_id: match.entryId,
          differences: match.differences,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });

      await sendMemberNotification(
        clubId,
        target.memberId,
        sourceMemberId,
        `${sourceMemberName} te demande de confirmer ta plongée`,
        `${confirmationBody(snapshot)}. Confirme si vous avez fait cette plongée ensemble.`,
        {
          type: 'logbook_dive_confirmation',
          club_id: clubId,
          confirmation_id: docRef.id,
          source_entry_id: entryId,
        }
      );
    }
  }
);

function copyPayloadFromSnapshot(snapshot, targetMemberId, targetMemberName, confirmationId, sourceMemberId, sourceEntryId) {
  return removeEmpty({
    member_id: targetMemberId,
    member_name: targetMemberName || null,
    source: 'shared_logbook',
    date: snapshot.date,
    location_id: snapshot.location_id || null,
    location_name: snapshot.location_name || '',
    country: snapshot.country || null,
    operation_id: snapshot.operation_id || null,
    operation_title: snapshot.operation_title || null,
    palanquee_id: snapshot.palanquee_id || null,
    depth_max_meters: numberOrNull(snapshot.depth_max_meters),
    duration_minutes: numberOrNull(snapshot.duration_minutes),
    counters: snapshot.counters || {},
    notes: snapshot.notes || null,
    buddies: Array.isArray(snapshot.buddies) ? snapshot.buddies : [],
    binomes: Array.isArray(snapshot.binomes) ? snapshot.binomes : [],
    entry_time: snapshot.entry_time || null,
    exit_time: snapshot.exit_time || null,
    entry_time_str: snapshot.entry_time_str || null,
    exit_time_str: snapshot.exit_time_str || null,
    combi: snapshot.combi || null,
    combi_type: snapshot.combi_type || null,
    tank: snapshot.tank || null,
    lestage_kg: numberOrNull(snapshot.lestage_kg),
    validation_status: 'buddy_confirmed',
    shared_from_member_id: sourceMemberId,
    shared_from_entry_id: sourceEntryId,
    logbook_confirmation_id: confirmationId,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
}

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

    const snapshot = confirmation.dive_snapshot || {};
    const targetName = confirmation.target_member_name || '';
    let status = 'declined';
    let copiedEntryId = null;
    let finalMatchedEntryId = matchedEntryId || confirmation.matched_entry_id || null;

    if (action === 'decline') {
      status = 'declined';
    } else if (action === 'confirm_copy') {
      const entryRef = db.collection('clubs').doc(clubId).collection('student_logbook_entries').doc();
      await entryRef.set(copyPayloadFromSnapshot(
        snapshot,
        uid,
        targetName,
        confirmationId,
        confirmation.source_member_id,
        confirmation.source_entry_id
      ));
      copiedEntryId = entryRef.id;
      status = 'confirmed_copied';
    } else if (action === 'confirm_existing_identical') {
      if (!finalMatchedEntryId) {
        const match = await findExistingMatch(db, clubId, uid, snapshot);
        finalMatchedEntryId = match.entryId;
      }
      status = 'confirmed_existing_identical';
    } else if (action === 'confirm_keep_existing') {
      status = 'confirmed_existing_different';
    } else if (action === 'confirm_no_import') {
      status = 'confirmed_no_import';
    } else if (action === 'confirm_replace_existing') {
      if (!finalMatchedEntryId) throw new HttpsError('invalid-argument', 'matchedEntryId manquant');
      await db.collection('clubs').doc(clubId)
        .collection('student_logbook_entries').doc(finalMatchedEntryId)
        .update({
          ...copyPayloadFromSnapshot(
            snapshot,
            uid,
            targetName,
            confirmationId,
            confirmation.source_member_id,
            confirmation.source_entry_id
          ),
          created_at: FieldValue.delete(),
          updated_at: FieldValue.serverTimestamp(),
        });
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
      confirmed_existing_different: 'confirmée : la plongée existante diffère',
      confirmed_no_import: 'confirmée sans import',
      declined: 'refusée',
    };
    await sendMemberNotification(
      clubId,
      confirmation.source_member_id,
      uid,
      `${targetName || 'Un membre'} a répondu à ta plongée`,
      `${targetName || 'Un membre'} a ${labels[status] || status} la plongée.`,
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
};
