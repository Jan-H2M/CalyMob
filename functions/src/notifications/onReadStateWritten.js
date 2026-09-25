const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { getUnreadCursorV1ModeForMember } = require('./unreadCursorFeatureFlag');
const { getCanonicalUnreadBreakdown } = require('./canonicalUnreadBadge');
const { sendSilentCursorBadge } = require('../utils/badge-helper');

const recentlySynced = new Map();
const COALESCE_MS = 4000;

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return value instanceof Date ? value.getTime() : 0;
}

function cursorAdvanced(before = {}, after = {}) {
  return ['last_seen_at', 'global_last_seen_at']
    .some((key) => timestampMs(after[key]) > timestampMs(before[key]));
}

async function reconcileReadStateBadge({ db, clubId, memberId, before, after, now = Date.now() }) {
  if (!cursorAdvanced(before, after)) return { skipped: 'not_advanced' };
  if (await getUnreadCursorV1ModeForMember(db, clubId, memberId, now) !== 'on') return { skipped: 'flag_off' };
  const key = `${clubId}/${memberId}`;
  // Trailing edge, not leading-edge dropping: a burst of cursor writes waits
  // briefly and only the final invocation recomputes/sends (including zero).
  const sequence = (recentlySynced.get(key) || 0) + 1;
  recentlySynced.set(key, sequence);
  await new Promise((resolve) => setTimeout(resolve, COALESCE_MS));
  if (recentlySynced.get(key) !== sequence) return { skipped: 'superseded' };
  const member = await db.collection('clubs').doc(clubId).collection('members').doc(memberId).get();
  const data = member.data() || {};
  const tokens = Array.isArray(data.fcm_tokens) ? data.fcm_tokens : (data.fcm_token ? [data.fcm_token] : []);
  const breakdown = await getCanonicalUnreadBreakdown({ db, clubId, memberId, now: new Date(now) });
  const result = await sendSilentCursorBadge({ clubId, memberId, tokens, total: breakdown.total });
  return { ...result, total: breakdown.total };
}

function makeTrigger(document) {
  return onDocumentWritten({ document, region: 'europe-west1' }, async (event) => reconcileReadStateBadge({
    db: admin.firestore(), clubId: event.params.clubId, memberId: event.params.memberId,
    before: event.data.before.data() || {}, after: event.data.after.data() || {},
  }));
}

const onReadStateWritten = makeTrigger('clubs/{clubId}/members/{memberId}/read_state/{sectionId}');
const onReadStateScopeWritten = makeTrigger('clubs/{clubId}/members/{memberId}/read_state/{sectionId}/{scopeCollection}/{scopeId}');

module.exports = { onReadStateWritten, onReadStateScopeWritten, reconcileReadStateBadge, cursorAdvanced, recentlySynced };
