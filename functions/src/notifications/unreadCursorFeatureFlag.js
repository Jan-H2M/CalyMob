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

async function getUnreadCursorV1Config(db, clubId) {
  try {
    const snapshot = await db.collection('clubs').doc(clubId)
      .collection('settings').doc('feature_flags').get();
    return { known: true, data: snapshot.exists ? snapshot.data() || {} : {} };
  } catch (error) {
    console.warn(`Unread cursor flag read failed for ${clubId}; badge authority unknown: ${error.message}`);
    return { known: false, data: {} };
  }
}

// Deliberately read the flag for every invocation. A warm Functions instance
// must not retain OFF/shadow after the one-moment production cutover while
// clients already observe ON through their realtime listener.
async function getUnreadCursorV1Mode(db, clubId) {
  const config = await getUnreadCursorV1Config(db, clubId);
  return config.known ? normalizeMode(config.data) : 'unknown';
}

async function getUnreadCursorV1ModeForMember(db, clubId, memberId) {
  const config = await getUnreadCursorV1Config(db, clubId);
  return config.known
    ? effectiveUnreadCursorV1Mode(config.data, memberId)
    : 'unknown';
}

module.exports = {
  getUnreadCursorV1Config,
  getUnreadCursorV1Mode,
  getUnreadCursorV1ModeForMember,
  normalizeMode,
  effectiveUnreadCursorV1Mode,
};
