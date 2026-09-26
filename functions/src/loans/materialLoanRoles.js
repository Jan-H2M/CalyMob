'use strict';

function normalizeClubRole(value) {
  return String(value || '').trim().toLowerCase();
}

function hasGonflageRole(member = {}) {
  const roles = Array.isArray(member.clubStatuten) ? member.clubStatuten : [];
  return roles.some((value) => {
    const role = normalizeClubRole(value);
    return role === 'g' || role === 'gonflage';
  });
}

module.exports = { hasGonflageRole, normalizeClubRole };
