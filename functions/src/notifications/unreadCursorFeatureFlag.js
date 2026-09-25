const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

function normalizeMode(data = {}) {
  if (data.unreadCursorV1Enabled !== true) return 'off';
  return ['off', 'shadow', 'on'].includes(data.unreadCursorV1Mode)
    ? data.unreadCursorV1Mode
    : 'off';
}

async function getUnreadCursorV1Mode(db, clubId, now = Date.now()) {
  const cached = cache.get(clubId);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.mode;
  try {
    const snapshot = await db.collection('clubs').doc(clubId)
      .collection('settings').doc('feature_flags').get();
    const mode = snapshot.exists ? normalizeMode(snapshot.data()) : 'off';
    cache.set(clubId, { at: now, mode });
    return mode;
  } catch (error) {
    console.warn(`Unread cursor flag read failed for ${clubId}; defaulting OFF: ${error.message}`);
    return 'off';
  }
}

function clearUnreadCursorV1FlagCache() { cache.clear(); }

module.exports = { getUnreadCursorV1Mode, normalizeMode, clearUnreadCursorV1FlagCache, CACHE_TTL_MS };
