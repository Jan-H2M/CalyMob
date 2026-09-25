const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

function normalizeMode(data = {}) {
  if (data.unreadCursorV1Enabled !== true) return 'off';
  return ['off', 'shadow', 'on'].includes(data.unreadCursorV1Mode)
    ? data.unreadCursorV1Mode
    : 'off';
}

function effectiveUnreadCursorV1Mode(data = {}, memberId) {
  const mode = normalizeMode(data);
  if (mode === 'on') return 'on';
  return mode === 'shadow' && Array.isArray(data.unreadCursorV1PilotMemberIds)
    && data.unreadCursorV1PilotMemberIds.includes(memberId) ? 'on' : mode;
}

async function getUnreadCursorV1Mode(db, clubId, now = Date.now()) {
  const cached = cache.get(clubId);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.mode;
  try {
    const snapshot = await db.collection('clubs').doc(clubId)
      .collection('settings').doc('feature_flags').get();
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const mode = normalizeMode(data);
    cache.set(clubId, { at: now, mode, data });
    return mode;
  } catch (error) {
    console.warn(`Unread cursor flag read failed for ${clubId}; defaulting OFF: ${error.message}`);
    return 'off';
  }
}

async function getUnreadCursorV1ModeForMember(db, clubId, memberId, now = Date.now()) {
  const cached = cache.get(clubId);
  if (cached && now - cached.at < CACHE_TTL_MS) return effectiveUnreadCursorV1Mode(cached.data || {}, memberId);
  try {
    const snapshot = await db.collection('clubs').doc(clubId).collection('settings').doc('feature_flags').get();
    const data = snapshot.exists ? snapshot.data() || {} : {};
    cache.set(clubId, { at: now, mode: normalizeMode(data), data });
    return effectiveUnreadCursorV1Mode(data, memberId);
  } catch (error) {
    console.warn(`Unread cursor flag read failed for ${clubId}; defaulting OFF: ${error.message}`);
    return 'off';
  }
}

function clearUnreadCursorV1FlagCache() { cache.clear(); }

module.exports = { getUnreadCursorV1Mode, getUnreadCursorV1ModeForMember, normalizeMode, effectiveUnreadCursorV1Mode, clearUnreadCursorV1FlagCache, CACHE_TTL_MS };
