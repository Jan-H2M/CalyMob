function normalizeTimestampMode(data = {}) {
  if (data.unreadTimestampV2Enabled !== true) return 'off';
  return ['off', 'shadow', 'on'].includes(data.unreadTimestampV2Mode)
    ? data.unreadTimestampV2Mode
    : 'off';
}

function effectiveTimestampMode(data = {}, memberId) {
  const mode = normalizeTimestampMode(data);
  if (mode === 'on') return 'on';
  return mode === 'shadow'
    && Array.isArray(data.unreadTimestampV2PilotMemberIds)
    && data.unreadTimestampV2PilotMemberIds.includes(memberId)
    ? 'on'
    : mode;
}

async function usesUnreadTimestampV2(db, clubId, memberId) {
  try {
    const [flags, marker] = await Promise.all([
      db.doc(`clubs/${clubId}/settings/feature_flags`).get(),
      db.doc(`clubs/${clubId}/settings/unread_timestamp_v2_migration`).get(),
    ]);
    const markerData = marker.exists ? marker.data() || {} : {};
    return effectiveTimestampMode(flags.exists ? flags.data() || {} : {}, memberId) === 'on'
      && markerData.schema_version === 2
      && markerData.status === 'complete'
      && markerData.missing_count === 0
      // Backfill completion alone is not enough while released legacy clients
      // may still create documents without canonical timestamp fields. This
      // server-only marker value is set only after min-version enforcement,
      // mandatory writer rules, and a final zero-missing scan.
      && markerData.writer_contract === 'required';
  } catch (error) {
    // Keep using cursor-v1's established server-corrected legacy fields. This
    // is not a legacy unread counter fallback and never publishes a false 0.
    console.warn(`Unread timestamp v2 authority unresolved for ${clubId}/${memberId}: ${error.message}`);
    return false;
  }
}

module.exports = {
  normalizeTimestampMode,
  effectiveTimestampMode,
  usesUnreadTimestampV2,
};
