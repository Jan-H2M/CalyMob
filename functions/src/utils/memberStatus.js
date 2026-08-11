const VALID_MEMBER_STATUSES = new Set(['active', 'inactive', 'archived']);

/**
 * Resolve the club-membership status during the member_status migration.
 * A valid canonical value always wins; legacy fields are fallback-only.
 */
function resolveMemberStatus(data = {}, { defaultStatus = 'inactive' } = {}) {
  const canonical = String(data.member_status || '').toLowerCase();
  if (VALID_MEMBER_STATUSES.has(canonical)) return canonical;

  const fallbackStatus = String(data.app_status || data.status || '').toLowerCase();
  if (fallbackStatus === 'active' || data.isActive === true || data.actif === true) {
    return 'active';
  }
  if (
    ['inactive', 'deleted', 'archived', 'suspended', 'pending'].includes(fallbackStatus) ||
    data.isActive === false ||
    data.actif === false
  ) {
    return 'inactive';
  }

  return defaultStatus;
}

function isActiveMember(data = {}, options) {
  return resolveMemberStatus(data, options) === 'active';
}

module.exports = { resolveMemberStatus, isActiveMember };
